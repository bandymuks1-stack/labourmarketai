import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { deriveReviewTimeline } from "@/lib/journal/review-status";

/**
 * Evidence Decision Timeline honesty guard (slice
 * evidence-decision-timeline-v1).
 *
 * The timeline shows what really happened to a journal entry, from append-only
 * data the app already stores. It must stay honest:
 *   1. it never yields a "Confirmed" step without a real approved/confirm row;
 *   2. it never invents a reason — note is null unless one was actually given;
 *   3. its copy never claims AI/automatic verification, and the "waiting" step
 *      is explicitly a HUMAN confirmation;
 *   4. its copy never names a broad confirmer the backend cannot store;
 *   5. the component maps each step's label from the real decision, gates the
 *      "waiting" step on an empty history, and renders a reason only when one
 *      exists; the page feeds it real data (created_at + derived timeline).
 *
 * Mix of pure-logic + source + i18n assertions; runs in CI via `pnpm -F web test`.
 */

const APP = join(__dirname, "..", "..");
function read(rel: string): string {
  return readFileSync(join(APP, rel), "utf8");
}
function loadJson(rel: string): Record<string, unknown> {
  return JSON.parse(read(rel)) as Record<string, unknown>;
}

const LOCALES = ["lt", "en"] as const;
const TL_KEYS = [
  "title",
  "created",
  "waiting",
  "approved",
  "changes_requested",
  "rejected",
  "reasonLabel",
] as const;

const BROAD_CONFIRMER = {
  en: /\b(parent|guardian|teacher|mentor|classmate)\b|\bfamily member\b/i,
  lt: /tėv|globėj|mokytoj|mentori|klasės draug|šeimos nar/i,
} as const;
// LT uses `\S*` because JS `\w`/`\b` are ASCII-only and break on š/ž/….
const FAKE_AUTO_CONFIRM = {
  en: /\bauto(?:matic|matically)?[- ]?(confirm|verif)|(confirm|verif)\w*\s+automatic/i,
  lt: /automat\S*\s+(patvirtin|patikrin)|(patvirtin|patikrin)\S*\s+automat/i,
} as const;
const FAKE_AI_CONFIRM = {
  en: /\bai[- ]?(confirm|verif)|(confirm|verif)\w*\s+by\s+ai\b/i,
  lt: /dirbtin\S*\s+intelekt\S*\s+(patvirtin|patikrin)/i,
} as const;

function timelineCopy(loc: "lt" | "en"): Record<string, string> {
  const entry = (loadJson(`messages/${loc}/journal.json`).entry ?? {}) as {
    timeline?: Record<string, string>;
  };
  return entry.timeline ?? {};
}

// ── 1. Pure logic — the timeline only reflects real rows ───────────────────

describe("deriveReviewTimeline reflects only real append-only decisions", () => {
  it("returns [] while still submitted (no evidence)", () => {
    expect(deriveReviewTimeline([])).toEqual([]);
    expect(deriveReviewTimeline(null)).toEqual([]);
    expect(deriveReviewTimeline(undefined)).toEqual([]);
  });

  it("never yields a confirmed step without a real approved/confirm row", () => {
    const tl = deriveReviewTimeline([
      { confirmation_scope: { decision: "changes_requested" }, created_at: "2026-05-01T00:00:00Z", confirmer_role: "manager" },
      { confirmation_scope: { decision: "rejected" }, created_at: "2026-05-02T00:00:00Z", confirmer_role: "owner" },
    ]);
    expect(tl.some((e) => e.result === "approved")).toBe(false);
  });

  it("orders oldest→newest and carries the real approved row", () => {
    const tl = deriveReviewTimeline([
      { confirmation_scope: { decision: "approved" }, created_at: "2026-05-10T00:00:00Z", confirmer_role: "owner" },
      { confirmation_scope: { decision: "changes_requested" }, created_at: "2026-05-01T00:00:00Z", confirmer_role: "manager" },
    ]);
    expect(tl.map((e) => e.result)).toEqual(["changes_requested", "approved"]);
    expect(tl[1]).toMatchObject({ result: "approved", role: "owner", at: "2026-05-10T00:00:00Z" });
  });

  it("never invents a reason — note is null unless one was actually given", () => {
    const tl = deriveReviewTimeline([
      { confirmation_scope: { decision: "rejected", note: "   " }, created_at: "2026-05-01T00:00:00Z", confirmer_role: "manager" },
      { confirmation_scope: { decision: "changes_requested", note: "add the hours" }, created_at: "2026-05-02T00:00:00Z", confirmer_role: "manager" },
      { confirmation_scope: { decision: "approved" }, created_at: "2026-05-03T00:00:00Z", confirmer_role: "owner" },
    ]);
    expect(tl[0].note).toBeNull(); // whitespace-only → null
    expect(tl[1].note).toBe("add the hours"); // real reason preserved
    expect(tl[2].note).toBeNull(); // missing → null
  });

  it("ignores rows with an unrecognised decision scope", () => {
    const tl = deriveReviewTimeline([
      { confirmation_scope: { foo: "bar" }, created_at: "2026-05-01T00:00:00Z", confirmer_role: "manager" },
    ]);
    expect(tl).toEqual([]);
  });
});

