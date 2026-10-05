import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { initialsOf } from "@/components/app/identity/identity-family";
import { playerInitials } from "@/lib/identity/player-identity";
import { personMonogram } from "@/lib/visual/avatar-monogram";

/**
 * ONE PERSON IDENTITY, not two systems (owner direction 2026-10-05).
 *
 * `PersonPortrait` (the 4:5 persistent portrait pinned by
 * person-identity-card / player-identity-stage / project-staffing-model) and
 * `PersonAvatar` (the frozen identity family's squircle) are two SILHOUETTES
 * of the same person. They must never be two RULES: one initials source, one
 * canonical fallback surface, one anonymity treatment that carries no photo.
 *
 * What stays pinned elsewhere and is deliberately NOT changed here: the
 * portrait's markup, test ids and `avatarUrl ?` ternary (real behaviour: a
 * consented photo or the shared monogram, never a synthesised face).
 *
 * OPEN DESIGN CONFLICT (named, not silently resolved — decision 0016): the
 * frozen family draws a person WITHOUT a photo as a tonal plate with an
 * engraved figure (fixed dark palette), while the persistent-portrait
 * contract pins the theme-swappable canonical surface. `surface="canonical"`
 * lets a real route choose the pinned surface explicitly; which one the
 * product standardises on is an owner decision.
 */
const WEB = join(__dirname, "..", "..");
const read = (rel: string) => readFileSync(join(WEB, rel), "utf8").replace(/\r\n/g, "\n");

describe("one person identity", () => {
  it("every person surface takes its initials from the single monogram source", () => {
    expect(initialsOf).toBe(personMonogram);
    expect(playerInitials).toBe(personMonogram);
    expect(initialsOf("Jonas Petraitis")).toBe("JP");
    expect(initialsOf("")).toBe("•");
  });

  it("the family has no second initials rule", () => {
    const family = read("components/app/identity/identity-family.tsx");
    expect(family).toMatch(/export const initialsOf = personMonogram;/);
    expect(family).not.toMatch(/\.split\(\/\\s\+\/\)\s*\.filter\(Boolean\)/);
  });

  it("the family's canonical fallback uses the SAME tokens as the persistent portrait", () => {
    const family = read("components/app/identity/identity-family.tsx");
    const portrait = read("components/app/identity/person-portrait.tsx");
    for (const token of ["PLAYER_IDENTITY_FALLBACK_SURFACE", "PLAYER_IDENTITY_AVATAR_BORDER"]) {
      expect(family, token).toContain(token);
      expect(portrait, token).toContain(token);
    }
    expect(family).toMatch(/data-surface="canonical"/);
  });

  it("an anonymous person is drawn with NO photo, whatever the caller passes", () => {
    const family = read("components/app/identity/identity-family.tsx");
    // The photo branch is guarded by `!person.anonymous`; the anonymous
    // branch comes before the fallback and never reads `person.photo`.
    expect(family).toMatch(/if \(person\.photo && !person\.anonymous\) \{/);
    const anonymous = family.slice(family.indexOf("if (person.anonymous) {"), family.indexOf('if (surface === "canonical")'));
    expect(anonymous).not.toMatch(/person\.photo/);
    expect(anonymous).toMatch(/aria-label=\{anonymousLabel\}/);
  });

  it("the persistent portrait is still a real photo or the shared monogram (pinned markup untouched)", () => {
    const portrait = read("components/app/identity/person-portrait.tsx");
    expect(portrait).toMatch(/avatarUrl \?/);
    expect(portrait).toContain('data-testid="person-portrait"');
    expect(portrait).not.toMatch(/placeholder|unsplash|pravatar|randomuser/i);
  });
});
