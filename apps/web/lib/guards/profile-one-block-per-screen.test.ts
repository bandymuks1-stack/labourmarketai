import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { tabForHash } from "@/components/app/hash-tab-redirect";

/**
 * Decision 0034 — the profile is one functional block per screen, each with
 * its own address (`?tab=`): overview, edit, details, background, skills, about. Nothing
 * was removed: every mount still renders on its tab, and every anchor written
 * before the split still reaches its section.
 */
const WEB = join(__dirname, "..", "..");
const PAGE = readFileSync(join(WEB, "app/[locale]/dashboard/profile/page.tsx"), "utf8");

/** The JSX of every `{tab === "<id>" ? (` block (blocks follow each other, so
 *  one runs to the next block's start or the end of the render). */
function blocks(id: string): string {
  const out: string[] = [];
  let from = 0;
  for (;;) {
    const at = PAGE.indexOf(`{tab === "${id}" ? (`, from);
    if (at < 0) break;
    const next = PAGE.indexOf('{tab === "', at + 1);
    const end = next < 0 ? PAGE.length : next;
    out.push(PAGE.slice(at, end));
    from = end;
  }
  expect(out.length, `block ${id} exists`).toBeGreaterThan(0);
  return out.join("\n");
}

describe("profile — one block per screen", () => {
  it("five tabs, each linked by its own address in one tab row", () => {
    expect(PAGE).toContain('const PROFILE_TABS = ["overview", "edit", "details", "background", "skills", "about"] as const;');
    expect(PAGE).toContain('data-testid="profile-tabs"');
    expect(PAGE).toContain("`/dashboard/profile?tab=${id}`");
    expect(PAGE).toContain('aria-current={active ? "page" : undefined}');
  });

  it("an unknown or missing tab falls back to the overview", () => {
    expect(PAGE).toMatch(/: "overview";/);
  });

  const cases: ReadonlyArray<[string, readonly string[]]> = [
    ["overview", ["<RosterLinkOffers", 'id="organization-history"', "<LearningCompassSection", "<LearnerCohortJoinSection", "<ProfileHubOverview", "<OrganizationsLeadership", 'data-testid="profile-role-ledgers"']],
    ["edit", ['id="profile-edit"', "<ProfileTextFirstFlow"]],
    ["details", ['id="cv-details"', "<WorkerPublicSummaryEditor", "<ProfileAvatar", 'id="cv-availability"', "<WorkCardEditor"]],
    ["background", ['id="cv-background"', "<WorkerLanguagesSection", "<WorkerEducationSection", "<WorkerAchievementsSection", "<ExternalProfilesSection"]],
    ["skills", ['id="capabilities"', "<CapabilityProfileSection", "<SkillClarifySection"]],
    ["about", ['id="profile-about"', "<TrustBlock"]],
  ];
  for (const [tab, mounts] of cases) {
    it(`?tab=${tab} holds ${mounts.join(", ")}`, () => {
      const text = blocks(tab);
      for (const m of mounts) expect(text, `${m} on ${tab}`).toContain(m);
    });
  }

  it("a block's own disclosure stands open on its tab", () => {
    for (const id of ["profile-edit", "cv-details", "cv-background", "profile-about"]) {
      expect(PAGE).toContain(`        id="${id}"\n        open\n`);
    }
    expect(PAGE).toContain('<details id="capabilities" open className=');
  });

  it("no page subtitle (decision 0032)", () => {
    expect(PAGE).not.toContain('t("pageSubtitle")');
  });
});

describe("a worker's pre-sign-up intake reaches the composer's block", () => {
  it("the overview hands a waiting intake draft to ?tab=edit, only without own profile text", () => {
    expect(PAGE).toContain('{tab === "overview" && savedProfileText.trim().length === 0 ? (');
    expect(PAGE).toContain("<IntakeDraftOpensEditor viewerEmail={user.email ?? null} />");
    const c = readFileSync(join(WEB, "components/app/intake-draft-opens-editor.tsx"), "utf8");
    expect(c).toContain("if (!readWorkerIntakeDraftFor(viewerEmail)) return;");
    expect(c).toContain("router.replace(`${pathname}?tab=edit#profile-edit`);");
    expect(c).not.toContain("clearWorkerIntakeDraft");
  });
});

describe("anchors written before the split reach their tab", () => {
  const map = { "profile-edit": "edit", "cv-availability": "details", capabilities: "skills" };

  it("the page forwards every section anchor that lives off the overview", () => {
    expect(PAGE).toContain("<HashTabRedirect tabByAnchor={PROFILE_TAB_BY_ANCHOR} current={tab} />");
    for (const [anchor, tab] of [
      ["profile-edit", "edit"],
      ["cv-details", "details"],
      ["profile-identity", "details"],
      ["profile-public-summary", "details"],
      ["cv-availability", "details"],
      ["work-card-editor-section", "details"],
      ["cv-background", "background"],
      ["cv-languages", "background"],
      ["cv-education", "background"],
      ["cv-achievements", "background"],
      ["capabilities", "skills"],
      ["candidate-skills", "skills"],
      ["profile-about", "about"],
    ]) {
      expect(PAGE).toMatch(new RegExp(`"?${anchor}"?: "${tab}",`));
    }
  });

  it("tabForHash moves a known anchor to its tab", () => {
    expect(tabForHash("#cv-availability", map, "overview")).toBe("details");
    expect(tabForHash("#capabilities", map, "edit")).toBe("skills");
  });

  it("negative controls: no hash, an overview anchor, or the current tab stay put", () => {
    expect(tabForHash("", map, "overview")).toBeNull();
    expect(tabForHash("#", map, "overview")).toBeNull();
    expect(tabForHash("#learning-compass", map, "overview")).toBeNull();
    expect(tabForHash("#profile-edit", map, "edit")).toBeNull();
  });
});
