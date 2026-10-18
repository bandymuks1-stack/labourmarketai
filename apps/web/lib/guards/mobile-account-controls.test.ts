import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const REPO = resolve(__dirname, "../../../..");
const read = (p: string) => readFileSync(resolve(REPO, p), "utf8");

/**
 * WHAT THIS PROTECTS — that a person can reach account deletion, the terms
 * and a support contact FROM INSIDE the native app, and that the app reaches
 * them by opening the canonical web surfaces rather than by growing its own.
 *
 * App Store guideline 5.1.1(v) rejects an app with account creation and no
 * path to account deletion. The deletion path exists: the web's self-service
 * privacy requests at `/<locale>/dashboard/privacy`, whose model carries the
 * `account_deletion` kind. The native settings screen links there. Two
 * directions can silently regress:
 *
 * · the link goes away, or points at a route that no longer exists — the
 *   app passes typecheck and fails review;
 * · someone "helps" by implementing deletion on the phone — a second rule
 *   for the same fact, which the architecture forbids (business logic lives
 *   in client-core and the canonical capabilities, never forked per client).
 */
describe("native settings — privacy, terms and support reach the canonical web surfaces", () => {
  const settings = read("apps/mobile/app/(shell)/settings.tsx");

  it("links to the web privacy page (data + account deletion) for the person's locale", () => {
    expect(settings).toContain("/${locale}/dashboard/privacy");
    expect(settings).toContain("Linking.openURL");
  });

  it("links to the terms and to the one published support address", () => {
    expect(settings).toContain("/${locale}/legal/terms");
    expect(settings).toContain('"info@labourmarket.ai"');
    expect(settings).toMatch(/mailto:\$\{SUPPORT_EMAIL\}/);
  });

  it("the linked web routes exist, and the privacy model carries account deletion", () => {
    for (const p of [
      "apps/web/app/[locale]/dashboard/privacy/page.tsx",
      "apps/web/app/[locale]/(marketing)/legal/terms/page.tsx",
    ]) {
      expect(existsSync(resolve(REPO, p)), `${p} is missing — the app links to a route that is not there`).toBe(true);
    }
    expect(read("apps/web/lib/privacy/privacy-request-model.ts")).toContain('"account_deletion"');
  });

  it("opens the SAME origin this build talks to, so a preview build never sends a person to production", () => {
    expect(settings).toContain("CONFIG.apiBaseUrl");
    expect(settings).not.toMatch(/https:\/\/labourmarket\.ai\/\$\{locale\}/);
  });

  it("does not fork account deletion onto the phone", () => {
    // The link is the implementation. A capability call, a Supabase call or a
    // deletion request built here would be a second rule for the same fact.
    expect(settings).not.toMatch(/account\.delete|deleteUser|privacy_requests|supabase|\.from\(/);
  });

  it("every link label is in the mobile catalogue, so no locale shows a raw key", () => {
    const messages = read("apps/mobile/src/i18n/messages.ts");
    for (const key of [
      "account.title",
      "account.privacy",
      "account.terms",
      "account.support",
      "account.openFailed",
    ]) {
      expect(settings).toContain(`t("${key}")`);
      // One definition per active locale (six since PL, 2026-09-20 #1810) — parity is the
      // compiler's (`Record<ActiveLocale, Catalogue>`), presence is ours.
      expect(messages.split(`"${key}":`).length - 1, `${key} is not defined in all six locales`).toBe(6);
    }
  });
});

/**
 * STORE-REVIEW FACTS for the account surfaces (technical completion,
 * 2026-10-14). Google Play's data-safety form needs a deletion URL that works
 * WITHOUT signing in, and the web privacy page needs a web session the app
 * cannot hand over — so the public `/legal/data-deletion` page is linked too.
 * A person who forgot the password must be able to recover from the app's own
 * sign-in screen, and a person creating an account in the app must be shown
 * the terms and the privacy policy before they do. All three are the
 * website's existing surfaces, opened in the browser — never a second rule.
 */
describe("native account surfaces — what the store reviews look for", () => {
  const settings = read("apps/mobile/app/(shell)/settings.tsx");
  const form = read("apps/mobile/src/screens/credentials-form.tsx");
  const messages = read("apps/mobile/src/i18n/messages.ts");

  it("settings links the PUBLIC deletion page and the privacy policy", () => {
    expect(settings).toContain("/${locale}/legal/data-deletion");
    expect(settings).toContain("/${locale}/legal/privacy");
    expect(settings).toContain('t("account.deletionInfo")');
    expect(settings).toContain('t("account.privacyPolicy")');
  });

  it("sign-in offers password recovery through the web's one recovery flow", () => {
    expect(form).toContain('"/auth/forgot-password"');
    expect(form).toContain('testID="forgot-password"');
    expect(form).toContain("CONFIG.apiBaseUrl");
    expect(form).not.toMatch(/resetPasswordForEmail/);
  });

  it("register shows the terms and the privacy policy before an account is created", () => {
    expect(form).toContain('t("auth.register.legal")');
    expect(form).toContain('"/legal/terms"');
    expect(form).toContain('"/legal/privacy"');
  });

  it("the linked public routes exist", () => {
    for (const p of [
      "apps/web/app/[locale]/(marketing)/legal/data-deletion/page.tsx",
      "apps/web/app/[locale]/(marketing)/legal/privacy/page.tsx",
      "apps/web/app/[locale]/auth/forgot-password/page.tsx",
    ]) {
      expect(existsSync(resolve(REPO, p)), `${p} is missing`).toBe(true);
    }
  });

  it("every new label exists in all six locales", () => {
    for (const key of [
      "account.deletionInfo",
      "account.privacyPolicy",
      "auth.signIn.forgot",
      "auth.register.legal",
    ]) {
      expect(messages.split(`"${key}":`).length - 1, `${key} is not defined in all six locales`).toBe(6);
    }
  });
});
