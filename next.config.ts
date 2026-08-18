import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      // Chunked CSV import sends ~2.5 MB pieces; Vercel caps request bodies
      // at ~4.5 MB anyway, so 4 MB gives headroom without ever hitting it.
      bodySizeLimit: "4mb",
    },
  },
};

export default nextConfig;
