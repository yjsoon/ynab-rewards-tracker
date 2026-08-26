import { describe, expect, it, vi } from "vitest";

import { createWorkerFetch } from "./worker-fetch.js";

function createFetch(overrides = {}) {
  return createWorkerFetch({
    handleCloudSyncRequest: overrides.handleCloudSyncRequest ?? (async () => null),
    openNextWorker: overrides.openNextWorker ?? {
      fetch: vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: "Missing authorization header" }), {
        status: 401,
        headers: { "Content-Type": "application/json", "x-opennext": "1" },
      })),
    },
  });
}

describe("worker fetch routing", () => {
  it("does not send PATCH to the assets binding", async () => {
    const assets = {
      fetch: vi.fn().mockRejectedValue(new Error("ASSETS cannot serve PATCH")),
    };
    const openNextWorker = {
      fetch: vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: "Missing authorization header" }), {
        status: 401,
        headers: { "Content-Type": "application/json", "x-opennext": "1" },
      })),
    };
    const fetch = createFetch({ openNextWorker });

    const response = await fetch(
      new Request("https://rewards.soon.sg/api/ynab/plans/x/transactions/y", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transaction: { flag_color: "purple" } }),
      }),
      { ASSETS: assets },
      {},
    );

    expect(assets.fetch).not.toHaveBeenCalled();
    expect(openNextWorker.fetch).toHaveBeenCalled();
    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: "Missing authorization header" });
  });

  it("still asks ASSETS for GET before falling through to OpenNext", async () => {
    const assets = {
      fetch: vi.fn().mockResolvedValue(new Response("not found", { status: 404 })),
    };
    const openNextWorker = {
      fetch: vi.fn().mockResolvedValue(new Response("ok", { status: 200 })),
    };
    const fetch = createFetch({ openNextWorker });

    const response = await fetch(
      new Request("https://rewards.soon.sg/api/ynab/plans"),
      { ASSETS: assets },
      {},
    );

    expect(assets.fetch).toHaveBeenCalled();
    expect(openNextWorker.fetch).toHaveBeenCalled();
    expect(response.status).toBe(200);
  });
});
