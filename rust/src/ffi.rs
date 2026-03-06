//! C FFI exports for the native bridge layer.
//!
//! Every function follows the pattern:
//! 1. Accept C strings / primitives
//! 2. Validate and convert to Rust types
//! 3. Perform the operation via `state` module
//! 4. Return a JSON-encoded C string (caller must free with `qmdb_free_string`)
//!
//! # Safety
//!
//! All `extern "C"` functions accept raw pointers. Callers must ensure
//! pointers are valid, null-terminated C strings. All returned strings
//! must be freed with `qmdb_free_string`.

use std::ffi::{CStr, CString, c_char};

use crate::error::QmdbError;
use crate::state;

// --- Lifecycle ---

/// Return the library version. Caller must free with `qmdb_free_string`.
#[unsafe(no_mangle)]
pub extern "C" fn qmdb_version() -> *const c_char {
    let version = CString::new(env!("CARGO_PKG_VERSION")).unwrap();
    version.into_raw() as *const c_char
}

/// Free a string previously returned by a qmdb_* function.
///
/// # Safety
/// `ptr` must be a pointer previously returned by a qmdb_* function, or null.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn qmdb_free_string(ptr: *mut c_char) {
    if !ptr.is_null() {
        unsafe {
            drop(CString::from_raw(ptr));
        }
    }
}

/// Open or create a database. Returns JSON-encoded DatabaseInfo.
///
/// # Safety
/// `config_json` must be a valid null-terminated UTF-8 C string.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn qmdb_open(config_json: *const c_char) -> *const c_char {
    let json_str = match unsafe { parse_c_str(config_json, "config_json") } {
        Ok(s) => s,
        Err(e) => return string_to_c(e.to_json()),
    };
    let config: serde_json::Value = match serde_json::from_str(json_str) {
        Ok(v) => v,
        Err(e) => return string_to_c(QmdbError::Serialization(e.to_string()).to_json()),
    };
    let path = match config["path"].as_str() {
        Some(p) => p,
        None => return string_to_c(QmdbError::Serialization("missing 'path'".into()).to_json()),
    };
    let create = config["create"].as_bool().unwrap_or(false);
    match state::open(path, create) {
        Ok(info) => string_to_c(serde_json::to_string(&info).unwrap()),
        Err(e) => string_to_c(e.to_json()),
    }
}

/// Close a database.
///
/// # Safety
/// `path` must be a valid null-terminated UTF-8 C string.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn qmdb_close(path: *const c_char) -> *const c_char {
    let path = match unsafe { parse_c_str(path, "path") } {
        Ok(s) => s,
        Err(e) => return string_to_c(e.to_json()),
    };
    match state::close(path) {
        Ok(()) => string_to_c(r#"{"ok":true}"#.to_string()),
        Err(e) => string_to_c(e.to_json()),
    }
}

/// Destroy a database (remove all data).
///
/// # Safety
/// `path` must be a valid null-terminated UTF-8 C string.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn qmdb_destroy(path: *const c_char) -> *const c_char {
    let path = match unsafe { parse_c_str(path, "path") } {
        Ok(s) => s,
        Err(e) => return string_to_c(e.to_json()),
    };
    match state::destroy(path) {
        Ok(()) => string_to_c(r#"{"ok":true}"#.to_string()),
        Err(e) => string_to_c(e.to_json()),
    }
}

/// Get current database info. Returns JSON-encoded DatabaseInfo.
///
/// # Safety
/// `path` must be a valid null-terminated UTF-8 C string.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn qmdb_info(path: *const c_char) -> *const c_char {
    let path = match unsafe { parse_c_str(path, "path") } {
        Ok(s) => s,
        Err(e) => return string_to_c(e.to_json()),
    };
    match state::info(path) {
        Ok(info) => string_to_c(serde_json::to_string(&info).unwrap()),
        Err(e) => string_to_c(e.to_json()),
    }
}

// --- KV Operations ---

/// Get a value by key. Returns JSON: `{"value": "..."}` or `{"value": null}`.
///
/// # Safety
/// `path` and `key` must be valid null-terminated UTF-8 C strings.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn qmdb_get(path: *const c_char, key: *const c_char) -> *const c_char {
    let path = match unsafe { parse_c_str(path, "path") } {
        Ok(s) => s,
        Err(e) => return string_to_c(e.to_json()),
    };
    let key = match unsafe { parse_c_str(key, "key") } {
        Ok(s) => s,
        Err(e) => return string_to_c(e.to_json()),
    };
    match state::get(path, key) {
        Ok(value) => string_to_c(serde_json::json!({ "value": value }).to_string()),
        Err(e) => string_to_c(e.to_json()),
    }
}

