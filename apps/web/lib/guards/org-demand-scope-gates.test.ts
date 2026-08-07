/**
 * Guard — ORG DEMAND SPINE, STAGE A (app-layer workspace gates, zero
 * migration).
 *
 * Extends the W8 rule pinned by `employer-organization-context.test.ts` to the
 * demand-chain surfaces a read-only audit (at 5be4baf6) found ungated: every
 * EMPLOYER read/write of demand-chain data resolves its acting context through
 * the ONE canonical resolver (`lib/company/employer-company-context.ts`),
 * fail-closed, with no profile-only company fallback. A sibling file (not an
 * edit of the W8 guard) because that guard's section 6 pins an exact
 * historical scope this slice must not blur.
 *
 * Also pinned here, because they are DECISIONS and not omissions:
 *   - the buyer spine stays UNGATED (person-or-company action, own `customers`
 *     identity — an employer gate would fail-closed every person-buyer);
 *   - privacy self-service stays UNGATED (a person right, never behind an
 *     employer workspace);
 *   - worker-facing reads carry no employer gate;
 *   - G6: the contact-disclosure ask derives its organization from the active
 *     workspace, never "first owned org by created_at".
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const APP = join(__dirname, "..", "..");
const read = (rel: string): string => readFileSync(join(APP, rel), "utf8");

const RESOLVER_IMPORT = /from "@\/lib\/company\/employer-company-context"/;

/** Every file this slice gated. Each must import the canonical resolver and
 *  actually call it — the gate must not be able to silently disappear. */
const STAGE_A_GATED: readonly { file: string; why: string }[] = [
  { file: "lib/demand/demand-drafts.ts", why: "employer draft read/save/close" },
  { file: "lib/buyer/customer-requests.ts", why: "employer-kinds demand list" },
  { file: "lib/demand/canonical-demand.ts", why: "employer leg of the market map" },
  { file: "lib/intelligence/intelligence-read.ts", why: "company demand intelligence" },
  { file: "lib/demand/demand-request.ts", why: "submit (W8) + prefill (Stage A)" },
  { file: "lib/opportunities/interest.ts", why: "company view of interest signals" },
  { file: "lib/demand/demand-location.ts", why: "demand-location write + reads" },
  { file: "lib/agency/clients.ts", why: "agency spine (Direction A = company)" },
  { file: "lib/privacy/contact-disclosure-actions.ts", why: "G6 org derivation" },
];

