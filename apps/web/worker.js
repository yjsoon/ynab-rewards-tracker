// The generated OpenNext worker assumes Cloudflare's asset layer runs first.
// Skew protection requires the opposite, so this wrapper preserves asset-first
// behavior while still letting missing old chunks reach OpenNext's version router.
import openNextWorker from "./.open-next/worker.js";
import { handleCloudSyncRequest } from "./cloud-sync-authority.js";

export { CloudSyncBackup } from "./cloud-sync-authority.js";

export default {
  async fetch(request, env, ctx) {
    const cloudSyncResponse = await handleCloudSyncRequest(request, env);
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
