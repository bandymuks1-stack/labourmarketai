import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Room separation (mobile-first room polish v1). Each room route shows only its
 * own space. Space SWITCHING lives in the header RoleSwitcher; /dashboard/account
 * is SETTINGS-ONLY (IA cleanup 2026-06-25), so no "Mano erdvės / My spaces"
 * link may route there (owner P0 2026-07-02). Pins the post-IA-reset state.
 */

const root = join(__dirname, "..", "..");
const read = (rel: string) => readFileSync(join(root, rel), "utf8");

const dashboard = read("app/[locale]/dashboard/page.tsx");
const account = read("app/[locale]/dashboard/account/page.tsx");
const buyer = read("app/[locale]/dashboard/buyer/page.tsx");
const company = read("app/[locale]/dashboard/company/page.tsx");
const profile = read("app/[locale]/dashboard/profile/page.tsx");
const agency = read("app/[locale]/dashboard/agency/page.tsx");
const journal = read("app/[locale]/dashboard/journal/page.tsx");

describe("active /dashboard room stays focused", () => {
  it("renders no all-roles catalogue and no future-module grid", () => {
    expect(dashboard).not.toMatch(/<RoleCatalogueGrid\b/);
    expect(dashboard).not.toMatch(/getVisibleRoleOptions/);
    expect(dashboard).not.toMatch(/<FeatureAvailabilityGrid\b/);
  });
  it("keeps the current-space header", () => {
    expect(dashboard).toMatch(/<CurrentSpaceHeader role=\{role\} \/>/);
  });
});

describe("/dashboard/account is settings only (marketplace IA cleanup)", () => {
  // Superseded PR #204: account no longer hosts the cross-space catalogue or
  // the future-module grid (it was acting as a second dashboard). Identity
  // switching is the header role switcher; the person↔company actions live on
  // the dashboard overview. Account = settings only.
  it("hosts no catalogue, no future-module grid, and no identity-action workspace", () => {
    expect(account).not.toMatch(/<RoleCatalogueGrid\b/);
    expect(account).not.toMatch(/<FeatureAvailabilityGrid\b/);
    expect(account).not.toMatch(/<IdentityActions\b/);
  });
  it("still carries settings: email, appearance, roles list, sign out", () => {
    expect(account).toMatch(/account\.email_label/);
    expect(account).toMatch(/account\.theme\.appearance/);
    expect(account).toMatch(/account\.roles_label/);
    expect(account).toMatch(/account\.logout/);
  });
});

describe("agency room folded into the company room (Direction A, 2026-07-05)", () => {
  it("is a redirect stub to the canonical company workspace", () => {
    expect(agency).toMatch(/redirect\(`\/\$\{locale\}\/dashboard\/company`\)/);
  });
  it("imports no buyer / private-person / catalogue blocks", () => {
    expect(agency).not.toMatch(/BuyerRequestsSection|getOwnCustomer\b|listOwnCustomerRequests|RoleCatalogueGrid|FeatureAvailabilityGrid/);
  });
});

describe("journal room shows work-evidence only (+ compact switcher)", () => {
  it("imports no buyer / agency / company-as-buyer / catalogue blocks", () => {
    expect(journal).not.toMatch(/BuyerRequestsSection|AgencyWorkersSection|CompanyWorkersSection|RoleCatalogueGrid|FeatureAvailabilityGrid/);
  });
  it("offers a compact My-spaces switch link (to the overview, never settings)", () => {
    expect(journal).toMatch(/href="\/dashboard"[\s\S]{0,220}data-testid="room-my-spaces-link"/);
    expect(journal).not.toMatch(/href="\/dashboard\/account"[\s\S]{0,220}data-testid="room-my-spaces-link"/);
  });
});

describe("buyer room shows buyer/request only", () => {
  it("imports no profile-CV / company / agency / catalogue blocks", () => {
    expect(buyer).not.toMatch(/ProfileCvClarityCard|WorkerTradeProfile|CapabilityProfileSection|WorkerEvidenceCard|CompanyWorkersSection|OrgMembersPanel|RoleCatalogueGrid|FeatureAvailabilityGrid/);
  });
  it("offers a compact My-spaces switch link (to the overview, never settings)", () => {
    expect(buyer).toMatch(/href="\/dashboard"[\s\S]{0,220}data-testid="room-my-spaces-link"/);
    expect(buyer).not.toMatch(/href="\/dashboard\/account"[\s\S]{0,220}data-testid="room-my-spaces-link"/);
  });
});

