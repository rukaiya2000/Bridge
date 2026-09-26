// Builds the extension into dist/.
import * as esbuild from "esbuild";
import { cpSync, existsSync, mkdirSync, readdirSync } from "node:fs";

const watch = process.argv.includes("--watch");

const common = {
  bundle: true,
  target: "chrome120",
  sourcemap: true,
  logLevel: "info",
  alias: { "@bridge/core": "../core/src/index.ts" },
};

const entries = [
  { in: "src/background/service-worker.ts", out: "background", format: "esm" },
  { in: "src/content/gemini.ts", out: "content-gemini", format: "iife" },
  { in: "src/content/session-only.ts", out: "content-session", format: "iife" },
  { in: "src/inject/mic-hook.ts", out: "mic-hook", format: "iife" },
  { in: "src/offscreen/offscreen.ts", out: "offscreen", format: "iife" },
  { in: "src/popup/popup.ts", out: "popup", format: "iife" },
  { in: "src/options/options.ts", out: "options", format: "iife" },
];

function copyStatic() {
  cpSync("static", "dist", { recursive: true });
  mkdirSync("dist/fixtures", { recursive: true });
  const fixtures = "../core/fixtures";
  if (existsSync(fixtures)) {
    for (const f of readdirSync(fixtures).filter((f) => f.endsWith(".json"))) cpSync(`${fixtures}/${f}`, `dist/fixtures/${f}`);
  }
}

const copyPlugin = { name: "copy-static", setup: (b) => b.onEnd(copyStatic) };

const contexts = await Promise.all(
  entries.map((e) =>
    esbuild.context({ ...common, entryPoints: [e.in], outfile: `dist/${e.out}.js`, format: e.format, plugins: [copyPlugin] }),
  ),
);

if (watch) {
  await Promise.all(contexts.map((c) => c.watch()));
  console.log("watching");
} else {
  await Promise.all(contexts.map((c) => c.rebuild()));
  await Promise.all(contexts.map((c) => c.dispose()));
  console.log("built dist/");
}
