export function createWorkerFetch({ handleCloudSyncRequest, openNextWorker }) {
  return async function fetch(request, env, ctx) {
    const cloudSyncResponse = await handleCloudSyncRequest(request, env);
    if (cloudSyncResponse) {
      return cloudSyncResponse;
    }

    const assetResponse = await env.ASSETS.fetch(request);
    if (assetResponse.status !== 404) {
      return assetResponse;
    }

    return openNextWorker.fetch(request, env, ctx);
  };
}
