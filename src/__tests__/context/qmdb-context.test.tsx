import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { ReactNode } from "react";
import { QMDBProvider, useQMDBContext } from "../../context/qmdb-context";
import { createMockNativeQMDB } from "../../native/mock";

function createWrapper() {
  const mock = createMockNativeQMDB();
  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QMDBProvider nativeModule={mock}>{children}</QMDBProvider>
    );
  }
  return { Wrapper, mock };
}

describe("QMDBProvider + useQMDBContext", () => {
  it("throws when used outside provider", () => {
    expect(() => {
      renderHook(() => useQMDBContext());
    }).toThrow("useQMDBContext must be used within a <QMDBProvider>");
  });

  it("starts with null info and isOpen=false", () => {
    const { Wrapper } = createWrapper();
    const { result } = renderHook(() => useQMDBContext(), {
      wrapper: Wrapper,
    });

    expect(result.current.info).toBeNull();
    expect(result.current.isOpen).toBe(false);
    expect(result.current.root).toBeNull();
  });

  it("opens a database and updates info", async () => {
    const { Wrapper } = createWrapper();
    const { result } = renderHook(() => useQMDBContext(), {
      wrapper: Wrapper,
    });

    await act(async () => {
      await result.current.open({ path: "/test/db", create: true });
    });

    expect(result.current.info).not.toBeNull();
    expect(result.current.info!.state).toBe("clean");
    expect(result.current.info!.activeKeys).toBe(0);
  });

  it("transitions through the state machine", async () => {
    const { Wrapper } = createWrapper();
    const { result } = renderHook(() => useQMDBContext(), {
      wrapper: Wrapper,
    });

    // Open → Clean
    await act(async () => {
      await result.current.open({ path: "/test/sm", create: true });
    });
    expect(result.current.info!.state).toBe("clean");

    // Clean → Mutable
    await act(async () => {
      await result.current.intoMutable();
    });
    expect(result.current.info!.state).toBe("mutable");

    // Write data
    await act(async () => {
      await result.current.update("aa", "bb");
    });

    // Mutable → Unmerkleized Durable (commit)
    await act(async () => {
      await result.current.commit();
    });
    expect(result.current.info!.state).toBe("unmerkleized_durable");

    // Unmerkleized Durable → Clean (merkleize)
    await act(async () => {
      await result.current.merkleize();
    });
    expect(result.current.info!.state).toBe("clean");
    expect(result.current.root).not.toBeNull();
  });

  it("performs CRUD operations", async () => {
    const { Wrapper } = createWrapper();
    const { result } = renderHook(() => useQMDBContext(), {
      wrapper: Wrapper,
    });

    await act(async () => {
      await result.current.open({ path: "/test/crud", create: true });
      await result.current.intoMutable();
    });

    // Create
    await act(async () => {
      await result.current.update("key1", "value1");
      await result.current.update("key2", "value2");
    });

    // Read
    const v1 = await result.current.get("key1");
    expect(v1).toBe("value1");

    const v2 = await result.current.get("key2");
    expect(v2).toBe("value2");

    // Update
    await act(async () => {
      await result.current.update("key1", "updated");
    });
    const v1Updated = await result.current.get("key1");
    expect(v1Updated).toBe("updated");

    // Delete
    await act(async () => {
      await result.current.remove("key2");
    });
    const v2Deleted = await result.current.get("key2");
    expect(v2Deleted).toBeNull();
  });

  it("batch updates multiple entries", async () => {
    const { Wrapper } = createWrapper();
    const { result } = renderHook(() => useQMDBContext(), {
      wrapper: Wrapper,
    });

    await act(async () => {
      await result.current.open({ path: "/test/batch", create: true });
      await result.current.intoMutable();
    });

    let locations: number[] = [];
    await act(async () => {
      locations = await result.current.batchUpdate([
        { key: "a", value: "1" },
        { key: "b", value: "2" },
        { key: "c", value: "3" },
      ]);
    });

    expect(locations).toHaveLength(3);
    expect(await result.current.get("a")).toBe("1");
    expect(await result.current.get("b")).toBe("2");
    expect(await result.current.get("c")).toBe("3");
  });

  it("closes the database and resets info", async () => {
    const { Wrapper } = createWrapper();
    const { result } = renderHook(() => useQMDBContext(), {
      wrapper: Wrapper,
    });

    await act(async () => {
      await result.current.open({ path: "/test/close", create: true });
    });
    expect(result.current.info).not.toBeNull();

    await act(async () => {
      await result.current.close();
    });
    expect(result.current.info).toBeNull();
  });

  it("rejects mutations in non-mutable state", async () => {
    const { Wrapper } = createWrapper();
    const { result } = renderHook(() => useQMDBContext(), {
      wrapper: Wrapper,
    });

    await act(async () => {
      await result.current.open({ path: "/test/reject", create: true });
    });

    // Should fail — database is in "clean" state, not "mutable"
    await expect(result.current.update("k", "v")).rejects.toThrow(
      "Cannot update in state"
    );
  });
});
