import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * A CLIENT IS NOT THE COMPANY THAT DID THE WORK (decision 0033).
 *
 * The company history folded EVERY record in another organization's books that
 * named this one as a party into this organization's own places, people and
 * hours. Records a subcontractor keeps that name its client then showed up as
 * the client's own work, with the subcontractor's workers by name. Only a
 * performing role is folded now; the client role is one aggregate with no
 * names, and the subcontractor sees its client.
 */
const WEB = join(__dirname, "..", "..");
const read = (rel: string) => readFileSync(join(WEB, rel), "utf8");

describe("the history reader keeps a client apart from the performer", () => {
  const src = read("lib/organization-evidence/company-work-history-read.ts");

  it("folds only the performing roles into the organization's own work", () => {
    expect(src).toMatch(/readElsewhere\(PERFORMING_PARTY_ROLES\)/);
    expect(src).toMatch(/buildCompanyWorkHistory\(\[\.\.\.recs\.records, \.\.\.attributed\], objects\)/);
    expect(src).not.toMatch(/listRecordIdsAttributedTo\(caller, org\.organizationId\)/);
  });

  it("sums the client role apart, with no names", () => {
    expect(src).toMatch(/readElsewhere\(\[CLIENT_PARTY_ROLE\]\)/);
    expect(src).toMatch(/summarizeWorkForClient\(doneForHere\)/);
    const model = read("lib/organization-evidence/work-for-client.ts");
    expect(model).not.toMatch(/personName|contextLabel|workObjectId/);
  });

  it("the store filters by role when asked", () => {
    expect(read("lib/organization-evidence/evidence-store.ts")).toMatch(/if \(roles\) q = q\.in\("party_role", roles as string\[\]\)/);
  });
});
