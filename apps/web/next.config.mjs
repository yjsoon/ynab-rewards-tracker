import { getDeploymentId } from "@opennextjs/cloudflare";

const deploymentId = getDeploymentId();

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ["@ynab-counter/ynab-client", "@ynab-counter/app-core"],
  deploymentId,
};

export default nextConfig;
