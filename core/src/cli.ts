// Node-only CLI used by eval/. JSONL in on stdin, JSONL out on stdout, one line per input line.
//   node core/dist/cli.js label [--rules-only] [--concurrency 4]
//   node core/dist/cli.js score --mode pattern|single
import { createInterface } from "node:readline";
import process from "node:process";
import { core } from "./index.js";
import { scoreArc } from "./arc.js";

const args = process.argv.slice(2);
const flag = (name: string) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};

async function readLines(): Promise<string[]> {
  const lines: string[] = [];
  for await (const line of createInterface({ input: process.stdin })) if (line.trim()) lines.push(line);
  return lines;
}

async function label(lines: string[]) {
  const rulesOnly = args.includes("--rules-only");
  const concurrency = Number(flag("--concurrency") ?? 4);
  const geminiKey = rulesOnly ? undefined : process.env.GEMINI_API_KEY;
  const out: string[] = new Array(lines.length);
  let next = 0;
  async function worker() {
    while (next < lines.length) {
      const i = next++;
      try {
        const { key, user, bot } = JSON.parse(lines[i]);
        const labels = await core.labelTurn(user, bot ?? null, { geminiKey });
        out[i] = JSON.stringify({ key, labels });
      } catch (e) {
        process.stderr.write(`line ${i + 1}: ${(e as Error).message}\n`);
        out[i] = JSON.stringify({ key: null, error: true });
      }
    }
  }
  await Promise.all(Array.from({ length: concurrency }, worker));
  for (const l of out) process.stdout.write(l + "\n");
}

function score(lines: string[]) {
  const mode = flag("--mode");
  if (mode !== "pattern" && mode !== "single") throw new Error("--mode must be pattern or single");
  lines.forEach((line, i) => {
    try {
      process.stdout.write(JSON.stringify(scoreArc(JSON.parse(line), mode)) + "\n");
    } catch (e) {
      process.stderr.write(`line ${i + 1}: ${(e as Error).message}\n`);
      process.stdout.write(JSON.stringify({ id: null, error: true }) + "\n");
    }
  });
}

const cmd = args[0];
if (cmd === "label") await label(await readLines());
else if (cmd === "score") score(await readLines());
else if (cmd) {
  process.stderr.write("usage: cli.js label [--rules-only] [--concurrency N] | score --mode pattern|single\n");
  process.exit(2);
}
