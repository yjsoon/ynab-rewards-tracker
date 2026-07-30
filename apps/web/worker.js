// The generated OpenNext worker assumes Cloudflare's asset layer runs first.
// Skew protection requires the opposite, so this wrapper preserves asset-first
// behavior while still letting missing old chunks reach OpenNext's version router.
import openNextWorker from "./.open-next/worker.js";

const CLOUD_SYNC_PATH = "/api/cloud-sync";
const CLOUD_SYNC_VERSION = 1;

async function handleCloudSyncMutation(request, env) {
  const url = new URL(request.url);
  if (url.pathname !== CLOUD_SYNC_PATH) {
    return null;
  }

  try {
    if (request.method === "POST") {
      const body = await request.json();
      const { keyId, ciphertext, iv } = body ?? {};

      if (typeof keyId !== "string" || typeof ciphertext !== "string" || typeof iv !== "string") {
        return Response.json({ error: "Invalid payload" }, { status: 400 });
      }

      const updatedAt = new Date().toISOString();
      await env.CLOUD_SYNC_KV.put(
        keyId,
        JSON.stringify({ ciphertext, iv, version: CLOUD_SYNC_VERSION, updatedAt })
      );

      return Response.json({ updatedAt, version: CLOUD_SYNC_VERSION });
    }

    if (request.method === "DELETE") {
      const keyId = url.searchParams.get("key");
      if (!keyId) {
        return Response.json({ error: "Missing key parameter" }, { status: 400 });
      }

      await env.CLOUD_SYNC_KV.delete(keyId);
      return Response.json({ success: true });
    }
  } catch (error) {
    console.error("Cloud Sync KV mutation failed", error);
    return Response.json({ error: "Cloud sync storage request failed" }, { status: 502 });
  }

  return null;
}

export default {
  async fetch(request, env, ctx) {
    const cloudSyncResponse = await handleCloudSyncMutation(request, env);
    if (cloudSyncResponse) {
      return cloudSyncResponse;
    }

    const assetResponse = await env.ASSETS.fetch(request);
    if (assetResponse.status !== 404) {
      return assetResponse;
    }

    return openNextWorker.fetch(request, env, ctx);
  },
};
