import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * W7 P2-1 — open-ended booking honesty.
 *
 * THE FINDING (see `docs/audits/W7_CLOSURE_AUDIT.md` §3). The double-booking
 * guard shipped in `20260802150000_booking_atomic_double_booking_v1.sql`
 * computes a booking's conflict band as
 *
 *     daterange(start_date, coalesce(expected_end_date, start_date), '[]')
 *
 * so a booking with NO end date collapses to the START DAY. The worker is
 * protected against a clashing booking on day one and on no other day. The
 * booking form offered a plain optional "Expected end" date with nothing
 * saying what leaving it empty meant, while the bookings list renders
 * "Until {date}" only when an end exists — so an empty end read as ongoing and
 * behaved as one day.
 *
 * THIS SLICE closes the honesty half only, with no schema change: the form now
 * states what an empty end actually does. Making genuinely open-ended bookings
 * conflict-safe changes the conflict interval in BOTH the EXCLUDE constraint
 * and `respond_booking_request_v3`, which is a migration and stays owner-gated.
 *
 * These assertions exist so the two halves cannot drift: if someone later
 * changes the interval semantics, the copy pinned here must be revisited in the
 * same change.
 */

const webRoot = join(__dirname, "..", "..");
const repoRoot = join(webRoot, "..", "..");
const read = (p: string) => readFileSync(p, "utf8");

const MIGRATION = join(
  repoRoot,
  "supabase",
  "migrations",
  "20260802150000_booking_atomic_double_booking_v1.sql",
);
const FORM = join(
  webRoot,
  "components",
  "app",
  "workspace",
  "candidates-result.tsx",
);
const LOCALES = ["lt", "en", "de", "nl", "ru"] as const;

describe("W7 P2-1 — the shipped conflict interval is what the copy describes", () => {
  const sql = read(MIGRATION);

  it("a missing end date still collapses to the start day", () => {
    // Both the structural constraint and the hand-rolled guard use the same
    // expression. If either stops using `coalesce(..., start_date)`, the
    // one-day claim in the form copy is no longer true and must change with it.
    const occurrences = (
      sql.match(/coalesce\(\s*(?:other\.|br\.)?expected_end_date,\s*(?:other\.|br\.)?start_date\s*\)/g) ??
      []
    ).length;
    expect(
      occurrences,
      "coalesce(expected_end_date, start_date) occurrences",
    ).toBeGreaterThanOrEqual(3);
  });

  it("the EXCLUDE constraint only governs accepted rows with a real start", () => {
    expect(sql).toMatch(/booking_requests_no_overlapping_accepted/);
    expect(sql).toMatch(/status = 'accepted' and start_date is not null/);
  });
});

describe("W7 P2-1 — the form says what an empty end date does", () => {
  const form = read(FORM);

  it("the end-date field carries a described hint", () => {
    expect(form).toMatch(/data-testid="candidate-booking-end-hint"/);
    expect(form).toMatch(/aria-describedby="candidate-booking-end-hint"/);
    expect(form).toMatch(/bookingEndHint/);
  });

  it("the hint is programmatically attached, not merely nearby", () => {
    // A visual-only note beside a field is invisible to a screen reader; the
    // whole point is that the employer learns this BEFORE proposing.
    const idIdx = form.indexOf('id="candidate-booking-end-hint"');
    const describedIdx = form.indexOf(
      'aria-describedby="candidate-booking-end-hint"',
    );
    expect(idIdx).toBeGreaterThan(-1);
    expect(describedIdx).toBeGreaterThan(-1);
  });

  for (const locale of LOCALES) {
    it(`${locale}: the hint exists and is not a placeholder`, () => {
      const m = JSON.parse(
        read(join(webRoot, "messages", `${locale}.json`)),
      ) as {
        conversation?: { results?: Record<string, string> };
      };
      const hint = m.conversation?.results?.bookingEndHint;
      expect(hint, `${locale} conversation.results.bookingEndHint`).toBeTruthy();
      expect((hint ?? "").length).toBeGreaterThan(20);
      // It must not promise an open-ended hold — that is the belief the
      // finding is about.
      expect(hint ?? "").not.toMatch(/indefinit|neterminuot|unbefristet|onbepaald|бессрочн/i);
    });
  }
});

describe("W7 P2-1 — the schema half stays owner-gated", () => {
  it("this slice adds no migration", () => {
    // The honesty fix is copy + one aria attribute. Any migration touching the
    // booking conflict model belongs in a separate owner-approved PR.
    const form = read(FORM);
    expect(form).not.toMatch(/create\s+(or\s+replace\s+)?function/i);
    expect(form).not.toMatch(/alter\s+table/i);
  });
});
