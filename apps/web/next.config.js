/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@ynab-counter/ynab-client']
};

module.exports = nextConfig;
