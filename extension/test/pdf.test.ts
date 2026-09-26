import { expect, it } from "vitest";
import { checkFile } from "../src/privacy/files";

// pdf.js 6 uses Promise.try, which Chrome has but Node 22 doesn't.
(Promise as unknown as { try?: unknown }).try ??= (fn: (...a: unknown[]) => unknown, ...args: unknown[]) =>
  new Promise((resolve) => resolve(fn(...args)));

// A minimal one-page PDF whose text is "Phone 305-555-0142 SSN 536-22-1234".
function tinyPdf(text: string): Uint8Array {
  const stream = `BT /F1 12 Tf 72 720 Td (${text}) Tj ET`;
  const objs = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  let out = "%PDF-1.4\n";
  const offsets: number[] = [];
  objs.forEach((o, i) => { offsets.push(out.length); out += `${i + 1} 0 obj\n${o}\nendobj\n`; });
  const xref = out.length;
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offsets.map((n) => `${String(n).padStart(10, "0")} 00000 n \n`).join("")}`;
  out += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return new TextEncoder().encode(out);
}

it("reads a PDF's text and finds personal info in it", async () => {
  const f = new File([tinyPdf("Phone 305-555-0142 SSN 536-22-1234")], "form.pdf", { type: "application/pdf" });
  const res = await checkFile(f);
  expect(res.findings).toEqual(expect.arrayContaining(["phone", "ssn"]));
  expect(res.photo).toBe(false);
});
