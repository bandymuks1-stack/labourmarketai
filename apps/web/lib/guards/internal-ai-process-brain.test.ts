import { describe, expect, it } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

/**
 * Source-level guard for Internal AI Process Brain v0.
 *
 * v0 is a DETERMINISTIC, read-only process assistant surfaced in the canonical
 * /dashboard/profile hub. This guard pins the safety contract so the layer can
 * never quietly become an actor, a verifier, or a network/AI caller:
 *
 *   1. The brain is pure — no external AI / API / network / mutation imports.
 *   2. It emits the structured shape (knownSignals / missingSignals /
 *      suggestedNextActions / evidenceLinks / safetyDisclaimers) and every
 *      suggestion carries a reason.
 *   3. The assistant is integrated ONLY on the canonical profile page (no new
 *      route) and names CV + skills + journal/evidence together.
 *   4. The copy never claims automatic verification (verified/confirmed/
 *      patvirtinta/patikrinta) except the explicitly-negated safety disclaimer.
 *   5. LT/EN parity for the processAssistant namespace.
 *   6. The project-local skill pack exists.
 *
 * Runs in CI via `pnpm -F web test`. Pure source assertions; invents nothing.
 */

const APP_ROOT = join(__dirname, "..", "..");

function read(rel: string): string {
  return readFileSync(join(APP_ROOT, rel), "utf8");
}
function loadJson(rel: string): Record<string, unknown> {
  return JSON.parse(read(rel)) as Record<string, unknown>;
}
function flattenStrings(
  obj: unknown,
  prefix = "",
  acc: Record<string, string> = {},
): Record<string, string> {
  if (obj && typeof obj === "object") {
    for (const [k, v] of Object.entries(obj)) {
      flattenStrings(v, prefix ? `${prefix}.${k}` : k, acc);
    }
  } else if (typeof obj === "string") {
    acc[prefix] = obj;
  }
  return acc;
}

const BRAIN = "lib/process-brain/profile-process-brain.ts";
const ASSISTANT = "components/app/profile-process-assistant.tsx";
const PROFILE_PAGE = "app/[locale]/dashboard/profile/page.tsx";
const SKILL_PACK = "../../docs/agent-skills/internal-ai-process-brain-v0.md";
const LOCALES = ["lt", "en"] as const;

// ── 1. The brain is pure: no network / AI / mutation ──────────────────────

