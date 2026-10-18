import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { describe, expect, it } from "vitest";

import { actsAsAgency, actsAsClient, resolveNeedsAudience } from "@/lib/company/agency-capability";

/**
 * OWNER DECISION ORG-2: agency is an organization CAPABILITY, not a permanent
 * account type. `company_type` stays valid for classification, discovery,
 * display and harmless legacy compatibility, but it must not be a second,
 * independent authorization gate. The ONE rule is `actsAsAgency` /
 * `readActsAsAgency` (type OR declared workforce role; SQL twin
 * `company_acts_as_agency`).
 *
 * This guard freezes the files that may still compare a company type to
 * 'staffing_agency'. A NEW comparison fails here: ask the capability rule
 * instead, or add the file below with the reason it is classification only.
 */
const ROOT = join(__dirname, "..", "..");
const ALLOW: Record<string, { count: number; why: string }> = {
  "lib/company/agency-capability.ts": { count: 3, why: "the ONE rule itself (type arm of the union) and its audience/client helpers" },
  "lib/company/agency-capability-read.ts": { count: 1, why: "short-circuit of the same rule" },
  "app/[locale]/dashboard/company/page.tsx": { count: 2, why: "type chip note (display) + client-invite read, which stays for every non-staffing type" },
  "app/[locale]/dashboard/company/settings/page.tsx": { count: 1, why: "type note (display)" },
  "lib/company/organization-switch.ts": { count: 2, why: "acting-role label / unnamed-organization phrase (classification)" },
  "lib/conversation/starter-signals.ts": { count: 1, why: "the TYPE fact fed into actsAsAgency" },
};

const COMPARE = /(companyType|company_type|ctype)\s*[!=]==?\s*["']staffing_agency["']|["']staffing_agency["']\s*[!=]==?\s*\w*(companyType|company_type)/;

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name.startsWith(".next") || name === "tests") continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name) && !name.endsWith(".d.ts")) out.push(p);
  }
  return out;
}

describe("ORG-2: company_type is not an independent agency authority gate", () => {
  it("only the allow-listed files compare a company type to 'staffing_agency'", () => {
    const found: Record<string, number> = {};
    for (const dir of ["app", "lib", "components"]) {
      for (const file of walk(join(ROOT, dir))) {
        const rel = relative(ROOT, file).split(sep).join("/");
        let n = 0;
        for (const line of readFileSync(file, "utf8").split("\n")) {
          const t = line.trim();
          if (t.startsWith("*") || t.startsWith("//") || t.startsWith("/*")) continue;
          if (COMPARE.test(line)) n += 1;
        }
        if (n > 0) found[rel] = n;
      }
    }
    const expected = Object.fromEntries(Object.entries(ALLOW).map(([k, v]) => [k, v.count]));
    expect(found).toEqual(expected);
  });
});

describe("ORG-2: agency capability for role-only and dual organizations", () => {
  it("a role-only agency (type is not staffing_agency) acts as an agency", () => {
    expect(actsAsAgency("construction", ["workforce_provider"])).toBe(true);
    expect(actsAsAgency("other", ["recruitment_partner"])).toBe(true);
    expect(actsAsAgency("construction", ["employer"])).toBe(false);
  });

  it("needs audience: plain employer buys, no choice", () => {
    expect(resolveNeedsAudience({ companyType: "construction", capabilities: ["employer"] })).toEqual({
      audience: "need",
      canChoose: false,
    });
    // a requested offer is ignored without the capability: no widening
    expect(
      resolveNeedsAudience({ companyType: "construction", capabilities: [], requested: "offer" }),
    ).toEqual({ audience: "need", canChoose: false });
  });

  it("needs audience: agency-only (type) offers, no choice; requested need is ignored", () => {
    expect(resolveNeedsAudience({ companyType: "staffing_agency", capabilities: [], requested: "need" })).toEqual({
      audience: "offer",
      canChoose: false,
    });
  });

  it("needs audience: dual organizations choose, defaults unchanged", () => {
    const dualRole = { companyType: "construction", capabilities: ["employer", "workforce_provider"] };
    expect(resolveNeedsAudience(dualRole)).toEqual({ audience: "need", canChoose: true });
    expect(resolveNeedsAudience({ ...dualRole, requested: "offer" })).toEqual({ audience: "offer", canChoose: true });
    const dualType = { companyType: "staffing_agency", capabilities: ["employer"] };
    expect(resolveNeedsAudience(dualType)).toEqual({ audience: "offer", canChoose: true });
    expect(resolveNeedsAudience({ ...dualType, requested: "need" })).toEqual({ audience: "need", canChoose: true });
    // role-only agency with no employer role but non-staffing type is a client too
    expect(resolveNeedsAudience({ companyType: "other", capabilities: ["workforce_provider"] }).canChoose).toBe(true);
  });

  it("partners alsoClient", () => {
    expect(actsAsClient("staffing_agency", [])).toBe(false);
    expect(actsAsClient("staffing_agency", ["employer"])).toBe(true);
    expect(actsAsClient("construction", [])).toBe(true);
  });
});
