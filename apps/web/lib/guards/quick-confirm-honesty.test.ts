import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Guard: One-Tap Confirm honesty (S3.5).
 *
 *   1. NO new write paths: the quick-confirm actions delegate to the existing
 *      gated chain (`confirmEntryAndVerifySkills` wrapper over the
 *      `confirm_entry_and_verify_skills` RPC + the existing
 *      `reviewJournalEntry` action) and never touch Supabase directly.
 *   2. NO auto-confirm and NO default-checked: the card lists the exact
 *      confirm set explicitly; there are no checkboxes (so nothing can be
 *      pre-checked) and no programmatic form submission.
 *   3. Clarity before speed: the batch flow renders the per-entry summary
 *      list and its lead text before its single confirm button.
 *   4. The reject path (with a required short reason) sits on the card.
 *   5. The inbox.quick copy exists in ALL 10 locales (§2.4).
 */

const APP_ROOT = join(__dirname, "..", "..");
const LOCALES = ["en", "lt", "lv", "et", "nl", "de", "da", "no", "sv", "pl"] as const;

const actions = readFileSync(
  join(APP_ROOT, "lib", "journal", "quick-confirm-actions.ts"),
  "utf8",
);
const queue = readFileSync(
  join(APP_ROOT, "lib", "journal", "review-queue.ts"),
  "utf8",
);
const card = readFileSync(
  join(APP_ROOT, "components", "app", "quick-confirm-card.tsx"),
  "utf8",
);
const batch = readFileSync(
  join(APP_ROOT, "components", "app", "quick-confirm-batch.tsx"),
  "utf8",
);

