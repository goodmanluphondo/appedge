import type { NextConfig } from "next";
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";
import { generateWranglerConfig } from "./lib/wrangler-config.mjs";

const nextConfig: NextConfig = {
  experimental: {
    agentFeedback: true,
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default async function configureNext() {
  await generateWranglerConfig();
  await initOpenNextCloudflareForDev({
    configPath: "wrangler.generated.jsonc",
    remoteBindings: false,
  });
  return nextConfig;
}
