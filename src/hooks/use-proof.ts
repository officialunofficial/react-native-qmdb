/**
 * useProof — hook for generating and verifying cryptographic proofs.
 */

import { useCallback, useMemo, useState } from "react";
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
  /** Whether a proof operation is in progress. */
  isPending: boolean;
}

export function useProof(): UseProofReturn {
  const ctx = useQMDBContext();
  const [lastResult, setLastResult] = useState<VerifyResult | null>(null);
  const [isPending, setIsPending] = useState(false);

  const prove = useCallback(
    async (key: Key) => {
      setIsPending(true);
      try {
        return await ctx.prove(key);
      } finally {
        setIsPending(false);
      }
    },
    [ctx.prove]
  );

  const rangeProof = useCallback(
    async (start: Location, end: Location) => {
      setIsPending(true);
      try {
        return await ctx.rangeProof(start, end);
      } finally {
        setIsPending(false);
      }
    },
    [ctx.rangeProof]
  );

  const verify = useCallback(
    async (proof: Proof, root: Digest) => {
      setIsPending(true);
      try {
        const result = await ctx.verify(proof, root);
        setLastResult(result);
        return result;
      } finally {
        setIsPending(false);
      }
    },
    [ctx.verify]
  );

  return useMemo(
    () => ({ prove, rangeProof, verify, lastResult, isPending }),
    [prove, rangeProof, verify, lastResult, isPending]
  );
}
