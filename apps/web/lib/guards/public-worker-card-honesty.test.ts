import { describe, expect, it } from "vitest";
import { existsSync, readFileSync, readdirSync, type Dirent } from "node:fs";
import { join } from "node:path";

/**
 * S3 PLAYER-CARD HONESTY — public worker-card unification guard.
 *
 * The visual audit found two contradictory worker-card systems: the canonical
 * real `WorkerPlayerCard` (honest counters, no rating) and a retired FUT-style
 * concept card (`player-card.tsx` + `ovr-ring.tsx`: 0–99 OVR, gold/silver/
 * bronze tiers, six-acronym stat bars, manual two-locale localization) that
 * `/for-workers` still rendered publicly. S3 deleted the concept card and
 * pointed `/for-workers` at the canonical card with the ONE shared sample.
 *
 * This guard pins every part of that so it cannot silently regress:
 *   1. the concept card and OVR ring stay deleted, nothing imports them;
 *   2. /for-workers renders the canonical card from the shared sample;
 *   3. the shared sample module stays the single public sample source;
 *   4. the retired stat/tier/status i18n fiction stays out of public copy;
 *   5. no manual `locale === "lt"` localization on the card surfaces;
 *   6. no second full Player Card component system appears.
 */

const APP = join(__dirname, "..", "..");
const read = (rel: string) => readFileSync(join(APP, rel), "utf8");
const exists = (rel: string) => existsSync(join(APP, rel));
const stripComments = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\/\/[^\n]*/g, " ");

/** Recursively list .ts/.tsx files under an app-relative directory. */
const walk = (rel: string, out: string[] = []): string[] => {
  for (const entry of readdirSync(join(APP, rel), {
    withFileTypes: true,
  }) as Dirent[]) {
    const childRel = `${rel}/${entry.name}`;
    if (entry.isDirectory()) {
      if (entry.name === "node_modules") continue;
      walk(childRel, out);
    } else if (/\.tsx?$/.test(entry.name)) {
      out.push(childRel);
    }
  }
  return out;
};

const FOR_WORKERS = "app/[locale]/(marketing)/for-workers/page.tsx";
const SAMPLE = "lib/player-card/sample-card.ts";
const SHOWCASE = "components/marketing/player-card-showcase.tsx";
const CANONICAL = "components/app/worker-player-card.tsx";

