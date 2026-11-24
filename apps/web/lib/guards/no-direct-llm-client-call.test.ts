/**
 * Guard — NO DIRECT LLM CLIENT CALL (Internal LLM Agents v1, PR2).
 *
 * The AI runtime is server-only. A React CLIENT component (a file with the
 * "use client" directive) must NEVER import the LLM SDK or the AI runtime
 * (run / providers / config) — AI is invoked only from server actions / routes,
 * which keeps keys server-side and routes every output through schema
 * validation + audit. Fails the build if a client component reaches the LLM.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join } from "node:path";

const APP_ROOT = join(__dirname, "..", "..");
const read = (p: string) => readFileSync(p, "utf8");

function walk(dir: string, acc: string[] = []): string[] {
  if (!existsSync(dir)) return acc;
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === ".next") continue;
    const abs = join(dir, name);
    if (statSync(abs).isDirectory()) walk(abs, acc);
    else if (/\.(tsx|ts|jsx|js)$/.test(abs)) acc.push(abs);
  }
  return acc;
}

const SCAN_DIRS = ["app", "components"].map((d) => join(APP_ROOT, d));

/** True if the file is a React client component ("use client" directive). */
function isClientComponent(src: string): boolean {
  // The directive must be among the first statements (allow leading comments).
  const head = src.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\/\/[^\n]*/g, " ").trimStart();
  return /^["']use client["']/.test(head);
}

// Forbidden imports from a client component: the SDK or any AI runtime module.
const FORBIDDEN_IMPORT =
  /(?:from\s*|import\s*\(\s*|require\s*\(\s*)["'](?:@anthropic-ai\/sdk|openai|@\/lib\/ai\/runtime(?:\/[^"']*)?)["']/;

describe("no direct LLM client call", () => {
  it("no client component imports the LLM SDK or the AI runtime", () => {
    const offenders: string[] = [];
    for (const dir of SCAN_DIRS) {
      for (const file of walk(dir)) {
        if (/\.test\.tsx?$/.test(file)) continue;
        const src = read(file);
        if (!isClientComponent(src)) continue;
        if (FORBIDDEN_IMPORT.test(src)) {
          offenders.push(file.slice(APP_ROOT.length + 1).replace(/\\/g, "/"));
        }
      }
    }
    expect(
      offenders,
      `client component reaches the LLM directly:\n${offenders.join("\n")}`,
    ).toEqual([]);
  });

  it("the detector flags runtime/SDK imports and ignores prose", () => {
    expect(FORBIDDEN_IMPORT.test('import { runAiCompletion } from "@/lib/ai/runtime/run";')).toBe(true);
    expect(FORBIDDEN_IMPORT.test('import Anthropic from "@anthropic-ai/sdk";')).toBe(true);
    expect(FORBIDDEN_IMPORT.test('import { x } from "@/lib/ai/schemas";')).toBe(false);
    expect(isClientComponent('"use client";\nexport default function C(){}')).toBe(true);
    expect(isClientComponent("export default function S(){}")).toBe(false);
  });
});
