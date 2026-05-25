import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Pinning tests for the journal evidence-loop sprint (fix/journal-evidence-loop-extraction-save-v1).
 *
 * These guards encode the supersprint's safety boundaries so a future change
 * cannot silently regress them:
 *
 *   - The save action MUST return a structured `{ok, code, message}` result
 *     so the composer can render a precise reason. Throwing strings reverts
 *     us to the "Nepavyko išsaugoti" black-box that triggered this sprint.
 *   - The parser MUST be deterministic / rule-based — no `fetch`, no AI
 *     model call, no external network from this module.
 *   - No `service_role` or admin-key shortcut in the journal save path.
 *   - The journal review UI MUST not present unconfirmed suggestions as
 *     "Patvirtinta" / "Verified" / "Confirmed" — those are reserved for
 *     externally confirmed entries (manager / client confirmation layer,
 *     still pending in PR #18).
 */

const WEB_ROOT = join(process.cwd());

function read(p: string): string {
  return readFileSync(join(WEB_ROOT, p), "utf-8");
}

describe("journal save action returns structured results", () => {
  const src = read("lib/journal/actions.ts");

  it("exports the CreateJournalEntryResult tagged union", () => {
    expect(src).toMatch(/export type CreateJournalEntryResult\s*=/);
    expect(src).toMatch(/ok:\s*true/);
    expect(src).toMatch(/ok:\s*false/);
  });

  it("never throws a string Error for known failure modes", () => {
    expect(src).not.toMatch(/throw new Error\("Engagement context required"\)/);
    expect(src).not.toMatch(/throw new Error\("No worker profile"\)/);
    expect(src).not.toMatch(/throw new Error\("Not authenticated"\)/);
    expect(src).not.toMatch(/throw new Error\("Please describe what you did"\)/);
  });

  it("does not use a service_role / admin runtime client for journal writes", () => {
    expect(src).not.toMatch(/service[_-]?role/i);
    expect(src).not.toMatch(/SUPABASE_SERVICE_ROLE/);
    expect(src).not.toMatch(/createAdminClient/i);
  });

  it("pre-validates unit_slug against productivity_units before any insert", () => {
    // The save must check the FK BEFORE touching journal_entries — otherwise
    // a stale productivity_units seed produces a half-written entry. The
    // pre-check is what closes the regression that surfaced in v1 prod.
    expect(src).toMatch(/from\("productivity_units"\)/);
    expect(src).toMatch(/unit_slug_unknown/);
  });

  it("calls the atomic create_journal_entry_full RPC as the primary save path", () => {
    // Atomicity is enforced server-side — the RPC inserts the entry + all
    // metric rows in one transaction (see 0016). The legacy two-step fallback
    // is only reached when the RPC is missing on the target DB.
    expect(src).toMatch(/supabase\.rpc\(\s*["']create_journal_entry_full["']/);
  });

  it("compensates with a delete when the legacy two-step save's metrics insert fails", () => {
    // If the RPC isn't applied yet and the metrics insert fails after the
    // entry insert succeeded, the fallback must try to clean up the orphan
    // entry so we don't leak a half-written record.
    expect(src).toMatch(
      /journal_entries["']\s*\)\s*\.delete\(\s*\)\s*\.eq\(["']id["']/,
    );
  });
});

describe("journal parser stays deterministic + rule-based", () => {
  const src = read("lib/structuring/extract-journal-suggestions.ts");

  it("does no network I/O (no fetch / no AI provider call)", () => {
    expect(src).not.toMatch(/\bfetch\(/);
    expect(src).not.toMatch(/openai|anthropic|claude\./i);
    expect(src).not.toMatch(/\bawait\s+\w*api/i);
  });

  it("renders the multi-fragment suggestion shape used by the composer", () => {
    expect(src).toMatch(/fragments:\s*JournalFragmentSuggestion\[\]/);
    expect(src).toMatch(/rawPhrase:/);
    expect(src).toMatch(/activitySlug:/);
    expect(src).toMatch(/activityLabel:/);
  });
});

describe("journal review UI is honest about state", () => {
  const composer = read("components/app/journal-entry-composer.tsx");
  const ltJournal = JSON.parse(read("messages/lt/journal.json"));
  const enJournal = JSON.parse(read("messages/en/journal.json"));

  it("does not call the suggestion-review block 'Patvirtinta' / 'Verified'", () => {
    // We're scanning the composer literals for the hard-banned LT/EN copy on
    // the review framing — `entry.status.confirmed` ("Patvirtinta") is a
    // separate, legitimate use (externally confirmed entries in the list).
    expect(ltJournal.suggestionReviewIntro).not.toMatch(/Patvirtinta/i);
    expect(enJournal.suggestionReviewIntro).not.toMatch(/Verified/i);
    expect(ltJournal.reviewMetaNote).toMatch(/Privatus įrašas/);
    expect(enJournal.reviewMetaNote).toMatch(/Private entry/);
  });

  it("renders precise save errors instead of swallowing them", () => {
    // The composer must surface `result.message` from the action, not
    // the generic translation key.
    expect(composer).toMatch(/setError\(result\.message\)/);
  });

  it("forwards fragments_json to the server only when the worker confirmed them", () => {
    expect(composer).toMatch(/fragments_json/);
    expect(composer).toMatch(/f\.status === "confirmed"/);
  });
});

describe("journal evidence-loop scope discipline", () => {
  const composer = read("components/app/journal-entry-composer.tsx");
  const action = read("lib/journal/actions.ts");
  const parser = read("lib/structuring/extract-journal-suggestions.ts");
  const keywords = read("lib/structuring/keywords.ts");

  const all = [composer, action, parser, keywords].join("\n");

  it("does not touch billing / payments / Stripe / Montonio", () => {
    expect(all).not.toMatch(/stripe|montonio|checkout|subscription|pricing/i);
  });

  it("does not introduce fake AI / fake matching / fake verification claims", () => {
    // Strip whole-line comments before scanning — the source carries explicit
    // "no auto-verified skill" doctrine notes that we want to KEEP. The guard
    // catches positive-claim wording elsewhere (state strings, JSX text).
    const stripped = all
      .split("\n")
      .filter((line) => !/^\s*(\/\/|\*|\/\*)/.test(line))
      .join("\n");
    expect(stripped).not.toMatch(/AI\s+confirmed/i);
    expect(stripped).not.toMatch(/auto[-_ ]?verified/i);
    expect(stripped).not.toMatch(/matched\s+by\s+ai/i);
  });
});