describe("1. every Stage A file resolves through the ONE canonical resolver", () => {
  it.each(STAGE_A_GATED)("$file imports the canonical module ($why)", ({ file }) => {
    expect(read(file)).toMatch(RESOLVER_IMPORT);
  });

  it.each(STAGE_A_GATED)("$file actually calls requireEmployerCompany", ({ file }) => {
    expect(read(file)).toMatch(/requireEmployerCompany\(\)/);
  });

  it.each(STAGE_A_GATED)(
    "$file never re-derives a company from companies.profile_id",
    ({ file }) => {
      // The exact shortcut the W8 audit banned from the employer spine.
      const companiesByProfile =
        /from\(\s*["']companies["']\s*\)[\s\S]{0,240}?\.eq\(\s*["']profile_id["']/;
      expect(companiesByProfile.test(read(file))).toBe(false);
    },
  );
});

describe("2. the gates are scoped to the EMPLOYER paths only", () => {
  it("demand-drafts gates exactly the employer draft kinds — buyer_request stays open", () => {
    const src = read("lib/demand/demand-drafts.ts");
    const setBody = src.slice(
      src.indexOf("EMPLOYER_DRAFT_TYPES"),
      src.indexOf("export type CompanyRequestPayload"),
    );
    expect(setBody).toMatch(/"company_request"/);
    expect(setBody).toMatch(/"agency_offer"/);
    expect(setBody).not.toMatch(/new Set\(\[[\s\S]*?"buyer_request"[\s\S]*?\]\)/);
  });

  it("the buyer save stays free of the employer gate (person-or-company action)", () => {
    const src = read("lib/buyer/customer-requests.ts");
    const saveBody = src.slice(src.indexOf("export async function saveCustomerRequest"));
    expect(saveBody).not.toMatch(/requireEmployerCompany/);
    // …and the decision is documented where the next editor will read it.
    expect(src).toMatch(/deliberately NOT employer-workspace-gated/);
  });

  it("the employer-kinds list path IS gated", () => {
    const src = read("lib/buyer/customer-requests.ts");
    const listBody = src.slice(
      src.indexOf("export async function listOwnCustomerRequests"),
      src.indexOf("export async function saveCustomerRequest"),
    );
    expect(listBody).toMatch(/requireEmployerCompany\(\)/);
    expect(listBody).toMatch(/no_company_context/);
  });

  it("privacy self-service is a person right — no employer gate, documented", () => {
    const src = read("lib/privacy/actions.ts");
    expect(src).not.toMatch(RESOLVER_IMPORT);
    expect(src).not.toMatch(/requireEmployerCompany/);
    expect(src).toMatch(/PERSON right/);
  });

  it("the worker salary read carries no employer gate", () => {
    const src = read("lib/intelligence/intelligence-read.ts");
    const workerBody = src.slice(
      src.indexOf("export async function getWorkerSalaryIntelligence"),
      src.indexOf("export async function getCompanyDemandIntelligence"),
    );
    expect(workerBody).not.toMatch(/requireEmployerCompany/);
  });

  it("the company demand intelligence read IS gated, and keeps a W14 row predicate", () => {
    const src = read("lib/intelligence/intelligence-read.ts");
    const body = src.slice(src.indexOf("export async function getCompanyDemandIntelligence"));
    expect(body).toMatch(/requireEmployerCompany\(\)/);
    // W8 Stage B: the row predicate widened from `profile_id = user.id` to
    // the RESOLVED organization (spine 20260806200000) — still a server-side
    // scope, still unreachable for the is_admin RLS branch. Pinned in full by
    // company-intelligence-owner-scope.test.ts.
    expect(body).toMatch(
      /\.eq\(\s*"organization_id"\s*,\s*employer\.organizationId\s*\)/,
    );
  });

  it("the market-map employer leg is gated; non-employer kinds keep flowing", () => {
    const src = read("lib/demand/canonical-demand.ts");
    expect(src).toMatch(/requireEmployerCompany\(\)/);
    // Fail-closed for employer demand = the kind filter excludes the employer
    // kinds when there is no resolved workspace, and ONLY then.
    expect(src).toMatch(/kind\.is\.null,kind\.eq\.buyer_request,kind\.eq\.customer_request/);
    // The module still takes no caller-supplied identifiers (W10 rule).
    expect(src).toMatch(/export async function loadCanonicalDemand\(\): Promise/);
  });
});

describe("3. G6 — the contact-disclosure ask derives its org from the workspace", () => {
  const src = read("lib/privacy/contact-disclosure-actions.ts");

  it("the first-owned-org-by-created_at resolver is gone", () => {
    expect(src).not.toMatch(/resolveOwnOrganizationId/);
    expect(src).not.toMatch(/\.eq\(\s*["']owner_profile_id["']/);
  });

  it("the organization id comes from the canonical resolver's answer", () => {
    expect(src).toMatch(/requireEmployerCompany\(\)/);
    expect(src).toMatch(/employer\.organizationId/);
  });

  it("failure stays fail-closed with the module's named reasons", () => {
    const body = src.slice(src.indexOf("export async function requestContactDisclosureAction"));
    expect(body).toMatch(/kind: "not-authed"/);
    expect(body).toMatch(/kind: "no-organization"/);
  });

  it("the RPC and its argument names are untouched", () => {
    expect(src).toMatch(/propose_contact_disclosure_request_v1/);
    expect(src).toMatch(/p_organization_id: organizationId/);
  });
});

describe("4. the skipped file stays skipped", () => {
  it("contact-interested-worker.ts (owned by another open branch) is untouched by Stage A", () => {
    // No Stage A marker — if that branch lands first, this slice must not have
    // edited the same surface underneath it.
    expect(read("lib/communication/contact-interested-worker.ts")).not.toMatch(/Stage A/);
  });
});
