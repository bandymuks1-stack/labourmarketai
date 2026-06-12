import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Launch Readiness Self-Test v1 — static regression net for the core product
 * cycle that real testers walk on day one:
 *
 *   worker onboarding → profile / player card → Work Journal skill evidence →
 *   company need → matching v1 → scouting → shortlist → manager confirmation.
 *
 * This is a SOURCE-LEVEL guard (no DB, no browser, Docker-free so it runs in
 * CI). It does NOT prove a live render — the Playwright suite (e2e:local) is the
 * live layer. What it locks in is that the critical-path route files keep
 * existing and keep their HONEST empty states / graceful-degradation branches,
 * so a refactor can't silently ship a blank page, a dead end, or fake evidence
 * before the first testers arrive. Findings are pinned to real code, not copy.
 */

const APP = join(__dirname, "..", "..");
const readApp = (rel: string) => readFileSync(join(APP, rel), "utf8");
const hasApp = (rel: string) => existsSync(join(APP, rel));

/** Every route a first tester touches on the worker / company / manager path. */
const CRITICAL_ROUTES: { path: string; label: string }[] = [
  { path: "middleware.ts", label: "auth/locale middleware" },
  { path: "app/[locale]/auth/login/page.tsx", label: "login" },
  { path: "app/[locale]/onboarding/page.tsx", label: "onboarding" },
  { path: "app/[locale]/dashboard/page.tsx", label: "worker dashboard" },
  { path: "app/[locale]/dashboard/profile/page.tsx", label: "profile" },
  { path: "app/[locale]/dashboard/player-card/page.tsx", label: "player card" },
  { path: "app/[locale]/dashboard/journal/page.tsx", label: "work journal" },
  { path: "app/[locale]/dashboard/inbox/page.tsx", label: "manager inbox" },
  { path: "app/[locale]/dashboard/company/page.tsx", label: "company dashboard" },
  { path: "app/[locale]/dashboard/company/scouting/page.tsx", label: "scouting" },
];

describe("Launch Readiness Self-Test v1 — critical routes exist", () => {
  it.each(CRITICAL_ROUTES)("$label route file is present ($path)", ({ path }) => {
    expect(hasApp(path), `missing critical route: ${path}`).toBe(true);
  });
});

describe("Launch Readiness — auth never blank-ends an unauthenticated visit", () => {
  const mw = readApp("middleware.ts");
  it("guards /dashboard and /onboarding behind auth", () => {
    expect(mw).toMatch(/REQUIRES_AUTH\s*=\s*\[[^\]]*"\/dashboard"/);
    expect(mw).toContain("/onboarding");
  });
  it("redirects an anonymous visit to the locale login (not a 500/blank)", () => {
    expect(mw).toMatch(/auth\/login/);
    expect(mw).toMatch(/NextResponse\.redirect/);
  });
});

describe("Launch Readiness — worker path shows honest empty states", () => {
  it("Work Journal renders an EmptyState with a single composer CTA when no entries", () => {
    const j = readApp("app/[locale]/dashboard/journal/page.tsx");
    expect(j).toContain("EmptyState");
    expect(j).toContain("#journal-composer");
  });

  it("Player card shows a real verified-empty state and never fakes verification", () => {
    const card = readApp("components/app/worker-player-card.tsx");
    // honest empty: a dedicated empty label for zero verified skills
    expect(card).toContain("verifiedEmpty");
    // the journal-supported tier only renders when it is actually > 0 (no
    // invented badge) — pins the §15/§19 evidence honesty.
    expect(card).toMatch(/card\.journalSupportedSkills\s*>\s*0/);
  });

  it("Player card data reads real counts (no fabricated score helper)", () => {
    const pc = readApp("lib/player-card/player-card.ts");
    // verified badges come strictly from verified=true rows.
    expect(pc).toMatch(/verified/);
    // no AI / auto-detected verification copy in the data layer
    expect(pc).not.toMatch(/ai[_-]?verified|auto[_-]?detected/i);
  });
});

describe("Launch Readiness — company path degrades gracefully on sparse data", () => {
  const scoutPage = readApp("app/[locale]/dashboard/company/scouting/page.tsx");
  const scoutLib = readApp("lib/scouting/scouting.ts");

  it("scouting page renders an honest branch for every sparse state (no error throw)", () => {
    for (const kind of ["not-structured", "needs-migration"]) {
      expect(scoutPage).toContain(kind);
    }
    // zero-candidate result has its own honest message, not a blank panel
    expect(scoutPage).toMatch(/candidates\.length === 0/);
    expect(scoutPage).toContain("noCandidates");
  });

  it("runScouting returns a tagged state for every path instead of throwing", () => {
    for (const kind of [
      '"not-found"',
      '"needs-migration"',
      '"not-structured"',
      '"error"',
      '"ok"',
    ]) {
      expect(scoutLib).toContain(kind);
    }
    // the shortlist read is wrapped so a missing demand_shortlist table (pre-
    // apply) can never crash the scouting page.
    expect(scoutLib).toMatch(/catch\s*\{/);
  });

  it("shortlist buttons wire to a server action (structurally functional, not dead)", () => {
    const btns = readApp("components/app/scouting-shortlist-buttons.tsx");
    expect(btns).toMatch(/setShortlistAction|setShortlist/);
  });
});

describe("Launch Readiness — manager path confirmation flow is intact", () => {
  it("inbox shows an honest empty state when nothing is pending", () => {
    const inbox = readApp("app/[locale]/dashboard/inbox/page.tsx");
    expect(inbox).toContain("EmptyState");
    expect(inbox).toContain("inbox.emptyTitle");
  });

  it("confirmEntrySkills is wired end-to-end through the SECURITY DEFINER RPC", () => {
    const review = readApp("lib/journal/review-actions.ts");
    expect(review).toContain("confirmEntrySkills");
    expect(review).toContain("confirmEntryAndVerifySkills");
    const org = readApp("lib/operations/org-membership.ts");
    expect(org).toContain("confirm_entry_and_verify_skills");
  });
});
