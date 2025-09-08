/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@ynab-counter/db']
};

module.exports = nextConfig;

