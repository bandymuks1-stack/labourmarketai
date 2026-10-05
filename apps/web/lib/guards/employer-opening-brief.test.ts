import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * V8 employer daily loop, GAP 1 — the employer no longer opens to silence.
 *
 * The audit measured the employer's first screen as a greeting plus three
 * hiring chips: the state-aware brief was worker-only by one gate line.
 * These pins keep the fix honest and keep it from quietly regressing to
 * either failure mode — silence (the old gate) or a recruitment-first brief
 * (the doctrine violation: hiring is episodic, the daily loop is the
 * product).
 */

const WEB = join(__dirname, "..", "..");
const read = (...p: string[]) => readFileSync(join(WEB, ...p), "utf8");

describe("the employer opening brief", () => {
  it("exists, and the chat routes each identity to its OWN brief", () => {
    const chat = read("components", "app", "conversation", "chat", "conversation-chat.tsx");
    // Re-anchored 2026-09-23: the worker brief now takes the rungs ŠIANDIEN
    // already states as an `omit` option (owner §20). The routing is the
    // same — each identity to its OWN brief — and the employer call takes
    // no option at all.
    expect(chat).toMatch(
      /identity === "person" \? loadOpeningBriefResult\(briefOptions\) : loadEmployerOpeningBriefResult\(\)/,
    );
    // The old silence gate must not come back.
    const opener = chat.slice(chat.indexOf("openedWithStateRef.current) return"));
    expect(opener.slice(0, 600)).not.toContain('identity !== "person") return');
  });

  it("leads with the daily loop, not recruitment", () => {
    const src = read("lib", "conversation", "opening-brief.ts");
    const fn = src.slice(src.indexOf("export async function loadEmployerOpeningBriefResult()"));
    // The manager's morning ladder, in order: reviews → absence decisions →
    // absent today → unread. Recruitment reads must NOT appear.
    const reviews = fn.indexOf("readQuickReviewQueueResult");
    const absences = fn.indexOf("readManagerPendingAbsences");
    const absentToday = fn.indexOf("absentOn");
    const unread = fn.indexOf("getUnreadConversationIdsForOrganization");
    expect(reviews).toBeGreaterThan(-1);
    expect(absences).toBeGreaterThan(reviews);
    expect(absentToday).toBeGreaterThan(absences);
    expect(unread).toBeGreaterThan(absentToday);
    // Recruitment FUNNEL reads (scouting, demand intake, match counts) must
    // not appear. Re-anchored 2026-09-04 (owner contract section 4D, attention):
    // the ONE candidate mention allowed is people who already raised a hand
    // on the company's own demand and are waiting for an answer — a pending
    // decision on a real person, like an agency's offers awaiting — read
    // through the pending-interest count, never a scouting run.
    expect(fn).not.toMatch(/scouting|create-demand|matches/i);
    expect(fn).not.toMatch(/runScouting|listCompanyDemands/);
    const rungStart = fn.indexOf("readPendingInterestCountsForCompany");
    const rungEnd = fn.indexOf("readQuickReviewQueueResult");
    expect(rungStart).toBeGreaterThan(-1);
    const outsideRung = fn.slice(0, fn.lastIndexOf("// Candidates who raised a hand", rungStart)) + fn.slice(rungEnd);
    expect(outsideRung).not.toMatch(/candidate/i);
  });

  it("keeps the worker brief's honesty contract: caps and silent failure", () => {
    const src = read("lib", "conversation", "opening-brief.ts");
    const fn = src.slice(src.indexOf("export async function loadEmployerOpeningBriefResult()"));
    expect(fn).toContain("MAX_LINES");
    expect(fn).toContain("MAX_CHIPS");
    // `none` is reserved for "every source answered and none had anything";
    // a failed source makes it `unknown` (SEP-7) — both must stay expressible.
    expect(fn).toContain('{ kind: "none" }');
    expect(fn).toContain('kind: "unknown"');
    // Independent try/catch per read — one failed read must not silence the
    // others, must never invent a line, and must NAME itself as unknown.
    const catches = fn.match(/} catch \{/g) ?? [];
    expect(catches.length).toBeGreaterThanOrEqual(4);
    expect((fn.match(/unknown\.add\(/g) ?? []).length).toBeGreaterThanOrEqual(catches.length);
  });

  it("the employer lines exist in every ROUTED locale", () => {
    for (const l of ["en", "lt", "ru", "nl", "de"]) {
      const m = JSON.parse(read("messages", `${l}.json`));
      const chat = m.conversation.chat;
      for (const key of [
        "briefEmployerJournalReviews",
        "briefEmployerPendingAbsences",
        "briefEmployerAbsentToday",
        "chipEmployerInbox",
        "chipEmployerAbsences",
        "briefEmployerBookingResponses",
        "chipEmployerBookings",
      ]) {
        expect(typeof chat[key], `${l}.${key}`).toBe("string");
      }
    }
  });
});
