/**
 * Nitro Module spec for QMDB.
 *
 * Nitrogen generates C++ bindings from this interface.
 * The C++ HybridObject calls Rust extern "C" FFI functions.
 */

import type { HybridObject } from "react-native-nitro-modules";

/**
 * Database configuration passed to open().
 */
export interface DatabaseConfig {
  path: string;
  create: boolean;
  pageCacheSize?: number;
}

/**
 * Snapshot of database state returned by state-mutating operations.
 */
export interface DatabaseInfo {
  state: string;
  root: string;
  bounds: { start: number; end: number };
  inactivityFloor: number;
  activeKeys: number;
}

/**
 * A recorded operation in the append-only log.
 */
export interface QMDBOperation {
  type: string;
  key: string;
  value?: string;
  location: number;
}

/**
 * A Merkle proof over a range of operations.
 */
export interface QMDBProof {
  operations: QMDBOperation[];
  nodes: string[];
  range: { start: number; end: number };
}

/**
 * Result of verifying a proof against a root.
 */
export interface VerifyResult {
  valid: boolean;
  reason?: string;
}

/**
 * The native QMDB HybridObject — implemented in C++, backed by Rust.
 *
 * Sync methods (get, version) run on the JS thread for zero-overhead reads.
 * Async methods (open, commit, merkleize, prove) run on a background thread.
 */
export interface QMDB
  extends HybridObject<{ ios: "c++"; android: "c++" }> {
  // Lifecycle
  readonly version: string;
  open(config: DatabaseConfig): Promise<DatabaseInfo>;
  close(path: string): Promise<void>;
  destroy(path: string): Promise<void>;
  info(path: string): Promise<DatabaseInfo>;

  // KV Operations — get is sync for fast reads
  get(path: string, key: string): string | undefined;
  update(path: string, key: string, value: string): Promise<number>;
  remove(path: string, key: string): Promise<void>;
  batchUpdate(
    path: string,
    entries: Array<{ key: string; value: string }>
  ): Promise<number[]>;

  // State Machine
  intoMutable(path: string): Promise<DatabaseInfo>;
  commit(path: string): Promise<DatabaseInfo>;
  merkleize(path: string): Promise<DatabaseInfo>;

  // Proofs
  prove(path: string, key: string): Promise<QMDBProof>;
  rangeProof(
    path: string,
    start: number,
    end: number
  ): Promise<QMDBProof>;
  verify(proof: QMDBProof, root: string): Promise<VerifyResult>;

  // Sync
  operationsSince(
    path: string,
    since: number,
    limit: number
  ): Promise<QMDBOperation[]>;
  applyOperations(
    path: string,
    operations: QMDBOperation[]
  ): Promise<void>;
}
