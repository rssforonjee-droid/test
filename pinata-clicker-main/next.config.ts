import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

const nextConfig: NextConfig = {
  output: "export",
  images: {
    unoptimized: true,
  },
};

export default withSentryConfig(nextConfig, {
  silent: true,
  widenClientFileUpload: true,
  // Source maps stay local because `output: "export"` skips uploading,
  // and hideSourceMaps is no longer supported in the new Sentry API.
});