describe("1. the FUT concept card stays deleted and unreferenced", () => {
  it("player-card.tsx and ovr-ring.tsx do not exist", () => {
    expect(exists("components/app/player-card.tsx")).toBe(false);
    expect(exists("components/app/ovr-ring.tsx")).toBe(false);
  });

  it("no ovr-ring file reappears anywhere under components/ or app/", () => {
    const offenders = [...walk("components"), ...walk("app")].filter((rel) =>
      /(^|\/)ovr-ring(\.|-)/.test(rel),
    );
    expect(offenders, offenders.join(", ")).toEqual([]);
  });

  it("nothing imports the concept card or the OVR ring", () => {
    const offenders: string[] = [];
    for (const rel of [...walk("components"), ...walk("app"), ...walk("lib")]) {
      const src = read(rel);
      if (
        /from\s+["']@\/components\/app\/player-card["']/.test(src) ||
        /from\s+["'][^"']*ovr-ring["']/.test(src)
      ) {
        offenders.push(rel);
      }
    }
    expect(offenders, offenders.join(", ")).toEqual([]);
  });

  it("the placeholder registry carries no FUT card payloads", () => {
    const src = stripComments(read("content/placeholders.ts"));
    for (const banned of ["getCard", "PlayerCardData", "STAT_KEYS", "PlayerStatKey"]) {
      expect(src, `content/placeholders.ts still carries ${banned}`).not.toContain(banned);
    }
  });
});

describe("2. /for-workers renders the canonical card from the shared sample", () => {
  const page = read(FOR_WORKERS);

  it("imports the canonical WorkerPlayerCard + the shared sample builder", () => {
    expect(page).toMatch(/from\s+"@\/components\/app\/worker-player-card"/);
    expect(page).toMatch(/buildSampleWorkerPlayerCard/);
    expect(page).toMatch(/buildPlayerCardLabels/);
  });

  it("renders no OVR / tier / stat-bar fiction", () => {
    const code = stripComments(page);
    expect(code).not.toMatch(/\bOVR\b/);
    expect(code).not.toMatch(/tier-(gold|silver|bronze)/);
    expect(code).not.toMatch(/\bSTAT_KEYS\b/);
  });

  it("keeps the always-visible Example frame around the sample card", () => {
    expect(page).toMatch(/<ExamplePreviewFrame>/);
  });
});

describe("3. ONE public sample source, shared with the landing showcase", () => {
  it("the shared sample module exists and builds the canonical shape", () => {
    const sample = read(SAMPLE);
    expect(sample).toMatch(/buildSampleWorkerPlayerCard/);
    expect(sample).toMatch(/WorkerPlayerCard/);
    // The sample is explainable facts only — never a universal score shape.
    const code = stripComments(sample);
    expect(code).not.toMatch(/\bovr\b/i);
    expect(code).not.toMatch(/\btier\b/i);
  });

  it("the landing showcase builds its sample from the SAME module", () => {
    const showcase = read(SHOWCASE);
    expect(showcase).toMatch(/buildSampleWorkerPlayerCard/);
    // No second inline sample card literal may reappear in the showcase.
    expect(showcase).not.toMatch(/skillsDeclared:\s*\d/);
  });
});

describe("4. the retired rating fiction stays out of public worker copy", () => {
  const ACTIVE = ["lt", "en", "ru", "de", "nl", "pl", "da", "et", "lv", "no", "sv"];

  it("playercards namespace keeps no stat/tier/status keys in any locale", () => {
    for (const loc of ACTIVE) {
      const pc = (
        JSON.parse(read(`messages/${loc}.json`)) as {
          playercards?: Record<string, unknown>;
        }
      ).playercards;
      expect(pc, `${loc} playercards`).toBeTruthy();
      for (const dead of ["stat", "tier", "status", "statLegendIntro"]) {
        expect(pc?.[dead], `${loc} playercards.${dead}`).toBeUndefined();
      }
    }
  });

  it("workers namespace advertises no stat bars / OVR / draft-status fiction", () => {
    for (const loc of ACTIVE) {
      const workers = JSON.stringify(
        (JSON.parse(read(`messages/${loc}.json`)) as { workers?: unknown }).workers ?? {},
      );
      expect(workers, `${loc} workers namespace`).not.toMatch(/\bOVR\b/);
      expect(workers, `${loc} workers namespace`).not.toMatch(/stat bars?|statų juost/i);
      expect(workers, `${loc} workers namespace`).not.toMatch(/0[–-]99/);
      expect(workers, `${loc} workers namespace`).not.toMatch(
        /Drafted|Atrinktas|Задрафтован/,
      );
    }
  });
});

describe("5. no manual two-locale localization on the card surfaces", () => {
  it('the public card surfaces never branch on locale === "lt"', () => {
    for (const rel of [FOR_WORKERS, SAMPLE, SHOWCASE, CANONICAL]) {
      const code = stripComments(read(rel));
      expect(code, rel).not.toMatch(/locale\s*===\s*["']lt["']/);
      expect(code, rel).not.toMatch(/\?\s*[a-zA-Z_$.]+\.lt\s*:\s*[a-zA-Z_$.]+\.en\b/);
    }
  });
});

describe("6. one full Player Card system — no second card component", () => {
  it("worker-player-card.tsx is the only full worker card component under components/app", () => {
    // A "full card" is a component that renders the card's identity header +
    // readiness. Chart/tile children live in components/app/player-card/ and
    // are allowed; a sibling re-implementation is not.
    const offenders = walk("components/app").filter((rel) => {
      if (rel === "components/app/worker-player-card.tsx") return false;
      if (rel.startsWith("components/app/player-card/")) return false;
      const src = read(rel);
      return /data-testid="worker-player-card"/.test(src);
    });
    expect(offenders, offenders.join(", ")).toEqual([]);
  });

  it("every public mount of the card goes through the canonical component", () => {
    for (const rel of [FOR_WORKERS, SHOWCASE]) {
      expect(read(rel), rel).toMatch(/<WorkerPlayerCard\b/);
      expect(read(rel), rel).not.toMatch(/<PlayerCard\b/);
    }
  });
});
