/**
 * GUARD — a manager reviews work entries from the phone through the web
 * inbox's own capabilities (owner order 2026-11-16: one shared client, no
 * parallel backend), with the web's three decisions, confirmed with the same
 * input the prepare step saw, and the web inbox's own words in every locale.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { REVIEW_DECISIONS } from "@/lib/journal/review-status";

const REPO = resolve(__dirname, "../../../..");
const read = (p: string) => readFileSync(resolve(REPO, p), "utf8");
const LOCALES = ["en", "lt", "ru", "nl", "de", "pl", "sv"] as const;

describe("mobile work review", () => {
  const screen = read("apps/mobile/src/screens/journal-review.tsx");

  it("reads and decides through the canonical capabilities only", () => {
    expect(screen).toContain('useCapability<JournalReviewQueueData>("journal.review_queue.get", NO_ARGS)');
    expect(screen).toContain('name: "journal.review_draft"');
    expect(screen).toContain('name: "journal.review_confirm"');
    expect(screen).not.toMatch(/supabase\s*\.\s*from\(/);
  });

  it("confirms with the prepare's own input plus its token", () => {
    expect(screen).toContain("args: args(entry, decision),");
    expect(screen).toContain("args: { ...args(entry, decision), confirmationToken: token },");
  });

  it("offers exactly the web's decisions", () => {
    const shapes = read("apps/mobile/src/capability-shapes.ts");
    const m = shapes.match(/export type JournalReviewDecision = ([^;]+);/);
    const phone = [...(m?.[1] ?? "").matchAll(/"([a-z_]+)"/g)].map((x) => x[1]).sort();
    expect(phone).toEqual([...REVIEW_DECISIONS].sort());
    for (const d of REVIEW_DECISIONS) expect(screen, d).toContain(`  ${d}: "review.`);
  });

  it("is an organization station on Today", () => {
    const today = read("apps/mobile/app/(shell)/today.tsx");
    const start = today.indexOf("{personal ? null : (");
    const gated = today.slice(start, today.indexOf("</>", start));
    expect(gated).toContain('testID="today-open-review"');
  });

  it("uses the web inbox's own words in every locale", () => {
    const messages = read("apps/mobile/src/i18n/messages.ts");
    for (const locale of LOCALES) {
      const j = JSON.parse(read(`apps/web/messages/${locale}/journal.json`));
      const w = (j.journal ?? j).inbox;
      const start = messages.indexOf(locale === "en" ? "const en = {" : `const ${locale}: Catalogue = {`);
      const block = messages.slice(start, messages.indexOf(locale === "en" ? "\n} as const;" : "\n};", start));
      const pairs: [string, string][] = [
        ["review.title", w.title],
        ["review.approve", w.approve],
        ["review.requestChanges", w.requestChanges],
        ["review.reject", w.reject],
        ["review.noteApprove", w.confirmNote],
        ["review.noteChanges", w.changesNote],
        ["review.noteReject", w.rejectReason],
        ["review.empty", w.emptyTitle],
        ["review.confirm", w.confirm],
        ["review.cancel", w.cancel],
      ];
      for (const [k, v] of pairs) expect(block, `${locale} ${k}`).toContain(`"${k}": ${JSON.stringify(v)}`);
    }
  });
});
