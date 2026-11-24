import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Room-based account spaces IA guard (v1).
 *
 * One account, several clearly separated spaces, one current space at a time.
 * The current space must be named and focused; a buyer never buys workers;
 * agency ≠ buyer; company hiring ≠ buyer; no abstract identity framing; no
 * internal DB/RPC/schema text in space copy.
 */

const root = join(__dirname, "..", "..");
const read = (rel: string) => readFileSync(join(root, rel), "utf8");
const lt = JSON.parse(read("messages/lt.json"));
const en = JSON.parse(read("messages/en.json"));

// The CurrentSpaceHeader pins left with the header and the page that
// mounted it — W3 Package 4 deleted the /dashboard/advanced second
// dashboard. The spaces copy the rooms still use stays pinned below.

describe("spaces namespace exists in LT + EN with switcher labels", () => {
  for (const [name, json] of [["lt", lt], ["en", en]] as const) {
    const s = json.spaces;
    it(`${name} has switcher + 4 space blocks`, () => {
      for (const k of ["current", "mySpaces", "openSpace", "switchSpace", "addSpace"]) {
        expect(s?.[k], `${name} spaces.${k}`).toBeTruthy();
      }
      for (const sp of ["profile", "company", "agency", "buyer"]) {
        expect(s?.[sp]?.name, `${name} spaces.${sp}.name`).toBeTruthy();
        expect(s?.[sp]?.purpose, `${name} spaces.${sp}.purpose`).toBeTruthy();
      }
    });
  }
  it("LT/EN switcher labels match the spec", () => {
    expect(lt.spaces.mySpaces).toBe("Mano erdvės");
    expect(lt.spaces.switchSpace).toBe("Keisti erdvę");
    expect(lt.spaces.openSpace).toBe("Atidaryti erdvę");
    expect(en.spaces.mySpaces).toBe("My spaces");
    expect(en.spaces.switchSpace).toBe("Switch space");
    expect(en.spaces.openSpace).toBe("Open space");
  });
});

describe("a buyer never buys workers", () => {
  // Buyer-context copy: the spaces.buyer block + the buyer role dashboard.
  // (The chain-action subtitle left with the second dashboard's chain
  // actions — W3 Package 4.)
  const buyerBlobs = [
    JSON.stringify(lt.spaces.buyer),
    JSON.stringify(en.spaces.buyer),
    JSON.stringify(lt.roleDashboards.buyer),
    JSON.stringify(en.roleDashboards.buyer),
  ].join(" ");
  it("buyer copy has no 'darbuotoj' (no worker purchase)", () => {
    expect(buyerBlobs).not.toMatch(/darbuotoj/i);
  });
  it("buyer copy has no buy-worker wording", () => {
    expect(buyerBlobs).not.toMatch(/pirkti darbuotoj|darbuotoj\w* pirkim|buy worker|buy employee|worker purchase|employee purchase/i);
  });
  it("buyer space purpose uses specialist/supplier/team language", () => {
    expect(lt.spaces.buyer.purpose).toMatch(/specialist|tiekėj|komand/i);
    expect(en.spaces.buyer.purpose).toMatch(/specialist|supplier|team/i);
  });
});

describe("spaces stay separated", () => {
  it("agency space is not labelled as a buyer", () => {
    expect(lt.spaces.agency.name).not.toMatch(/pirkėj/i);
    expect(en.spaces.agency.name).not.toMatch(/buyer/i);
    // Action/capability framing (no-silo sweep): agency = partner services,
    // not a separate "space". Still clearly distinct from the buyer space.
    expect(lt.spaces.agency.name).toBe("Partnerio paslaugos");
  });
  it("company workspace is hiring, not buyer", () => {
    expect(lt.spaces.company.name).toBe("Įmonės darbo erdvė");
    expect(JSON.stringify(lt.spaces.company)).not.toMatch(/pirkėj/i);
  });
});

describe("account never becomes a second dashboard", () => {
  // The advanced-room and CurrentSpaceHeader pins above/below died with the
  // second dashboard itself — W3 Package 4 deleted /dashboard/advanced.
  const account = read("app/[locale]/dashboard/account/page.tsx");
  it("account is settings only — it does NOT host the cross-space catalogue (superseded PR #204)", () => {
    // Owner override 2026-06-25: account must not be a second dashboard. The
    // catalogue + future-module grid were removed from account; identity
    // switching is the header role switcher.
    expect(account).not.toMatch(/<RoleCatalogueGrid\b/);
    expect(account).not.toMatch(/<FeatureAvailabilityGrid\b/);
    expect(account).not.toMatch(/<IdentityActions\b/);
  });
});

describe("space pages do not render other spaces' blocks by default", () => {
  it("buyer space renders no personal-CV / company / agency space components", () => {
    const buyer = read("app/[locale]/dashboard/buyer/page.tsx");
    expect(buyer).not.toMatch(/ProfileCvClarityCard|RoleCatalogueGrid|CompanyWorkersSection|WorkerEvidenceCard|FeatureAvailabilityGrid/);
  });
});

describe("no abstract identity framing, no internal tech text in space copy", () => {
  for (const [name, json] of [["lt", lt], ["en", en]] as const) {
    it(`${name} has no "kas esu operacijoje" / "operacijos vaidmuo" / "subjekto režimas"`, () => {
      const all = JSON.stringify(json).toLowerCase();
      expect(all).not.toContain("kas esu operacijoje");
      expect(all).not.toContain("operacijos vaidmuo");
      expect(all).not.toContain("subjekto režimas");
    });
    it(`${name} spaces copy exposes no DB/RPC/schema text`, () => {
      const s = JSON.stringify(json.spaces);
      expect(s).not.toMatch(/public\.\w|\bRPC\b|\bRLS\b|save_customer|apply_migration/);
    });
  }
});
