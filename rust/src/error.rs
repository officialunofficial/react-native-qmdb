//! Error types for the QMDB mobile bridge.

use thiserror::Error;

#[derive(Error, Debug)]
pub enum QmdbError {
    #[error("database not open: {0}")]
    NotOpen(String),

    #[error("invalid state transition: cannot {action} in state {state}")]
    InvalidState { action: String, state: String },

    #[error("key not found: {0}")]
    KeyNotFound(String),

    #[error("storage error: {0}")]
    Storage(String),

    #[error("serialization error: {0}")]
    Serialization(String),

    #[error("null pointer argument: {0}")]
    NullPointer(String),

    #[error("invalid UTF-8: {0}")]
    InvalidUtf8(String),
}

impl QmdbError {
    /// Convert to a JSON error response for the native bridge.
    pub fn to_json(&self) -> String {
        serde_json::json!({
            "error": true,
            "code": self.error_code(),
            "message": self.to_string(),
        })
        .to_string()
    }

    fn error_code(&self) -> &'static str {
        match self {
            Self::NotOpen(_) => "NOT_OPEN",
            Self::InvalidState { .. } => "INVALID_STATE",
            Self::KeyNotFound(_) => "KEY_NOT_FOUND",
            Self::Storage(_) => "STORAGE",
            Self::Serialization(_) => "SERIALIZATION",
            Self::NullPointer(_) => "NULL_POINTER",
            Self::InvalidUtf8(_) => "INVALID_UTF8",
        }
    }
}
