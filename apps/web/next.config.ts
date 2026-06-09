import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      // TecDoc / TecAlliance CDN (article thumbnails)
      { protocol: "https", hostname: "**.tecalliance.net" },
      { protocol: "https", hostname: "**.tecdoc.net" },
    ],
  },
};

export default nextConfig;
