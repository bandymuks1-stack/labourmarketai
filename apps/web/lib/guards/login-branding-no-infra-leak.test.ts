import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Login-branding guard (Core Product Sprint Train v2, Wagon 3 — login branding).
 *
 * Owner directive: a user must NEVER see technical backend / hosting / project
 * identity while signing in. The sibling guard `public-brand-name.test.ts`
 * freezes the auth-facing *source* files (`login-form.tsx`, `google-button.tsx`,
 * `auth/layout.tsx`, `auth/login/page.tsx`) against a Supabase host string — but
 * the actual user-visible sign-in copy lives in the i18n message catalog, which
 * that guard never reads. A preview-host notice once read "You're on a Vercel
 * preview deployment … Supabase Site URL only allows the production origin",
 * leaking two backend vendor names straight onto the login screen.
 *
 * This guard closes that gap: every string under the `auth` namespace in each
 * shipped product locale (lt / en / ru) must be free of hosting / backend /
 * database vendor names and of a bare Supabase project host. Brand-side names
 * (labourmarket.ai, Google as the chosen sign-in provider) stay allowed.
 *
 * RED items NOT enforceable here (external owner config, documented in
 * docs/owner-input/login-branding-p0.md): the Google OAuth consent app name and
 * the Supabase auth host shown on Google's own consent / account-chooser screen.
 */

const ROOT = join(__dirname, "..", "..");
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8");

/** Product locales whose auth copy a real user can see while signing in. */
const LOCALES = ["lt", "en", "ru"];

/** Backend / hosting / infra vendor + service names that must never appear in
 *  user-facing sign-in copy. Word-boundary matched, case-insensitive. "Google"
 *  is deliberately NOT here — it is the sign-in provider the user chose, shown
 *  as "Continue with Google", which is correct brand-side behaviour. */
const FORBIDDEN_INFRA = [
  /\bvercel\b/i,
  /\bsupabase\b/i,
  /\bnetlify\b/i,
  /\bcloudflare\b/i,
  /\brender\.com\b/i,
  /\bfly\.io\b/i,
  /\bpostgres(?:ql)?\b/i,
  /\bsite url\b/i,
];

/** A bare Supabase project host like `gorgitwvdzxbnaxhrsrw.supabase.co`. */
const SUPABASE_HOST_RE = /[a-z0-9]{16,}\.supabase\.co/i;

/** Flatten every leaf string value of an object into `[path, value]` pairs so a
 *  violation reports exactly which key leaked. */
function leafStrings(obj: unknown, path = ""): Array<[string, string]> {
  if (typeof obj === "string") return [[path, obj]];
  if (Array.isArray(obj)) {
    return obj.flatMap((v, i) => leafStrings(v, `${path}[${i}]`));
  }
  if (obj && typeof obj === "object") {
    return Object.entries(obj).flatMap(([k, v]) =>
      leafStrings(v, path ? `${path}.${k}` : k),
    );
  }
  return [];
}

describe("login / auth copy never shows backend or infra identity", () => {
  for (const locale of LOCALES) {
    const auth = JSON.parse(read(`messages/${locale}.json`)).auth ?? {};
    const leaves = leafStrings(auth, `${locale}.auth`);

    it(`${locale}: no auth string names a hosting / backend / DB vendor`, () => {
      const hits = leaves.filter(([, v]) =>
        FORBIDDEN_INFRA.some((re) => re.test(v)),
      );
      expect(
        hits.map(([p, v]) => `${p}: ${v}`),
        `auth copy must not expose backend identity: ${JSON.stringify(hits)}`,
      ).toEqual([]);
    });

    it(`${locale}: no auth string embeds a Supabase project host`, () => {
      const hits = leaves.filter(([, v]) => SUPABASE_HOST_RE.test(v));
      expect(hits.map(([p]) => p)).toEqual([]);
    });
  }

  it("the preview-host notice still points the user to the real product URL", () => {
    // The honest substance of the notice (use the live site for Google login)
    // must survive the branding cleanup — only the vendor names were removed.
    for (const locale of LOCALES) {
      const notice = JSON.parse(read(`messages/${locale}.json`)).auth?.login
        ?.preview_host_notice;
      expect(notice).toMatch(/labourmarket\.ai/);
    }
  });
});
