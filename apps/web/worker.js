// The generated OpenNext worker assumes Cloudflare's asset layer runs first.
// Skew protection requires the opposite, so this wrapper preserves asset-first
// behavior while still letting missing old chunks reach OpenNext's version router.
import openNextWorker from "./.open-next/worker.js";
import { handleCloudSyncRequest } from "./cloud-sync-authority.js";
import { createWorkerFetch } from "./worker-fetch.js";

export { CloudSyncBackup } from "./cloud-sync-authority.js";

export default {
  fetch: createWorkerFetch({ handleCloudSyncRequest, openNextWorker }),
};
