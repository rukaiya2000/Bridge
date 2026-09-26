// Bundles the extension into dist/. See docs/PHASE1.md §4.2.
import * as esbuild from "esbuild";
import { cpSync, existsSync, mkdirSync, readdirSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));
const dist = join(root, "dist");
const watch = process.argv.includes("--watch");
const useRealCore = process.env.BRIDGE_CORE === "real";

// [source, output file, format]. Entries whose source doesn't exist yet are skipped,
// so the build works while files are added one by one.
const entries = [
  ["src/background/service-worker.ts", "background.js", "esm"],
  ["src/content/gemini.ts", "content-gemini.js", "iife"],
  ["src/content/session-only.ts", "content-session.js", "iife"],
  ["src/popup/popup.ts", "popup.js", "iife"],
  ["src/options/options.ts", "options.js", "iife"],
].filter(([src]) => existsSync(join(root, src)));

const coreAlias = useRealCore ? join(root, "../core/src/index.ts") : join(root, "src/core-stub.ts");

function copyStatic() {
  cpSync(join(root, "static"), dist, { recursive: true });
  const fixtures = join(root, "../core/fixtures");
  if (existsSync(fixtures)) {
    mkdirSync(join(dist, "fixtures"), { recursive: true });
    for (const f of readdirSync(fixtures).filter((f) => f.endsWith(".json"))) {
      cpSync(join(fixtures, f), join(dist, "fixtures", f));
    }
  }
}

rmSync(dist, { recursive: true, force: true });
mkdirSync(dist, { recursive: true });
copyStatic();

const contexts = await Promise.all(
  entries.map(([src, out, format]) =>
    esbuild.context({
      entryPoints: [join(root, src)],
      outfile: join(dist, out),
      bundle: true,
      format,
      target: "chrome120",
      sourcemap: true,
      alias: { "@bridge/core": coreAlias },
      logLevel: "info",
    }),
  ),
);

if (watch) {
  await Promise.all(contexts.map((c) => c.watch()));
  console.log(`watching (core: ${useRealCore ? "real" : "stub"}); static/ is copied on start only`);
} else {
  await Promise.all(contexts.map((c) => c.rebuild()));
  await Promise.all(contexts.map((c) => c.dispose()));
  console.log(`built ${entries.length} entries to dist/ (core: ${useRealCore ? "real" : "stub"})`);
}
