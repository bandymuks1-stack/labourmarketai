import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { personMonogram } from "@/lib/visual/avatar-monogram";
import { buildPlayerCardMinimum } from "@/lib/identity/player-card-minimum";

/**
 * Guard: one person = one Player Card identity logic (Core Product Sprint Train
 * v2, Wagon 2 — Player Card / CV identity surface).
 *
 * The person-identity initials/avatar fallback must be the SAME across the
 * Player Card header, the map own-marker and the shared avatar component — so
 * the map compact card reads as the same Player Card, not a separate popup.
 * These are deterministic source + behaviour checks (the journal/map pages are
 * auth-gated, so a static source proof is the honest substitute for a screenshot).
 */
const ROOT = join(__dirname, "..", "..");
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8");

const playerCard = read("components/app/worker-player-card.tsx");
const mapLive = read("components/app/market-map/location-map.tsx");
const mapPage = read("app/[locale]/dashboard/market-map/page.tsx");

describe("shared monogram is the single source of person initials", () => {
  it("Player Card sources identity through the minimum contract, no private copy", () => {
    // PR #538: the card now routes its identity tile (avatar/name/initials)
    // through buildPlayerCardMinimum, whose initials are playerInitials ===
    // personMonogram — same monogram, one contract, not a private slice.
    expect(playerCard).toMatch(
      /import \{ buildPlayerCardMinimum \} from "@\/lib\/identity\/player-card-minimum"/,
    );
    expect(playerCard).toMatch(/buildPlayerCardMinimum\(/);
    expect(playerCard).toMatch(/identity\.initials/);
    // The old local initialsOf duplicate AND a direct private monogram call are gone.
    expect(playerCard).not.toMatch(/function initialsOf/);
    expect(playerCard).not.toMatch(/personMonogram\(/);
  });

  it("map own-marker initial uses the SAME monogram (two letters, not one)", () => {
    expect(mapPage).toMatch(/personMonogram\(ownName\)/);
    // No single-letter slice — that produced "J" where the card shows "JP".
    expect(mapPage).not.toMatch(/ownName\.slice\(0, ?1\)/);
  });

  it("identical initials on card and marker for the same name", () => {
    // The marker calls personMonogram directly; the card flows through the
    // minimum contract. Prove BOTH paths yield the same initials for one name.
    expect(personMonogram("Jonas Petraitis")).toBe("JP");
    expect(buildPlayerCardMinimum({ fullName: "Jonas Petraitis" }).initials).toBe(
      personMonogram("Jonas Petraitis"),
    );
  });
});

describe("map marker avatar fallback matches the Player Card tokens", () => {
  it("uses theme CSS variables (not fixed hex), same tokens as the card tile", () => {
    // Player Card monogram tile uses bg-ink-700 + text-text-primary; the marker
    // fallback must reference the SAME tokens so it matches across themes.
    expect(mapLive).toMatch(
      /background:rgb\(var\(--c-ink-700\)\);color:rgb\(var\(--c-text-primary\)\)/,
    );
    expect(playerCard).toMatch(/bg-ink-700/);
    expect(playerCard).toMatch(/text-text-primary/);
    // No hard-coded hex for the fallback avatar fill (old cyan OR the interim
    // dark-hex) — colours come from tokens now.
    expect(mapLive).not.toMatch(/background:#22D3EE;color:#0B1014/);
    expect(mapLive).not.toMatch(/background:#10131F;color:#E8EEF2/);
    // The neutral cyan RING accent is preserved (silent-trust marker style).
    expect(mapLive).toMatch(/const ringColor = "#22D3EE"/);
  });
});
