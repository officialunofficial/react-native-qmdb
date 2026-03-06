/**
 * useSync — hook for synchronizing local state with a remote QMDB instance.
 */

import { useCallback, useMemo, useState } from "react";
import { useQMDBContext } from "../context/qmdb-context";
import type { Location, Operation } from "../types";

export type SyncStatus = "idle" | "syncing" | "error" | "synced";

export interface UseSyncReturn {
  /** Current sync status. */
  status: SyncStatus;
  /** Error message if status is "error". */
  error: string | null;
  /** Last synced location (reactive). */
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
  const [lastSyncedLocation, setLastSyncedLocation] = useState<Location>(0);

  const handleError = useCallback((e: unknown) => {
    setError(e instanceof Error ? e.message : String(e));
    setStatus("error");
  }, []);

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
          setLastSyncedLocation(since + ops.length);
        }
        setStatus("synced");
      } catch (e) {
        handleError(e);
      }
    },
    [ctx.operationsSince, handleError]
  );

  const pull = useCallback(
    async (
      fetcher: (since: Location, limit: number) => Promise<Operation[]>,
      limit = 1000
    ) => {
      setStatus("syncing");
      setError(null);
      try {
        const ops = await fetcher(lastSyncedLocation, limit);
        if (ops.length > 0) {
          await ctx.applyOperations(ops);
          setLastSyncedLocation((prev) => prev + ops.length);
        }
        setStatus("synced");
      } catch (e) {
        handleError(e);
      }
    },
    [ctx.applyOperations, lastSyncedLocation, handleError]
  );

  return useMemo(
    () => ({
      status,
      error,
      lastSyncedLocation,
      push,
      pull,
    }),
    [status, error, lastSyncedLocation, push, pull]
  );
}
