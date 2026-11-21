import { spawn } from "node:child_process";
import { mkdtemp, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { build } from "esbuild";

const TEST_FILE_SUFFIX = ".test.ts";
const SEARCH_ROOTS = ["app", "lib"];

async function findTestFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const found = [];
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) found.push(...await findTestFiles(path));
    else if (entry.name.endsWith(TEST_FILE_SUFFIX)) found.push(path);
  }
  return found;
}

const testFiles = (await Promise.all(SEARCH_ROOTS.map(findTestFiles))).flat();
if (testFiles.length === 0) throw new Error("No test files were found.");

const outputDirectory = await mkdtemp(join(tmpdir(), "appedge-tests-"));
await build({
  entryPoints: testFiles,
  outdir: outputDirectory,
  outbase: ".",
  bundle: true,
  platform: "node",
  format: "esm",
  outExtension: { ".js": ".mjs" },
  logLevel: "error",
});

const bundledFiles = testFiles.map((file) => join(outputDirectory, file.replace(/\.ts$/, ".mjs")));
const run = spawn(process.execPath, ["--test", ...bundledFiles], { stdio: "inherit" });
run.on("exit", (code) => {
  process.exitCode = code ?? 1;
});
