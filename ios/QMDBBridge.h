// C header for the Rust qmdb_mobile library.
// Auto-generated interface — do not edit manually.
// These functions return JSON-encoded C strings that must be freed with qmdb_free_string.

#ifndef QMDB_BRIDGE_H
#define QMDB_BRIDGE_H

#include <stdint.h>

#ifdef __cplusplus
extern "C" {
#endif

// Lifecycle
const char *qmdb_version(void);
void qmdb_free_string(char *ptr);
const char *qmdb_open(const char *config_json);
const char *qmdb_close(const char *path);
const char *qmdb_destroy(const char *path);
const char *qmdb_info(const char *path);

// KV Operations
const char *qmdb_get(const char *path, const char *key);
const char *qmdb_update(const char *path, const char *key, const char *value);
const char *qmdb_delete(const char *path, const char *key);
const char *qmdb_batch_update(const char *path, const char *entries_json);

// State Machine
const char *qmdb_into_mutable(const char *path);
const char *qmdb_commit(const char *path);
const char *qmdb_merkleize(const char *path);

// Proofs
const char *qmdb_prove(const char *path, const char *key);
const char *qmdb_range_proof(const char *path, uint64_t start, uint64_t end);
const char *qmdb_verify(const char *proof_json, const char *root);

// Sync
const char *qmdb_operations_since(const char *path, uint64_t since, uint64_t limit);
const char *qmdb_apply_operations(const char *path, const char *ops_json);

#ifdef __cplusplus
}
#endif

#endif // QMDB_BRIDGE_H
