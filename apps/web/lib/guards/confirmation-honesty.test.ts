import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

/**
 * Confirmation honesty guard (audit: docs/design/universal-confirmation-roles-v1.md).
 *
 * The product must NOT claim broader human confirmation than the backend can
 * actually store. Today the only confirmers the schema supports are an
 * organization `manager`, `owner`, or `external_manager`: the review RPC gates
 * on exactly those `relationship_slug`s, and every confirmation row REQUIRES a
 * non-null `confirmer_engagement_context_id` (an org-scoped engagement) — so a
 * parent, teacher, buyer, or family member simply has no way to record a
 * confirmation. Adding those is a migration (see the design doc), deferred.
 *
 * This guard pins:
 *   1. the backend reality (RPC slug allow-list + NOT NULL engagement FK);
 *   2. the confirmer-role labels shown to users are EXACTLY the supported set;
 *   3. confirmation-specific copy never names a broad confirmer the backend
 *      cannot store, and stays honest about automatic confirmation.
 *
 * Pure source + i18n assertions; runs in CI via `pnpm -F web test`.
 */

const APP_ROOT = join(__dirname, "..", "..");
const REPO_ROOT = join(APP_ROOT, "..", "..");
function read(rel: string): string {
  return readFileSync(join(APP_ROOT, rel), "utf8");
}
function loadJson(rel: string): Record<string, unknown> {
  return JSON.parse(read(rel)) as Record<string, unknown>;
}
function readMigration(match: RegExp): string {
  const dir = join(REPO_ROOT, "supabase", "migrations");
  const file = readdirSync(dir).find((f) => match.test(f));
  if (!file) throw new Error(`no migration matching ${match}`);
  return readFileSync(join(dir, file), "utf8");
}

const SUPPORTED_CONFIRMERS = ["manager", "owner", "external_manager"] as const;
const LOCALES = ["lt", "en"] as const;

// Broad confirmer claims the backend cannot store. Scoped to confirmation copy
// only (these words are legitimate elsewhere — e.g. "student" capability copy,
// the "Pirkėjas/customer" onboarding ROLE — so we never scan whole files).
const BROAD_CONFIRMER = {
  en: /\b(parent|guardian|teacher|mentor|classmate)\b|\bfamily member\b/i,
  lt: /tėv|globėj|mokytoj|mentori|klasės draug|šeimos nar/i,
} as const;

// ── 1. Backend reality: only manager/owner/external_manager can confirm ───

describe("Guard: the backend restricts confirmers to the supported set", () => {
  it("the review RPC gates on exactly manager/owner/external_manager", () => {
    const sql = readMigration(/membership_engagement_reroute\.sql$/);
    expect(sql).toMatch(
      /relationship_slug in \('manager','owner','external_manager'\)/,
    );
    // and never widened to a broad confirmer role in the same allow-list
    expect(sql).not.toMatch(/relationship_slug in \([^)]*\b(parent|guardian|teacher|mentor|buyer|customer)\b[^)]*\)/i);
  });

  it("a confirmation REQUIRES a non-null org engagement (no free-floating confirmers)", () => {
    const sql = readMigration(/0013_work_journal_m1\.sql$/);
    expect(sql).toMatch(
      /confirmer_engagement_context_id\s+uuid\s+not null\s+references public\.engagement_contexts/,
    );
  });
});

// ── 2. The confirmer-role labels are EXACTLY the supported set ─────────────

describe("Guard: confirmer-role labels match the backend, no broad roles", () => {
  for (const loc of LOCALES) {
    it(`${loc}: journal.entry.confirmerRole keys === supported set`, () => {
      const entry = (loadJson(`messages/${loc}/journal.json`).entry ?? {}) as {
        confirmerRole?: Record<string, string>;
      };
      const keys = Object.keys(entry.confirmerRole ?? {}).sort();
      expect(keys).toEqual([...SUPPORTED_CONFIRMERS].sort());
    });
  }

  it("the journal decision timeline filters confirmer roles to the supported set", () => {
    // The per-entry confirmer-role allow-list moved from the journal page into
    // the Evidence Decision Timeline component (slice
    // evidence-decision-timeline-v1) when the latest-wins origin line became a
    // full decision history. The honesty pin follows it.
    const timeline = read("components/app/evidence-decision-timeline.tsx");
    expect(timeline).toMatch(/\["manager",\s*"owner",\s*"external_manager"\]/);
  });
});

// ── 3. Confirmation copy is honest (no broad claim, no auto-confirm) ───────

