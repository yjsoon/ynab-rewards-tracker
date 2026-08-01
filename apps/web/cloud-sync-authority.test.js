import { describe, expect, it, vi } from "vitest";

import { CloudSyncBackup, handleCloudSyncRequest } from "./cloud-sync-authority.js";

class FakeStorage {
  values = new Map();

  async get(key) {
    return this.values.get(key);
  }

  async put(key, value) {
    this.values.set(key, value);
  }

  async delete(key) {
    return this.values.delete(key);
  }
}

class FakeState {
  storage = new FakeStorage();
  tail = Promise.resolve();

  blockConcurrencyWhile(operation) {
    const result = this.tail.then(operation, operation);
    this.tail = result.then(() => undefined, () => undefined);
    return result;
  }
}

function createEnvironment(initialKV = new Map()) {
  const kvValues = new Map(initialKV);
  const instances = new Map();
  const kv = {
    get: vi.fn(async (key) => kvValues.get(key) ?? null),
    delete: vi.fn(async (key) => kvValues.delete(key)),
  };
  const env = {
    CLOUD_SYNC_KV: kv,
    CLOUD_SYNC_BACKUPS: {
      idFromName: (key) => key,
      get: (id) => {
        if (!instances.has(id)) {
          instances.set(id, new CloudSyncBackup(new FakeState(), { CLOUD_SYNC_KV: kv }));
        }
        return instances.get(id);
      },
    },
  };
  return { env, kv, kvValues };
}

function upload(keyId, ciphertext, expectedUpdatedAt, includeExpected = true) {
  const body = { keyId, ciphertext, iv: "iv" };
  if (includeExpected) body.expectedUpdatedAt = expectedUpdatedAt;
  return new Request("https://example.test/api/cloud-sync", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("production Cloud Sync Durable Object authority", () => {
  it("rejects one of two concurrent writes sharing a stale revision", async () => {
    const { env } = createEnvironment();

    const responses = await Promise.all([
      handleCloudSyncRequest(upload("sync-key", "device-a", null), env),
      handleCloudSyncRequest(upload("sync-key", "device-b", null), env),
    ]);

    expect(responses.map((response) => response.status).sort()).toEqual([200, 409]);
    const stored = await handleCloudSyncRequest(
      new Request("https://example.test/api/cloud-sync?key=sync-key"),
      env,
    );
    expect((await stored.json()).ciphertext).toMatch(/^device-[ab]$/);
  });

  it("lazily migrates a legacy KV backup to one stable stored revision", async () => {
    const { env, kv } = createEnvironment(new Map([
      ["legacy-key", JSON.stringify({ ciphertext: "legacy", iv: "legacy-iv" })],
    ]));
    const request = () => new Request("https://example.test/api/cloud-sync?key=legacy-key");

    const first = await handleCloudSyncRequest(request(), env);
    const second = await handleCloudSyncRequest(request(), env);
    const firstBody = await first.json();
    const secondBody = await second.json();

    expect(firstBody).toMatchObject({ ciphertext: "legacy", iv: "legacy-iv", version: 1 });
    expect(firstBody.updatedAt).toEqual(expect.any(String));
    expect(secondBody.updatedAt).toBe(firstBody.updatedAt);
    expect(kv.get).toHaveBeenCalledTimes(1);
  });

  it("retries migration after a transient KV miss", async () => {
    const { env, kv } = createEnvironment(new Map([
      ["delayed-key", JSON.stringify({ ciphertext: "legacy", iv: "legacy-iv" })],
    ]));
    kv.get.mockResolvedValueOnce(null);
    const request = () => new Request("https://example.test/api/cloud-sync?key=delayed-key");

    const first = await handleCloudSyncRequest(request(), env);
    const second = await handleCloudSyncRequest(request(), env);

    expect(first.status).toBe(404);
    expect(second.status).toBe(200);
    expect(await second.json()).toMatchObject({ ciphertext: "legacy", iv: "legacy-iv" });
    expect(kv.get).toHaveBeenCalledTimes(2);
  });

  it("does not let a delayed legacy value overwrite a new durable write", async () => {
    const { env, kv } = createEnvironment(new Map([
      ["write-key", JSON.stringify({ ciphertext: "legacy", iv: "legacy-iv" })],
    ]));
    kv.get.mockResolvedValueOnce(null);

    const write = await handleCloudSyncRequest(upload("write-key", "replacement", null), env);
    const stored = await handleCloudSyncRequest(
      new Request("https://example.test/api/cloud-sync?key=write-key"),
      env,
    );

    expect(write.status).toBe(200);
    expect(await stored.json()).toMatchObject({ ciphertext: "replacement", iv: "iv" });
    expect(kv.get).toHaveBeenCalledTimes(1);
  });

  it("does not resurrect a delayed legacy value after deletion", async () => {
    const { env, kv } = createEnvironment(new Map([
      ["delete-key", JSON.stringify({ ciphertext: "legacy", iv: "legacy-iv" })],
    ]));
    kv.get.mockResolvedValueOnce(null);
    // Model a stale KV replica that remains readable after the delete request.
    kv.delete.mockResolvedValueOnce(false);

    const deletion = await handleCloudSyncRequest(
      new Request("https://example.test/api/cloud-sync?key=delete-key", { method: "DELETE" }),
      env,
    );
    const stored = await handleCloudSyncRequest(
      new Request("https://example.test/api/cloud-sync?key=delete-key"),
      env,
    );

    expect(deletion.status).toBe(200);
    expect(stored.status).toBe(404);
    expect(kv.get).toHaveBeenCalledTimes(1);
  });

  it("serializes delete followed by an older-client write without resurrecting KV", async () => {
    const { env, kvValues } = createEnvironment(new Map([
      ["ordered-key", JSON.stringify({
        ciphertext: "legacy",
        iv: "legacy-iv",
        updatedAt: "2026-07-31T00:00:00.000Z",
      })],
    ]));

    const deletion = handleCloudSyncRequest(
      new Request("https://example.test/api/cloud-sync?key=ordered-key", { method: "DELETE" }),
      env,
    );
    const write = handleCloudSyncRequest(upload("ordered-key", "replacement", undefined, false), env);
    const [deleteResponse, writeResponse] = await Promise.all([deletion, write]);

    expect(deleteResponse.status).toBe(200);
    expect(writeResponse.status).toBe(200);
    expect(kvValues.has("ordered-key")).toBe(false);
    const stored = await handleCloudSyncRequest(
      new Request("https://example.test/api/cloud-sync?key=ordered-key"),
      env,
    );
    expect(await stored.json()).toMatchObject({ ciphertext: "replacement" });
  });

  it("allows older clients without expectedUpdatedAt to overwrite compatibly", async () => {
    const { env } = createEnvironment();
    const initial = await handleCloudSyncRequest(upload("compat-key", "initial", null), env);
    expect(initial.status).toBe(200);

    const overwrite = await handleCloudSyncRequest(
      upload("compat-key", "older-client", undefined, false),
      env,
    );

    expect(overwrite.status).toBe(200);
    const stored = await handleCloudSyncRequest(
      new Request("https://example.test/api/cloud-sync?key=compat-key"),
      env,
    );
    expect(await stored.json()).toMatchObject({ ciphertext: "older-client" });
  });
});
