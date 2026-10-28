import type { NextConfig } from "next";

// Every page here is per-user (it reads the Supabase session), so we use the classic
// dynamic rendering model rather than Cache Components.
const nextConfig: NextConfig = {
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
