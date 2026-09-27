// Checks a file the teen is about to upload. Runs only on the device; PDFs are read with pdf.js,
// which is loaded on demand so ordinary pages don't pay for it.
import { findInText, type Finding } from "./detect";

// Filenames that usually mean an ID, school record, medical or money document.
const SENSITIVE_NAME =
  /passport|driver'?s?[\s_-]?licen[cs]e|\bssn\b|social[\s_-]?security|birth[\s_-]?cert|report[\s_-]?card|transcript|medical|prescription|diagnos|bank[\s_-]?statement|\btax|\bw-?2\b|\b1099\b|\bid[\s_-]?card|student[\s_-]?id|insurance/i;
const TEXT_FILE = /\.(txt|csv|md|json|html?)$/i;
const MAX_TEXT_BYTES = 1_000_000;
const MAX_PDF_PAGES = 5;

export interface FileCheck {
  name: string;
  findings: Finding[];
  photo: boolean; // images can't be read cheaply; they get a gentler reminder instead
}

async function pdfText(file: File): Promise<string> {
  const { extractPdfText } = await import("./pdf");
  return extractPdfText(await file.arrayBuffer(), MAX_PDF_PAGES);
}

export async function checkFile(file: File): Promise<FileCheck> {
  const findings: Finding[] = SENSITIVE_NAME.test(file.name) ? ["id_document"] : [];
  const photo = file.type.startsWith("image/");
  let text = "";
  try {
    if (file.type === "application/pdf" || /\.pdf$/i.test(file.name)) text = await pdfText(file);
    else if ((file.type.startsWith("text/") || TEXT_FILE.test(file.name)) && file.size <= MAX_TEXT_BYTES) text = await file.text();
  } catch {
    // Unreadable file: fall back to the filename check only.
  }
  return { name: file.name, findings: [...new Set([...findings, ...findInText(text)])], photo };
}
