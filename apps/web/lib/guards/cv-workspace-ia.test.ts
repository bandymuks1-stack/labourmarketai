import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * CV / personal-workspace information-architecture guard (cv-workspace-ia,
 * owner P0 2026-07-02, finding 3).
 *
 * A normal user must be able to tell the surfaces apart:
 *   - /dashboard/profile  → personal workspace / player card (edit identity)
 *   - /cv                 → the ONE surface titled "Mano CV" (the CV output)
 *   - /dashboard/journal  → "Darbo įrašai" — the source that FEEDS the CV
 *   - entry skill links   → skills connected to a specific work entry
 *   - /dashboard/account  → settings only
 *
 * Pins:
 *   a. only the /cv page namespace (cvExport.pageTitle) carries the exact
 *      "Mano CV" title — no other worker surface reuses it;
 *   b. the /cv page renders the built-from explainer keys;
 *   c. the journal page carries an ALWAYS-reachable /cv link (also at 0 entries);
 *   d. the waiting-for-review copy explains who reviews and what the entry
 *      counts as meanwhile — never the bare "Waiting for human review";
 *   e. none of the new keys claim verification/certification.
 */

const web = join(__dirname, "..", "..");
const read = (rel: string) => readFileSync(join(web, rel), "utf8");
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const base = (loc: string) => JSON.parse(read(`messages/${loc}.json`)) as Record<string, any>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const journalNs = (loc: string) => JSON.parse(read(`messages/${loc}/journal.json`)) as Record<string, any>;

const LOCS = ["lt", "en", "ru"] as const;
const CV_TITLE: Record<(typeof LOCS)[number], string> = {
  lt: "Mano CV",
  en: "My CV",
  ru: "Моё CV",
};

function walkValues(obj: unknown, path: string, out: Array<{ path: string; value: string }>): void {
  if (typeof obj === "string") out.push({ path, value: obj });
  else if (obj && typeof obj === "object" && !Array.isArray(obj)) {
    for (const [k, v] of Object.entries(obj)) walkValues(v, path ? `${path}.${k}` : k, out);
  }
}

// ── a. Only the /cv page is titled "Mano CV" ───────────────────────────────

describe("Guard: the /cv page is the ONLY surface titled 'Mano CV'", () => {
  for (const loc of LOCS) {
    it(`${loc}: cvExport.pageTitle is the CV title; no other message value carries it`, () => {
      const b = base(loc);
      expect(b.cvExport.pageTitle).toBe(CV_TITLE[loc]);
      const all: Array<{ path: string; value: string }> = [];
      walkValues(b, "", all);
      walkValues(journalNs(loc), "journal", all);
      const offenders = all
        .filter((e) => e.path !== "cvExport.pageTitle" && e.value.includes(CV_TITLE[loc]))
        .map((e) => `${e.path}: ${e.value}`);
      expect(
        offenders,
        `${loc}: surfaces still titled/naming "${CV_TITLE[loc]}":\n  ${offenders.join("\n  ")}`,
      ).toEqual([]);
    });
  }

  it("the renamed surfaces describe what they are (records language, not CV)", () => {
    const lt = base("lt");
    expect(lt.workerEvidence.title).toBe("Darbo įrašai ir įgūdžiai");
    expect(lt.profileHub.journalLink).toBe("Darbo žurnalas");
    expect(lt.auth.dashboard.mySpace.proofCard.title).not.toBe("Mano CV");
    expect(lt.auth.dashboard.section.proofs.title).not.toBe("Mano CV");
    // Canonical-term swap (worker-workspace UX audit v2): the journal H1 now
    // carries the ONE canonical name "Darbo žurnalas" (matches the nav tab);
    // it must still never read as a second "Mano CV".
    expect(journalNs("lt").navTitle).toBe("Darbo žurnalas");
  });

  it("the journal page H1 renders the journal title, not the CV page title", () => {
    const page = read("app/[locale]/dashboard/journal/page.tsx");
    expect(page).toMatch(/\{t\("navTitle"\)\}/);
    expect(page).not.toMatch(/tCv\("pageTitle"\)/);
  });
});

