import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * A DELETED OR SUPERSEDED ENTRY EVIDENCES NO SKILL.
 *
 * `journal_entry_skills` rows stay when their entry is deleted or corrected
 * (production 2026-10-20: 19 of 243 links point at one). The player card's
 * evidence counts and the market map's "evidenced by journal work" read the
 * links raw, so a removed entry kept strengthening a skill. Both now join the
 * entry and keep live ones only — the same rule the CV and profile apply.
 */
const WEB = join(__dirname, "..", "..");
const READS = ["lib/player-card/player-card.ts", "lib/market-map/owner-readiness.ts"];

describe("skill evidence counts live entries only", () => {
  it.each(READS)("%s joins the entry and filters deleted + superseded", (file) => {
    const src = readFileSync(join(WEB, file), "utf8");
    const at = src.indexOf('.from("journal_entry_skills")');
    expect(at).toBeGreaterThan(-1);
    const chain = src.slice(at, at + 600);
    expect(chain).toMatch(/journal_entries!inner\(deleted_at, superseded_by\)/);
    expect(chain).toMatch(/\.is\("journal_entries\.deleted_at", null\)/);
    expect(chain).toMatch(/\.is\("journal_entries\.superseded_by", null\)/);
  });
});
