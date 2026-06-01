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

describe("/dashboard/account is the ONLY cross-space switcher/catalogue surface", () => {
  it("hosts My-spaces with the catalogue + future-module grid + current space", () => {
    expect(account).toMatch(/data-testid="my-spaces"/);
    expect(account).toMatch(/<RoleCatalogueGrid\b/);
    expect(account).toMatch(/<FeatureAvailabilityGrid\b/);
    expect(account).toMatch(/data-testid="my-spaces-current"/);
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
