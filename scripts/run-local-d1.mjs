import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { loadEnvFile } from "node:process";
import { requireEnv } from "../lib/.env.mjs";
import { generateWranglerConfig } from "../lib/wrangler-config.mjs";

for (const filename of [".env.local", ".env"]) {
  if (existsSync(filename)) {
    loadEnvFile(filename);
  }
}

await generateWranglerConfig();

const action = process.argv[2];
const databaseName = requireEnv("APPEDGE_D1_DATABASE_NAME", process.env.APPEDGE_D1_DATABASE_NAME);
const commands = {
  migrate: ["d1", "migrations", "apply", databaseName, "--config", "wrangler.generated.jsonc", "--local"],
  seed: ["d1", "execute", databaseName, "--config", "wrangler.generated.jsonc", "--local", "--file=./seed/demo.sql"],
};
const command = commands[action];

if (!command) {
  throw new Error("Choose either migrate or seed.");
}

const result = spawn("node_modules/.bin/wrangler", command, { stdio: "inherit" });

result.on("error", (error) => {
  throw error;
});

result.on("exit", (code) => {
  process.exitCode = code ?? 1;
});
