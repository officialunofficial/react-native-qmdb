import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { ReactNode } from "react";
import { QMDBProvider } from "../../context/qmdb-context";
import { useQMDB } from "../../hooks/use-qmdb";
import { createMockNativeQMDB } from "../../native/mock";

function createWrapper() {
  const mock = createMockNativeQMDB();
  function Wrapper({ children }: { children: ReactNode }) {
    return <QMDBProvider nativeModule={mock}>{children}</QMDBProvider>;
  }
  return { Wrapper, mock };
}

describe("useQMDB", () => {
  it("starts in closed state", () => {
    const { Wrapper } = createWrapper();
    const { result } = renderHook(() => useQMDB(), { wrapper: Wrapper });

    expect(result.current.isOpen).toBe(false);
    expect(result.current.root).toBeNull();
    expect(result.current.state).toBeNull();
    expect(result.current.activeKeys).toBe(0);
    expect(result.current.operationCount).toBe(0);
  });

  it("opens and exposes database state", async () => {
    const { Wrapper } = createWrapper();
    const { result } = renderHook(() => useQMDB(), { wrapper: Wrapper });

    await act(async () => {
      await result.current.open({ path: "/test/hook", create: true });
    });

    expect(result.current.isOpen).toBe(true);
    expect(result.current.state).toBe("clean");
  });

  it("set/get roundtrip", async () => {
    const { Wrapper } = createWrapper();
    const { result } = renderHook(() => useQMDB(), { wrapper: Wrapper });

    await act(async () => {
      await result.current.open({ path: "/test/setget", create: true });
      await result.current.startTransaction();
    });

    await act(async () => {
      await result.current.set("mykey", "myvalue");
    });

    const value = await result.current.get("mykey");
    expect(value).toBe("myvalue");
  });

  it("commitAndMerkleize returns root", async () => {
    const { Wrapper } = createWrapper();
    const { result } = renderHook(() => useQMDB(), { wrapper: Wrapper });

    await act(async () => {
      await result.current.open({ path: "/test/commit", create: true });
      await result.current.startTransaction();
      await result.current.set("k", "v");
    });

    let root: string = "";
    await act(async () => {
      root = await result.current.commitAndMerkleize();
    });

    expect(root).toBeTruthy();
    expect(root.length).toBeGreaterThan(0);
    expect(result.current.state).toBe("clean");
    expect(result.current.root).toBe(root);
  });

  it("remove deletes a key", async () => {
    const { Wrapper } = createWrapper();
    const { result } = renderHook(() => useQMDB(), { wrapper: Wrapper });

    await act(async () => {
      await result.current.open({ path: "/test/remove", create: true });
      await result.current.startTransaction();
      await result.current.set("ephemeral", "data");
    });

    expect(await result.current.get("ephemeral")).toBe("data");

    await act(async () => {
      await result.current.remove("ephemeral");
    });

    expect(await result.current.get("ephemeral")).toBeNull();
  });

  it("close resets all state", async () => {
    const { Wrapper } = createWrapper();
    const { result } = renderHook(() => useQMDB(), { wrapper: Wrapper });

    await act(async () => {
      await result.current.open({ path: "/test/closeHook", create: true });
    });
    expect(result.current.isOpen).toBe(true);

    await act(async () => {
      await result.current.close();
    });

    expect(result.current.isOpen).toBe(false);
    expect(result.current.state).toBeNull();
    expect(result.current.root).toBeNull();
  });
});
