import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";

/**
 * Operations truth guards (ops cycle PR F). Locks the findings of the
 * company/worker/foreman audit so the product cannot silently drift back
 * into claiming foreman / project-manager / site-manager coordination
 * works. Coarse + stable on purpose.
 */

const APP_ROOT = join(__dirname, "..", "..");
const REPO = resolve(APP_ROOT, "..", "..");
function read(rel: string): string {
  return readFileSync(join(APP_ROOT, rel), "utf8");
}
function readRepo(rel: string): string {
  return readFileSync(join(REPO, rel), "utf8");
}

// ── 1. The audit doc exists and keeps its honest core verdicts ──────────

describe("operations truth audit doc integrity", () => {
  const doc = readRepo(
    "docs/audits/company-worker-foreman-operations-truth-v1.md",
  );
  it("exists and is substantial", () => {
    expect(doc.length).toBeGreaterThan(2000);
  });
  it("keeps the 'not one connected system' headline + foreman/PM verdicts", () => {
    const lower = doc.toLowerCase();
    // Contiguous fragment (markdown soft-wraps the full sentence).
    expect(lower).toContain("single connected");
    expect(lower).toContain("foreman");
    // Foreman / project-manager must be described as not real somewhere.
    expect(lower).toMatch(/ui_only|not_enabled|not real|missing/);
  });
});

// ── 2. The live role catalogue must NOT declare coordination roles ──────

describe("coordination roles are not in the live role catalogue", () => {
  const roles = read("lib/config/roles.ts");
  it("roles.ts declares no foreman/brigadier/project_manager/site_manager role id", () => {
    // These remain profession labels only. A role id would imply real
    // wiring the audit proved does not exist.
    expect(roles).not.toMatch(/id:\s*["'](foreman|brigadier|project_manager|site_manager)["']/);
  });
});

// ── 3. Operations capability map keeps explicit, honest statuses ────────

describe("operations role capability map stays explicit", () => {
  const src = read("lib/operations/role-capabilities.ts");

  it("is a pure module (no IO / AI / GPS / payment imports)", () => {
    for (const re of [
      /import\s+["']server-only["']/,
      /from\s+["']openai["']/i,
      /from\s+["']@anthropic/i,
      /from\s+["']tesseract/i,
      /from\s+["']stripe["']/i,
      /from\s+["']twilio["']/i,
      /navigator\.geolocation/i,
    ]) {
      expect(re.test(src), `must not match ${re}`).toBe(false);
    }
  });

  it("foreman / project_manager / site_manager stay not_enabled; team_lead planned", () => {
    // Pin the literal status next to each id so a silent promotion fails.
    expect(src).toMatch(
      /id:\s*"foreman",\s*status:\s*"not_enabled"/,
    );
    expect(src).toMatch(
      /id:\s*"project_manager",\s*status:\s*"not_enabled"/,
    );
    expect(src).toMatch(
      /id:\s*"site_manager",\s*status:\s*"not_enabled"/,
    );
    expect(src).toMatch(/id:\s*"team_lead",\s*status:\s*"planned"/);
  });
});

// ── 4. Work-journal + ops helpers import no AI/GPS/payment packages ─────

describe("journal + operations helpers import no external AI/GPS/payment", () => {
  const BANNED = [
    /from\s+["']openai["']/i,
    /from\s+["']@anthropic[^"']*["']/i,
    /from\s+["']tesseract[^"']*["']/i,
    /from\s+["']pdf-parse["']/i,
    /from\s+["']stripe["']/i,
    /from\s+["']twilio["']/i,
    /from\s+["']@sendgrid[^"']*["']/i,
  ];
  const dirs = ["lib/journal", "lib/operations"];
  for (const dir of dirs) {
    const abs = join(APP_ROOT, dir);
    const files = readdirSync(abs).filter(
      (f) => f.endsWith(".ts") && !f.endsWith(".test.ts"),
    );
    for (const f of files) {
      it(`${dir}/${f} has no banned external import`, () => {
        const src = readFileSync(join(abs, f), "utf8");
        for (const re of BANNED) {
          expect(re.test(src), `${dir}/${f} must not import ${re}`).toBe(false);
        }
      });
    }
  }
});