// ── b. The /cv page explains what the CV is built from ─────────────────────

describe("Guard: /cv renders the built-from explainer", () => {
  const page = read("app/[locale]/cv/page.tsx");
  it("renders every builtFrom key inside the cv-built-from block", () => {
    expect(page).toMatch(/data-testid="cv-built-from"/);
    for (const k of ["lead", "profile", "skills", "records", "privacy"]) {
      expect(page, `cv page must render builtFrom.${k}`).toMatch(
        new RegExp(`t\\("builtFrom\\.${k}"\\)`),
      );
    }
  });
  it("every locale carries non-empty builtFrom copy", () => {
    for (const loc of LOCS) {
      const bf = base(loc).cvExport.builtFrom as Record<string, string>;
      for (const k of ["lead", "profile", "skills", "records", "privacy"]) {
        expect(
          typeof bf?.[k] === "string" && bf[k].trim().length > 0,
          `${loc} cvExport.builtFrom.${k} missing`,
        ).toBe(true);
      }
    }
  });
  it("the explainer never prints on the exported CV (screen-only)", () => {
    expect(page).toMatch(/print:hidden"\s*\n\s*data-testid="cv-built-from"/);
  });
});

// ── c. The journal always links to the CV it feeds ─────────────────────────

describe("Guard: the journal page carries an always-reachable /cv link", () => {
  const page = read("app/[locale]/dashboard/journal/page.tsx");
  it("renders the cv-bridge link unconditionally (zero-state included)", () => {
    expect(page).toMatch(/data-testid="journal-cv-bridge-link"/);
    expect(page).toMatch(/t\("cvBridgeEmpty"\)/);
    // The bridge paragraph must NOT be gated behind a non-zero entry count.
    expect(page).not.toMatch(/totalEntryCount > 0 &&\s*\(\s*<p[^>]*journal-cv-bridge/);
  });
  it("every locale carries the zero-state bridge copy", () => {
    for (const loc of LOCS) {
      const v = journalNs(loc).cvBridgeEmpty as string;
      expect(typeof v === "string" && v.trim().length > 0, `${loc} journal.cvBridgeEmpty`).toBe(true);
    }
  });
});

// ── d. Waiting-for-review copy is explained, not bare ──────────────────────

describe("Guard: waiting-for-review copy explains who reviews + interim state", () => {
  const PINNED: Record<(typeof LOCS)[number], string> = {
    lt: "Laukia žmogaus peržiūros — peržiūrėti gali jūsų organizacijos vadovas ar savininkas; iki tol tai lieka jūsų nurodytas įrašas",
    en: "Waiting for a human to review it — your organisation's manager or owner can review it; until then it stays the record you entered",
    ru: "Ожидает просмотра человеком — просмотреть её может руководитель или владелец вашей организации; до этого она остаётся записью, которую указали вы",
  };
  for (const loc of LOCS) {
    it(`${loc}: entry.timeline.waiting is the explained copy`, () => {
      expect(journalNs(loc).entry.timeline.waiting).toBe(PINNED[loc]);
    });
  }
});

// ── e. No verification claim in any of the new keys ────────────────────────

describe("Guard: the new IA copy never claims verification", () => {
  const CERT = /patvirtin|tvirtin|verif|подтвержд|верифиц|\bconfirm/i;
  for (const loc of LOCS) {
    it(`${loc}: builtFrom + bridge + waiting + whoCanConfirm are certification-free`, () => {
      const j = journalNs(loc);
      const values: string[] = [
        ...Object.values(base(loc).cvExport.builtFrom as Record<string, string>),
        j.cvBridgeEmpty,
        j.whoCanConfirm,
        j.entry.timeline.waiting,
        base(loc).workerEvidence.title,
        base(loc).profileHub.journalLink,
        j.navTitle,
      ];
      const offenders = values.filter((v) => CERT.test(v));
      expect(offenders, `${loc} certification wording: ${offenders.join(" | ")}`).toEqual([]);
    });
  }
});
