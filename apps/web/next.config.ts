import type { NextConfig } from "next";
import { SECURITY_HEADERS, imageRemotePatterns } from "./src/lib/security/security-headers";

const nextConfig: NextConfig = {
  cacheComponents: true,
  images: {
    remotePatterns: imageRemotePatterns(),
  },
  async headers() {
    return [{ source: "/(.*)", headers: SECURITY_HEADERS }];
  },
};

export default nextConfig;
