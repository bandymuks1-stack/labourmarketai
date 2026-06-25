import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Room separation (mobile-first room polish v1). Each room route shows only its
 * own space; cross-space catalogue/switcher content lives ONLY under
 * /dashboard/account ("Mano erdvės / My spaces"). Pins the post-IA-reset state.
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

describe("agency room shows candidate/team supply only (+ compact switcher)", () => {
  it("imports no buyer / private-person / catalogue blocks", () => {
    expect(agency).not.toMatch(/BuyerRequestsSection|getOwnCustomer\b|listOwnCustomerRequests|RoleCatalogueGrid|FeatureAvailabilityGrid/);
  });
  it("offers a compact My-spaces switch link", () => {
    expect(agency).toMatch(/data-testid="room-my-spaces-link"/);
  });
});

describe("journal room shows work-evidence only (+ compact switcher)", () => {
  it("imports no buyer / agency / company-as-buyer / catalogue blocks", () => {
    expect(journal).not.toMatch(/BuyerRequestsSection|AgencyWorkersSection|CompanyWorkersSection|RoleCatalogueGrid|FeatureAvailabilityGrid/);
  });
  it("offers a compact My-spaces switch link", () => {
    expect(journal).toMatch(/data-testid="room-my-spaces-link"/);
  });
});

describe("buyer room shows buyer/request only", () => {
  it("imports no profile-CV / company / agency / catalogue blocks", () => {
    expect(buyer).not.toMatch(/ProfileCvClarityCard|WorkerTradeProfile|CapabilityProfileSection|WorkerEvidenceCard|CompanyWorkersSection|OrgMembersPanel|RoleCatalogueGrid|FeatureAvailabilityGrid/);
  });
  it("offers a compact My-spaces switch link", () => {
    expect(buyer).toMatch(/data-testid="room-my-spaces-link"/);
  });
});

describe("company room shows company work management only", () => {
  it("imports no buyer-request blocks", () => {
    expect(company).not.toMatch(/BuyerRequestsSection|getOwnCustomer\b|listOwnCustomerRequests/);
  });
  it("offers a compact My-spaces switch link", () => {
    expect(company).toMatch(/data-testid="room-my-spaces-link"/);
  });
});

describe("profile room shows personal profile only (+ compact switcher)", () => {
  it("imports no buyer / company / agency / catalogue blocks", () => {
    expect(profile).not.toMatch(/BuyerRequestsSection|CompanyWorkersSection|OrgMembersPanel|RoleCatalogueGrid|FeatureAvailabilityGrid/);
  });
  it("offers a compact My-spaces switch link", () => {
    expect(profile).toMatch(/data-testid="room-my-spaces-link"/);
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
