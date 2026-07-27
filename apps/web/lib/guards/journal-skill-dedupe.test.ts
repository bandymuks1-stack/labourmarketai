import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  dedupeSignalsByLabel,
  normalizeSignalLabel,
} from "@/lib/structuring/signal-dedupe";

/**
 * PR-C guard — journal → skill dedupe behavior (doctrine: no duplicate
 * skills). Pins the two layers that keep one skill ONE row / ONE visible
 * signal:
 *
 *   1. the PURE display-time concept dedupe (`signal-dedupe.ts`) — real
 *      exported functions, unit-tested;
 *   2. the WRITE-time dedupe in the pipeline + confirm trust boundary —
 *      `worker_skills` writes are conflict-guarded on (worker_id, skill_id)
 *      with ignoreDuplicates, and the pipeline only ever adds skills the
 *      worker has NOT already declared (source scan, so a refactor cannot
 *      silently drop the guarantee).
 */

const APP = join(__dirname, "..", "..");
const read = (rel: string) => readFileSync(join(APP, rel), "utf8");

describe("pure display-time dedupe (real exported functions)", () => {
  it("normalizeSignalLabel collapses case + whitespace only", () => {
    expect(normalizeSignalLabel("  Mūrijimas  ")).toBe("mūrijimas");
    expect(normalizeSignalLabel("Plytelių   klijavimas")).toBe(
      "plytelių klijavimas",
    );
    // Accent folding intentionally NOT applied (labels are localized already).
    expect(normalizeSignalLabel("Mūrijimas")).not.toBe("murijimas");
  });

  it("drops duplicate concepts — first occurrence wins, order preserved", () => {
    const out = dedupeSignalsByLabel([
      { name: "Mūrijimas" },
      { name: "Plytelių klijavimas" },
      { name: "  mūrijimas " },
      { name: "PLYTELIŲ KLIJAVIMAS" },
    ]);
    expect(out.map((s) => s.name)).toEqual([
      "Mūrijimas",
      "Plytelių klijavimas",
    ]);
  });

  it("drops items whose label is already shown elsewhere", () => {
    const out = dedupeSignalsByLabel(
      [{ name: "Mūrijimas" }, { name: "Dažymas" }],
      ["mūrijimas"],
    );
    expect(out.map((s) => s.name)).toEqual(["Dažymas"]);
  });

  it("empty labels never survive", () => {
    expect(dedupeSignalsByLabel([{ name: "   " }, { name: "" }])).toEqual([]);
  });
});

describe("write-time dedupe — no duplicate worker_skills row for one slug", () => {
  const pipeline = read("lib/journal/skill-pipeline.ts");
  const confirm = read("lib/journal/skill-pipeline-actions.ts");

  it("pipeline only adds skills the worker has NOT declared", () => {
    // The candidate set for worker_skills inserts is filtered against the
    // declared-slug set read at the start of the run.
    expect(pipeline).toMatch(
      /const toAdd = resolved\.filter\(\(r\) => !inputs\.declaredSlugs\.has\(r\.slug\)\)/,
    );
  });

  it("pipeline worker_skills write is conflict-guarded on (worker_id, skill_id)", () => {
    const idx = pipeline.indexOf('.from("worker_skills").upsert');
    expect(idx).toBeGreaterThan(-1);
    const window = pipeline.slice(idx, idx + 300);
    expect(window).toContain('onConflict: "worker_id,skill_id"');
    expect(window).toContain("ignoreDuplicates: true");
  });

  it("confirm trust boundary checks ownership first AND conflict-guards the add", () => {
    // addSkillAndLink: reads the existing worker_skills row before inserting…
    expect(confirm).toMatch(/const alreadyOwned = Boolean\(owned\?\.skill_id\);/);
    expect(confirm).toMatch(/if \(!alreadyOwned\) \{/);
    // …and the insert itself is still upsert-guarded on the same unique key.
    const idx = confirm.indexOf('.from("worker_skills").upsert');
    expect(idx).toBeGreaterThan(-1);
    const window = confirm.slice(idx, idx + 400);
    expect(window).toContain('onConflict: "worker_id,skill_id"');
    expect(window).toContain("ignoreDuplicates: true");
  });

  it("evidence links are conflict-guarded on (journal_entry_id, skill_id)", () => {
    // The single link-write helper carries the idempotent upsert shape for
    // every upsert-mode call site.
    const helper = read("lib/journal/entry-skill-link-write.ts");
    expect(helper).toContain('onConflict: "journal_entry_id,skill_id"');
    expect(helper).toContain("ignoreDuplicates: true");
  });
});
