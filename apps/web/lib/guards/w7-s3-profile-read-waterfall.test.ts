import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * W7-S3 — the `/dashboard/profile` read waterfall stays flat.
 *
 * Measured on `origin/main` 07dbd458: 43 serial await stages for one render —
 * 24 of them `getTranslations` over an already-loaded bundle, one awaited
 * inside the JSX, and thirteen worker reads spread across eight stages although
 * every one of them is keyed by `workerId` / `user.id` alone. The waterfall was
 * accidental, not structural.
 *
 * This guard pins the SHAPE, not a timing number: dev-server timing on this
 * repo varies more than any change it could detect (W7-S1 measured 3129→7171 ms
 * for identical code), so a stage count is the only honest ratchet.
 *
 * It is a RATCHET: the stage ceilings may go DOWN, never up.
 */

const WEB = join(__dirname, "..", "..");
const read = (rel: string) => readFileSync(join(WEB, rel), "utf8");

const PAGE_REL = "app/[locale]/dashboard/profile/page.tsx";
const HUB_REL = "components/app/profile-hub-overview.tsx";

/** Comments and literals stripped, so prose can never satisfy or break a count. */
function code(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/\/\/[^\n]*/g, " ")
    .replace(/`(?:\\.|[^`\\])*`/g, "``")
    .replace(/"(?:\\.|[^"\\])*"/g, '""')
    .replace(/'(?:\\.|[^'\\])*'/g, "''");
}

const PAGE = code(read(PAGE_REL));
const HUB = code(read(HUB_REL));

/** One `await` == one serial stage. `await Promise.all([…])` is ONE await no
 *  matter how many reads it batches — which is exactly the point. */
const stages = (src: string) => (src.match(/\bawait\b/g) ?? []).length;

describe("W7-S3 — serial stages stay at or below the measured floor", () => {
  it(`the profile page renders in at most 7 serial stages (was 34)`, () => {
    expect(stages(PAGE)).toBeLessThanOrEqual(7);
  });

  it(`the profile hub renders in at most 2 serial stages (was 9)`, () => {
    expect(stages(HUB)).toBeLessThanOrEqual(2);
  });

  it("the whole render path is at most 9 serial stages (was 43)", () => {
    expect(stages(PAGE) + stages(HUB)).toBeLessThanOrEqual(9);
  });
});

describe("W7-S3 — translations never re-serialise", () => {
  it("no namespace is awaited on its own line", () => {
    // `const x = await getTranslations(…)` is the shape that produced 24 stages.
    for (const [label, src] of [
      ["page", PAGE],
      ["hub", HUB],
    ] as const) {
      expect(
        src,
        `${label}: getTranslations must be resolved inside a Promise.all`,
      ).not.toMatch(/=\s*await\s+getTranslations\(/);
    }
    expect(HUB).not.toMatch(/=\s*await\s+getLocale\(/);
  });

  it("the page resolves every namespace in ONE batch", () => {
    expect(PAGE).toMatch(/await Promise\.all\(\[[\s\S]{0,1600}?getTranslations\(/);
  });
});

describe("W7-S3 — nothing is awaited inside the returned JSX", () => {
  it("no await survives after the render begins", () => {
    // An await inside JSX suspends the tree after it has started rendering and
    // can overlap with nothing at all. Both instances (`featureNotes`,
    // `getOwnTrustSignals`) were hoisted into their stages.
    const jsxStart = PAGE.indexOf("return (");
    expect(jsxStart).toBeGreaterThan(0);
    expect(PAGE.slice(jsxStart)).not.toMatch(/\bawait\b/);
  });
});

describe("W7-S3 — the authorization gate stays ordered", () => {
  it("createClient → auth.getUser → redirect happens before any read", () => {
    const iClient = PAGE.indexOf("await createClient()");
    const iUser = PAGE.indexOf("await supabase.auth.getUser()");
    const iRedirect = PAGE.indexOf("redirect(");
    const iFirstRead = PAGE.indexOf("await Promise.all", iUser);
    expect(iClient).toBeGreaterThan(0);
    expect(iUser).toBeGreaterThan(iClient);
    expect(iRedirect).toBeGreaterThan(iUser);
    expect(iFirstRead).toBeGreaterThan(iRedirect);
  });

  it("the fail-closed check is a redirect, not a soft fallback", () => {
    expect(PAGE).toMatch(/if\s*\(!user\)\s*redirect\(/);
  });
});

describe("W7-S3 — no read runs twice", () => {
  const both = PAGE + "\n" + HUB;

  it("every canonical reader is called exactly once in the render path", () => {
    for (const reader of [
      "getOwnAvatar",
      "getOwnedOrganizations",
      "getEmployerOwnerProfileId",
      "getOwnTrustSignals",
      "getOwnAvailabilityPrefs",
      "getOwnWorkerLanguages",
      "getOwnExternalProfiles",
      "getOwnWorkerEducation",
      "getOwnWorkerAchievements",
      "getWorkerPlayerCard",
      "getProfileOpportunitySignal",
      "countTodayJournalEntries",
    ]) {
      const calls = (both.match(new RegExp(`\\b${reader}\\(`, "g")) ?? []).length;
      expect(calls, `${reader} is called ${calls}× — expected exactly 1`).toBe(1);
    }
  });

  it("no table is queried twice for the same purpose", () => {
    const raw = read(PAGE_REL) + "\n" + read(HUB_REL);
    const counts: Record<string, number> = {};
    for (const m of raw.matchAll(/\.from\(\s*["'`]([a-z_]+)["'`]\s*\)/g)) {
      counts[m[1]] = (counts[m[1]] ?? 0) + 1;
    }
    // `profession_skills` is read twice ON PURPOSE and they are different
    // questions: is_core for the CURRENT profession, and the allowed-skill
    // catalogue across ALL of the worker's professions. Everything else must
    // appear at most once.
    for (const [table, n] of Object.entries(counts)) {
      const allowed = table === "profession_skills" ? 2 : 1;
      expect(n, `${table} queried ${n}× in the render path`).toBeLessThanOrEqual(
        allowed,
      );
    }
  });
});

describe("W7-S3 — no profile data was pushed to the client to fake a win", () => {
  it("the page and the hub stay server components", () => {
    expect(PAGE).not.toMatch(/["']use client["']/);
    expect(HUB).not.toMatch(/["']use client["']/);
  });

  it("the visible surface is not hidden behind a late Suspense boundary (#1011)", () => {
    // The lesson from #1011: late streaming must not make the worker's visible
    // surface depend on a frame that may never paint. This slice introduces no
    // Suspense at all — it only removes serialisation.
    expect(PAGE).not.toMatch(/<Suspense/);
    expect(HUB).not.toMatch(/<Suspense/);
  });
});
