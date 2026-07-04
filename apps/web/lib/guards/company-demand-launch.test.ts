import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  canCloseFrom,
  canReopenFrom,
  mergeConfirmedNeedPayload,
} from "@/lib/demand/demand-lifecycle-model";
import { deriveNeedSkills } from "@/lib/market/need-skills";
import { parseStructuredNeed } from "@/lib/market/fit";

/**
 * COMPANY / DEMAND SYSTEM — LAUNCH GUARDS (PR10).
 *
 * Pins: the closed lifecycle whitelist (submitted↔closed only), the §19
 * confirm act (canonical slugs, payload-preserving merge, company-attributed),
 * the worker-visibility filter (closed demand can never reach the board),
 * the per-demand scouting bridge, honest copy, and zero outbound.
 */

const APP_ROOT = join(__dirname, "..", "..");
const REPO_ROOT = join(APP_ROOT, "..", "..");
const read = (rel: string) => readFileSync(join(APP_ROOT, rel), "utf8");
const stripComments = (src: string): string =>
  src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|\s)\/\/.*$/gm, "$1");

const CATALOGUE: Set<string> = new Set(
  Object.keys(
    JSON.parse(read("messages/lt/skill-names.json")) as Record<string, string>,
  ),
);

describe("lifecycle transitions are a closed whitelist", () => {
  it("only submitted can close; only closed can reopen", () => {
    expect(canCloseFrom("submitted")).toBe(true);
    for (const s of ["draft", "in_review", "needs_followup", "approved", "closed", null, ""]) {
      expect(canCloseFrom(s), String(s)).toBe(false);
    }
    expect(canReopenFrom("closed")).toBe(true);
    for (const s of ["draft", "submitted", "in_review", "approved", null]) {
      expect(canReopenFrom(s), String(s)).toBe(false);
    }
  });

  it("the server flows re-check the current status as a write precondition", () => {
    const src = read("lib/demand/demand-lifecycle.ts");
    expect(src).toMatch(/canCloseFrom\(req\.status\)/);
    expect(src).toMatch(/canReopenFrom\(req\.status\)/);
    expect(src).toMatch(/\.eq\("status", "submitted"\)/);
    expect(src).toMatch(/\.eq\("status", "closed"\)/);
    // Own-row only, both in the read and the write.
    expect((src.match(/\.eq\("profile_id", user\.id\)/g) ?? []).length).toBeGreaterThanOrEqual(3);
  });
});

describe("§19 confirm act — canonical, payload-preserving, company-attributed", () => {
  it("merge preserves unrelated payload keys and sorts unique slugs", () => {
    const merged = mergeConfirmedNeedPayload(
      {
        agency_offers: [{ agency_name: "A" }],
        match_log: [{ at: "x" }],
        structured_need: { esco_skill_uris: ["http://x"] },
      },
      { skillSlugs: ["order-picking", "order-picking", "barcode-scanning"], professionSlug: "warehouse_worker" },
    );
    expect(merged.agency_offers).toEqual([{ agency_name: "A" }]);
    expect(merged.match_log).toEqual([{ at: "x" }]);
    const sn = merged.structured_need as Record<string, unknown>;
    expect(sn.esco_skill_uris).toEqual(["http://x"]); // legacy human ESCO kept
    expect(sn.skill_slugs).toEqual(["barcode-scanning", "order-picking"]);
    expect(sn.profession_slug).toBe("warehouse_worker");
    expect(sn.confirmed_by).toBe("company");
  });

  it("a confirmed payload parses as a HUMAN-structured need (banner gone)", () => {
    const merged = mergeConfirmedNeedPayload({}, {
      skillSlugs: ["cleaning-services", "laundry"],
      professionSlug: "cleaner",
    });
    const parsed = parseStructuredNeed(merged);
    expect(parsed?.skillSlugs).toEqual(["cleaning-services", "laundry"]);
    expect(parsed?.professionSlug).toBe("cleaner");
    // deriveNeedSkills now sees a human-structured need — no recognition flag.
    const derived = deriveNeedSkills({ payload: merged, needSummary: "irrelevant text now" });
    expect(derived.source).toBe("human_structured");
  });

  it("what gets confirmed is exactly the offline derivation (catalogue slugs)", () => {
    const derived = deriveNeedSkills({
      needSummary: "We need warehouse workers for order picking and pallet handling.",
    });
    expect(derived.source).toBe("recognized_from_text");
    for (const slug of derived.skillSlugs) {
      expect(CATALOGUE.has(slug), slug).toBe(true);
    }
    const confirmSrc = read("lib/demand/demand-lifecycle.ts");
    expect(confirmSrc).toMatch(/deriveNeedSkills/); // the ONE pipeline
    expect(confirmSrc).toMatch(/nothing-to-confirm/); // honest no-op paths
  });
});

describe("closed demand can never reach the worker board", () => {
  it("the applied worker RPC serves submitted + verified only (SQL pin)", () => {
    const sql = readFileSync(
      join(REPO_ROOT, "supabase", "migrations", "20260705130000_worker_demand_location_label.sql"),
      "utf8",
    );
    expect(sql).toMatch(/where cr\.status = 'submitted'/);
    expect(sql).toMatch(/verification_status = 'verified'/);
  });
});

describe("UI honesty + reachability", () => {
  it("scouting mounts the lifecycle controls with the confirm act", () => {
    const page = read("app/[locale]/dashboard/company/scouting/page.tsx");
    expect(page).toMatch(/DemandLifecycleControls/);
    expect(page).toMatch(/showConfirm=/);
  });

  it("every demand row deep-links its own scouting view", () => {
    const readback = read("components/app/demand-requests-readback.tsx");
    expect(readback).toMatch(/dashboard\/company\/scouting\?request=\$\{r\.id\}/);
    expect(readback).toMatch(/demand-readback-scout-link/);
  });

  it("the manage-help copy no longer claims closing is unavailable", () => {
    for (const locale of ["en", "lt", "ru"] as const) {
      const j = JSON.parse(read(`messages/${locale}.json`)) as {
        demandReadback?: { manageHelp?: string };
      };
      const help = (j.demandReadback?.manageHelp ?? "").toLowerCase();
      expect(help.length).toBeGreaterThan(20);
      // must affirmatively point closing/confirming at the scouting view…
      expect(help).toMatch(/scouting/);
      // …and must still be honest that submitted-text EDITING is unavailable.
      expect(help).toMatch(/edit|redagav|редактир/);
    }
  });
});

describe("no external sending, no fake contact", () => {
  const FORBIDDEN = [
    /\bfetch\s*\(/,
    /mailto:/i,
    /nodemailer|sendgrid|resend|postmark|mailgun|twilio|whatsapp|telegram/i,
    /smtp|webhook/i,
    /https?:\/\//i,
  ];
  it("lifecycle modules contain no outbound primitive", () => {
    for (const rel of [
      "lib/demand/demand-lifecycle.ts",
      "lib/demand/demand-lifecycle-model.ts",
      "lib/demand/demand-lifecycle-actions.ts",
      "components/app/demand-lifecycle-controls.tsx",
    ]) {
      const src = stripComments(read(rel));
      for (const re of FORBIDDEN) {
        expect(re.test(src), `${rel} matches ${re}`).toBe(false);
      }
    }
  });
});
