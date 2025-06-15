import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async rewrites() {
    return [
      {
        source: "/:slug([a-zA-Z0-9]{7})",
        destination: "/api/redirect/:slug",
      },
    ];
  },
  serverExternalPackages: ["fs", "path"], // Updated from experimental.serverComponentsExternalPackages
};

export default nextConfig;