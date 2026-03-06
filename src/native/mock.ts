/**
 * In-memory mock of the native QMDB module for testing.
 *
 * Implements the full NativeQMDB interface with a JS-side Map,
 * simulating the state machine transitions and proof generation.
 */

import type {
  Bounds,
  DatabaseConfig,
  DatabaseInfo,
  DatabaseState,
  Digest,
  Key,
  Location,
  NativeQMDB,
  Operation,
  Proof,
  Value,
  VerifyResult,
} from "../types";
import { sha256Hex } from "../utils/digest";

interface DBInstance {
  state: DatabaseState;
  store: Map<Key, Value>;
  log: Operation[];
  inactivityFloor: number;
  root: Digest;
}

const instances = new Map<string, DBInstance>();

function computeRoot(log: Operation[]): Digest {
  if (log.length === 0) return sha256Hex("");
  const serialized = log.map((op) => `${op.type}:${op.key}:${op.value ?? ""}`).join("|");
  return sha256Hex(serialized);
}

function getDB(path: string): DBInstance {
  const db = instances.get(path);
  if (!db) throw new Error(`Database not open: ${path}`);
  return db;
}

function toInfo(db: DBInstance): DatabaseInfo {
  return {
    state: db.state,
    root: db.root,
    bounds: { start: 0, end: db.log.length },
    inactivityFloor: db.inactivityFloor,
    activeKeys: db.store.size,
  };
}

export function createMockNativeQMDB(): NativeQMDB {
  return {
    async open(config: DatabaseConfig): Promise<DatabaseInfo> {
      if (instances.has(config.path) ) {
        return toInfo(getDB(config.path));
      }
      const db: DBInstance = {
        state: "clean",
        store: new Map(),
        log: [],
        inactivityFloor: 0,
        root: computeRoot([]),
      };
      instances.set(config.path, db);
      return toInfo(db);
    },

    async close(path: string): Promise<void> {
      getDB(path); // throws if not open
      instances.delete(path);
    },

    async destroy(path: string): Promise<void> {
      instances.delete(path);
    },

    async info(path: string): Promise<DatabaseInfo> {
      return toInfo(getDB(path));
    },

    async update(path: string, key: Key, value: Value): Promise<Location> {
      const db = getDB(path);
      if (db.state !== "mutable") throw new Error(`Cannot update in state: ${db.state}`);
      db.store.set(key, value);
      const loc = db.log.length;
      db.log.push({ type: "update", key, value, location: loc });
      return loc;
    },

    async delete(path: string, key: Key): Promise<void> {
      const db = getDB(path);
      if (db.state !== "mutable") throw new Error(`Cannot delete in state: ${db.state}`);
      db.store.delete(key);
      db.log.push({ type: "delete", key, location: db.log.length });
    },

    async get(path: string, key: Key): Promise<Value | null> {
      const db = getDB(path);
      return db.store.get(key) ?? null;
    },

    async batchUpdate(
      path: string,
      entries: Array<{ key: Key; value: Value }>
    ): Promise<Location[]> {
      const db = getDB(path);
      if (db.state !== "mutable") throw new Error(`Cannot batch update in state: ${db.state}`);
      const locations: Location[] = [];
      for (const { key, value } of entries) {
        db.store.set(key, value);
        const loc = db.log.length;
        db.log.push({ type: "update", key, value, location: loc });
        locations.push(loc);
      }
      return locations;
    },

    async commit(path: string): Promise<DatabaseInfo> {
      const db = getDB(path);
      if (db.state !== "mutable") throw new Error(`Cannot commit in state: ${db.state}`);
      db.state = "unmerkleized_durable";
      return toInfo(db);
    },

    async merkleize(path: string): Promise<DatabaseInfo> {
      const db = getDB(path);
      if (db.state === "clean" || db.state === "mutable") {
        throw new Error(`Cannot merkleize in state: ${db.state}`);
      }
      db.root = computeRoot(db.log);
      if (db.state === "unmerkleized_durable") {
        db.state = "clean";
      } else {
        db.state = "merkleized_nondurable";
      }
      return toInfo(db);
    },

    async intoMutable(path: string): Promise<DatabaseInfo> {
      const db = getDB(path);
      db.state = "mutable";
      return toInfo(db);
    },

    async prove(path: string, key: Key): Promise<Proof> {
      const db = getDB(path);
      const ops = db.log.filter((op) => op.key === key);
      return {
        operations: ops,
        nodes: [db.root],
        range: { start: 0, end: db.log.length },
      };
    },

    async rangeProof(path: string, start: Location, end: Location): Promise<Proof> {
      const db = getDB(path);
      const ops = db.log.slice(start, end);
      return {
        operations: ops,
        nodes: [db.root],
        range: { start, end },
      };
    },

    async verify(proof: Proof, root: Digest): Promise<VerifyResult> {
      if (proof.nodes.length > 0 && proof.nodes[0] === root) {
        return { valid: true };
      }
      return { valid: false, reason: "Root mismatch" };
    },

    async operationsSince(
      path: string,
      since: Location,
      limit: number
    ): Promise<Operation[]> {
      const db = getDB(path);
      return db.log.slice(since, since + limit);
    },

    async applyOperations(path: string, operations: Operation[]): Promise<Bounds> {
      const db = getDB(path);
      if (db.state !== "mutable") throw new Error(`Cannot apply operations in state: ${db.state}`);
      for (const op of operations) {
        if (op.type === "update" && op.value != null) {
          db.store.set(op.key, op.value);
        } else if (op.type === "delete") {
          db.store.delete(op.key);
        }
        db.log.push({ ...op, location: db.log.length });
      }
      return { start: 0, end: db.log.length };
    },
  };
}

/** Reset all mock database instances (for test cleanup). */
export function resetMockInstances(): void {
  instances.clear();
}
