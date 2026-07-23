import type { NextConfig } from "next";
import path from "path";
import { fileURLToPath } from "url";

const projectRoot = path.dirname(fileURLToPath(import.meta.url));

const nextConfig: NextConfig = {
  // context.md is read at request time by /api/intervene (see lib/context.ts).
  // It lives outside the app tree, so trace it explicitly into the serverless
  // bundle or the read 404s once deployed.
  outputFileTracingIncludes: {
    "/api/intervene": ["./context.md"],
  },
  // Keep Turbopack rooted on this package when nested under Downloads/.
  turbopack: {
    root: projectRoot,
  },
};

export default nextConfig;
