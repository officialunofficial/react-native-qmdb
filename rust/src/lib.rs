//! QMDB Mobile — FFI bridge between React Native and commonware-storage.
//!
//! This crate exposes a C-compatible API that Swift (iOS) and Kotlin (Android)
//! native modules call into. All heavy crypto and storage operations happen here.
//!
//! # Architecture
//!
//! ```text
//! React Native JS -> Native Module (Swift/Kotlin) -> C FFI -> this crate -> commonware-storage
//! ```
//!
//! # Safety
//!
//! All `extern "C"` functions are `unsafe` at the boundary but validate inputs
//! before calling into safe Rust. Strings are passed as null-terminated C strings
//! and results are returned as JSON-encoded C strings that the caller must free.

mod error;
mod ffi;
mod state;

pub use error::QmdbError;
pub use ffi::*;

#[cfg(test)]
mod tests {
    use super::*;
    use std::ffi::{CStr, CString, c_char};

    /// Helper: call an FFI function, read the JSON, free the string.
    unsafe fn read_ffi(ptr: *const c_char) -> String {
        assert!(!ptr.is_null());
        let s = unsafe { CStr::from_ptr(ptr) }.to_str().unwrap().to_string();
        unsafe { qmdb_free_string(ptr as *mut c_char) };
        s
    }

    #[test]
    fn test_version() {
        let json = unsafe { read_ffi(qmdb_version()) };
        assert_eq!(json, env!("CARGO_PKG_VERSION"));
    }

    #[test]
    fn test_open_via_ffi() {
        let config = CString::new(r#"{"path": "/test/ffi_open2", "create": true}"#).unwrap();
        let json = unsafe { read_ffi(qmdb_open(config.as_ptr())) };
        let parsed: serde_json::Value = serde_json::from_str(&json).unwrap();
        assert_eq!(parsed["state"], "clean");
        assert_eq!(parsed["activeKeys"], 0);

        let path = CString::new("/test/ffi_open2").unwrap();
        unsafe { read_ffi(qmdb_close(path.as_ptr())) };
    }

    #[test]
    fn test_full_ffi_workflow() {
        let path_str = "/test/ffi_wf2";
        let path = CString::new(path_str).unwrap();
        let config =
            CString::new(format!(r#"{{"path": "{}", "create": true}}"#, path_str)).unwrap();

        // Open
        unsafe { read_ffi(qmdb_open(config.as_ptr())) };

        // Into mutable
        let json = unsafe { read_ffi(qmdb_into_mutable(path.as_ptr())) };
        let v: serde_json::Value = serde_json::from_str(&json).unwrap();
        assert_eq!(v["state"], "mutable");

        // Update
        let key = CString::new("hello").unwrap();
        let value = CString::new("world").unwrap();
        let json = unsafe { read_ffi(qmdb_update(path.as_ptr(), key.as_ptr(), value.as_ptr())) };
        let v: serde_json::Value = serde_json::from_str(&json).unwrap();
        assert_eq!(v["location"], 0);

        // Get
        let json = unsafe { read_ffi(qmdb_get(path.as_ptr(), key.as_ptr())) };
        let v: serde_json::Value = serde_json::from_str(&json).unwrap();
        assert_eq!(v["value"], "world");

        // Commit
        let json = unsafe { read_ffi(qmdb_commit(path.as_ptr())) };
        let v: serde_json::Value = serde_json::from_str(&json).unwrap();
        assert_eq!(v["state"], "unmerkleized_durable");

        // Merkleize
        let json = unsafe { read_ffi(qmdb_merkleize(path.as_ptr())) };
        let v: serde_json::Value = serde_json::from_str(&json).unwrap();
        assert_eq!(v["state"], "clean");

        // Cleanup
        unsafe { read_ffi(qmdb_close(path.as_ptr())) };
    }
}
