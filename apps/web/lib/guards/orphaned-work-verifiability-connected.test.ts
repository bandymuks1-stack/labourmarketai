import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  WORK_VERIFICATION_STATES,
  deriveWorkVerificationState,
} from "@/lib/journal/work-verification-state";

/**
 * "KAM PATEIKTI ATLIKTĄ DARBĄ?" — the model is CONNECTED, not merely built.
 *
 * ── THE GAP THIS GUARD EXISTS FOR ──────────────────────────────────────────
 * `work-verification-state.ts` shipped on 2026-09-06 carrying the whole
 * semantic model — nine states, a first-class "nobody" verifier, one honest
 * next action each — and **not one consumer**. Every test passed. The model
 * was correct and the worker was still shown a blank.
 *
 * That is the failure mode this repository keeps hitting: a capability that is
 * built, tested, green, and wired to nothing. A unit test of the derivation
 * cannot see it, because the derivation was never wrong. So this guard asserts
 * the WIRING, on the source of the surface itself.
 *
 * ── WHY IT MATTERS, MEASURED ───────────────────────────────────────────────
 * Read from production on 2026-09-07, not inferred: of 34 live journal
 * entries, **17 sit in an active `employee` engagement context with no
 * organization at all**, and every one of them is unconfirmed. 56 such
 * contexts exist. Half of all real work recorded on this platform can reach no
 * verifier — and before this wiring the product said nothing about it.
 */

const WEB = join(__dirname, "..", "..");
const read = (rel: string) => readFileSync(join(WEB, rel), "utf8");

const JOURNAL_PAGE = "app/[locale]/dashboard/journal/page.tsx";
const ACTIVE_LOCALES = ["lt", "en", "ru", "nl", "de"] as const;

describe("the journal surface actually asks the question", () => {
  const page = read(JOURNAL_PAGE);

  it("derives the verification state per entry", () => {
    expect(page).toContain("deriveWorkVerificationState");
    // Fed from the entry's OWN context, not a page-level default.
    expect(page).toContain("contextFacts.get(e.engagement_context_id)");
  });

  it("builds the context facts from real columns, inventing none", () => {
    for (const column of [
      "organization_id",
      "journal_review_enabled",
      "relationship_slug",
      "status",
    ]) {
      expect(page, `${column} must come from the context row`).toContain(column);
    }
  });

  it("renders the state AND the next action, with the state machine-readable", () => {
    expect(page).toContain("data-verification-state");
    expect(page).toContain("data-next-action");
    expect(page).toContain("tVerify(`state.${verification.state}`)");
  });

  it("the 'name your employer' action is a real destination, not advice", () => {
    // The orphaned case is the majority case on production. Telling someone to
    // identify a verifier without saying where is the same dead end in words.
    expect(page).toContain("IDENTIFY_VERIFIER_HREF");
    expect(page).toMatch(/IDENTIFY_VERIFIER_HREF = "\/dashboard\/profile#capabilities"/);
    expect(page).toContain("journal-entry-identify-verifier-");
  });

  it("no state is rendered as a blank — every state has a shown key", () => {
    // The derivation returns `nextAction: "none"` for a decided entry, which is
    // the ONE case the row is hidden; every other state must reach the reader.
    expect(page).toContain('verification.nextAction !== "none"');
  });
});

describe("the vocabulary is complete in every active locale", () => {
  // READ THE FILE THE RUNTIME LOADS. `lib/i18n/request.ts` REPLACES the base
  // catalogue's `journal` block with `messages/<locale>/journal.json`, so a
  // `journal.*` key that lives only in `<locale>.json` is unreachable: this
  // block sat there from 2026-09-07 to 2026-09-11 and every entry on
  // production rendered "journal.verification.state.self_reported" as its
  // trust line — while this guard passed, because it read the wrong file.
  // Guard `i18n-namespace-shadow.test.ts` now forbids the shadow itself.
  type Catalog = { verification?: { state?: Record<string, string>; action?: Record<string, string> } };
  const catalogs: Record<string, Catalog> = Object.fromEntries(
    ACTIVE_LOCALES.map((l) => [l, JSON.parse(read(`messages/${l}/journal.json`)) as Catalog]),
  );

  for (const locale of ACTIVE_LOCALES) {
    it(`${locale}: every canonical state has a real string`, () => {
      const states = catalogs[locale].verification?.state ?? {};
      for (const state of WORK_VERIFICATION_STATES) {
        expect((states[state] ?? "").trim(), `${locale} journal.verification.state.${state}`)
          .not.toBe("");
      }
      // No state is left over from a rename — the two lists are the same set.
      expect(Object.keys(states).sort()).toEqual([...WORK_VERIFICATION_STATES].sort());
    });

    it(`${locale}: every next action has a real string`, () => {
      const actions = catalogs[locale].verification?.action ?? {};
      for (const key of [
        "await_verifier",
        "ask_employer_to_enable_confirmation",
        "identify_verifier",
        "respond_to_decision",
        "none",
      ]) {
        expect((actions[key] ?? "").trim(), `${locale} journal.verification.action.${key}`)
          .not.toBe("");
      }
    });
  }
});

describe("the production shape this closes, held as a regression case", () => {
  /** The exact shape of the 56 contexts and 17 entries measured on production:
   *  an ACTIVE `employee` relationship with NO organization behind it. */
  const ORPHANED_CONTEXT = {
    organizationId: null,
    journalReviewEnabled: false,
    relationshipSlug: "employee",
    status: "active",
  } as const;

  it("orphaned work is self_reported with a real next step — never a blank", () => {
    const v = deriveWorkVerificationState({
      reviewResult: "submitted",
      context: ORPHANED_CONTEXT,
    });
    expect(v.state).toBe("self_reported");
    expect(v.verifier).toEqual({ kind: "none" });
    // The whole point: there IS something the person can do.
    expect(v.nextAction).toBe("identify_verifier");
  });

  it("it is never silently upgraded — no context can produce `verified`", () => {
    for (const reviewResult of ["submitted", null] as const) {
      const v = deriveWorkVerificationState({ reviewResult, context: ORPHANED_CONTEXT });
      expect(v.state).not.toBe("verified");
    }
  });

  it("an unreadable confirmation is UNKNOWN, not an absence of confirmation", () => {
    const v = deriveWorkVerificationState({ reviewResult: null, context: ORPHANED_CONTEXT });
    expect(v.evidenceUnavailable).toBe(true);
  });

  it("once an organization exists the answer changes on its own", () => {
    const v = deriveWorkVerificationState({
      reviewResult: "submitted",
      context: { ...ORPHANED_CONTEXT, organizationId: "org-1", journalReviewEnabled: true },
    });
    expect(v.state).toBe("verification_pending");
    expect(v.nextAction).toBe("await_verifier");
  });
});
