/**
 * QMDBProvider — React 19 context for managing authenticated database instances.
 *
 * Uses React 19 `use()` for async resource reading and provides a stable
 * reference to the database operations via context.
 */

import {
  createContext,
  useCallback,
  useContext,
  useRef,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { getNativeModule } from "../native/module";
import type {
  DatabaseConfig,
  DatabaseInfo,
  Digest,
  Key,
  Location,
  NativeQMDB,
  Operation,
  Proof,
  Value,
  VerifyResult,
} from "../types";

/** The public API surface exposed by the QMDB context. */
export interface QMDBContextValue {
  /** Current database info (reactive — triggers re-render on change). */
  info: DatabaseInfo | null;
  /** Whether the database is currently open. */
  isOpen: boolean;
  /** The current Merkle root, or null if not merkleized. */
  root: Digest | null;

  // Lifecycle
  open(config: DatabaseConfig): Promise<DatabaseInfo>;
  close(): Promise<void>;

  // KV operations
  get(key: Key): Promise<Value | null>;
  update(key: Key, value: Value): Promise<Location>;
  remove(key: Key): Promise<void>;
  batchUpdate(entries: Array<{ key: Key; value: Value }>): Promise<Location[]>;

  // State machine
  commit(): Promise<DatabaseInfo>;
  merkleize(): Promise<DatabaseInfo>;
  intoMutable(): Promise<DatabaseInfo>;

  // Proofs
  prove(key: Key): Promise<Proof>;
  rangeProof(start: Location, end: Location): Promise<Proof>;
  verify(proof: Proof, root: Digest): Promise<VerifyResult>;

  // Sync
  operationsSince(since: Location, limit?: number): Promise<Operation[]>;
  applyOperations(operations: Operation[]): Promise<void>;
}

const QMDBContext = createContext<QMDBContextValue | null>(null);

export interface QMDBProviderProps {
  children: ReactNode;
  /** Optional: inject a custom native module (useful for testing). */
  nativeModule?: NativeQMDB;
}

type Listener = () => void;

export function QMDBProvider({ children, nativeModule }: QMDBProviderProps) {
  const mod = nativeModule ?? getNativeModule();
  const pathRef = useRef<string | null>(null);

  // External store for reactive info updates
  const infoRef = useRef<DatabaseInfo | null>(null);
  const listenersRef = useRef(new Set<Listener>());

  const subscribe = useCallback((listener: Listener) => {
    listenersRef.current.add(listener);
    return () => listenersRef.current.delete(listener);
  }, []);

  const getSnapshot = useCallback(() => infoRef.current, []);

  const setInfo = useCallback((next: DatabaseInfo | null) => {
    infoRef.current = next;
    for (const listener of listenersRef.current) listener();
  }, []);

  const info = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  const requirePath = (): string => {
    const p = pathRef.current;
    if (!p) throw new Error("QMDB: database not open. Call open() first.");
    return p;
  };

  const open = useCallback(
    async (config: DatabaseConfig) => {
      const result = await mod.open(config);
      pathRef.current = config.path;
      setInfo(result);
      return result;
    },
    [mod, setInfo]
  );

  const close = useCallback(async () => {
    const p = requirePath();
    await mod.close(p);
    pathRef.current = null;
    setInfo(null);
  }, [mod, setInfo]);

  const get = useCallback(
    (key: Key) => mod.get(requirePath(), key),
    [mod]
  );

  const update = useCallback(
    async (key: Key, value: Value) => {
      const loc = await mod.update(requirePath(), key, value);
      return loc;
    },
    [mod]
  );

  const remove = useCallback(
    async (key: Key) => {
      await mod.delete(requirePath(), key);
    },
    [mod]
  );

  const batchUpdate = useCallback(
    (entries: Array<{ key: Key; value: Value }>) =>
      mod.batchUpdate(requirePath(), entries),
    [mod]
  );

  const commit = useCallback(async () => {
    const result = await mod.commit(requirePath());
    setInfo(result);
    return result;
  }, [mod, setInfo]);

  const merkleize = useCallback(async () => {
    const result = await mod.merkleize(requirePath());
    setInfo(result);
    return result;
  }, [mod, setInfo]);

  const intoMutable = useCallback(async () => {
    const result = await mod.intoMutable(requirePath());
    setInfo(result);
    return result;
  }, [mod, setInfo]);

  const prove = useCallback(
    (key: Key) => mod.prove(requirePath(), key),
    [mod]
  );

  const rangeProof = useCallback(
    (start: Location, end: Location) =>
      mod.rangeProof(requirePath(), start, end),
    [mod]
  );

  const verify = useCallback(
    (proof: Proof, root: Digest) => mod.verify(proof, root),
    [mod]
  );

  const operationsSince = useCallback(
    (since: Location, limit = 100) =>
      mod.operationsSince(requirePath(), since, limit),
    [mod]
  );

  const applyOperations = useCallback(
    async (operations: Operation[]) => {
      await mod.applyOperations(requirePath(), operations);
    },
    [mod]
  );

  const value: QMDBContextValue = {
    info,
    isOpen: pathRef.current !== null,
    root: info?.state === "clean" || info?.state === "merkleized_nondurable"
      ? info.root
      : null,

    open,
    close,
    get,
    update,
    remove,
    batchUpdate,
    commit,
    merkleize,
    intoMutable,
    prove,
    rangeProof,
    verify,
    operationsSince,
    applyOperations,
  };

  return <QMDBContext.Provider value={value}>{children}</QMDBContext.Provider>;
}

/** Access the QMDB context. Throws if used outside a QMDBProvider. */
export function useQMDBContext(): QMDBContextValue {
  const ctx = useContext(QMDBContext);
  if (!ctx) {
    throw new Error("useQMDBContext must be used within a <QMDBProvider>");
  }
  return ctx;
}
