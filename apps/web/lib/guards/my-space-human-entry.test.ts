import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { workerNextAction } from "../dashboard/next-action";

/**
 * "Mano erdvė" human-entry guard (slice my-space-human-entry-v1).
 *
 * The logged-in worker must land in their own calm space, not an admin cockpit.
 * This guard pins the product-logic correction so it cannot silently regress:
 *
 *   1. The worker entry opens with the calm "Aš dabar" summary (<MySpaceNow>),
 *      and the heavy cockpit surfaces (journey-rail stepper, platform "starting
 *      point" banner, role/module activity-setup card) are NOT in the worker
 *      render path.
 *   2. The profile/CV CTA ("Užpildyti profilį") is gated to the INCOMPLETE
 *      profile state only — a completed profile never re-shows it (no duplicate
 *      "fill your profile" nag).
 *   3. No standalone "Įgūdžių patvirtinimai" / "Skill verifications" card is
 *      exposed on the dashboard or profile user-facing surfaces (skill evidence
 *      stays inline + honestly labelled, never its own heavy block).
 *   4. The "Mano erdvė" copy is human and calm — present in LT + EN, and free of
 *      bureaucratic / internal-system wording (draft, module, verification_status,
 *      "užpildyk sistemą") and of demo/fake/sample wording.
 *
 * Pure source + i18n assertions; invents nothing. Runs in CI via `pnpm -F web test`.
 */

const root = join(__dirname, "..", "..");
const read = (rel: string) => readFileSync(join(root, rel), "utf8");
const lt = JSON.parse(read("messages/lt.json"));
const en = JSON.parse(read("messages/en.json"));

const DASH_PAGE = "app/[locale]/dashboard/page.tsx";
const PROFILE_PAGE = "app/[locale]/dashboard/profile/page.tsx";

describe("worker entry opens with the state-aware work card", () => {
  const page = read(DASH_PAGE);
  it("mounts <WorkCard> on the dashboard (the calm 'Mano darbo kortelė')", () => {
    expect(page).toMatch(/<WorkCard\b/);
  });
  it("the work card surfaces honest missing states, never a fabricated value", () => {
    const card = read("components/app/work-card.tsx");
    // Missing dimensions show a "dar nenurodyta" hint, not a fake 0/score.
    expect(card).toContain("dim.${dim}.missing");
    // No system/score field is ever surfaced to the user.
    expect(card).not.toMatch(/trust_score|profile_completeness/);
  });
  it("the worker entry no longer renders the role/module activity-setup link", () => {
    // The "start a company/agency/buyer" card is not a person's next natural
    // step; it lives under /dashboard/account now.
    expect(page).not.toMatch(/dashboard-activity-setup-link/);
    expect(page).not.toMatch(/activitySetup\./);
  });
});

describe("profile/CV CTA is gated to the incomplete state (no duplicate nag)", () => {
  it("a completed profile never returns the complete-profile action", () => {
    const complete = workerNextAction({
      hasProfile: true,
      entriesTotal: 3,
      confirmedCount: 1,
    });
    expect(complete.key).not.toBe("worker_complete_profile");
  });
  it("an empty profile DOES return the complete-profile action (real route)", () => {
    const empty = workerNextAction({
      hasProfile: false,
      entriesTotal: 0,
      confirmedCount: 0,
    });
    expect(empty.key).toBe("worker_complete_profile");
    expect(empty.href).toBe("/dashboard/profile");
  });
});

describe("no standalone 'Įgūdžių patvirtinimai' card on user-facing entry surfaces", () => {
  for (const rel of [DASH_PAGE, PROFILE_PAGE]) {
    it(`${rel} has no hardcoded skill-verification card title`, () => {
      const src = read(rel);
      expect(src).not.toMatch(/Įgūdžių patvirtinim/i);
      expect(src).not.toMatch(/Skill verification/i);
    });
  }
  it("no message string is a standalone 'Įgūdžių patvirtinimai' / 'Skill verifications' card title", () => {
    const offenders: string[] = [];
    for (const [name, json] of [["lt", lt], ["en", en]] as const) {
      const walk = (v: unknown, path: string) => {
        if (typeof v === "string") {
          if (/^\s*(Įgūdžių patvirtinimai|Skill verifications?)\s*$/i.test(v))
            offenders.push(`${name}:${path} = "${v}"`);
        } else if (v && typeof v === "object") {
          for (const [k, val] of Object.entries(v)) walk(val, `${path}.${k}`);
        }
      };
      walk(json, "");
    }
    expect(offenders, offenders.join(" | ")).toEqual([]);
  });
});

