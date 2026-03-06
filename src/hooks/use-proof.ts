/**
 * useProof — hook for generating and verifying cryptographic proofs.
 */

import { useCallback, useMemo, useRef, useState } from "react";
import { useQMDBContext } from "../context/qmdb-context";
import type { Digest, Key, Location, Proof, VerifyResult } from "../types";

export interface UseProofReturn {
  /** Generate an inclusion proof for a key. */
  prove: (key: Key) => Promise<Proof>;
  /** Generate a range proof over operations. */
  rangeProof: (start: Location, end: Location) => Promise<Proof>;
  /** Verify a proof against a root. */
  verify: (proof: Proof, root: Digest) => Promise<VerifyResult>;
  /** Last verification result. */
  lastResult: VerifyResult | null;
  /** Whether any proof operation is in progress. */
  isPending: boolean;
}

export function useProof(): UseProofReturn {
  const ctx = useQMDBContext();
  const [lastResult, setLastResult] = useState<VerifyResult | null>(null);
  const [pendingCount, setPendingCount] = useState(0);
  const pendingRef = useRef(0);

  const trackPending = useCallback(
    async <T>(fn: () => Promise<T>): Promise<T> => {
      pendingRef.current += 1;
      setPendingCount(pendingRef.current);
      try {
        return await fn();
      } finally {
        pendingRef.current -= 1;
        setPendingCount(pendingRef.current);
      }
    },
    []
  );

  const prove = useCallback(
    (key: Key) => trackPending(() => ctx.prove(key)),
    [ctx.prove, trackPending]
  );

  const rangeProof = useCallback(
    (start: Location, end: Location) =>
      trackPending(() => ctx.rangeProof(start, end)),
    [ctx.rangeProof, trackPending]
  );

  const verify = useCallback(
    (proof: Proof, root: Digest) =>
      trackPending(async () => {
        const result = await ctx.verify(proof, root);
        setLastResult(result);
        return result;
      }),
    [ctx.verify, trackPending]
  );

  return useMemo(
    () => ({
      prove,
      rangeProof,
      verify,
      lastResult,
      isPending: pendingCount > 0,
    }),
    [prove, rangeProof, verify, lastResult, pendingCount]
  );
}
