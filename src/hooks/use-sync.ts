/**
 * useSync — hook for synchronizing local state with a remote QMDB instance.
 */

import { useCallback, useMemo, useRef, useState } from "react";
import { useQMDBContext } from "../context/qmdb-context";
import type { Location, Operation } from "../types";

export type SyncStatus = "idle" | "syncing" | "error" | "synced";

export interface UseSyncReturn {
  /** Current sync status. */
  status: SyncStatus;
  /** Error message if status is "error". */
  error: string | null;
  /** Last synced location. */
  lastSyncedLocation: Location;

  /** Push local operations to a remote endpoint. */
  push: (
    since: Location,
    sender: (operations: Operation[]) => Promise<void>
  ) => Promise<void>;

  /** Pull remote operations and apply locally. */
  pull: (
    fetcher: (since: Location, limit: number) => Promise<Operation[]>,
    limit?: number
  ) => Promise<void>;
}

export function useSync(): UseSyncReturn {
  const ctx = useQMDBContext();
  const [status, setStatus] = useState<SyncStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const lastSyncedRef = useRef<Location>(0);

  const push = useCallback(
    async (
      since: Location,
      sender: (operations: Operation[]) => Promise<void>
    ) => {
      setStatus("syncing");
      setError(null);
      try {
        const ops = await ctx.operationsSince(since);
        if (ops.length > 0) {
          await sender(ops);
          lastSyncedRef.current = since + ops.length;
        }
        setStatus("synced");
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
        setStatus("error");
      }
    },
    [ctx.operationsSince]
  );

  const pull = useCallback(
    async (
      fetcher: (since: Location, limit: number) => Promise<Operation[]>,
      limit = 1000
    ) => {
      setStatus("syncing");
      setError(null);
      try {
        const ops = await fetcher(lastSyncedRef.current, limit);
        if (ops.length > 0) {
          await ctx.applyOperations(ops);
          lastSyncedRef.current += ops.length;
        }
        setStatus("synced");
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
        setStatus("error");
      }
    },
    [ctx.applyOperations]
  );

  return useMemo(
    () => ({
      status,
      error,
      lastSyncedLocation: lastSyncedRef.current,
      push,
      pull,
    }),
    [status, error, push, pull]
  );
}
