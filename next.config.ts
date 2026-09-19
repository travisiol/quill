import type { NextConfig } from "next";

/**
 * wagmi's connector bundle may reach for optional `@x402/*` payment packages
 * through @base-org/account. They are never executed here; alias them to a
 * CommonJS stub so the bundler stops looking.
 */
const OPTIONAL_MODULES = [
  "@x402/core",
  "@x402/core/client",
  "@x402/core/server",
  "@x402/evm",
  "@x402/evm/exact/client",
  "@x402/evm/exact/server",
  "@x402/evm/upto/client",
  "@x402/evm/upto/server",
  "@x402/svm",
  "@x402/svm/exact/client",
  "@x402/svm/exact/server",
  "@x402/express",
  "@x402/extensions/bazaar",
  "@x402/fetch",
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  devIndicators: false,
  turbopack: {
    resolveAlias: Object.fromEntries(OPTIONAL_MODULES.map((name) => [name, "./src/lib/empty.cjs"])),
  },
};

export default nextConfig;
