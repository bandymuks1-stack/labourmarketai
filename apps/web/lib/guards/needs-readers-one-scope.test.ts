import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * THE ORGANIZATION'S NEEDS: ONE SCOPE, ONE KIND LIST (duplication audit ORG-4,
 * docs/audits/DUPLICATION_AUDIT.md).
 *
 * The agency's needs list on /partners read the caller's own rows from every
 * organization, while every other needs reader reads the active workspace's.
 * It now uses the same workspace filter, stays on own rows (the link and share
 * writes accept nothing else) and is read once per render. The chat share path
 * offers the same own rows. The employer kind list is declared once.
 */
const WEB = join(__dirname, "..", "..");
const read = (rel: string) => readFileSync(join(WEB, rel), "utf8");

describe("the needs readers share one scope", () => {
  it("the agency list reads the active workspace's own rows, once per render", () => {
    const src = read("lib/agency/clients.ts");
    expect(src).toMatch(/export const listAgencyDemands = cache\(readAgencyDemands\)/);
    const fn = src.slice(src.indexOf("async function readAgencyDemands"));
    expect(fn).toMatch(/const workspace = demandsOfWorkspaceFilter\(user\.id, employer\.organizationId\)/);
    expect(fn.match(/\.eq\("profile_id", user\.id\)\s*\.or\(workspace\)/g)).toHaveLength(2);
  });

  it("the chat share path offers only the needs the share RPC accepts", () => {
    const src = read("lib/conversation/client-bridge.ts");
    expect(src).toMatch(/demands\.filter\(\(d\) => d\.ownedByCaller && /);
  });

  it("the employer kind list is declared once and imported", () => {
    expect(read("lib/buyer/customer-requests.ts")).toMatch(/export const EMPLOYER_DEMAND_KINDS = \[/);
    for (const rel of ["app/[locale]/dashboard/company/page.tsx", "app/[locale]/dashboard/company/needs/page.tsx"]) {
      const src = read(rel);
      expect(src).not.toMatch(/const EMPLOYER_DEMAND_KINDS =/);
      expect(src).toMatch(/import \{ EMPLOYER_DEMAND_KINDS, listOwnCustomerRequests \} from "@\/lib\/buyer\/customer-requests"/);
    }
  });
});
