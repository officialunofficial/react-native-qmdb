//! Global instance management and state machine for QMDB databases.
//!
//! Each open database is tracked by path in a global HashMap behind a Mutex.
//! The state machine enforces valid transitions at the Rust level, matching
//! the commonware-storage QMDB type-state system.
//!
//! When the real commonware-storage integration is wired up, the `DbInstance`
//! will hold actual QMDB type-state variants instead of the in-memory simulation.

use std::collections::HashMap;
use std::sync::Mutex;

use serde::{Deserialize, Serialize};

use crate::error::QmdbError;

/// The four orthogonal states of an authenticated database.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum DatabaseState {
    Clean,
    Mutable,
    MerkleizedNondurable,
    UnmerkleizedDurable,
}

/// Snapshot of a database's current state, returned to the JS layer as JSON.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DatabaseInfo {
    pub state: DatabaseState,
    pub root: String,
    pub bounds: Bounds,
    pub inactivity_floor: u64,
    pub active_keys: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Bounds {
    pub start: u64,
    pub end: u64,
}

/// An operation recorded in the append-only log.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Operation {
    #[serde(rename = "type")]
    pub op_type: String,
    pub key: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub value: Option<String>,
    pub location: u64,
}

/// A Merkle proof over operations.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Proof {
    pub operations: Vec<Operation>,
    pub nodes: Vec<String>,
    pub range: Bounds,
}

/// Result of proof verification.
#[derive(Debug, Clone, Serialize)]
pub struct VerifyResult {
    pub valid: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub reason: Option<String>,
}

/// In-memory database instance (will be replaced by real QMDB).
struct DbInstance {
    state: DatabaseState,
    store: HashMap<String, String>,
    log: Vec<Operation>,
    inactivity_floor: u64,
    root: String,
}

impl DbInstance {
    fn new() -> Self {
        Self {
            state: DatabaseState::Clean,
            store: HashMap::new(),
            log: Vec::new(),
            inactivity_floor: 0,
            root: compute_root(&[]),
        }
    }

    fn to_info(&self) -> DatabaseInfo {
        DatabaseInfo {
            state: self.state,
            root: self.root.clone(),
            bounds: Bounds {
                start: 0,
                end: self.log.len() as u64,
            },
            inactivity_floor: self.inactivity_floor,
            active_keys: self.store.len() as u64,
        }
    }

    fn require_mutable(&self, action: &str) -> Result<(), QmdbError> {
        if self.state != DatabaseState::Mutable {
            return Err(QmdbError::InvalidState {
                action: action.to_string(),
                state: format!("{:?}", self.state),
            });
        }
        Ok(())
    }
}

/// Compute a mock Merkle root from operation log (djb2 hash, NOT cryptographic).
/// Will be replaced by real SHA-256 MMR root from commonware-storage.
fn compute_root(ops: &[Operation]) -> String {
    if ops.is_empty() {
        return "0".repeat(64);
    }
    let serialized: String = ops
        .iter()
        .map(|op| {
            format!(
                "{}:{}:{}",
                op.op_type,
                op.key,
                op.value.as_deref().unwrap_or("")
            )
        })
        .collect::<Vec<_>>()
        .join("|");

    // djb2 hash → hex (mock only)
    let mut hash: u64 = 5381;
    for byte in serialized.bytes() {
        hash = hash.wrapping_mul(33).wrapping_add(byte as u64);
    }
    format!("{:064x}", hash)
}

// --- Global Instance Registry ---

static INSTANCES: Mutex<Option<HashMap<String, DbInstance>>> = Mutex::new(None);

fn with_instances<F, R>(f: F) -> R
where
    F: FnOnce(&mut HashMap<String, DbInstance>) -> R,
{
    let mut guard = INSTANCES.lock().unwrap();
    let map = guard.get_or_insert_with(HashMap::new);
    f(map)
}

fn with_db<F, R>(path: &str, f: F) -> Result<R, QmdbError>
where
    F: FnOnce(&mut DbInstance) -> Result<R, QmdbError>,
{
    with_instances(|map| {
        let db = map
            .get_mut(path)
            .ok_or_else(|| QmdbError::NotOpen(path.to_string()))?;
        f(db)
    })
}

// --- Public Operations ---

pub fn open(path: &str, _create: bool) -> Result<DatabaseInfo, QmdbError> {
    with_instances(|map| {
        if let Some(db) = map.get(path) {
            return Ok(db.to_info());
        }
        let db = DbInstance::new();
        let info = db.to_info();
        map.insert(path.to_string(), db);
        Ok(info)
    })
}

