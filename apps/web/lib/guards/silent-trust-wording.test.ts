import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Guard: Silent-trust wording cleanup (sprint silent-trust-wording-cleanup-p0).
 *
 * Owner rule: normal / public / self-view UI must NEVER show wording or a badge
 * that suggests the platform publicly CERTIFIES a person, skill, work record,
 * company, or service — unless the owner later explicitly approves a separate
 * public trust model. Confirmation / review / verification stay REAL and stored;
 * they are used internally (ranking, matching, review, fraud, future trust
 * scoring) as SILENT signals — but the worker/public surfaces describe the
 * record state in neutral records language, never an affirmative trust badge.
 *
 * This guard pins both halves of that contract so it cannot silently regress:
 *   A. The positive-state LABELS on the trust-signal namespaces carry no
 *      affirmative certification stem (LT patvirtin/tvirtin/verifik, EN
 *      verified/confirmed, RU подтверж/верифиц) in the three served locales.
 *   B. The self-view surfaces (player card, own map marker, trust block, CV
 *      sheet, worker-evidence card, evidence-status strip) carry no gold/green
 *      certification visual token (trust ring, trust accent, tier gold, the
 *      green verified glow, a verified count/badge, a ShieldCheck "verified"
 *      icon, a ✓ certified checkmark).
 *
 * It deliberately does NOT forbid the honest PENDING copy ("Laukia
 * patvirtinimo" / "Awaiting confirmation"): that states the ABSENCE of
 * certification, which is exactly what the owner wants surfaced.
 */

const APP_ROOT = join(__dirname, "..", "..");
const read = (rel: string) => readFileSync(join(APP_ROOT, rel), "utf8");
const SERVED = ["lt", "en", "ru"] as const;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const msgs = (loc: string): any =>
  JSON.parse(read(join("messages", `${loc}.json`)));
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const get = (obj: any, path: string) =>
  path.split(".").reduce((o, k) => (o == null ? o : o[k]), obj);

// The affirmative-certification stems, per served locale. Pending/awaiting copy
// (which states the absence of certification) is handled separately and is NOT
// forbidden here.
const CERT_STEM = /verif|confirm|patvirtin|tvirtinat|подтверж|верифиц/i;

// The positive-state labels: the rung that USED to read "Patvirtinta /
// Confirmed / Verified". Each must now be neutral records language.
const POSITIVE_LABELS = [
  "playerCard.verifiedTitle",
  "evidenceStatus.confirmed.label",
  "workerEvidence.confirmed",
  "cvExport.tiers.confirmed",
  "cvExport.summary.verifiedSkills",
  "cvExport.summary.managerConfirmations",
  "trust.verifiedSkills",
  "trust.managerConfirmations",
  "todayScreen.week.confirmed",
  "journalSkillLinks.source.confirmed",
];

describe("Silent-trust: positive-state labels are neutral records language", () => {
  for (const loc of SERVED) {
    it(`${loc}: no affirmative certification stem on any positive-state label`, () => {
      const m = msgs(loc);
      for (const path of POSITIVE_LABELS) {
        const value = get(m, path);
        expect(typeof value === "string" && value.length > 0, `${loc}: ${path} missing`).toBe(true);
        expect(value, `${loc}: ${path} = "${value}" reads as a public certification`).not.toMatch(
          CERT_STEM,
        );
      }
    });
  }
});

describe("Silent-trust: self-view surfaces carry no certification visual token", () => {
  const card = read("components/app/worker-player-card.tsx");
  const map = read("components/app/market-map-live.tsx");
  const trust = read("components/app/trust-block.tsx");
  const evidence = read("components/app/worker-evidence-card.tsx");
  const strip = read("components/app/evidence-status-strip.tsx");
  const cv = read("app/[locale]/cv/page.tsx");

  it("the player card has no gold/green certification token or verified badge", () => {
    expect(card).not.toMatch(/trust-ring/);
    expect(card).not.toMatch(/trust-accent/);
    expect(card).not.toMatch(/tier-gold/);
    expect(card).not.toMatch(/state-success/);
    expect(card).not.toMatch(/ShieldCheck/);
    // keeps the neutral skill-signals section (proves the section still renders)
    expect(card).toMatch(/player-card-skill-signals/);
  });

  it("the own map marker has no verified count/badge or gold ring", () => {
    expect(map).not.toMatch(/verifiedSkillsCount/);
    expect(map).not.toMatch(/verifiedBadge/);
    expect(map).toMatch(/const ringColor = "#22D3EE"/);
  });

  it("the trust block highlight is neutral (no green verified stat)", () => {
    expect(trust).not.toMatch(/ShieldCheck/);
    expect(trust).not.toMatch(/state-success/);
  });

  it("the worker-evidence + evidence-status strip use neutral tones", () => {
    expect(evidence).not.toMatch(/emerald/);
    expect(strip).not.toMatch(/emerald/);
  });

  it("the CV sheet has no emerald confirmed badge or ✓ certified checkmark", () => {
    expect(cv).not.toMatch(/emerald/);
    expect(cv).not.toMatch(/ShieldCheck/);
    expect(cv).not.toMatch(/"✓ "/);
  });
});
