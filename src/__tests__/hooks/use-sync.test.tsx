import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { QMDBProvider, useQMDBContext } from "../../context/qmdb-context";
import { useSync } from "../../hooks/use-sync";
import { createMockNativeQMDB } from "../../native/mock";
import type { Operation } from "../../types";

function createWrapper() {
  const mock = createMockNativeQMDB();
  function Wrapper({ children }: { children: ReactNode }) {
    return <QMDBProvider nativeModule={mock}>{children}</QMDBProvider>;
  }
  return { Wrapper, mock };
}

function useCombined() {
  const ctx = useQMDBContext();
  const sync = useSync();
  return { ctx, sync };
}

describe("useSync", () => {
  it("starts in idle state", () => {
    const { Wrapper } = createWrapper();
    const { result } = renderHook(() => useSync(), { wrapper: Wrapper });

    expect(result.current.status).toBe("idle");
    expect(result.current.error).toBeNull();
    expect(result.current.lastSyncedLocation).toBe(0);
  });

  it("pushes local operations to a remote", async () => {
    const { Wrapper } = createWrapper();
    const { result } = renderHook(() => useCombined(), { wrapper: Wrapper });

    // Setup data
    await act(async () => {
      await result.current.ctx.open({ path: "/test/push", create: true });
      await result.current.ctx.intoMutable();
      await result.current.ctx.update("k1", "v1");
      await result.current.ctx.update("k2", "v2");
    });

    const sender = vi.fn<(ops: Operation[]) => Promise<void>>().mockResolvedValue(undefined);

    await act(async () => {
      await result.current.sync.push(0, sender);
    });

    expect(sender).toHaveBeenCalledOnce();
    expect(sender.mock.calls[0][0]).toHaveLength(2);
    expect(result.current.sync.status).toBe("synced");
  });

  it("pulls remote operations and applies locally", async () => {
    const { Wrapper } = createWrapper();
    const { result } = renderHook(() => useCombined(), { wrapper: Wrapper });

    await act(async () => {
      await result.current.ctx.open({ path: "/test/pull", create: true });
      await result.current.ctx.intoMutable();
    });

    const remoteOps: Operation[] = [
      { type: "update", key: "remote1", value: "rval1", location: 0 },
      { type: "update", key: "remote2", value: "rval2", location: 1 },
    ];

    const fetcher = vi.fn().mockResolvedValue(remoteOps);

    await act(async () => {
      await result.current.sync.pull(fetcher);
    });

    expect(fetcher).toHaveBeenCalledOnce();
    expect(result.current.sync.status).toBe("synced");

    // Verify data was applied
    expect(await result.current.ctx.get("remote1")).toBe("rval1");
    expect(await result.current.ctx.get("remote2")).toBe("rval2");
  });

  it("handles push errors gracefully", async () => {
    const { Wrapper } = createWrapper();
    const { result } = renderHook(() => useCombined(), { wrapper: Wrapper });

    await act(async () => {
      await result.current.ctx.open({ path: "/test/pusherr", create: true });
      await result.current.ctx.intoMutable();
      await result.current.ctx.update("k", "v");
    });

    const sender = vi.fn().mockRejectedValue(new Error("Network failure"));

    await act(async () => {
      await result.current.sync.push(0, sender);
    });

    expect(result.current.sync.status).toBe("error");
    expect(result.current.sync.error).toBe("Network failure");
  });

  it("handles pull errors gracefully", async () => {
    const { Wrapper } = createWrapper();
    const { result } = renderHook(() => useCombined(), { wrapper: Wrapper });

    await act(async () => {
      await result.current.ctx.open({ path: "/test/pullerr", create: true });
      await result.current.ctx.intoMutable();
    });

    const fetcher = vi.fn().mockRejectedValue(new Error("Server unavailable"));

    await act(async () => {
      await result.current.sync.pull(fetcher);
    });

    expect(result.current.sync.status).toBe("error");
    expect(result.current.sync.error).toBe("Server unavailable");
  });
});