pub fn close(path: &str) -> Result<(), QmdbError> {
    with_instances(|map| {
        if map.remove(path).is_none() {
            return Err(QmdbError::NotOpen(path.to_string()));
        }
        Ok(())
    })
}

pub fn destroy(path: &str) -> Result<(), QmdbError> {
    with_instances(|map| {
        map.remove(path);
        Ok(())
    })
}

pub fn info(path: &str) -> Result<DatabaseInfo, QmdbError> {
    with_db(path, |db| Ok(db.to_info()))
}

pub fn get(path: &str, key: &str) -> Result<Option<String>, QmdbError> {
    with_db(path, |db| Ok(db.store.get(key).cloned()))
}

pub fn update(path: &str, key: &str, value: &str) -> Result<u64, QmdbError> {
    with_db(path, |db| {
        db.require_mutable("update")?;
        db.store.insert(key.to_string(), value.to_string());
        let loc = db.log.len() as u64;
        db.log.push(Operation {
            op_type: "update".to_string(),
            key: key.to_string(),
            value: Some(value.to_string()),
            location: loc,
        });
        Ok(loc)
    })
}

pub fn delete(path: &str, key: &str) -> Result<(), QmdbError> {
    with_db(path, |db| {
        db.require_mutable("delete")?;
        db.store.remove(key);
        db.log.push(Operation {
            op_type: "delete".to_string(),
            key: key.to_string(),
            value: None,
            location: db.log.len() as u64,
        });
        Ok(())
    })
}

pub fn batch_update(path: &str, entries: &[(String, String)]) -> Result<Vec<u64>, QmdbError> {
    with_db(path, |db| {
        db.require_mutable("batch update")?;
        let mut locations = Vec::with_capacity(entries.len());
        for (key, value) in entries {
            db.store.insert(key.clone(), value.clone());
            let loc = db.log.len() as u64;
            db.log.push(Operation {
                op_type: "update".to_string(),
                key: key.clone(),
                value: Some(value.clone()),
                location: loc,
            });
            locations.push(loc);
        }
        Ok(locations)
    })
}

pub fn into_mutable(path: &str) -> Result<DatabaseInfo, QmdbError> {
    with_db(path, |db| {
        db.state = DatabaseState::Mutable;
        Ok(db.to_info())
    })
}

pub fn commit(path: &str) -> Result<DatabaseInfo, QmdbError> {
    with_db(path, |db| {
        db.require_mutable("commit")?;
        db.state = DatabaseState::UnmerkleizedDurable;
        Ok(db.to_info())
    })
}

pub fn merkleize(path: &str) -> Result<DatabaseInfo, QmdbError> {
    with_db(path, |db| {
        match db.state {
            DatabaseState::Clean | DatabaseState::Mutable => {
                return Err(QmdbError::InvalidState {
                    action: "merkleize".to_string(),
                    state: format!("{:?}", db.state),
                });
            }
            DatabaseState::UnmerkleizedDurable => {
                db.root = compute_root(&db.log);
                db.state = DatabaseState::Clean;
            }
            DatabaseState::MerkleizedNondurable => {
                // Already merkleized, just return info
            }
        }
        Ok(db.to_info())
    })
}

pub fn prove(path: &str, key: &str) -> Result<Proof, QmdbError> {
    with_db(path, |db| {
        let ops: Vec<Operation> = db.log.iter().filter(|op| op.key == key).cloned().collect();
        Ok(Proof {
            operations: ops,
            nodes: vec![db.root.clone()],
            range: Bounds {
                start: 0,
                end: db.log.len() as u64,
            },
        })
    })
}

pub fn range_proof(path: &str, start: u64, end: u64) -> Result<Proof, QmdbError> {
    with_db(path, |db| {
        let start_idx = start as usize;
        let end_idx = (end as usize).min(db.log.len());
        let ops = db.log[start_idx..end_idx].to_vec();
        Ok(Proof {
            operations: ops,
            nodes: vec![db.root.clone()],
            range: Bounds { start, end },
        })
    })
}

pub fn verify(proof: &Proof, root: &str) -> VerifyResult {
    if !proof.nodes.is_empty() && proof.nodes[0] == root {
        VerifyResult {
            valid: true,
            reason: None,
        }
    } else {
        VerifyResult {
            valid: false,
            reason: Some("Root mismatch".to_string()),
        }
    }
}

