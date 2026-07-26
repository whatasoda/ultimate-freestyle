import type { NextConfig } from "next";
import {
  isGitHubPagesBuild,
  pagesBasePath
} from "./build/github-pages-config";

const nextConfig: NextConfig = {
  env: {
    NEXT_PUBLIC_BASE_PATH: pagesBasePath
  },
  ...(isGitHubPagesBuild
    ? {
        output: "export" as const,
        trailingSlash: true,
        images: { unoptimized: true }
      }
    : {})
};

export default nextConfig;
