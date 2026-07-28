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

describe("current-space header makes the active space obvious + focused", () => {
  const comp = read("components/app/current-space-header.tsx");
  const page = read("app/[locale]/dashboard/advanced/page.tsx");
  it("maps every role to exactly one space", () => {
    for (const role of ["worker", "company", "agency", "customer"]) {
      expect(comp).toMatch(new RegExp(`${role}:\\s*"(profile|company|agency|buyer)"`));
    }
  });
  it("renders space name + purpose + a compact open-space link", () => {
    expect(comp).toMatch(/t\(`\$\{key\}\.name`\)/);
    expect(comp).toMatch(/t\(`\$\{key\}\.purpose`\)/);
    expect(comp).toMatch(/t\("openSpace"\)/);
    expect(comp).toMatch(/data-testid="open-space-link"/);
  });
  it("is mounted on the dashboard (current space shown at the top)", () => {
    expect((page.match(/<CurrentSpaceHeader role=\{role\} \/>/g) ?? []).length).toBeGreaterThanOrEqual(2);
  });
});

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
  // Buyer-context copy: the spaces.buyer block + the dashboard buyer chain-action subtitle.
  const buyerBlobs = [
    JSON.stringify(lt.spaces.buyer),
    JSON.stringify(en.spaces.buyer),
    lt.auth.dashboard.chainActions.buyerSubtitle,
    en.auth.dashboard.chainActions.buyerSubtitle,
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

describe("active /dashboard room shows only the current space (no cross-space soup)", () => {
  const dashboard = read("app/[locale]/dashboard/advanced/page.tsx");
  const account = read("app/[locale]/dashboard/account/page.tsx");
  it("the active dashboard room renders NO all-roles catalogue as permanent content", () => {
    expect(dashboard).not.toMatch(/<RoleCatalogueGrid\b/);
    expect(dashboard).not.toMatch(/getVisibleRoleOptions/);
  });
  it("the active dashboard room renders NO generic future-module grid", () => {
    expect(dashboard).not.toMatch(/<FeatureAvailabilityGrid\b/);
  });
  it("account is settings only — it does NOT host the cross-space catalogue (superseded PR #204)", () => {
    // Owner override 2026-06-25: account must not be a second dashboard. The
    // catalogue + future-module grid were removed from account; identity
    // switching is the header role switcher, person↔company actions live on the
    // dashboard overview. The active room staying clean (above) is unchanged.
    expect(account).not.toMatch(/<RoleCatalogueGrid\b/);
    expect(account).not.toMatch(/<FeatureAvailabilityGrid\b/);
    expect(account).not.toMatch(/<IdentityActions\b/);
  });
  it("the current-space header opens the ACTIVE space's hub, never settings", () => {
    // Owner P0 2026-07-02: account is settings-only, so the header chip must
    // NOT route there. Rebuild W5: the agency room is a REDIRECT_STUB and the
    // buyer room is DUPLICATE_DRIFT — both spaces open the CANONICAL company
    // workspace directly (no live links into stub/drift routes). Settings
    // stays reachable via the avatar AccountMenu ("Nustatymai").
    const comp = read("components/app/current-space-header.tsx");
    expect(dashboard).toMatch(/<CurrentSpaceHeader role=\{role\} \/>/);
    // no account route as a VALUE (the constraint comment may name the path)
    expect(comp).not.toMatch(/["'`]\/dashboard\/account["'`]/);
    expect(comp).toMatch(/profile: "\/dashboard\/profile"/);
    expect(comp).toMatch(/company: "\/dashboard\/company"/);
    expect(comp).toMatch(/agency: "\/dashboard\/company"/);
    expect(comp).toMatch(/buyer: "\/dashboard\/company"/);
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