/// Update a key-value pair. Returns JSON: `{"location": N}`.
///
/// # Safety
/// `path`, `key`, and `value` must be valid null-terminated UTF-8 C strings.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn qmdb_update(
    path: *const c_char,
    key: *const c_char,
    value: *const c_char,
) -> *const c_char {
    let path = match unsafe { parse_c_str(path, "path") } {
        Ok(s) => s,
        Err(e) => return string_to_c(e.to_json()),
    };
    let key = match unsafe { parse_c_str(key, "key") } {
        Ok(s) => s,
        Err(e) => return string_to_c(e.to_json()),
    };
    let value = match unsafe { parse_c_str(value, "value") } {
        Ok(s) => s,
        Err(e) => return string_to_c(e.to_json()),
    };
    match state::update(path, key, value) {
        Ok(loc) => string_to_c(serde_json::json!({ "location": loc }).to_string()),
        Err(e) => string_to_c(e.to_json()),
    }
}

/// Delete a key. Returns JSON: `{"ok": true}`.
///
/// # Safety
/// `path` and `key` must be valid null-terminated UTF-8 C strings.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn qmdb_delete(path: *const c_char, key: *const c_char) -> *const c_char {
    let path = match unsafe { parse_c_str(path, "path") } {
        Ok(s) => s,
        Err(e) => return string_to_c(e.to_json()),
    };
    let key = match unsafe { parse_c_str(key, "key") } {
        Ok(s) => s,
        Err(e) => return string_to_c(e.to_json()),
    };
    match state::delete(path, key) {
        Ok(()) => string_to_c(r#"{"ok":true}"#.to_string()),
        Err(e) => string_to_c(e.to_json()),
    }
}

/// Batch update multiple key-value pairs. Returns JSON: `{"locations": [N, ...]}`.
///
/// # Safety
/// `path` and `entries_json` must be valid null-terminated UTF-8 C strings.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn qmdb_batch_update(
    path: *const c_char,
    entries_json: *const c_char,
) -> *const c_char {
    let path = match unsafe { parse_c_str(path, "path") } {
        Ok(s) => s,
        Err(e) => return string_to_c(e.to_json()),
    };
    let json_str = match unsafe { parse_c_str(entries_json, "entries_json") } {
        Ok(s) => s,
        Err(e) => return string_to_c(e.to_json()),
    };
    let entries: Vec<serde_json::Value> = match serde_json::from_str(json_str) {
        Ok(v) => v,
        Err(e) => return string_to_c(QmdbError::Serialization(e.to_string()).to_json()),
    };
    let pairs: Result<Vec<(String, String)>, QmdbError> = entries
        .iter()
        .map(|e| {
            let key = e["key"]
                .as_str()
                .ok_or_else(|| QmdbError::Serialization("missing 'key'".into()))?;
            let value = e["value"]
                .as_str()
                .ok_or_else(|| QmdbError::Serialization("missing 'value'".into()))?;
            Ok((key.to_string(), value.to_string()))
        })
        .collect();
    let pairs = match pairs {
        Ok(p) => p,
        Err(e) => return string_to_c(e.to_json()),
    };
    match state::batch_update(path, &pairs) {
        Ok(locs) => string_to_c(serde_json::json!({ "locations": locs }).to_string()),
        Err(e) => string_to_c(e.to_json()),
    }
}

// --- State Machine ---

/// Transition to mutable state. Returns JSON-encoded DatabaseInfo.
///
/// # Safety
/// `path` must be a valid null-terminated UTF-8 C string.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn qmdb_into_mutable(path: *const c_char) -> *const c_char {
    let path = match unsafe { parse_c_str(path, "path") } {
        Ok(s) => s,
        Err(e) => return string_to_c(e.to_json()),
    };
    match state::into_mutable(path) {
        Ok(info) => string_to_c(serde_json::to_string(&info).unwrap()),
        Err(e) => string_to_c(e.to_json()),
    }
}

/// Commit changes. Returns JSON-encoded DatabaseInfo.
///
/// # Safety
/// `path` must be a valid null-terminated UTF-8 C string.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn qmdb_commit(path: *const c_char) -> *const c_char {
    let path = match unsafe { parse_c_str(path, "path") } {
        Ok(s) => s,
        Err(e) => return string_to_c(e.to_json()),
    };
    match state::commit(path) {
        Ok(info) => string_to_c(serde_json::to_string(&info).unwrap()),
        Err(e) => string_to_c(e.to_json()),
    }
}

/// Merkleize the database. Returns JSON-encoded DatabaseInfo.
///
/// # Safety
/// `path` must be a valid null-terminated UTF-8 C string.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn qmdb_merkleize(path: *const c_char) -> *const c_char {
    let path = match unsafe { parse_c_str(path, "path") } {
        Ok(s) => s,
        Err(e) => return string_to_c(e.to_json()),
    };
    match state::merkleize(path) {
        Ok(info) => string_to_c(serde_json::to_string(&info).unwrap()),
        Err(e) => string_to_c(e.to_json()),
    }
}

