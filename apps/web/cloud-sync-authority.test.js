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

function createEnvironment(initialKV = new Map(), { bindLegacyKV = true } = {}) {
  const kvValues = new Map(initialKV);
  const instances = new Map();
  const kv = {
    get: vi.fn(async (key) => kvValues.get(key) ?? null),
    delete: vi.fn(async (key) => kvValues.delete(key)),
  };
  const authorityEnv = bindLegacyKV ? { CLOUD_SYNC_KV: kv } : {};
  const env = {
    ...(bindLegacyKV ? { CLOUD_SYNC_KV: kv } : {}),
    CLOUD_SYNC_BACKUPS: {
      idFromName: (key) => key,
      get: (id) => {
        if (!instances.has(id)) {
          instances.set(id, new CloudSyncBackup(new FakeState(), authorityEnv));
        }
        return instances.get(id);
      },
    },
  };
  return { env, kv, kvValues, authorityEnv };
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
  it("retries legacy migration when a missing KV binding appears later", async () => {
    const { env, kv, authorityEnv } = createEnvironment(new Map([
      ["optional-key", JSON.stringify({ ciphertext: "legacy", iv: "legacy-iv" })],
    ]), { bindLegacyKV: false });
    const request = () => new Request("https://example.test/api/cloud-sync?key=optional-key");

    const first = await handleCloudSyncRequest(request(), env);
    authorityEnv.CLOUD_SYNC_KV = kv;
    const afterBindingAppears = await handleCloudSyncRequest(request(), env);

    expect(first.status).toBe(404);
    expect(afterBindingAppears.status).toBe(200);
    expect(await afterBindingAppears.json()).toMatchObject({ ciphertext: "legacy" });
    expect(kv.get).toHaveBeenCalledOnce();
  });

  it("keeps a delete authoritative when the optional legacy KV binding appears later", async () => {
    const { env, kv, authorityEnv } = createEnvironment(new Map([
      ["optional-delete", JSON.stringify({ ciphertext: "legacy", iv: "legacy-iv" })],
    ]), { bindLegacyKV: false });

    const response = await handleCloudSyncRequest(
      new Request("https://example.test/api/cloud-sync?key=optional-delete", { method: "DELETE" }),
      env,
    );
    authorityEnv.CLOUD_SYNC_KV = kv;
    const afterBindingAppears = await handleCloudSyncRequest(
      new Request("https://example.test/api/cloud-sync?key=optional-delete"),
      env,
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ success: true });
    expect(afterBindingAppears.status).toBe(404);
    expect(kv.get).not.toHaveBeenCalled();
  });

  it("keeps a write authoritative when the optional legacy KV binding appears later", async () => {
    const { env, kv, authorityEnv } = createEnvironment(new Map([
      ["optional-write", JSON.stringify({ ciphertext: "legacy", iv: "legacy-iv" })],
    ]), { bindLegacyKV: false });

    const response = await handleCloudSyncRequest(upload("optional-write", "replacement", null), env);
    authorityEnv.CLOUD_SYNC_KV = kv;
    const stored = await handleCloudSyncRequest(
      new Request("https://example.test/api/cloud-sync?key=optional-write"),
      env,
    );

    expect(response.status).toBe(200);
    expect(await stored.json()).toMatchObject({ ciphertext: "replacement" });
    expect(kv.get).not.toHaveBeenCalled();
  });

  it("returns 400 for malformed POST JSON without routing it to storage", async () => {
    const { env } = createEnvironment();
    const route = vi.spyOn(env.CLOUD_SYNC_BACKUPS, "idFromName");

    const response = await handleCloudSyncRequest(
      new Request("https://example.test/api/cloud-sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{not-json",
      }),
      env,
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "Invalid payload" });
    expect(route).not.toHaveBeenCalled();
  });

  it("keeps Durable Object storage failures classified as 502", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const state = new FakeState();
    state.storage.get = vi.fn(async () => {
      throw new Error("storage unavailable");
    });
    const authority = new CloudSyncBackup(state, {});

    const response = await authority.fetch(
      new Request("https://example.test/api/cloud-sync?key=storage-failure"),
    );

    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({ error: "Cloud sync storage request failed" });
    expect(consoleError).toHaveBeenCalledOnce();
    consoleError.mockRestore();
  });

  it("returns 400 when malformed JSON reaches the Durable Object directly", async () => {
    const authority = new CloudSyncBackup(new FakeState(), {});

    const response = await authority.fetch(new Request("https://example.test/api/cloud-sync", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{not-json",
    }));

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "Invalid payload" });
  });

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