describe("Guard: quick confirm reuses ONLY the existing write chain", () => {
  it("delegates to the existing wrappers", () => {
    expect(actions).toContain("confirmEntryAndVerifySkills");
    expect(actions).toContain("reviewJournalEntry");
  });

  it("opens no direct database write path of its own", () => {
    expect(actions).not.toContain("createClient");
    expect(actions).not.toMatch(/\.from\(|\.insert\(|\.update\(|\.delete\(|\.rpc\(/);
  });

  it("the read model reuses the gated reviewable RPC and confirms nothing", () => {
    expect(queue).toContain("reviewable_journal_entry_ids");
    expect(queue).not.toMatch(/\.insert\(|\.update\(|\.delete\(/);
  });

  it("batch input is bounded and validated (no unbounded loop)", () => {
    expect(actions).toContain("BATCH_LIMIT");
    expect(actions).toMatch(/invalid_payload/);
  });
});

describe("Guard: no auto-confirm, no default-checked, explicit confirm set", () => {
  for (const [name, src] of [
    ["quick-confirm-card", card],
    ["quick-confirm-batch", batch],
  ] as const) {
    it(`${name}: has no checkboxes and nothing pre-checked`, () => {
      expect(src).not.toContain("defaultChecked");
      expect(src).not.toContain('type="checkbox"');
    });

    it(`${name}: never submits a form programmatically`, () => {
      expect(src).not.toMatch(/requestSubmit|\.submit\(\)/);
    });
  }

  it("the card renders the explicit will-confirm list", () => {
    expect(card).toContain("inbox.quick.willConfirm");
    expect(card).toContain("quick-will-confirm-");
  });

  it("the card keeps the reject path with a required reason", () => {
    expect(card).toContain('decision" value="rejected"');
    expect(card).toMatch(/name="note"[\s\S]{0,200}required/);
  });

  it("the batch dialog shows the summary list + lead before its confirm", () => {
    expect(batch).toContain("inbox.quick.batchSummaryLead");
    expect(batch).toContain("quick-batch-summary");
    const summaryIdx = batch.indexOf("quick-batch-summary");
    const confirmIdx = batch.indexOf("quick-batch-confirm");
    expect(summaryIdx).toBeGreaterThan(-1);
    expect(confirmIdx).toBeGreaterThan(summaryIdx);
  });

  it("batch failures are surfaced, never swallowed", () => {
    expect(batch).toContain("batchFailed");
    expect(actions).toContain("failed.push");
  });
});

describe("Guard: exceptions pyramid (DESIGN_SOUL §3) on the batch flow", () => {
  const batchLib = readFileSync(
    join(APP_ROOT, "lib", "journal", "batch-review.ts"),
    "utf8",
  );

  it("the batch rail is the REAL applied RPC pair (20260611120000)", () => {
    expect(batchLib).toContain("batch_review_exceptions");
    expect(batchLib).toContain("review_journal_entries_batch");
  });

  it("the action re-checks exceptions SERVER-side and refuses unacknowledged", () => {
    expect(actions).toContain("fetchBatchExceptions");
    expect(actions).toContain("exception_not_acknowledged");
    expect(actions).toMatch(/!acknowledged\.has\(i\.entryId\)/);
  });

  it("skills entries keep the only skill-flipping chain (no double-confirm)", () => {
    expect(actions).toMatch(/withSkills[\s\S]*confirmOne/);
    expect(actions).toContain("entryOnly");
  });

  it("exceptions render BEFORE the confirm button; acknowledge is a deliberate tap", () => {
    const excIdx = batch.indexOf("quick-batch-exception");
    const confirmIdx = batch.indexOf("quick-batch-confirm");
    expect(excIdx).toBeGreaterThan(-1);
    expect(confirmIdx).toBeGreaterThan(excIdx);
    expect(batch).toContain("quick-batch-ack");
    expect(batch).toContain("aria-pressed");
    expect(batch).toContain("quick-batch-excluded-note");
  });

  it("per-entry outcomes are reported after the write", () => {
    expect(batch).toContain("quick-batch-outcomes");
    expect(actions).toContain("outcomes: items.map");
  });

  it("exception copy exists in all 10 locales", () => {
    for (const locale of LOCALES) {
      const journal = JSON.parse(
        readFileSync(join(APP_ROOT, "messages", locale, "journal.json"), "utf8"),
      );
      const quick = journal?.inbox?.quick;
      for (const k of [
        "ackButton",
        "ackDone",
        "excludedNote",
        "outcomeNotAcknowledged",
      ]) {
        expect(quick?.[k], `inbox.quick.${k} missing in ${locale}`).toBeTruthy();
      }
      for (const slug of ["worker_first_entries", "unusual_hours", "new_skill"]) {
        expect(
          quick?.exception?.[slug],
          `inbox.quick.exception.${slug} missing in ${locale}`,
        ).toBeTruthy();
      }
    }
  });
});

describe("Guard: inbox.quick copy exists in all 10 locales", () => {
  const KEYS = [
    "openQuick",
    "title",
    "subtitle",
    "detailedReview",
    "willConfirm",
    "entryOnlyNote",
    "confirmTap",
    "confirmTapSkills",
    "confirmedCard",
    "rejectedCard",
    "batchButton",
    "batchSummaryTitle",
    "batchSummaryLead",
    "batchConfirm",
    "batchDone",
    "batchFailed",
  ];

  for (const locale of LOCALES) {
    it(`${locale}: every inbox.quick key exists and is non-empty`, () => {
      const journal = JSON.parse(
        readFileSync(
          join(APP_ROOT, "messages", locale, "journal.json"),
          "utf8",
        ),
      );
      const quick = journal?.inbox?.quick;
      expect(quick, `inbox.quick missing in ${locale}/journal.json`).toBeTruthy();
      for (const key of KEYS) {
        expect(
          typeof quick[key] === "string" && quick[key].trim().length > 0,
          `inbox.quick.${key} missing/empty in ${locale}/journal.json`,
        ).toBe(true);
      }
    });
  }

  it("LT + EN: the copy phrases the manual-decision disclaimer affirmatively", () => {
    for (const locale of ["lt", "en"]) {
      const journal = JSON.parse(
        readFileSync(
          join(APP_ROOT, "messages", locale, "journal.json"),
          "utf8",
        ),
      );
      const sub = journal.inbox.quick.subtitle as string;
      // Repo convention: no "automatiškai patvirtin*" / "automatically
      // confirmed" phrasing, even negated (cta-honesty-clarity precedent).
      expect(sub).not.toMatch(/automatiškai\s+patvirtin/i);
      expect(sub).not.toMatch(/automatic(?:ally)?\s+(confirm|verif)/i);
    }
  });
});