describe("Guard: the process brain is pure (no network / AI / mutation)", () => {
  const brain = read(BRAIN);

  it("imports no network / external-AI client", () => {
    const FORBIDDEN_IMPORT =
      /\b(fetch|XMLHttpRequest)\b|from\s+["'](?:node:)?(?:https?|net|axios|openai|@anthropic-ai\/[^"']+|undici)["']|createClient|@\/lib\/supabase/;
    expect(
      FORBIDDEN_IMPORT.test(brain),
      "process brain must not touch network / external AI / supabase — it is pure data→data",
    ).toBe(false);
  });

  it("performs no mutation or server action", () => {
    expect(brain).not.toMatch(/["']use server["']/);
    expect(brain).not.toMatch(/\.(insert|update|upsert|delete)\(/);
    expect(brain).not.toMatch(/\b(revalidatePath|revalidateTag|redirect)\b/);
  });

  it("is deterministic (no Date/random)", () => {
    expect(brain).not.toMatch(/Date\.now\(|new Date\(|Math\.random\(/);
  });
});

// ── 2. Structured output with reasons ─────────────────────────────────────

describe("Guard: the brain emits the structured, reasoned shape", () => {
  const brain = read(BRAIN);

  it("declares the five output sections", () => {
    for (const field of [
      "knownSignals",
      "missingSignals",
      "suggestedNextActions",
      "evidenceLinks",
      "safetyDisclaimers",
    ]) {
      expect(brain, `output must include ${field}`).toMatch(new RegExp(field));
    }
  });

  it("every suggestion type carries a reasonKey + an href", () => {
    expect(brain).toMatch(/reasonKey:/);
    expect(brain).toMatch(/href:/);
  });

  it("the assistant renders the 'why this is suggested' reason", () => {
    const ui = read(ASSISTANT);
    expect(ui).toMatch(/whyLabel/);
    expect(ui).toMatch(/reasonKey/);
  });
});

// ── 3. Integration: canonical profile only, names all three pillars ───────

describe("Guard: integrated on the canonical profile hub only", () => {
  it("the standalone assistant panel is consolidated out of the profile (no competing helper)", () => {
    // P0 profile rescue: the single ProfileHubOverview now carries summary +
    // what's-missing + one next action. The pure, read-only process brain (lib)
    // stays tested below and available for reuse, but is no longer rendered as a
    // separate competing panel. See journal-profile-single-path.test.ts.
    const page = read(PROFILE_PAGE);
    expect(page).not.toMatch(/<ProfileProcessAssistant/);
  });

  it("the assistant names CV + skills + journal/evidence together", () => {
    const brain = read(BRAIN);
    expect(brain).toMatch(/signals\.cv\./);
    expect(brain).toMatch(/signals\.skills\./);
    expect(brain).toMatch(/signals\.journal\./);
  });

  it("creates NO new profile/CV/evidence route", () => {
    const ROUTE_DIRS = [
      "app/[locale]/dashboard/process",
      "app/[locale]/dashboard/process-assistant",
      "app/[locale]/dashboard/ai",
      "app/[locale]/dashboard/cv",
      "app/[locale]/dashboard/evidence",
    ];
    for (const d of ROUTE_DIRS) {
      expect(existsSync(join(APP_ROOT, d)), `forbidden parallel route ${d} exists`).toBe(false);
    }
  });

  it("the assistant only links existing canonical destinations", () => {
    const brain = read(BRAIN);
    // The only hrefs the brain may emit.
    const hrefs = [...brain.matchAll(/"(#[a-z-]+|\/dashboard\/[a-z-]+)"/g)].map((m) => m[1]);
    for (const h of hrefs) {
      expect(["#profile-edit", "/dashboard/journal"].includes(h), `unexpected href ${h}`).toBe(true);
    }
  });
});

// ── 4. Honest copy: no automatic-verification claims ──────────────────────

// The ONLY processAssistant values allowed to carry a verify/confirm token are
// the negated safety disclaimers.
const VERIFY_CLAIM = /patvirtint|patikrint|\bverified\b|\bconfirmed\b/i;

describe("Guard: process-assistant copy never claims automatic verification", () => {
  for (const loc of LOCALES) {
    const pa = loadJson(`messages/${loc}.json`).processAssistant;

    it(`${loc}: processAssistant namespace exists with the required keys`, () => {
      expect(pa, `${loc} processAssistant missing`).toBeTruthy();
      const flat = flattenStrings(pa);
      for (const k of [
        "title",
        "intro",
        "actionsHeading",
        "whyLabel",
        "signals.cv.known",
        "signals.skills.known",
        "signals.journal.known",
        "actions.addJournal.reason",
        "safety.notAutomaticVerification",
        "safety.suggestionOnly",
      ]) {
        expect(typeof flat[k] === "string" && flat[k].trim().length > 0, `${loc} processAssistant.${k} missing`).toBe(true);
      }
    });

    it(`${loc}: only the negated safety disclaimer may carry a verify/confirm token`, () => {
      const flat = flattenStrings(pa);
      for (const [k, v] of Object.entries(flat)) {
        if (k.startsWith("safety.")) continue; // negated disclaimers, asserted below
        expect(
          VERIFY_CLAIM.test(v),
          `${loc} processAssistant.${k} must not claim verification: "${v}"`,
        ).toBe(false);
      }
    });

    it(`${loc}: the not-automatic-verification disclaimer is a real negation`, () => {
      const flat = flattenStrings(pa);
      const v = flat["safety.notAutomaticVerification"] ?? "";
      const negated =
        loc === "lt"
          ? /niek\w*\s+nepatvirtina|nepatvirtin/i.test(v)
          : /nothing\s+is\s+confirmed\s+automatically|not\s+.*verif/i.test(v);
      expect(negated, `${loc} safety.notAutomaticVerification must be a negation: "${v}"`).toBe(true);
    });
  }

  it("LT and EN processAssistant key sets are identical (no drift)", () => {
    const lt = Object.keys(flattenStrings(loadJson("messages/lt.json").processAssistant)).sort();
    const en = Object.keys(flattenStrings(loadJson("messages/en.json").processAssistant)).sort();
    expect(lt).toEqual(en);
  });
});

// ── 5. The project-local skill pack exists ────────────────────────────────

describe("Guard: the internal-AI skill pack is present", () => {
  it("docs/agent-skills/internal-ai-process-brain-v0.md exists", () => {
    expect(existsSync(join(APP_ROOT, SKILL_PACK))).toBe(true);
  });

  it("the skill pack references the existing Agent OS doctrine (reuse, not duplicate)", () => {
    const pack = read(SKILL_PACK);
    expect(pack).toMatch(/agent-os/);
    expect(pack).toMatch(/PLATFORM_DOCTRINE/);
  });
});

// ── Negative controls ─────────────────────────────────────────────────────

describe("Guard: detectors are real (negative controls)", () => {
  it("the verify-claim detector flags an affirmative claim", () => {
    expect(VERIFY_CLAIM.test("Įgūdis patvirtintas")).toBe(true);
    expect(VERIFY_CLAIM.test("verified skill")).toBe(true);
    expect(VERIFY_CLAIM.test("Suggested next steps")).toBe(false);
  });

  it("the network-import detector flags a fetch/openai import", () => {
    const FORBIDDEN_IMPORT =
      /\bfetch\b|from\s+["'](?:node:)?(?:https?|net|axios|openai|@anthropic-ai\/[^"']+|undici)["']|createClient|@\/lib\/supabase/;
    expect(FORBIDDEN_IMPORT.test('const r = await fetch("/x")')).toBe(true);
    expect(FORBIDDEN_IMPORT.test('import OpenAI from "openai"')).toBe(true);
    expect(FORBIDDEN_IMPORT.test("export function pure(x) { return x }")).toBe(false);
  });
});
