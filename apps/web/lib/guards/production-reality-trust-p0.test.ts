import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Production reality / trust guards (production-reality-trust-p0).
 *
 * Owner mobile review after the action-first IA went live found three
 * trust-breaking states. These guards freeze the honest fixes so they can't
 * silently regress:
 *
 *  - Issue 2: an old journal entry must NOT visibly show skill chips the entry
 *    text no longer supports (a web-design entry showed construction skills).
 *    Stale links stay COLLAPSED behind an honest summary, never rendered as the
 *    entry's skills by default. No DB mutation (links persist until unlinked).
 *  - Issue 3: the manager review card must NOT show approve/reject buttons next
 *    to "Neturite teisės peržiūrėti šio įrašo". A permission denial is terminal:
 *    the action surfaces are hidden, leaving one honest reason. No fake approval.
 */

const ROOT = join(__dirname, "..", "..");
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8");
const LOCALES = ["lt", "en", "ru"] as const;

describe("issue 2 — stale journal skill chips stay collapsed (no unrelated chips shown)", () => {
  const src = read("components/app/journal-entry-skill-links.tsx");

  it("the review bucket defaults to collapsed", () => {
    expect(src).toMatch(/const \[reviewOpen, setReviewOpen\] = useState\(false\)/);
  });

  it("the stale chips render ONLY when the worker expands the bucket", () => {
    // The chip list is gated by reviewOpen — not rendered unconditionally.
    expect(src).toMatch(/reviewOpen &&\s*\(\s*<ul[\s\S]*reviewChips\.map/);
  });

  it("an honest summary line replaces the always-on chip wall", () => {
    expect(src).toMatch(/entry-skill-review-summary-/);
    expect(src).toMatch(/t\("reviewSummary", \{ count: reviewChips\.length \}\)/);
  });

  it("the worker can still unlink the stale links (real clean-up, not just hide)", () => {
    expect(src).toMatch(/entry-skill-unlink-flagged-/);
    expect(src).toMatch(/function unlinkFlagged\(\)/);
  });

  it("all active locales carry the new collapse copy", () => {
    for (const loc of LOCALES) {
      const j = JSON.parse(read(`messages/${loc}.json`));
      const k = j.journalSkillLinks ?? {};
      expect(k.reviewSummary, `${loc}: reviewSummary`).toBeTruthy();
      expect(k.reviewShow, `${loc}: reviewShow`).toBeTruthy();
      expect(k.reviewHide, `${loc}: reviewHide`).toBeTruthy();
    }
  });
});

describe("issue 3 — no approve/reject buttons when the reviewer is not permitted", () => {
  const src = read("components/app/journal-inbox-entry.tsx");

  it("computes a terminal permission-blocked state from the real denial codes", () => {
    expect(src).toMatch(/permissionBlocked/);
    expect(src).toMatch(/not_authorized/);
    expect(src).toMatch(/no_reviewer_engagement/);
    expect(src).toMatch(/review_not_enabled/);
  });

  it("gates every action surface on canAct (= not done AND not blocked)", () => {
    expect(src).toMatch(/const canAct = !done && !permissionBlocked/);
    // No action block keys off the raw `!done &&` guard anymore — they all use
    // canAct so a permission denial hides them.
    expect(src).not.toMatch(/\{!done && mode === "idle"/);
    expect(src).not.toMatch(/\{!done && mode === "confirm"/);
    expect(src).not.toMatch(/\{!done && \(mode === "rejected"/);
    expect(src).toMatch(/\{canAct && mode === "idle"/);
    expect(src).toMatch(/\{canAct && mode === "confirm"/);
    expect(src).toMatch(/\{canAct && \(mode === "rejected"/);
  });

  it("keeps one honest denial reason (notAuthorized copy) present", () => {
    expect(src).toMatch(/t\("inbox\.result\.notAuthorized"\)/);
    for (const loc of LOCALES) {
      const j = JSON.parse(read(`messages/${loc}/journal.json`));
      expect(j.inbox?.result?.notAuthorized, `${loc}: notAuthorized`).toBeTruthy();
    }
  });
});

describe("issue 4 — the map own-marker is a real player card (real data only)", () => {
  const live = read("components/app/market-map-live.tsx");
  const page = read("app/[locale]/dashboard/market-map/page.tsx");

  it("MapIdentity carries the real player-card signals", () => {
    expect(live).toMatch(/professionLabel\?: string \| null/);
    expect(live).toMatch(/availabilityLabel\?: string \| null/);
    expect(live).toMatch(/verifiedSkillsCount\?: number/);
  });

  it("the verified badge shows ONLY for a real confirmed count (never fabricated)", () => {
    expect(live).toMatch(/const verified = identity\.verifiedSkillsCount \?\? 0/);
    expect(live).toMatch(/verified > 0/);
  });

  it("availability + verified count come from real owner-scoped reads", () => {
    // Availability only when really set (not 'unknown'); count straight from
    // the confirmed capability tally (worker_skills.verified).
    expect(page).toMatch(/availability\.state !== "unknown"/);
    expect(page).toMatch(/verifiedSkillsCount = capabilities\.counts\.confirmed/);
  });

  it("the marker / map is enlarged for mobile (player-card scale)", () => {
    // Avatar bumped from 40px → 52px; map taller on mobile.
    expect(live).toMatch(/width:52px;height:52px/);
    expect(live).toMatch(/min-h-\[24rem\]/);
  });

  it("the active locales carry the availability marker labels", () => {
    for (const loc of LOCALES) {
      const j = JSON.parse(read(`messages/${loc}.json`));
      const a = j.marketMap?.markerAvail ?? {};
      expect(a.available, `${loc}: available`).toBeTruthy();
      expect(a.busy, `${loc}: busy`).toBeTruthy();
      expect(a.unavailable, `${loc}: unavailable`).toBeTruthy();
    }
  });
});
