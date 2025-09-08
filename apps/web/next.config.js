/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@ynab-counter/db', '@ynab-counter/ynab-client']
};

module.exports = nextConfig;
