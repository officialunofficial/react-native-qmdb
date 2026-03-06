/**
 * Native module interface — the contract between JS and the Rust FFI layer.
 *
 * This is what the Expo/Turbo native module must implement.
 * All methods are async because they cross the JS-native bridge.
 */

import type {
  Bounds,
  DatabaseConfig,
  DatabaseInfo,
  Digest,
  Key,
  Location,
  Operation,
  Proof,
  Value,
  VerifyResult,
} from "./database";

export interface NativeQMDB {
  /** Initialize or open a database. Returns initial info. */
  open(config: DatabaseConfig): Promise<DatabaseInfo>;

  /** Close the database and flush to disk. */
  close(path: string): Promise<void>;

  /** Destroy the database, deleting all data. */
  destroy(path: string): Promise<void>;

  /** Get current database info. */
  info(path: string): Promise<DatabaseInfo>;

  // --- Mutable operations (requires mutable state) ---

  /** Set a key-value pair. */
  update(path: string, key: Key, value: Value): Promise<Location>;

  /** Delete a key. */
  delete(path: string, key: Key): Promise<void>;

  /** Get the value for a key, or null if not found. */
  get(path: string, key: Key): Promise<Value | null>;

  /** Batch update multiple key-value pairs atomically. */
  batchUpdate(
    path: string,
    entries: Array<{ key: Key; value: Value }>
  ): Promise<Location[]>;

  // --- State transitions ---

  /** Commit pending operations to durable storage. */
  commit(path: string): Promise<DatabaseInfo>;

  /** Compute the Merkle root (merkleize). */
  merkleize(path: string): Promise<DatabaseInfo>;

  /** Transition to mutable state. */
  intoMutable(path: string): Promise<DatabaseInfo>;

  // --- Proofs ---

  /** Generate an inclusion/exclusion proof for a key at the current state. */
  prove(path: string, key: Key): Promise<Proof>;

  /** Generate a range proof over a span of operations. */
  rangeProof(path: string, start: Location, end: Location): Promise<Proof>;

  /** Verify a proof against a root digest. */
  verify(proof: Proof, root: Digest): Promise<VerifyResult>;

  // --- Sync ---

  /** Get operations since a given location (for sync). */
  operationsSince(
    path: string,
    since: Location,
    limit: number
  ): Promise<Operation[]>;

  /** Apply verified operations from a remote source. */
  applyOperations(path: string, operations: Operation[]): Promise<Bounds>;
}
