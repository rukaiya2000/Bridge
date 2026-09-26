import { defineConfig } from "vitest/config";

const pdfjsLegacy = (file: string) => new URL(`../node_modules/pdfjs-dist/legacy/build/${file}`, import.meta.url).pathname;

export default defineConfig({
  resolve: {
    alias: [
      { find: "@bridge/core", replacement: new URL("../core/src/index.ts", import.meta.url).pathname },
      // Node lacks browser APIs the modern pdf.js build uses (e.g. Uint8Array.toHex); tests use the legacy build.
      { find: /^pdfjs-dist\/build\/pdf\.worker\.mjs$/, replacement: pdfjsLegacy("pdf.worker.mjs") },
      { find: /^pdfjs-dist$/, replacement: pdfjsLegacy("pdf.mjs") },
    ],
  },
});
