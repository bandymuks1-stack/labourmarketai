/**
 * COMPANY SCOUTING VISIBILITY — permanent CI guard (Step 3B).
 *
 * The company-facing scouting/shortlist surface must consume the Step 3A
 * visibility policy and never render a worker's name/contact/private field.
 * Doctrine §4 (default-closed) + §7 (encode the negative-visibility rules so a
 * future refactor can't quietly re-introduce a leak). The behavioural proof is
 * `lib/scouting/scout-safe-view.test.ts`; this guard pins the source wiring.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

const APP = resolve(__dirname, "..", "..");
const read = (rel: string): string => readFileSync(join(APP, rel), "utf8");
// Strip comments so we assert executable/JSX source, not doc prose (the docs
// legitimately NAME the forbidden fields to explain why they're excluded).
const code = (src: string): string =>
  src.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\{\/\*[\s\S]*?\*\/\}/g, " ").replace(/\/\/[^\n]*/g, " ");

const PAGE = "app/[locale]/dashboard/company/scouting/page.tsx";
const MAPPER = "lib/scouting/scout-safe-view.ts";
const SCOUTING = "lib/scouting/scouting.ts";

describe("safe-view mapper consumes the Step 3A policy", () => {
  const src = code(read(MAPPER));
  it("imports the visibility policy", () => {
    expect(src).toMatch(/from\s+["']@\/lib\/visibility\/worker-profile-visibility["']/);
    expect(src).toMatch(/toShortlistSafePreview/);
    expect(src).toMatch(/canStartCommunicationOrBooking/);
    expect(src).toMatch(/assertContactSafe/);
  });
  it("never passes a name/headline into the preview builder", () => {
    expect(src).not.toMatch(/displayName/);
    expect(src).not.toMatch(/headline/);
  });
});

describe("scouting server layer returns only the safe candidate", () => {
  const src = code(read(SCOUTING));
  it("builds candidates via toScoutSafeCandidate", () => {
    expect(src).toMatch(/toScoutSafeCandidate/);
    expect(src).toMatch(/ScoutSafeCandidate/);
  });
  it("does not surface raw name/contact fields to the candidate shape", () => {
    expect(src).not.toMatch(/\bdisplayName\b/);
    expect(src).not.toMatch(/\bheadline\b/);
  });
});

describe("company scouting page renders only safe fields", () => {
  const src = code(read(PAGE));

  it("renders the anonymized handle, not a name", () => {
    expect(src).toMatch(/anonymizedToken/);
    expect(src).toMatch(/preview\.anonymizedLabel|p\.anonymizedLabel/);
  });

  it("shows the contacts-hidden privacy frame", () => {
    expect(src).toMatch(/privacy\.contactsHidden/);
    expect(src).toMatch(/privacy\.profileSafe/);
  });

  it("drives the communication status from canContact (no live messaging)", () => {
    expect(src).toMatch(/c\.canContact/);
    expect(src).toMatch(/comms\.blocked/);
  });

  it("never references a contact / name / private worker field", () => {
    for (const forbidden of [
      /\bdisplayName\b/,
      /\bheadline\b/,
      /\.email\b/,
      /\.phone\b/,
      /\bfull_?name\b/,
      /profile_?text/i,
      /\.bio\b/,
    ]) {
      expect(src).not.toMatch(forbidden);
    }
  });
});

describe("no fake match / AI / verification / contact-ready language", () => {
  for (const rel of [PAGE, MAPPER, SCOUTING]) {
    const src = code(read(rel)).toLowerCase();
    it(`${rel}: honest, no fabricated claims`, () => {
      expect(src).not.toMatch(/\bai\s*(match|matching|score|verif)/);
      expect(src).not.toMatch(/guaranteed (fit|match)/);
      expect(src).not.toMatch(/best match/);
      expect(src).not.toMatch(/contact[- ]ready|unlock contact|verified worker/);
    });
  }
});

describe("i18n parity for the new scouting copy (LT/EN/RU)", () => {
  for (const loc of ["en", "lt", "ru"] as const) {
    it(`${loc}.json carries the new safe-scouting keys`, () => {
      const j = JSON.parse(read(`messages/${loc}.json`)) as {
        scouting?: Record<string, unknown> & {
          privacy?: Record<string, unknown>;
          fields?: Record<string, unknown>;
          comms?: Record<string, unknown>;
        };
      };
      const s = j.scouting;
      expect(s?.candidate).toBeTruthy();
      expect(s?.privacy?.contactsHidden).toBeTruthy();
      expect(s?.privacy?.profileSafe).toBeTruthy();
      expect(s?.fields?.location).toBeTruthy();
      expect(s?.comms?.blocked).toBeTruthy();
      // No leftover English marker in any active locale.
      expect(JSON.stringify(s)).not.toContain("[EN]");
    });
  }
});
