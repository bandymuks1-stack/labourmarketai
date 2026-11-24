import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { BRAND_NAME } from "../seo/metadata";

/**
 * Public brand-name honesty guard (production-reality-trust-p0, issue 1).
 *
 * Owner mobile review: during Google sign-in the user must only ever see the
 * product name ("Labour Market AI" / "LabourMarket.ai") — never a backend
 * infrastructure host, Supabase project ref, internal project id, or raw
 * service name. The visible name on the Google consent screen + account chooser
 * is EXTERNAL provider config (Google OAuth consent app name + Supabase project
 * domain) and is fixed by the owner in those dashboards — see
 * docs/owner-input/production-reality-trust-p0-audit.md.
 *
 * What this guard CAN freeze in code: no auth-facing surface uses a Supabase
 * host / raw project-ref-looking token as the visible product name, and the
 * brand constant stays a human product name. So a future change can't silently
 * leak the backend host into the login chrome.
 */

const ROOT = join(__dirname, "..", "..");
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8");

/** A bare Supabase project host like `gorgitwvdzxbnaxhrsrw.supabase.co`. */
const SUPABASE_HOST_RE = /[a-z0-9]{16,}\.supabase\.co/i;

/** Auth surfaces a user actually sees while signing in. */
const AUTH_FACING_FILES = [
  "app/[locale]/auth/layout.tsx",
  "app/[locale]/auth/login/page.tsx",
  "components/app/login-form.tsx",
  "components/app/google-button.tsx",
];

describe("the public brand name is a human product name, not infra", () => {
  it("BRAND_NAME reads as the product, not a backend host / project ref", () => {
    expect(BRAND_NAME).toMatch(/labourmarket/i);
    expect(BRAND_NAME).not.toMatch(SUPABASE_HOST_RE);
    expect(BRAND_NAME).not.toMatch(/\.supabase\./i);
    // Not a raw 20-char project-ref token masquerading as a name.
    expect(BRAND_NAME).not.toMatch(/^[a-z0-9]{20}$/i);
  });

  it("the auth header shows the brand name, never an infra host", () => {
    const layout = read("app/[locale]/auth/layout.tsx");
    expect(layout).toMatch(/labourmarket/i);
    expect(layout).not.toMatch(SUPABASE_HOST_RE);
  });
});

describe("no auth-facing surface leaks the backend host as a visible name", () => {
  for (const rel of AUTH_FACING_FILES) {
    it(`${rel} contains no Supabase host string`, () => {
      expect(read(rel)).not.toMatch(SUPABASE_HOST_RE);
    });
  }
});