describe("company room shows company work management only", () => {
  it("imports no buyer-request blocks", () => {
    expect(company).not.toMatch(/BuyerRequestsSection|getOwnCustomer\b|listOwnCustomerRequests/);
  });
  it("offers a compact My-spaces switch link (to the overview, never settings)", () => {
    expect(company).toMatch(/href="\/dashboard"[\s\S]{0,220}data-testid="room-my-spaces-link"/);
    expect(company).not.toMatch(/href="\/dashboard\/account"[\s\S]{0,220}data-testid="room-my-spaces-link"/);
  });
});

describe("profile room shows personal profile only (+ compact switcher)", () => {
  it("imports no buyer / company / agency / catalogue blocks", () => {
    expect(profile).not.toMatch(/BuyerRequestsSection|CompanyWorkersSection|OrgMembersPanel|RoleCatalogueGrid|FeatureAvailabilityGrid/);
  });
  it("offers a compact My-spaces switch link (to the overview, never settings)", () => {
    expect(profile).toMatch(/href="\/dashboard"[\s\S]{0,220}data-testid="room-my-spaces-link"/);
    expect(profile).not.toMatch(/href="\/dashboard\/account"[\s\S]{0,220}data-testid="room-my-spaces-link"/);
  });
});

describe("my-space navigation truth (owner P0 2026-07-02)", () => {
  // /dashboard/account is SETTINGS-ONLY. The workspace/space chips must never
  // route there; settings stays reachable via the avatar AccountMenu under the
  // unambiguous settings label; the worker's CV hub stays reachable without a
  // settings detour: dashboard → profile hub → /cv.
  const header = read("components/app/current-space-header.tsx");
  const menu = read("components/app/account-menu.tsx");

  it("(a) the current-space chip never points at settings — it opens the active space hub", () => {
    expect(header).not.toMatch(/["'`]\/dashboard\/account["'`]/);
    expect(header).toMatch(/href=\{SPACE_ROUTE\[key\]\}/);
    expect(header).toMatch(/profile: "\/dashboard\/profile"/);
    expect(header).toMatch(/company: "\/dashboard\/company"/);
  });

  it("(a) no room 'Mano erdvės' chip points at settings", () => {
    for (const [name, src] of [
      // agency room removed 2026-07-05 — redirect stub, no chip at all.
      ["journal", journal],
      ["buyer", buyer],
      ["company", company],
      ["profile", profile],
    ] as const) {
      expect(
        /href="\/dashboard\/account"[\s\S]{0,220}data-testid="room-my-spaces-link"/.test(src),
        `${name} room chip must not target /dashboard/account`,
      ).toBe(false);
    }
  });

  it("(b) settings stays reachable from the account menu with the settings label", () => {
    expect(menu).toMatch(/href="\/dashboard\/account"[\s\S]{0,240}data-testid="account-menu-account-link"/);
    // labelled with the settings key ("Nustatymai"), never a spaces label
    expect(menu).toMatch(/\{t\("tabs\.account"\)\}/);
    expect(menu).not.toMatch(/mySpaces/);
  });

  it("(c) the CV hub chain holds: dashboard → profile hub → /cv", () => {
    // dashboard mounts the header whose worker space routes to the profile hub
    expect(dashboard).toMatch(/<CurrentSpaceHeader role=\{role\} \/>/);
    expect(header).toMatch(/worker:\s*"profile"/);
    expect(header).toMatch(/profile: "\/dashboard\/profile"/);
    // the profile hub links to the CV page (no settings detour)
    expect(profile).toMatch(/href="\/cv"/);
  });
});

describe("buyer copy: no worker-purchase, no internal tech text", () => {
  const lt = JSON.parse(read("messages/lt.json"));
  const en = JSON.parse(read("messages/en.json"));
  const buyerBlob = [
    JSON.stringify(lt.roleDashboards.buyer),
    JSON.stringify(en.roleDashboards.buyer),
    lt.auth.dashboard.chainActions.buyerSubtitle,
    en.auth.dashboard.chainActions.buyerSubtitle,
    JSON.stringify(lt.spaces.buyer),
    JSON.stringify(en.spaces.buyer),
  ].join(" ");
  it("no worker-purchase wording", () => {
    expect(buyerBlob).not.toMatch(/darbuotoj|pirkti darbuotoj|buy worker|buy employee/i);
  });
  it("no DB/RPC/schema text", () => {
    expect(buyerBlob).not.toMatch(/public\.\w|\bRPC\b|\bRLS\b|save_customer|apply_migration/);
  });
});
