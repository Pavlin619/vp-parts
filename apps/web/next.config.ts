import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  cacheComponents: true,
  images: {
    remotePatterns: [
      // TecDoc / TecAlliance CDN (article thumbnails)
      { protocol: "https", hostname: "**.tecalliance.net" },
      { protocol: "https", hostname: "**.tecdoc.net" },
      { protocol: "https", hostname: "**.tecalliance.services" },
      // Placeholder brand logos, reachable only under TECDOC_MOCK=true. Real
      // getBrands logos are on digital-assets.tecalliance.services, covered
      // above; this goes when TecDocMockClient does.
      { protocol: "https", hostname: "placehold.co" }
    ],
  },
};

export default nextConfig;
