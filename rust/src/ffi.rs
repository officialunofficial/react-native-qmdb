//! C FFI exports for the native bridge layer.
//!
//! Every function follows the pattern:
//! 1. Accept C strings / primitives
//! 2. Validate and convert to Rust types
//! 3. Perform the operation
//! 4. Return a JSON-encoded C string (caller must free with `qmdb_free_string`)

use std::ffi::{CStr, CString, c_char};

use crate::error::QmdbError;

/// Return the library version as a C string. Caller must free with `qmdb_free_string`.
///
/// # Safety
/// Returns a heap-allocated C string. Must be freed by the caller.
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
pub extern "C" fn qmdb_open(config_json: *const c_char) -> *const c_char {
    match _qmdb_open(config_json) {
        Ok(json) => string_to_c(json),
        Err(e) => string_to_c(e.to_json()),
    }
}

fn _qmdb_open(config_json: *const c_char) -> Result<String, QmdbError> {
    let _config = parse_c_str(config_json, "config_json")?;
    // TODO: Initialize commonware-storage QMDB instance
    // For now, return a placeholder clean state
    Ok(serde_json::json!({
        "state": "clean",
        "root": "0".repeat(64),
        "bounds": { "start": 0, "end": 0 },
        "inactivityFloor": 0,
        "activeKeys": 0,
    })
    .to_string())
}

/// Close a database.
///
/// # Safety
/// `path` must be a valid null-terminated UTF-8 C string.
#[unsafe(no_mangle)]
pub extern "C" fn qmdb_close(path: *const c_char) -> *const c_char {
    match parse_c_str(path, "path") {
        Ok(_path) => {
            // TODO: Close the database instance
            string_to_c(r#"{"ok":true}"#.to_string())
        }
        Err(e) => string_to_c(e.to_json()),
    }
}

// --- Helpers ---

fn parse_c_str(ptr: *const c_char, name: &str) -> Result<String, QmdbError> {
    if ptr.is_null() {
        return Err(QmdbError::NullPointer(name.to_string()));
    }
    let c_str = unsafe { CStr::from_ptr(ptr) };
    c_str
        .to_str()
        .map(|s| s.to_string())
        .map_err(|e| QmdbError::InvalidUtf8(e.to_string()))
}

fn string_to_c(s: String) -> *const c_char {
    CString::new(s)
        .unwrap_or_else(|_| CString::new("{}").unwrap())
        .into_raw() as *const c_char
}