// ── 2. Copy is complete + honest ───────────────────────────────────────────

describe("Guard: timeline copy is complete and honest", () => {
  for (const loc of LOCALES) {
    it(`${loc}: every timeline key present, none over-claims or fakes auto/AI`, () => {
      const tl = timelineCopy(loc);
      for (const k of TL_KEYS) {
        const v = tl[k] ?? "";
        expect(typeof v === "string" && v.length > 0, `${loc} entry.timeline.${k}`).toBe(true);
        expect(BROAD_CONFIRMER[loc].test(v), `${loc} ${k} broad confirmer: "${v}"`).toBe(false);
        expect(FAKE_AUTO_CONFIRM[loc].test(v), `${loc} ${k} auto-confirm: "${v}"`).toBe(false);
        expect(FAKE_AI_CONFIRM[loc].test(v), `${loc} ${k} AI-confirm: "${v}"`).toBe(false);
      }
    });
  }

  it("the reviewed/returned labels read truthfully; waiting is human (silent-trust)", () => {
    // Silent-trust rule: the worker timeline uses neutral review/record wording,
    // never a certification ("confirmed"/"patvirtinta"). The waiting step still
    // makes clear a human (not AI) is involved.
    expect(/reviewed/i.test(timelineCopy("en").approved ?? "")).toBe(true);
    expect(/peržiūrėt/i.test(timelineCopy("lt").approved ?? "")).toBe(true);
    expect(/returned/i.test(timelineCopy("en").rejected ?? "")).toBe(true);
    expect(/grąžint/i.test(timelineCopy("lt").rejected ?? "")).toBe(true);
    expect(/human/i.test(timelineCopy("en").waiting ?? "")).toBe(true);
    expect(/žmogaus/i.test(timelineCopy("lt").waiting ?? "")).toBe(true);
  });
});

// ── 3. The component presents honestly, the page feeds it real data ────────

describe("Guard: the timeline component and page stay honest", () => {
  const cmp = read("components/app/evidence-decision-timeline.tsx");
  const page = read("app/[locale]/dashboard/journal/page.tsx");

  it("the step label is mapped from the real decision (no hardcoded confirmed)", () => {
    expect(cmp).toMatch(/t\(`entry\.timeline\.\$\{ev\.result\}`\)/);
  });

  it("the 'waiting' step is gated on an empty decision history", () => {
    expect(cmp).toMatch(/events\.length === 0/);
  });

  it("a reason is rendered only when a real note exists", () => {
    expect(cmp).toMatch(/ev\.note \?/);
  });

  it("the page feeds the timeline real created_at + derived events", () => {
    expect(page).toMatch(/createdAt=\{e\.created_at\}/);
    expect(page).toMatch(/events=\{timeline\}/);
    // Whitespace/newline-tolerant: the call must pass the real append-only
    // confirmations, but prettier may wrap the argument across lines.
    expect(page).toMatch(
      /deriveReviewTimeline\(\s*e\.journal_entry_confirmations\s*,?\s*\)/,
    );
  });
});

// ── Negative controls — the detectors are real ─────────────────────────────

describe("Guard: the timeline detectors are real", () => {
  it("flags broad/auto/AI claims; passes the honest timeline copy", () => {
    expect(BROAD_CONFIRMER.en.test("confirmed by a teacher")).toBe(true);
    expect(FAKE_AUTO_CONFIRM.en.test("confirmed automatically")).toBe(true);
    expect(FAKE_AUTO_CONFIRM.lt.test("automatiškai patvirtinta")).toBe(true);
    expect(FAKE_AI_CONFIRM.en.test("verified by AI")).toBe(true);
    for (const loc of LOCALES) {
      for (const k of TL_KEYS) {
        const v = timelineCopy(loc)[k] ?? "";
        expect(BROAD_CONFIRMER[loc].test(v)).toBe(false);
        expect(FAKE_AUTO_CONFIRM[loc].test(v)).toBe(false);
        expect(FAKE_AI_CONFIRM[loc].test(v)).toBe(false);
      }
    }
  });
});
