import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // context.md is read at request time by /api/intervene (see lib/context.ts).
  // It lives outside the app tree, so trace it explicitly into the serverless
  // bundle or the read 404s once deployed.
  outputFileTracingIncludes: {
    "/api/intervene": ["./context.md"],
  },
};

export default nextConfig;
