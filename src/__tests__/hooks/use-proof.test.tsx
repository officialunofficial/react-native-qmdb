import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { ReactNode } from "react";
import { QMDBProvider } from "../../context/qmdb-context";
import { useQMDBContext } from "../../context/qmdb-context";
import { useProof } from "../../hooks/use-proof";
import { createMockNativeQMDB } from "../../native/mock";

function createWrapper() {
  const mock = createMockNativeQMDB();
  function Wrapper({ children }: { children: ReactNode }) {
    return <QMDBProvider nativeModule={mock}>{children}</QMDBProvider>;
  }
  return { Wrapper, mock };
}

/** Helper hook that exposes both context and proof hooks. */
function useCombined() {
  const ctx = useQMDBContext();
  const proof = useProof();
  return { ctx, proof };
}

describe("useProof", () => {
  it("starts with no result and not pending", () => {
    const { Wrapper } = createWrapper();
    const { result } = renderHook(() => useProof(), { wrapper: Wrapper });

    expect(result.current.lastResult).toBeNull();
    expect(result.current.isPending).toBe(false);
  });

  it("generates and verifies an inclusion proof", async () => {
    const { Wrapper } = createWrapper();
    const { result } = renderHook(() => useCombined(), { wrapper: Wrapper });

    // Setup: open, write data, commit, merkleize
    await act(async () => {
      await result.current.ctx.open({ path: "/test/proof", create: true });
      await result.current.ctx.intoMutable();
      await result.current.ctx.update("proofkey", "proofvalue");
      await result.current.ctx.commit();
      await result.current.ctx.merkleize();
    });

    const root = result.current.ctx.root!;
    expect(root).toBeTruthy();

    // Generate proof
    let proof: Awaited<ReturnType<typeof result.current.proof.prove>>;
    await act(async () => {
      proof = await result.current.proof.prove("proofkey");
    });

    expect(proof!.operations.length).toBeGreaterThan(0);
    expect(proof!.operations[0].key).toBe("proofkey");

    // Verify against correct root
    await act(async () => {
      const vr = await result.current.proof.verify(proof!, root);
      expect(vr.valid).toBe(true);
    });
    expect(result.current.proof.lastResult?.valid).toBe(true);
  });

  it("rejects proof against wrong root", async () => {
    const { Wrapper } = createWrapper();
    const { result } = renderHook(() => useCombined(), { wrapper: Wrapper });

    await act(async () => {
      await result.current.ctx.open({ path: "/test/badroot", create: true });
      await result.current.ctx.intoMutable();
      await result.current.ctx.update("x", "y");
      await result.current.ctx.commit();
      await result.current.ctx.merkleize();
    });

    let proof: Awaited<ReturnType<typeof result.current.proof.prove>>;
    await act(async () => {
      proof = await result.current.proof.prove("x");
    });

    // Verify against a fabricated root
    await act(async () => {
      const vr = await result.current.proof.verify(proof!, "0000000000000000");
      expect(vr.valid).toBe(false);
      expect(vr.reason).toBeTruthy();
    });
  });

  it("generates a range proof", async () => {
    const { Wrapper } = createWrapper();
    const { result } = renderHook(() => useCombined(), { wrapper: Wrapper });

    await act(async () => {
      await result.current.ctx.open({ path: "/test/range", create: true });
      await result.current.ctx.intoMutable();
      await result.current.ctx.update("a", "1");
      await result.current.ctx.update("b", "2");
      await result.current.ctx.update("c", "3");
    });

    let proof: Awaited<ReturnType<typeof result.current.proof.rangeProof>>;
    await act(async () => {
      proof = await result.current.proof.rangeProof(0, 2);
    });

    expect(proof!.operations).toHaveLength(2);
    expect(proof!.range.start).toBe(0);
    expect(proof!.range.end).toBe(2);
  });
});
