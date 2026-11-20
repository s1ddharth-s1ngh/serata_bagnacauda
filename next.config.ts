import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "export", // static site for GitHub Pages; the admin API is supabase/functions/admin
  basePath: process.env.PAGES_BASE_PATH, // "/serata_bagnacauda" in .github/workflows/pages.yml, root locally
  trailingSlash: true, // /upload -> upload/index.html, which any static host serves as-is
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
