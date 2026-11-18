import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * J-2 (2.36) in prod-register-gaps.spec.ts saves ONE journal entry as the QA
 * worker in production. Its claim is that it writes NO product-funnel row
 * (`pilot_events`): the owner's condition is that a walk never distorts the
 * statistics, and the funnel's population split has no synthetic class.
 *
 * Client events are dropped by the consent gate (the walk asserts the refusal
 * and that no analytics item appears). This guard pins the rest of the claim:
 *  - the composer saves through `createJournalEntry` (lib/journal/actions.ts);
 *  - nothing that module imports, at any depth, emits a server funnel event or
 *    writes `pilot_events`;
 *  - no migration writes `pilot_events` from inside the database;
 *  - the walk still makes both consent assertions around its save.
 */

const WEB = resolve(__dirname, "..", "..");
const REPO = resolve(WEB, "..", "..");
const read = (p: string) => readFileSync(p, "utf8");

function resolveSpec(from: string, spec: string): string | null {
  let base: string;
  if (spec.startsWith("@/")) base = join(WEB, spec.slice(2));
  else if (spec.startsWith(".")) base = resolve(dirname(from), spec);
  else return null;
  for (const ext of [".ts", ".tsx", ".mjs", "/index.ts", "/index.tsx"]) {
    if (existsSync(base + ext)) return base + ext;
  }
  return /\.(ts|tsx|mjs)$/.test(base) && existsSync(base) ? base : null;
}

/** Every module reached through value imports (type-only imports run nothing). */
function closure(entry: string): string[] {
  const seen = new Set<string>();
  const queue = [entry];
  while (queue.length > 0) {
    const file = queue.pop()!;
    if (seen.has(file)) continue;
    seen.add(file);
    for (const m of read(file).matchAll(/(?:^|\n)\s*(import|export)\s+(type\s+)?([^'";]*?)from\s+["']([^"']+)["']|(?:^|\n)\s*import\s+["']([^"']+)["']/g)) {
      if (m[2]) continue;
      const target = resolveSpec(file, m[4] ?? m[5]);
      if (target) queue.push(target);
    }
  }
  return [...seen];
}

const EMITTER = /emitServerFunnelEvent\s*\(|recordTelemetryEvent\s*\(|\.from\(\s*["']pilot_events["']\s*\)/;

describe("J-2 (2.36) production walk writes no funnel row", () => {
  it("the composer saves a new entry through createJournalEntry from lib/journal/actions", () => {
    const composer = read(join(WEB, "components", "app", "journal-entry-composer.tsx"));
    expect(composer).toMatch(/await createJournalEntry\(fd\)/);
    expect(composer).toMatch(/createJournalEntry[\s\S]*?\} from "@\/lib\/journal\/actions"/);
  });

  it("nothing the save action imports emits a server funnel event or writes pilot_events", () => {
    const files = closure(join(WEB, "lib", "journal", "actions.ts"));
    expect(files.length, "the import walk reached the save path").toBeGreaterThan(20);
    const emitters = files.filter((f) => EMITTER.test(read(f))).map((f) => f.slice(WEB.length + 1));
    expect(emitters).toEqual([]);
  });

  it("no migration writes pilot_events from inside the database", () => {
    const dir = join(REPO, "supabase", "migrations");
    const writers = readdirSync(dir)
      .filter((f) => f.endsWith(".sql"))
      .filter((f) => /insert\s+into\s+(public\.)?pilot_events/i.test(read(join(dir, f))));
    expect(writers).toEqual([]);
  });

  it("client events are consent-gated, and the walk asserts the refusal before and no analytics item after the save", () => {
    const task = read(join(WEB, "lib", "telemetry", "task.ts"));
    expect(task).toMatch(/if \(!hasAnalyticsConsent\(\)\) return;\s*const payload = \{\s*sessionId: getPilotSessionId\(\)/);
    const walk = read(join(WEB, "tests", "e2e", "prod-register-gaps.spec.ts"));
    const step = walk.slice(walk.indexOf('test("J-2 (2.36).'), walk.indexOf('test("G-4 (3.34).'));
    const refused = step.indexOf('.toBe("refused")');
    const firstWrite = step.indexOf("text.fill(");
    const saved = step.indexOf('"journal-saved-banner"');
    const noItem = step.indexOf("no funnel event was sent");
    expect(refused, "the refusal is asserted").toBeGreaterThan(0);
    expect(refused, "before the first write").toBeLessThan(firstWrite);
    expect(noItem, "no analytics item after the save").toBeGreaterThan(saved);
  });

  it("the OWNER STEP says activation is a whole-product change and is not run", () => {
    const walk = read(join(WEB, "tests", "e2e", "prod-register-gaps.spec.ts"));
    expect(walk).toMatch(/OWNER STEP — NOT RUN BY THE WALK, NOT RUN BY AGENTS/);
    expect(walk).toMatch(/the WHOLE PRODUCT/);
    expect(walk).not.toMatch(/set active = true/);
  });
});
