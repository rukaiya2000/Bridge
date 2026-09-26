// PDF text extraction with Mozilla's pdf.js, entirely in the browser.
// A content script can't start pdf.js's worker (it would be cross-origin to the page), so pdf.js
// runs its worker code on the main thread: it uses `globalThis.pdfjsWorker` when that is set.
import * as pdfjs from "pdfjs-dist";

let ready: Promise<void> | undefined;
const loadWorker = () =>
  (ready ??= import("pdfjs-dist/build/pdf.worker.mjs").then((worker) => {
    (globalThis as { pdfjsWorker?: unknown }).pdfjsWorker = worker;
  }));

export async function extractPdfText(data: ArrayBuffer, maxPages: number): Promise<string> {
  await loadWorker();
  const task = pdfjs.getDocument({ data });
  const doc = await task.promise;
  const pages: string[] = [];
  for (let i = 1; i <= Math.min(doc.numPages, maxPages); i++) {
    const content = await (await doc.getPage(i)).getTextContent();
    pages.push(content.items.map((it) => ("str" in it ? it.str : "")).join(" "));
  }
  await task.destroy();
  return pages.join("\n");
}
