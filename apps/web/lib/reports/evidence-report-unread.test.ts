import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { buildEvidenceReport } from "@/lib/reports/evidence-report";
import { buildWorkerEvidenceSummary } from "@/lib/assist/assist-model";

/**
 * "Empty" is a CLAIM. It says: we counted, and there is nothing.
 *
 * `getOwnTrustSignals` learned to return `null` for a count it could not read
 * (#1652), but every consumer of it still minted a `0` — so the evidence
 * report said `state: "empty"`, the reports page printed `0`, and the chat
 * answered "{entries} journal entries" with a number nobody had counted. The
 * honesty stopped at the read layer and the lie resumed one call later.
 *
 * The section state union already carried `not_available` for exactly this.
 * `metrics` stays `Record<string, number>`, and an unknown count is now an
 * ABSENT KEY rather than a zero — which is what stops a downstream `?? 0` from
 * quietly reinventing the claim.
 */

const BASE = {
  tierCounts: {
    self_declared: 1,
    work_supported: 1,
    manager_confirmed: 1,
    verified: 0,
  },
  supportedSkills: ["welding"],
  unsupportedSkills: [],
  awaitingConfirmation: [],
  hasWorkNeedContext: false,
} as const;

const build = (journalEntries: number | null, confirmations: number | null) =>
  buildEvidenceReport({ ...BASE, journalEntries, confirmations });

const section = (r: ReturnType<typeof build>) =>
  r.sections.find((s) => s.key === "workEntrySummary")!;

describe("a counted zero and an unread count are different answers", () => {
  it("counted, and there is nothing → empty, with the zero stated", () => {
    const s = section(build(0, 0));
    expect(s.state).toBe("empty");
    expect(s.metrics.entries).toBe(0);
    expect(s.metrics.confirmations).toBe(0);
  });

  it("counted, and there is something → real", () => {
    const s = section(build(4, 2));
    expect(s.state).toBe("real");
    expect(s.metrics).toEqual({ entries: 4, confirmations: 2 });
  });

  it("not readable → not_available, and the metric is ABSENT rather than 0", () => {
    const s = section(build(null, null));
    expect(s.state).toBe("not_available");
    expect(s.metrics).toEqual({});
    // The absence is the point: a present 0 is what downstream `?? 0` reads.
    expect("entries" in s.metrics).toBe(false);
  });

  it("one readable and one not → only the unread one goes missing", () => {
    const s = section(build(4, null));
    expect(s.metrics.entries).toBe(4);
    expect("confirmations" in s.metrics).toBe(false);
  });
});

describe("the unknown survives every hop instead of becoming a zero", () => {
  it("the assist summary carries null, not 0", () => {
    const summary = buildWorkerEvidenceSummary(build(null, null));
    expect(summary.journalEntries).toBeNull();
    expect(summary.confirmations).toBeNull();
    // Counts that WERE read still arrive as numbers.
    expect(summary.totalSkills).toBe(3);
    expect(summary.workSupported).toBe(1);
  });

  it("a real count still arrives as a number", () => {
    const summary = buildWorkerEvidenceSummary(build(7, 5));
    expect(summary.journalEntries).toBe(7);
    expect(summary.confirmations).toBe(5);
  });
});

describe("no surface states a number nobody counted", () => {
  const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

  it("the reports tile renders an em dash for null", () => {
    const page = read("app/[locale]/dashboard/reports/page.tsx");
    expect(page).toMatch(/value === null \? "—" : value/);
    expect(page).toMatch(/value: number \| null/);
  });

  it("the assist tile renders an em dash for null", () => {
    const page = read("app/[locale]/dashboard/assist/page.tsx");
    expect(page).toMatch(/value === null \? "—" : value/);
  });

  it("the chat answers with a different sentence rather than an interpolated null", () => {
    const wf = read("lib/ai-workspace/workflows.ts");
    expect(wf).toMatch(/const entriesUnread =/);
    expect(wf).toContain('t("figuresWorkerUnread"');
    // The unread sentence must not take the two counts at all.
    const branch = wf.slice(wf.indexOf('t("figuresWorkerUnread"'));
    expect(branch.slice(0, 200)).not.toContain("journalEntries");
  });

  it("every locale carries the unread sentence", () => {
    for (const locale of ["en", "lt", "de", "nl", "ru", "pl", "sv", "da", "et", "lv", "no"]) {
      const messages = JSON.parse(
        read(`messages/${locale}.json`),
      ) as { workspace?: { ai?: Record<string, string> } };
      const text = messages.workspace?.ai?.figuresWorkerUnread;
      expect(typeof text, `${locale}: figuresWorkerUnread`).toBe("string");
      // It may still state the skills figures — those are always counted.
      expect(text, `${locale}`).toContain("{skills}");
      // It must NOT promise the two it could not read.
      expect(text, `${locale}`).not.toContain("{entries}");
      expect(text, `${locale}`).not.toContain("{confirmations}");
    }
  });
});
