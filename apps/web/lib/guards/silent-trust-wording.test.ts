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
const CERT_STEM = /verif|confirm|tvirtin|подтверж|верифиц/i;

// Employer/external REVIEW-as-trust-claim framing. The owner forbids presenting
// employer/external review or approval of a worker's history/skills as a public
// signal ("employer-reviewed history", "externally reviewed skills", "external
// review"). Tight patterns: they catch the adjective/status framing but NOT the
// allowed internal-workflow verb ("waiting for a person to review it").
const EXTERNAL_REVIEW = [
  /employer[-\s]?(?:review|approv|confirm)/i,
  /externally\s+(?:review|confirm|verif)/i,
  /external\s+(?:review|confirmation|verification)/i,
  /darbdav\w*\s+(?:peržiūr|patvirtin|tvirtin)/i,
  /išorin\w*\s+(?:peržiūr|patvirtin)/i,
  /(?:peržiūrėt\w*|patvirtint\w*)\s+iš\s+išor/i,
  /(?:внешн\w*|работодател\w*)\s+(?:просмотр|подтвер|провер)/i,
  /просмотрен\w*\s+работодател/i,
];

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

// Worker-self-view / public trust-ladder namespaces. The owner rule forbids ANY
// confirmation/verification wording here — including honest pending negatives
// ("awaiting confirmation" / "Laukia patvirtinimo" / "Ожидает подтверждения").
// Excluded by design (different sense, documented in the audit):
//   - marketMap.*       → location/COORDINATE confirmation (privacy feature)
//   - auth.* password/email-link verification + reviewer chainActions
//   - ICU placeholder NAMES like {confirmations} (not rendered text)
const TRUST_NAMESPACES = [
  // worker self-view / in-app
  "evidenceStatus", "workerEvidence", "playerCard", "trust", "cvExport",
  "todayScreen", "capabilityProfile", "workerReadiness", "journalSkillLinks",
  "skills", "profileHub", "profileSkillClaims", "profileCvClarity",
  "evidenceReport", "featureNotes", "features", "structuring",
  "suggestionStatuses", "skillClarify", "worldMap", "myWorkView", "workEntryReview",
  // PUBLIC marketing (landing, /for-workers, /for-companies, public pages) — the
  // rule is the same outside the app as inside it. (pricing = commercial
  // "confirm pricing", scouting/searchRoom = employer app: out of scope.)
  "workers", "companies", "agencies", "pages", "hero", "journey", "vision",
  "workAbroad", "workerIntake", "companyNeed", "services", "marketPulse",
  "playercards", "labourMarket", "matchPreview",
];
// Strip ICU/placeholder braces so a variable NAME like {confirmations} is not
// mistaken for rendered certification copy. Repeat to handle nested plurals.
function stripBraces(s: string): string {
  let prev: string;
  do { prev = s; s = s.replace(/\{[^{}]*\}/g, " "); } while (s !== prev);
  return s;
}

describe("Silent-trust: no pending/affirmative certification wording in trust UI", () => {
  for (const loc of SERVED) {
    it(`${loc}: trust-ladder namespaces are free of confirmation/verification wording`, () => {
      const m = msgs(loc);
      const offenders: string[] = [];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const walk = (o: any, path: string) => {
        for (const k in o) {
          const v = o[k];
          const p = path ? `${path}.${k}` : k;
          if (typeof v === "string") {
            const text = stripBraces(v);
            if (CERT_STEM.test(text) || EXTERNAL_REVIEW.some((rx) => rx.test(text)))
              offenders.push(`${p} = ${JSON.stringify(v)}`);
          } else if (v && typeof v === "object") walk(v, p);
        }
      };
      for (const ns of TRUST_NAMESPACES) if (m[ns]) walk(m[ns], ns);
      expect(offenders, `${loc} trust-ladder leaks:\n${offenders.join("\n")}`).toEqual([]);
    });
  }
});

// The journal namespace is served from messages/{locale}/journal.json (a
// next-intl override), so it is NOT in the base file scanned above. The WORKER
// journal (composer, entry status/timeline, self-progress) is a self-view
// surface and must be free of certification wording. The reviewer-only `inbox.*`
// subtree is the allowed admin/reviewer exception and is excluded.
describe("Silent-trust: worker-facing journal copy is neutral (inbox.* excluded)", () => {
  for (const loc of SERVED) {
    it(`${loc}: journal sub-file (minus inbox.*) has no certification wording`, () => {
      const j = JSON.parse(read(join("messages", loc, "journal.json")));
      const offenders: string[] = [];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const walk = (o: any, path: string) => {
        for (const k in o) {
          const v = o[k];
          const p = path ? `${path}.${k}` : k;
          if (p === "inbox" || p.startsWith("inbox.")) continue; // reviewer-only
          if (typeof v === "string") {
            const text = stripBraces(v);
            if (CERT_STEM.test(text) || EXTERNAL_REVIEW.some((rx) => rx.test(text)))
              offenders.push(`${p} = ${JSON.stringify(v)}`);
          } else if (v && typeof v === "object") walk(v, p);
        }
      };
      walk(j, "");
      expect(offenders, `${loc} journal leaks:\n${offenders.join("\n")}`).toEqual([]);
    });
  }
});

// The W6 `learning` namespace is worker-facing for the transparency copy
// (pageTitle/lead/worker.*) — those must be neutral records language. The
// `manager.*` subtree is the reviewer/manager surface (auto-confirmation policy
// controls, queue actions) where "confirm/auto-confirmation" is the real,
// allowed workflow verb — it is excluded, exactly like journal `inbox.*`.
describe("Silent-trust: worker-facing learning copy is neutral (manager.* excluded)", () => {
  for (const loc of SERVED) {
    it(`${loc}: learning namespace (minus manager.*) has no certification wording`, () => {
      const block = msgs(loc).learning;
      const offenders: string[] = [];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const walk = (o: any, path: string) => {
        for (const k in o) {
          const v = o[k];
          const p = path ? `${path}.${k}` : k;
          if (p === "manager" || p.startsWith("manager.")) continue; // reviewer-only
          if (typeof v === "string") {
            const text = stripBraces(v);
            if (CERT_STEM.test(text) || EXTERNAL_REVIEW.some((rx) => rx.test(text)))
              offenders.push(`${p} = ${JSON.stringify(v)}`);
          } else if (v && typeof v === "object") walk(v, p);
        }
      };
      if (block) walk(block, "");
      expect(offenders, `${loc} learning leaks:\n${offenders.join("\n")}`).toEqual([]);
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
