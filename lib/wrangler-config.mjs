import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { loadEnvFile } from "node:process";
import { requireEnv } from "./require-env.mjs";

export async function generateWranglerConfig() {
  for (const filename of [".env.local", ".env"]) {
    if (existsSync(filename)) {
      loadEnvFile(filename);
    }
  }

  const base = JSON.parse(await readFile("wrangler.jsonc", "utf8"));
  const workerName = requireEnv("APPEDGE_WORKER_NAME", process.env.APPEDGE_WORKER_NAME);

  const configuration = {
    name: workerName,
    services: [{ binding: "WORKER_SELF_REFERENCE", service: workerName }],
    vars: {
      ...(process.env.APPEDGE_GATEWAY_WORKER_NAME ? { APPEDGE_GATEWAY_WORKER_NAME: process.env.APPEDGE_GATEWAY_WORKER_NAME } : {}),
      APPEDGE_EDGE_HOSTNAME: requireEnv("APPEDGE_EDGE_HOSTNAME", process.env.APPEDGE_EDGE_HOSTNAME),
      NEXT_PUBLIC_APP_URL: requireEnv("NEXT_PUBLIC_APP_URL", process.env.NEXT_PUBLIC_APP_URL),
      AUTH_MICROSOFT_ENTRA_ID_CLIENT_ID: requireEnv("AUTH_MICROSOFT_ENTRA_ID_CLIENT_ID", process.env.AUTH_MICROSOFT_ENTRA_ID_CLIENT_ID),
      AUTH_MICROSOFT_ENTRA_ID_TENANT_ID: requireEnv("AUTH_MICROSOFT_ENTRA_ID_TENANT_ID", process.env.AUTH_MICROSOFT_ENTRA_ID_TENANT_ID),
    },
    secrets: {
      required: ["AUTH_MICROSOFT_ENTRA_ID_CLIENT_SECRET", "CLOUDFLARE_API_TOKEN", "CLOUDFLARE_ZONE_ID", "CLOUDFLARE_ACCOUNT_ID"],
    },
    d1_databases: [{
      binding: "APPEDGE_DB",
      database_name: requireEnv("APPEDGE_D1_DATABASE_NAME", process.env.APPEDGE_D1_DATABASE_NAME),
      database_id: requireEnv("APPEDGE_D1_DATABASE_ID", process.env.APPEDGE_D1_DATABASE_ID),
      migrations_dir: "migrations",
    }],
  };

  await writeFile("wrangler.generated.jsonc", `${JSON.stringify({
    ...base,
    ...configuration,
  }, null, 2)}\n`);
  await mkdir(".wrangler/deploy", { recursive: true });
  await writeFile(".wrangler/deploy/config.json", `${JSON.stringify({ configPath: "../../wrangler.generated.jsonc" })}\n`);
}