// --- Proofs ---

/// Generate an inclusion proof for a key. Returns JSON-encoded Proof.
///
/// # Safety
/// `path` and `key` must be valid null-terminated UTF-8 C strings.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn qmdb_prove(path: *const c_char, key: *const c_char) -> *const c_char {
    let path = match unsafe { parse_c_str(path, "path") } {
        Ok(s) => s,
        Err(e) => return string_to_c(e.to_json()),
    };
    let key = match unsafe { parse_c_str(key, "key") } {
        Ok(s) => s,
        Err(e) => return string_to_c(e.to_json()),
    };
    match state::prove(path, key) {
        Ok(proof) => string_to_c(serde_json::to_string(&proof).unwrap()),
        Err(e) => string_to_c(e.to_json()),
    }
}

/// Generate a range proof. Returns JSON-encoded Proof.
///
/// # Safety
/// `path` must be a valid null-terminated UTF-8 C string.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn qmdb_range_proof(
    path: *const c_char,
    start: u64,
    end: u64,
) -> *const c_char {
    let path = match unsafe { parse_c_str(path, "path") } {
        Ok(s) => s,
        Err(e) => return string_to_c(e.to_json()),
    };
    match state::range_proof(path, start, end) {
        Ok(proof) => string_to_c(serde_json::to_string(&proof).unwrap()),
        Err(e) => string_to_c(e.to_json()),
    }
}

/// Verify a proof against a root. Returns JSON-encoded VerifyResult.
///
/// # Safety
/// `proof_json` and `root` must be valid null-terminated UTF-8 C strings.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn qmdb_verify(
    proof_json: *const c_char,
    root: *const c_char,
) -> *const c_char {
    let json_str = match unsafe { parse_c_str(proof_json, "proof_json") } {
        Ok(s) => s,
        Err(e) => return string_to_c(e.to_json()),
    };
    let root = match unsafe { parse_c_str(root, "root") } {
        Ok(s) => s,
        Err(e) => return string_to_c(e.to_json()),
    };
    let proof: state::Proof = match serde_json::from_str(json_str) {
        Ok(p) => p,
        Err(e) => return string_to_c(QmdbError::Serialization(e.to_string()).to_json()),
    };
    let result = state::verify(&proof, root);
    string_to_c(serde_json::to_string(&result).unwrap())
}

// --- Sync ---

/// Get operations since a location. Returns JSON array of operations.
///
/// # Safety
/// `path` must be a valid null-terminated UTF-8 C string.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn qmdb_operations_since(
    path: *const c_char,
    since: u64,
    limit: u64,
) -> *const c_char {
    let path = match unsafe { parse_c_str(path, "path") } {
        Ok(s) => s,
        Err(e) => return string_to_c(e.to_json()),
    };
    match state::operations_since(path, since, limit) {
        Ok(ops) => string_to_c(serde_json::to_string(&ops).unwrap()),
        Err(e) => string_to_c(e.to_json()),
    }
}

/// Apply operations from a remote source. Returns JSON-encoded Bounds.
///
/// # Safety
/// `path` and `ops_json` must be valid null-terminated UTF-8 C strings.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn qmdb_apply_operations(
    path: *const c_char,
    ops_json: *const c_char,
) -> *const c_char {
    let path = match unsafe { parse_c_str(path, "path") } {
        Ok(s) => s,
        Err(e) => return string_to_c(e.to_json()),
    };
    let json_str = match unsafe { parse_c_str(ops_json, "ops_json") } {
        Ok(s) => s,
        Err(e) => return string_to_c(e.to_json()),
    };
    let operations: Vec<state::Operation> = match serde_json::from_str(json_str) {
        Ok(v) => v,
        Err(e) => return string_to_c(QmdbError::Serialization(e.to_string()).to_json()),
    };
    match state::apply_operations(path, &operations) {
        Ok(bounds) => string_to_c(serde_json::to_string(&bounds).unwrap()),
        Err(e) => string_to_c(e.to_json()),
    }
}

// --- Helpers ---

/// Parse a C string pointer into a borrowed `&str`.
///
/// # Safety
/// Caller must ensure `ptr` points to a valid, null-terminated C string
/// that outlives the returned `&str`.
unsafe fn parse_c_str<'a>(ptr: *const c_char, name: &str) -> Result<&'a str, QmdbError> {
    if ptr.is_null() {
        return Err(QmdbError::NullPointer(name.to_string()));
    }
    let c_str = unsafe { CStr::from_ptr(ptr) };
    c_str
        .to_str()
        .map_err(|e| QmdbError::InvalidUtf8(e.to_string()))
}

fn string_to_c(s: String) -> *const c_char {
    CString::new(s)
        .unwrap_or_else(|_| CString::new("{}").unwrap())
        .into_raw() as *const c_char
}
