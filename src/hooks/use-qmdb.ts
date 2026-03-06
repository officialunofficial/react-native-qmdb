/**
 * useQMDB — primary hook for interacting with the authenticated database.
 *
 * Wraps the context with convenience methods and memoized selectors.
 */

import { useCallback, useMemo } from "react";
import { useQMDBContext } from "../context/qmdb-context";
import type { DatabaseConfig, Key, Value } from "../types";

export interface UseQMDBReturn {
  /** Current Merkle root (null if not merkleized or not open). */
  root: string | null;
  /** Whether the database is open. */
  isOpen: boolean;
  /** Current database state. */
  state: string | null;
  /** Number of active keys. */
  activeKeys: number;
  /** Total operations in the log. */
  operationCount: number;

  /** Open a database. */
  open: (config: DatabaseConfig) => Promise<void>;
  /** Close the database. */
  close: () => Promise<void>;
  /** Get a value by key. */
  get: (key: Key) => Promise<Value | null>;
  /** Set a key-value pair. Requires mutable state. */
  set: (key: Key, value: Value) => Promise<void>;
  /** Delete a key. Requires mutable state. */
  remove: (key: Key) => Promise<void>;
  /** Commit + merkleize in one call. Returns the new root. */
  commitAndMerkleize: () => Promise<string>;
  /** Transition to mutable state for writes. */
  startTransaction: () => Promise<void>;
}

export function useQMDB(): UseQMDBReturn {
  const ctx = useQMDBContext();

  const open = useCallback(
    async (config: DatabaseConfig) => {
      await ctx.open(config);
    },
    [ctx.open]
  );

  const set = useCallback(
    async (key: Key, value: Value) => {
      await ctx.update(key, value);
    },
    [ctx.update]
  );

  const commitAndMerkleize = useCallback(async () => {
    await ctx.commit();
    const info = await ctx.merkleize();
    return info.root;
  }, [ctx.commit, ctx.merkleize]);

  const startTransaction = useCallback(async () => {
    await ctx.intoMutable();
  }, [ctx.intoMutable]);

  return useMemo(
    () => ({
      root: ctx.root,
      isOpen: ctx.isOpen,
      state: ctx.info?.state ?? null,
      activeKeys: ctx.info?.activeKeys ?? 0,
      operationCount: ctx.info?.bounds.end ?? 0,

      open,
      close: ctx.close,
      get: ctx.get,
      set,
      remove: ctx.remove,
      commitAndMerkleize,
      startTransaction,
    }),
    [
      ctx.root,
      ctx.isOpen,
      ctx.info,
      open,
      ctx.close,
      ctx.get,
      set,
      ctx.remove,
      commitAndMerkleize,
      startTransaction,
    ]
  );
}
