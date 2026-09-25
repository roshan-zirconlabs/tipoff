import type { NextConfig } from "next";

const config: NextConfig = {
  reactStrictMode: true,
  transpilePackages: ["@tipoff/core"],
  experimental: {
    // TypeScript 7 ships only the native compiler; Next type-checks through the tsc CLI.
    useTypeScriptCli: true,
  },
};

export default config;
