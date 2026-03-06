//! QMDB Mobile — FFI bridge between React Native and commonware-storage.
//!
//! This crate exposes a C-compatible API that Swift (iOS) and Kotlin (Android)
//! native modules call into. All heavy crypto and storage operations happen here.
//!
//! # Architecture
//!
//! ```text
//! React Native JS → Native Module (Swift/Kotlin) → C FFI → this crate → commonware-storage
//! ```
//!
//! # Safety
//!
//! All `extern "C"` functions are `unsafe` at the boundary but validate inputs
//! before calling into safe Rust. Strings are passed as null-terminated C strings
//! and results are returned as JSON-encoded C strings that the caller must free.

mod error;
mod ffi;

pub use error::QmdbError;
pub use ffi::*;

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_version() {
        let version = qmdb_version();
        assert!(!version.is_null());
        let c_str = unsafe { std::ffi::CStr::from_ptr(version) };
        let s = c_str.to_str().unwrap();
        assert_eq!(s, env!("CARGO_PKG_VERSION"));
        unsafe { qmdb_free_string(version as *mut std::ffi::c_char) };
    }
}
