const CLOUD_SYNC_PATH = "/api/cloud-sync";
const CLOUD_SYNC_VERSION = 1;
const BACKUP_STORAGE_KEY = "backup";
const KV_MIGRATION_STORAGE_KEY = "kvMigrationComplete";

function json(body, status = 200) {
  return Response.json(body, { status });
}
function nextRevision(previousRevision) {
  const previousTimestamp = typeof previousRevision === "string"
    ? Date.parse(previousRevision)
    : Number.NaN;
  const now = Date.now();
  return new Date(
    Number.isFinite(previousTimestamp) && previousTimestamp >= now
      ? previousTimestamp + 1
      : now
  ).toISOString();
}

function parseBackup(raw) {
  const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
  if (
    !parsed
    || typeof parsed !== "object"
    || typeof parsed.ciphertext !== "string"
    || typeof parsed.iv !== "string"
  ) {
    throw new Error("Stored cloud backup is invalid");
  }

  return {
    ciphertext: parsed.ciphertext,
    iv: parsed.iv,
    version: typeof parsed.version === "number" ? parsed.version : CLOUD_SYNC_VERSION,
    updatedAt: typeof parsed.updatedAt === "string"
      ? parsed.updatedAt
      : nextRevision(),
  };
}

function keyFromRequest(request, body) {
  if (request.method === "POST") {
    return typeof body?.keyId === "string" && body.keyId.length > 0
      ? body.keyId
      : null;
  }
  return new URL(request.url).searchParams.get("key");
}

export class CloudSyncBackup {
  constructor(state, env) {
    this.state = state;
    this.env = env;
  }

  async ensureMigrated(keyId) {
    const migrationComplete = await this.state.storage.get(KV_MIGRATION_STORAGE_KEY);
    if (migrationComplete === true) {
      return await this.state.storage.get(BACKUP_STORAGE_KEY) ?? null;
    }

    // A durable write is authoritative even if a previous request failed before
    // recording the migration marker. Never let a later-visible KV value replace it.
    const durableBackup = await this.state.storage.get(BACKUP_STORAGE_KEY);
    if (durableBackup) {
      await this.state.storage.put(KV_MIGRATION_STORAGE_KEY, true);
      return durableBackup;
    }

    const legacyValue = await this.env.CLOUD_SYNC_KV.get(keyId);
    const backup = legacyValue === null ? null : parseBackup(legacyValue);
    if (backup) {
      await this.state.storage.put(BACKUP_STORAGE_KEY, backup);
      await this.state.storage.put(KV_MIGRATION_STORAGE_KEY, true);
    }
    return backup;
  }

  async handle(request) {
    let body;
    if (request.method === "POST") {
      body = await request.json();
    }
    const keyId = keyFromRequest(request, body);
    if (!keyId) {
      return json(
        { error: request.method === "POST" ? "Invalid payload" : "Missing key parameter" },
        400
      );
    }

    const current = await this.ensureMigrated(keyId);

    if (request.method === "GET") {
      return current
        ? json(current)
        : json({ error: "Not found" }, 404);
    }

    if (request.method === "POST") {
      const { ciphertext, iv, expectedUpdatedAt } = body ?? {};
      const hasExpectedRevision = body !== null
        && typeof body === "object"
        && Object.prototype.hasOwnProperty.call(body, "expectedUpdatedAt");
      if (
        typeof ciphertext !== "string"
        || typeof iv !== "string"
        || (hasExpectedRevision && expectedUpdatedAt !== null && typeof expectedUpdatedAt !== "string")
      ) {
        return json({ error: "Invalid payload" }, 400);
      }

      if (hasExpectedRevision && (current?.updatedAt ?? null) !== expectedUpdatedAt) {
        return json(
          { error: "Cloud backup changed on another device. Restore it before saving again." },
          409
        );
      }

      const updatedAt = nextRevision(current?.updatedAt);
      const backup = { ciphertext, iv, version: CLOUD_SYNC_VERSION, updatedAt };
      await this.state.storage.put(BACKUP_STORAGE_KEY, backup);
      // Once this object has accepted a write, KV must never become authoritative
      // for it, even if the initial migration lookup was a transient miss.
      await this.state.storage.put(KV_MIGRATION_STORAGE_KEY, true);
      return json({ updatedAt, version: CLOUD_SYNC_VERSION });
    }

    if (request.method === "DELETE") {
      // Record the tombstone before touching either copy. A stale or eventually
      // visible KV value can then never resurrect the deleted backup.
      await this.state.storage.put(KV_MIGRATION_STORAGE_KEY, true);
      await this.state.storage.delete(BACKUP_STORAGE_KEY);
      await this.env.CLOUD_SYNC_KV.delete(keyId);
      return json({ success: true });
    }

    return json({ error: "Method not allowed" }, 405);
  }

  async fetch(request) {
    try {
      // This is the per-key production authority. blockConcurrencyWhile keeps
      // external KV migration and durable reads/writes in one serial operation.
      return await this.state.blockConcurrencyWhile(() => this.handle(request));
    } catch (error) {
      console.error("Cloud Sync Durable Object request failed", error);
      return json({ error: "Cloud sync storage request failed" }, 502);
    }
  }
}

export async function handleCloudSyncRequest(request, env) {
  const url = new URL(request.url);
  if (url.pathname !== CLOUD_SYNC_PATH || !["GET", "POST", "DELETE"].includes(request.method)) {
    return null;
  }

  try {
    const body = request.method === "POST" ? await request.clone().json() : undefined;
    const keyId = keyFromRequest(request, body);
    if (!keyId) {
      return json(
        { error: request.method === "POST" ? "Invalid payload" : "Missing key parameter" },
        400
      );
    }
    if (!env.CLOUD_SYNC_BACKUPS) {
      return json({ error: "Cloud sync storage is not configured" }, 501);
    }

    const id = env.CLOUD_SYNC_BACKUPS.idFromName(keyId);
    return await env.CLOUD_SYNC_BACKUPS.get(id).fetch(request);
  } catch (error) {
    console.error("Cloud Sync Durable Object routing failed", error);
    return json({ error: "Cloud sync storage request failed" }, 502);
  }
}