describe("'Mano erdvė' copy is human, calm, present in LT + EN", () => {
  const REQUIRED = [
    "eyebrow",
    "intro",
    "snapshot.work",
    "snapshot.workEmpty",
    "snapshot.skills",
    "snapshot.skillsValue",
    "snapshot.skillsEmpty",
    "snapshot.proof",
    "snapshot.proofValue",
    "snapshot.proofEmpty",
    "unverifiedNote",
    "activities.title",
    "activities.body",
    "activities.cta",
    "proofCard.title",
    "proofCard.body",
    "proofCard.cta",
    "otherSpaces",
  ];
  const get = (json: Record<string, unknown>, path: string): unknown =>
    path.split(".").reduce<unknown>((acc, k) => {
      if (acc && typeof acc === "object") return (acc as Record<string, unknown>)[k];
      return undefined;
    }, (json.auth as Record<string, unknown>).dashboard);

  for (const [name, json] of [["lt", lt], ["en", en]] as const) {
    it(`${name} exposes the full mySpace namespace`, () => {
      for (const k of REQUIRED) {
        const v = get(json, `mySpace.${k}`);
        expect(typeof v === "string" && v.trim().length > 0, `${name} mySpace.${k}`).toBe(true);
      }
    });
  }

  it("the LT copy reads as a personal space (warm, first-person), not a system", () => {
    const m = (lt.auth.dashboard as Record<string, unknown>).mySpace as {
      eyebrow: string;
      intro: string;
      snapshot: Record<string, string>;
    };
    expect(m.eyebrow).toBe("Aš dabar");
    expect(m.intro).toMatch(/jūsų erdvė/i);
    // First-person human framing for the snapshot ("ką dirbu / moku / įrodau").
    expect(m.snapshot.work).toMatch(/^Ką /);
  });

  it("mySpace copy carries no bureaucratic / internal-system wording", () => {
    const blobs: string[] = [];
    for (const json of [lt, en]) {
      blobs.push(
        JSON.stringify((json.auth as Record<string, unknown>).dashboard && (json.auth.dashboard as Record<string, unknown>).mySpace),
      );
    }
    const all = blobs.join(" ");
    // No internal/system or "fill the system" wording, no demo/fake/sample.
    expect(all).not.toMatch(/verification_status|server draft|stale draft|\bmodule\b|\bmodulis\b|\bmoduli/i);
    expect(all).not.toMatch(/užpildyk\w*\s+sistem|fill (?:in |out )?the system/i);
    expect(all).not.toMatch(/\bdemo\b|\bsample\b|\bfake\b|pavyzdiniai duomenys/i);
  });
});

describe("'Mano darbo kortelė' (work card) copy is complete + honest in LT + EN", () => {
  const card = (json: Record<string, unknown>) =>
    (json.auth as { dashboard: { workCard: Record<string, unknown> } }).dashboard
      .workCard;

  // Every suggested action must explain WHY it helps — the four benefit lines.
  const WHY_KEYS = ["work", "availability", "location", "pay", "evidence", "complete"];

  for (const [name, json] of [["lt", lt], ["en", en]] as const) {
    it(`${name} exposes the state intros + dimension labels + why lines`, () => {
      const w = card(json) as {
        intro: Record<string, string>;
        dim: Record<string, { label: string; missing: string }>;
        next: Record<string, string>;
        why: Record<string, string>;
        stale: Record<string, string>;
      };
      for (const s of ["new", "returning", "stale"]) {
        expect(w.intro?.[s], `${name} intro.${s}`).toBeTruthy();
      }
      for (const d of ["work", "availability", "location", "pay", "evidence"]) {
        expect(w.dim?.[d]?.label, `${name} dim.${d}.label`).toBeTruthy();
        expect(w.dim?.[d]?.missing, `${name} dim.${d}.missing`).toBeTruthy();
        expect(w.next?.[d], `${name} next.${d}`).toBeTruthy();
      }
      for (const k of WHY_KEYS) {
        expect(w.why?.[k], `${name} why.${k}`).toBeTruthy();
      }
      // The stale confirmation is "Taip / Pakeisti", a small ask — not onboarding.
      for (const k of ["title", "body", "yes", "change"]) {
        expect(w.stale?.[k], `${name} stale.${k}`).toBeTruthy();
      }
    });
  }

  it("LT why-copy matches the mandated benefit sentences", () => {
    const w = card(lt) as { why: Record<string, string> };
    expect(w.why.work).toMatch(/kokiam darbui jus galima siūlyti/);
    expect(w.why.pay).toMatch(/pagrįsti jūsų pageidaujamą tarifą/);
    expect(w.why.evidence).toMatch(/galite juos pridėti vėliau/);
  });

  it("work-card copy makes no fake score / no fabricated matching claim", () => {
    const all = [card(lt), card(en)].map((c) => JSON.stringify(c)).join(" ");
    // No score / percentage / ranking, no internal tech, no demo/fake/sample.
    expect(all).not.toMatch(/\bscore\b|balas|reitingas|\d+\s?%|trust_score/i);
    expect(all).not.toMatch(/verification_status|\bRPC\b|\bRLS\b|server draft/i);
    expect(all).not.toMatch(/\bdemo\b|\bsample\b|\bfake\b|pavyzdiniai duomenys/i);
    // "Suggested for" / "offers" describe a benefit of giving data — never a
    // promise that matching exists today (no "guaranteed"/"automatic match").
    expect(all).not.toMatch(/guarantee|garantuo|automat\w*\s+(match|suderin|atitik)/i);
  });
});
