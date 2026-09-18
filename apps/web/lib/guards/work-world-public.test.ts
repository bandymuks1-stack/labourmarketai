import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Guard: the public surfaces (jobs, landing) speak the same work-world
 * grammar as the product — and no dead utility class is left rendering
 * nothing. `text-muted-foreground`, `bg-accent`, `border-input`,
 * `bg-background`, `border-foreground`, `bg-primary`, `hover:bg-muted` are
 * shadcn names that were never in the token map: they compiled to NO CSS,
 * so secondary text rendered in the primary colour and two submit buttons
 * had no background at all.
 */
const root = resolve(__dirname, "..", "..");
const read = (rel: string) => readFileSync(resolve(root, rel), "utf8");

const DEAD = /\b(text-muted-foreground|bg-accent(\/\d+)?|border-input|bg-background|border-foreground|text-primary-foreground|bg-primary|hover:bg-muted)\b/;

describe("Guard: PUBLIC JOBS + LANDING wear the work-world grammar", () => {
  it("no dead (undefined) utility class remains on the surfaces that carried them", () => {
    // The three /jobs files carry the same fix on the owner-waived branch
    // (public-acquisition-route-jobs is PR-scoped and owner-expanded); they
    // join this list when that PR merges.
    for (const rel of [
      "app/[locale]/oauth/consent/page.tsx",
      "components/app/timesheet-import-review.tsx",
      "components/app/work-hours-quick-entry.tsx",
      "components/marketing/save-vacancy-button.tsx",
    ]) {
      expect(read(rel), rel).not.toMatch(DEAD);
    }
  });

  it("the landing chain wears the evidence diamond with honest roles: journal = evidence, skills = attestation, nothing verified", () => {
    const chain = read("components/marketing/product-chain-band.tsx");
    expect(chain).toContain('from "@/components/app/work-world/primitives"');
    expect(chain).toMatch(/journal:\s*"SELF_REPORTED"/);
    expect(chain).toMatch(/skills:\s*"ORGANIZATION_ATTESTED"/);
    expect(chain).not.toMatch(/INDEPENDENTLY_VERIFIED/);
    expect(chain).toMatch(/<EvidenceDot state=\{standing\[key\]\} \/>/);
  });
});
