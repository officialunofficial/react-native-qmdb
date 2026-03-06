/**
 * Core QMDB types — platform-agnostic database abstractions.
 *
 * These types model the QMDB state machine:
 *   init() → Clean → into_mutable() → Mutable → commit() → Durable → into_merkleized() → Clean
 */

/** A 32-byte SHA-256 digest, hex-encoded. */
export type Digest = string;

/** A location in the append-only operation log. */
export type Location = number;

/** A key in the key-value store (hex-encoded bytes). */
export type Key = string;

/** A value in the key-value store (hex-encoded bytes). */
export type Value = string;

/** The four orthogonal states of an authenticated database. */
export type DatabaseState =
  | "clean" // Merkleized + Durable
  | "mutable" // Unmerkleized + NonDurable
  | "merkleized_nondurable" // Merkleized + NonDurable
  | "unmerkleized_durable"; // Unmerkleized + Durable

/** Range of valid operations in the log. */
export interface Bounds {
  /** First valid location (inclusive). */
  start: Location;
  /** One past the last valid location (exclusive). */
  end: Location;
}

/** An operation recorded in the append-only log. */
export interface Operation {
  type: "update" | "delete";
  key: Key;
  value?: Value;
  location: Location;
}

/** A Merkle proof over a range of operations. */
export interface Proof {
  /** The operations covered by this proof. */
  operations: Operation[];
  /** MMR nodes needed to verify the proof. */
  nodes: Digest[];
  /** The range of locations this proof covers. */
  range: Bounds;
}

/** Result of verifying a proof against a known root. */
export interface VerifyResult {
  valid: boolean;
  /** If invalid, reason for failure. */
  reason?: string;
}

/** Configuration for initializing a QMDB instance. */
export interface DatabaseConfig {
  /** Filesystem path for the database storage directory. */
  path: string;
  /** Whether to create the database if it doesn't exist. */
  create: boolean;
  /** Page cache size in bytes (default: 4MB). */
  pageCacheSize?: number;
}

/** Snapshot of the database's current state. */
export interface DatabaseInfo {
  state: DatabaseState;
  root: Digest;
  bounds: Bounds;
  inactivityFloor: Location;
  activeKeys: number;
}
