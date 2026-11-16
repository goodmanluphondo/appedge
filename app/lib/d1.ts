import "server-only";
import { getCloudflareContext } from "@opennextjs/cloudflare";

export type D1Value = string | number | null;

export interface AppEdgeD1Statement {
  bind(...values: D1Value[]): AppEdgeD1Statement;
  all<Row>(): Promise<{ results: Row[]; success: boolean }>;
  first<Row>(): Promise<Row | null>;
  run(): Promise<unknown>;
}

export interface AppEdgeD1Database {
  prepare(query: string): AppEdgeD1Statement;
}

export function getAppEdgeDatabase(): AppEdgeD1Database {
  const { env } = getCloudflareContext();
  const database = (env as unknown as { APPEDGE_DB?: AppEdgeD1Database }).APPEDGE_DB;

  if (!database) {
    throw new Error("The Cloudflare D1 binding APPEDGE_DB is unavailable.");
  }

  return database;
}
