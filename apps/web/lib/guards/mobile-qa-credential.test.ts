import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";


// The mobile review identity's ONE-RUN password (owner approval 2026-10-28).
// The script may touch exactly one synthetic account, only on the production
// project, only when it is marked qa_synthetic, and must never print the secret.
const ROOT = join(__dirname, "..", "..", "..", "..");
const read = (p: string) => readFileSync(join(ROOT, p), "utf8").replace(/\r\n/g, "\n");
const script = read(".github/scripts/mobile-qa-credential.mjs");
// Read as TEXT, not imported: only the allowlisted files may import the production QA
// guard (prod-qa-identity.test.ts). The constants are matched from their source.
const guardSrc = read("apps/web/lib/testing/prod-qa-guard.ts");
const localSrc = read("apps/web/lib/testing/local-supabase-guard.ts");
const PROD_QA_OWNER_EMAIL = /PROD_QA_OWNER_EMAIL = "([^"]+)"/.exec(guardSrc)?.[1] ?? "";
const PRODUCTION_PROJECT_REF = /PRODUCTION_PROJECT_REF = "([^"]+)"/.exec(localSrc)?.[1] ?? "";

describe("mobile review identity credential (one-run password)", () => {
  it("touches exactly the allowlisted synthetic owner, on the production project only", () => {
    expect(PROD_QA_OWNER_EMAIL).toMatch(/^qa\.owner\+multiw@/);
    expect(PRODUCTION_PROJECT_REF).toMatch(/^[a-z0-9]{20}$/);
    expect(script).toContain(`const QA_EMAIL = "${PROD_QA_OWNER_EMAIL}";`);
    expect(script).toContain(`const PROJECT_REF = "${PRODUCTION_PROJECT_REF}";`);
    expect(script).toMatch(/claims\.ref !== PROJECT_REF \|\| claims\.role !== "service_role"/);
    expect(script.match(/@labourmarket\.ai/g)).toHaveLength(1);
  });

  it("refuses an account that is not marked qa_synthetic", () => {
    expect(script).toMatch(/user\.app_metadata\?\.qa_synthetic !== true/);
  });

  it("masks the password before anything else and never logs it", () => {
    const mask = script.indexOf("::add-mask::${password}");
    expect(mask).toBeGreaterThan(-1);
    expect(mask).toBeLessThan(script.indexOf("appendFileSync(envFile"));
    expect(script).not.toMatch(/console\.(log|error)\([^)]*\$\{password\}[^)]*\)(?<!add-mask::\$\{password\}`\))/);
  });

  it("every signed-in job issues first and scrambles always", () => {
    for (const wf of [".github/workflows/android.yml", ".github/workflows/ios-signed-in.yml"]) {
      const s = read(wf);
      expect(s).toContain("node .github/scripts/mobile-qa-credential.mjs issue");
      expect(s).toMatch(/if: always\(\)\n\s+env:\n\s+SERVICE_ROLE_KEY: \$\{\{ secrets\.SUPABASE_SERVICE_ROLE_KEY \}\}\n\s+run: node \.github\/scripts\/mobile-qa-credential\.mjs scramble/);
      expect(s).not.toContain("secrets.MOBILE_QA_PASSWORD");
    }
  });
});