pub fn operations_since(path: &str, since: u64, limit: u64) -> Result<Vec<Operation>, QmdbError> {
    with_db(path, |db| {
        let start = since as usize;
        let end = (start + limit as usize).min(db.log.len());
        Ok(db.log[start..end].to_vec())
    })
}

pub fn apply_operations(path: &str, operations: &[Operation]) -> Result<Bounds, QmdbError> {
    with_db(path, |db| {
        db.require_mutable("apply operations")?;
        for op in operations {
            if op.op_type == "update" {
                if let Some(ref value) = op.value {
                    db.store.insert(op.key.clone(), value.clone());
                }
            } else if op.op_type == "delete" {
                db.store.remove(&op.key);
            }
            db.log.push(Operation {
                op_type: op.op_type.clone(),
                key: op.key.clone(),
                value: op.value.clone(),
                location: db.log.len() as u64,
            });
        }
        Ok(Bounds {
            start: 0,
            end: db.log.len() as u64,
        })
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn test_path() -> String {
        format!(
            "/test/{}",
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        )
    }

    #[test]
    fn test_open_close() {
        let path = test_path();
        let info = open(&path, true).unwrap();
        assert_eq!(info.state, DatabaseState::Clean);
        assert_eq!(info.active_keys, 0);
        close(&path).unwrap();
    }

    #[test]
    fn test_state_machine() {
        let path = test_path();
        open(&path, true).unwrap();

        // Clean -> Mutable
        let info = into_mutable(&path).unwrap();
        assert_eq!(info.state, DatabaseState::Mutable);

        // Write data
        update(&path, "key1", "value1").unwrap();

        // Mutable -> UnmerkleizedDurable (commit)
        let info = commit(&path).unwrap();
        assert_eq!(info.state, DatabaseState::UnmerkleizedDurable);

        // UnmerkleizedDurable -> Clean (merkleize)
        let info = merkleize(&path).unwrap();
        assert_eq!(info.state, DatabaseState::Clean);
        assert_ne!(info.root, "0".repeat(64));

        close(&path).unwrap();
    }

    #[test]
    fn test_crud() {
        let path = test_path();
        open(&path, true).unwrap();
        into_mutable(&path).unwrap();

        // Create
        update(&path, "a", "1").unwrap();
        update(&path, "b", "2").unwrap();

        // Read
        assert_eq!(get(&path, "a").unwrap(), Some("1".to_string()));
        assert_eq!(get(&path, "b").unwrap(), Some("2".to_string()));
        assert_eq!(get(&path, "c").unwrap(), None);

        // Update
        update(&path, "a", "updated").unwrap();
        assert_eq!(get(&path, "a").unwrap(), Some("updated".to_string()));

        // Delete
        delete(&path, "b").unwrap();
        assert_eq!(get(&path, "b").unwrap(), None);

        close(&path).unwrap();
    }

    #[test]
    fn test_batch_update() {
        let path = test_path();
        open(&path, true).unwrap();
        into_mutable(&path).unwrap();

        let entries = vec![
            ("x".to_string(), "10".to_string()),
            ("y".to_string(), "20".to_string()),
            ("z".to_string(), "30".to_string()),
        ];
        let locs = batch_update(&path, &entries).unwrap();
        assert_eq!(locs.len(), 3);

        assert_eq!(get(&path, "x").unwrap(), Some("10".to_string()));
        assert_eq!(get(&path, "y").unwrap(), Some("20".to_string()));
        assert_eq!(get(&path, "z").unwrap(), Some("30".to_string()));

        close(&path).unwrap();
    }

    #[test]
    fn test_reject_mutation_in_clean_state() {
        let path = test_path();
        open(&path, true).unwrap();

        let result = update(&path, "k", "v");
        assert!(result.is_err());

        close(&path).unwrap();
    }

    #[test]
    fn test_prove_and_verify() {
        let path = test_path();
        open(&path, true).unwrap();
        into_mutable(&path).unwrap();
        update(&path, "key", "val").unwrap();
        commit(&path).unwrap();
        let db_info = merkleize(&path).unwrap();

        let proof = prove(&path, "key").unwrap();
        assert_eq!(proof.operations.len(), 1);

        let result = verify(&proof, &db_info.root);
        assert!(result.valid);

        let bad_result = verify(&proof, "bad_root");
        assert!(!bad_result.valid);

        close(&path).unwrap();
    }
}
