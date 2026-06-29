import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * PR-D1 guard — the dashboard work card ("Mano darbo kortelė") renders the
 * CANONICAL Player Card identity tile, not a bare text greeting.
 *
 * The dashboard is the first authenticated identity surface; per the design
 * control formula §4 it must read as the SAME Player Card as the profile / CV /
 * map. This pins that the WorkCard adopts the shared `AvatarDisplay` (which
 * itself is wired to the `lib/identity/player-identity.ts` tokens) — so a later
 * refactor can't silently drop the dashboard back to a fragment look.
 *
 * Source-regex guard (whitespace/newline tolerant); runs in CI via `pnpm -F web test`.
 */

const APP = join(__dirname, "..", "..");
const read = (rel: string): string => readFileSync(join(APP, rel), "utf8");

describe("dashboard WorkCard adopts the canonical Player Card identity tile", () => {
  const workCard = read("components/app/work-card.tsx");

  it("imports the shared AvatarDisplay (not a bespoke avatar)", () => {
    expect(workCard).toMatch(
      /import\s*\{\s*AvatarDisplay\s*\}\s*from\s*["']\.\/avatar-display["']/,
    );
  });

  it("renders the identity tile with the worker's real name", () => {
    expect(workCard).toMatch(/<AvatarDisplay\b/);
    expect(workCard).toMatch(/displayName=\{data\.name\}/);
    // Avatar is fed by the existing getOwnAvatar read via the avatarUrl prop.
    expect(workCard).toMatch(/signedUrl=\{avatarUrl\}/);
  });

  it("shows the role/specialization line from existing profession data", () => {
    expect(workCard).toMatch(/data\.professionName/);
    expect(workCard).toMatch(/data-testid="work-card-identity"/);
  });
});

describe("the AvatarDisplay tile stays wired to the player-identity contract", () => {
  const avatar = read("components/app/avatar-display.tsx");

  it("uses the canonical fallback surface + hairline border tokens", () => {
    expect(avatar).toMatch(/PLAYER_IDENTITY_FALLBACK_SURFACE/);
    expect(avatar).toMatch(/PLAYER_IDENTITY_AVATAR_BORDER/);
    expect(avatar).toMatch(
      /from\s*["']@\/lib\/identity\/player-identity["']/,
    );
  });
});
