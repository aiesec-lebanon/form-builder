import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
  // pg loads optional native bindings at runtime; keep it out of the bundle.
  serverExternalPackages: ["pg"],
};

export default nextConfig;
