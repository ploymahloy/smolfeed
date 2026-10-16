import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: [
    "better-sqlite3",
    "@atproto/api",
    "@atproto/oauth-client-node",
    "@atproto/oauth-client",
  ],
};

export default nextConfig;
