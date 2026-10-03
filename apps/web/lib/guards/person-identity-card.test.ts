import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { PLAYER_IDENTITY_VARIANTS } from "@/lib/identity/player-identity";

/**
 * ONE reusable professional-identity layer (owner order 2026-10-01).
 *
 * The employer reading an application (scouting candidate) and the company
 * team list render the SAME PersonIdentityCard, at different depth. This pins:
 * the two surfaces adopt it (no parallel card), the card shows no score /
 * percentage / stars, the disclosure is a native closed <details> (reduced
 * motion by construction), and the scouting card no longer prints a percent.
 */
const APP = join(__dirname, "..", "..");
const read = (rel: string) => readFileSync(join(APP, rel), "utf8");

const CARD = read("components/app/identity/person-identity-card.tsx");
const SCOUT = read("app/[locale]/dashboard/company/scouting/page.tsx");
const TEAM = read("components/app/company-workers-section.tsx");

describe("PersonIdentityCard — one identity, different depth", () => {
  it("is declared as two canonical variants", () => {
    expect(PLAYER_IDENTITY_VARIANTS).toContain("candidate-review");
    expect(PLAYER_IDENTITY_VARIANTS).toContain("team-member");
  });

  it("the application/candidate read and the team list both use it", () => {
    expect(SCOUT).toContain('variant="candidate-review"');
    expect(TEAM).toContain('variant="team-member"');
    expect(SCOUT).toContain("PersonIdentityCard");
    expect(TEAM).toContain("PersonIdentityCard");
  });

  it("reuses the shared identity vocabulary, not a bespoke look", () => {
    // The card renders the ONE shared portrait (identity/person-portrait.tsx),
    // which owns the canonical fallback surface + border — so the person has the
    // same 4:5 shape and monogram on every surface.
    const PORTRAIT = read("components/app/identity/person-portrait.tsx");
    expect(CARD).toContain("<PersonPortrait");
    expect(PORTRAIT).toContain("PLAYER_IDENTITY_FALLBACK_SURFACE");
    expect(PORTRAIT).toContain("PLAYER_IDENTITY_AVATAR_BORDER");
  });

  it("carries no score, percentage, stars or game vocabulary", () => {
    const code = CARD.replace(/\/\*[\s\S]*?\*\//g, "");
    expect(code).not.toMatch(/%|stars?\b|rating|score|trust|league|player card/i);
  });

  it("depth is a native <details>, closed unless the caller opens it", () => {
    expect(CARD).toContain("<details");
    expect(CARD).toContain("defaultOpen = false");
    expect(CARD).toContain("motion-reduce:transition-none");
  });

  it("the scouting card prints no match percentage", () => {
    expect(SCOUT).not.toMatch(/pct:\s*fit\.pct/);
    for (const loc of ["lt", "en", "ru", "nl", "de", "pl"]) {
      const m = JSON.parse(read(`messages/${loc}.json`)) as {
        scouting: { skillFit: string; identity: Record<string, string> };
      };
      expect(m.scouting.skillFit).not.toContain("{pct}");
      for (const k of ["why", "skills", "readiness", "openTo", "skillCount", "nameHidden"]) {
        expect(m.scouting.identity[k], `${loc}.scouting.identity.${k}`).toBeTruthy();
      }
    }
  });

  it("the candidate stays anonymized: no name or photo is read for it", () => {
    expect(SCOUT).not.toMatch(/avatarUrl=|displayName|getAvatarForVisibleWorker/);
  });
});
