import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  cacheComponents: true,
  images: {
    remotePatterns: [
      // TecDoc / TecAlliance CDN (article thumbnails)
      { protocol: "https", hostname: "**.tecalliance.net" },
      { protocol: "https", hostname: "**.tecdoc.net" },
      { protocol: "https", hostname: "**.tecalliance.services" },
      // Placeholder brand logos served by the TecDoc mock (removed once the
      // real getBrands integration is enabled).
      { protocol: "https", hostname: "placehold.co" }
    ],
  },
};

export default nextConfig;
