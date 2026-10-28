import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { PRODUCTION_PROJECT_REF } from "../testing/local-supabase-guard";
import { PROD_QA_OWNER_EMAIL } from "../testing/prod-qa-guard";

// The mobile review identity's ONE-RUN password (owner approval 2026-10-28).
// The script may touch exactly one synthetic account, only on the production
// project, only when it is marked qa_synthetic, and must never print the secret.
const ROOT = join(__dirname, "..", "..", "..", "..");
const read = (p: string) => readFileSync(join(ROOT, p), "utf8").replace(/\r\n/g, "\n");
const script = read(".github/scripts/mobile-qa-credential.mjs");

describe("mobile review identity credential (one-run password)", () => {
  it("touches exactly the allowlisted synthetic owner, on the production project only", () => {
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
