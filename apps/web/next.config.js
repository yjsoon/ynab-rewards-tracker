/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@ynab-counter/ynab-client', '@ynab-counter/app-core']
};

module.exports = nextConfig;