// The user-facing strings that talk about WHO confirms / confirmation state.
function confirmationStrings(loc: "lt" | "en"): { key: string; value: string }[] {
  const root = loadJson(`messages/${loc}.json`);
  const journal = loadJson(`messages/${loc}/journal.json`);
  const we = (root.workerEvidence ?? {}) as Record<string, string>;
  const j = journal as Record<string, string>;
  const inbox = (journal.inbox ?? {}) as Record<string, string>;
  return [
    ["workerEvidence.confirmed", we.confirmed],
    ["workerEvidence.footnote", we.footnote],
    ["workerEvidence.awaitingNote", we.awaitingNote],
    // "Who can confirm this today" clarity lines (profile + journal). They name
    // the confirmer roles explicitly, so they are the most likely place for a
    // broad-confirmer claim to creep in — scan them too.
    ["workerEvidence.whoCanConfirm", we.whoCanConfirm],
    ["journal.reviewMetaNote", j.reviewMetaNote],
    ["journal.savedConfirmNote", j.savedConfirmNote],
    ["journal.whoCanConfirm", j.whoCanConfirm],
    ["journal.inbox.confirmSkillsHint", inbox.confirmSkillsHint],
  ]
    .filter(([, v]) => typeof v === "string" && v.length > 0)
    .map(([key, value]) => ({ key: key as string, value: value as string }));
}

describe("Guard: confirmation copy never over-claims who can confirm", () => {
  for (const loc of LOCALES) {
    it(`${loc}: no confirmation string names a parent/teacher/family confirmer`, () => {
      for (const { key, value } of confirmationStrings(loc)) {
        expect(
          BROAD_CONFIRMER[loc].test(value),
          `${loc} ${key} over-claims a broad confirmer: "${value}"`,
        ).toBe(false);
      }
    });

    it(`${loc}: the evidence footnote stays honest that nothing auto-confirms`, () => {
      const we = (loadJson(`messages/${loc}.json`).workerEvidence ?? {}) as {
        footnote?: string;
      };
      const honest =
        loc === "lt"
          ? /nieko nepatvirtina automat/i
          : /nothing is confirmed automatically/i;
      expect(honest.test(we.footnote ?? ""), `${loc} footnote: "${we.footnote}"`).toBe(true);
    });
  }
});

// ── 3b. The "who can confirm today" lines are honest AND informative ───────

// Terms that prove the line names the real supported confirmers, and that it
// keeps an unconfirmed entry honestly self-declared.
const WHO_CAN_CONFIRM_TERMS = {
  en: { manager: /\bmanager\b/i, owner: /\bowner\b/i, selfDeclared: /self-declared/i },
  lt: { manager: /vadov/i, owner: /savinink/i, selfDeclared: /nurodyt/i },
} as const;

describe("Guard: the who-can-confirm clarity lines name the supported roles", () => {
  for (const loc of LOCALES) {
    it(`${loc}: profile + journal whoCanConfirm name manager + owner, mark self-declared, no broad role`, () => {
      const we = (loadJson(`messages/${loc}.json`).workerEvidence ?? {}) as {
        whoCanConfirm?: string;
      };
      const j = loadJson(`messages/${loc}/journal.json`) as { whoCanConfirm?: string };
      const terms = WHO_CAN_CONFIRM_TERMS[loc];
      for (const [key, value] of [
        ["workerEvidence.whoCanConfirm", we.whoCanConfirm],
        ["journal.whoCanConfirm", j.whoCanConfirm],
      ] as const) {
        expect(typeof value === "string" && value.length > 0, `${loc} ${key} missing`).toBe(
          true,
        );
        const v = value as string;
        expect(terms.manager.test(v), `${loc} ${key} must name the manager confirmer`).toBe(
          true,
        );
        expect(terms.owner.test(v), `${loc} ${key} must name the owner confirmer`).toBe(true);
        expect(
          terms.selfDeclared.test(v),
          `${loc} ${key} must state the entry stays self-declared until confirmed`,
        ).toBe(true);
        expect(
          BROAD_CONFIRMER[loc].test(v),
          `${loc} ${key} must not name a broad confirmer the backend can't store: "${v}"`,
        ).toBe(false);
      }
    });
  }
});

// ── Negative controls — the detector is real ──────────────────────────────

describe("Guard: the broad-confirmer detector is real", () => {
  it("flags broad confirmers, passes the supported manager/owner copy", () => {
    expect(BROAD_CONFIRMER.en.test("Confirmed by a teacher")).toBe(true);
    expect(BROAD_CONFIRMER.en.test("a parent or guardian can confirm")).toBe(true);
    expect(BROAD_CONFIRMER.lt.test("patvirtino mokytojas")).toBe(true);
    expect(BROAD_CONFIRMER.lt.test("tėvai gali patvirtinti")).toBe(true);
    // honest current copy passes
    expect(BROAD_CONFIRMER.en.test("Confirmed by manager")).toBe(false);
    expect(BROAD_CONFIRMER.en.test("until a manager or client confirms it")).toBe(false);
    expect(BROAD_CONFIRMER.lt.test("Patvirtinta vadovo")).toBe(false);
  });
});
