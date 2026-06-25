import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Profile avatar upload — real, owner-scoped, compression-reusing, honest.
 *  - the upload UI exists (profile + player-card surfaces);
 *  - PR #484 client compression runs before upload;
 *  - the storage path is owner-scoped (<uid>/...), server-validated;
 *  - an initials-monogram fallback (never a synthesised/placeholder face);
 *  - no fake "verified identity" wording.
 */
const ROOT = join(__dirname, "..", "..");
const read = (rel: string): string => readFileSync(join(ROOT, rel), "utf8");

const ctrl = read("components/app/profile-avatar.tsx");
const disp = read("components/app/avatar-display.tsx");
const upload = read("lib/profile/avatar-upload.ts");
const actions = read("lib/profile/avatar-actions.ts");
const profilePage = read("app/[locale]/dashboard/profile/page.tsx");
// Mano CV surface — the read-only avatar now leads here via the player card.
const manoCvPage = read("app/[locale]/dashboard/journal/page.tsx");

describe("avatar UI exists and is wired into identity surfaces", () => {
  it("the profile (edit identity) page renders the upload control", () => {
    expect(profilePage).toMatch(/<ProfileAvatar\b/);
    expect(profilePage).toMatch(/getOwnAvatar/);
  });
  it("the Mano CV surface renders the avatar (read-only, via the player card)", () => {
    expect(manoCvPage).toMatch(/getOwnAvatar/);
    expect(manoCvPage).toMatch(/avatarUrl=\{manoAvatar\.signedUrl\}/);
  });
  it("the control exposes upload + remove affordances", () => {
    expect(ctrl).toMatch(/data-testid="profile-avatar"/);
    expect(ctrl).toMatch(/data-testid="profile-avatar-input"/);
    expect(ctrl).toMatch(/data-testid="profile-avatar-remove"/);
  });
});

describe("compression is reused before upload", () => {
  it("the control compresses with the PR #484 utility", () => {
    expect(ctrl).toMatch(/compressImageFile/);
    expect(ctrl).toMatch(/from "@\/lib\/browser\/image-compress"/);
  });
});

describe("upload path + write are owner-scoped", () => {
  it("uploads under the caller's own folder to the private bucket", () => {
    expect(upload).toMatch(/\$\{user\.id\}\/avatar-/);
    expect(upload).toMatch(/from\("profile-avatars"\)/);
  });
  it("the server action only writes the caller's own path/row", () => {
    expect(actions).toMatch(/startsWith\(`\$\{user\.id\}\/`\)/);
    expect(actions).toMatch(/\.eq\("id", user\.id\)/);
  });
});

describe("honest fallback + no fake identity claim", () => {
  it("renders an initials monogram when there is no photo", () => {
    expect(disp).toMatch(/avatarMonogram/);
    expect(disp).toMatch(/data-testid="avatar-monogram"/);
  });
  it("no fake verified/identity wording in the avatar UI or copy", () => {
    const code = (ctrl + disp).replace(/\/\*[\s\S]*?\*\//g, " ");
    expect(code).not.toMatch(/verified|patvirtint|подтвержд|guaranteed/i);
    for (const loc of ["lt", "en", "ru"] as const) {
      const pa = JSON.parse(read(`messages/${loc}.json`)).profileAvatar;
      const all = JSON.stringify(pa);
      expect(all).not.toMatch(/verified|patvirtint|подтвержд|guaranteed/i);
    }
  });
});

describe("avatar copy present in active locales (lt/en/ru)", () => {
  for (const loc of ["lt", "en", "ru"] as const) {
    it(`${loc}: profileAvatar has upload/change/remove/preparing/uploaded/hint`, () => {
      const pa = JSON.parse(read(`messages/${loc}.json`)).profileAvatar;
      for (const k of ["upload", "change", "remove", "preparing", "uploading", "uploaded", "uploadFailed", "invalidFile", "notReady", "alt", "hint"]) {
        expect(typeof pa?.[k] === "string" && pa[k].length > 0, `${loc} ${k}`).toBe(true);
      }
    });
  }
});