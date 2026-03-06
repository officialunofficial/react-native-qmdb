import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { ReactNode } from "react";
import { QMDBProvider, useQMDBContext } from "../../context/qmdb-context";
import { useQMDB } from "../../hooks/use-qmdb";
import { useProof } from "../../hooks/use-proof";
import { createMockNativeQMDB } from "../../native/mock";

function createWrapper() {
  const mock = createMockNativeQMDB();
  function Wrapper({ children }: { children: ReactNode }) {
    return <QMDBProvider nativeModule={mock}>{children}</QMDBProvider>;
  }
  return { Wrapper, mock };
}

function useAll() {
  const ctx = useQMDBContext();
  const db = useQMDB();
  const proof = useProof();
  return { ctx, db, proof };
}

describe("full workflow integration", () => {
  it("open → write → commit → prove → verify → close", async () => {
    const { Wrapper } = createWrapper();
    const { result } = renderHook(() => useAll(), { wrapper: Wrapper });

    // 1. Open
    await act(async () => {
      await result.current.db.open({ path: "/test/full", create: true });
    });
    expect(result.current.db.isOpen).toBe(true);
    expect(result.current.db.state).toBe("clean");

    // 2. Start transaction
    await act(async () => {
      await result.current.db.startTransaction();
    });
    expect(result.current.db.state).toBe("mutable");

    // 3. Write data
    await act(async () => {
      await result.current.db.set("user:alice", "fid:1234");
      await result.current.db.set("user:bob", "fid:5678");
      await result.current.db.set("cast:0xabc", "hello world");
    });

    // 4. Read back
    expect(await result.current.db.get("user:alice")).toBe("fid:1234");
    expect(await result.current.db.get("cast:0xabc")).toBe("hello world");
    expect(await result.current.db.get("nonexistent")).toBeNull();

    // 5. Commit + merkleize
    let root: string = "";
    await act(async () => {
      root = await result.current.db.commitAndMerkleize();
    });
    expect(root).toBeTruthy();
    expect(result.current.db.state).toBe("clean");
    expect(result.current.db.root).toBe(root);

    // 6. Prove inclusion of a key
    let proof: Awaited<ReturnType<typeof result.current.proof.prove>>;
    await act(async () => {
      proof = await result.current.proof.prove("user:alice");
    });
    expect(proof!.operations.length).toBeGreaterThan(0);

    // 7. Verify proof against the root
    await act(async () => {
      const vr = await result.current.proof.verify(proof!, root);
      expect(vr.valid).toBe(true);
    });

    // 8. Verify proof fails against wrong root
    await act(async () => {
      const vr = await result.current.proof.verify(proof!, "baadcafe".repeat(8));
      expect(vr.valid).toBe(false);
    });

    // 9. Close
    await act(async () => {
      await result.current.db.close();
    });
    expect(result.current.db.isOpen).toBe(false);
    expect(result.current.db.root).toBeNull();
  });

  it("multiple transactions produce different roots", async () => {
    const { Wrapper } = createWrapper();
    const { result } = renderHook(() => useAll(), { wrapper: Wrapper });

    await act(async () => {
      await result.current.db.open({ path: "/test/roots", create: true });
      await result.current.db.startTransaction();
      await result.current.db.set("a", "1");
    });

    let root1: string = "";
    await act(async () => {
      root1 = await result.current.db.commitAndMerkleize();
    });

    // Second transaction with different data
    await act(async () => {
      await result.current.db.startTransaction();
      await result.current.db.set("b", "2");
    });

    let root2: string = "";
    await act(async () => {
      root2 = await result.current.db.commitAndMerkleize();
    });

    // Roots must differ since the log has different content
    expect(root1).not.toBe(root2);
  });

  it("delete removes key from provable state", async () => {
    const { Wrapper } = createWrapper();
    const { result } = renderHook(() => useAll(), { wrapper: Wrapper });

    await act(async () => {
      await result.current.db.open({ path: "/test/delete", create: true });
      await result.current.db.startTransaction();
      await result.current.db.set("temp", "data");
      await result.current.db.remove("temp");
    });

    expect(await result.current.db.get("temp")).toBeNull();
  });

  it("batch update + proof roundtrip", async () => {
    const { Wrapper } = createWrapper();
    const { result } = renderHook(() => useAll(), { wrapper: Wrapper });

    await act(async () => {
      await result.current.ctx.open({ path: "/test/batch-proof", create: true });
      await result.current.ctx.intoMutable();
      await result.current.ctx.batchUpdate([
        { key: "x", value: "10" },
        { key: "y", value: "20" },
        { key: "z", value: "30" },
      ]);
      await result.current.ctx.commit();
      await result.current.ctx.merkleize();
    });

    const root = result.current.ctx.root!;

    // Range proof over all operations
    let rangeProof: Awaited<ReturnType<typeof result.current.proof.rangeProof>>;
    await act(async () => {
      rangeProof = await result.current.proof.rangeProof(0, 3);
    });

    expect(rangeProof!.operations).toHaveLength(3);

    await act(async () => {
      const vr = await result.current.proof.verify(rangeProof!, root);
      expect(vr.valid).toBe(true);
    });
  });
});
