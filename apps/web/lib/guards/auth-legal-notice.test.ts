import { describe, expect, it, vi } from "vitest";
import { createElement, Fragment, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * SIGNUP PRIVACY & TERMS NOTICE guard (GDPR Art. 13 first layer).
 *
 * Before any account-creating action the user must see: who the data
 * controller is, a working Terms link, a working Privacy link, and the
 * acknowledgement that creating an account means accepting the terms.
 * This guard renders the REAL `AuthLegalNotice` with the REAL copy of
 * every active locale and statically proves placement in both forms:
 *
 *  1. every active locale ships auth.legalNotice.{signup,googleLogin,
 *     controller} with real, locale-distinct values naming the controller;
 *  2. the rendered notice contains exactly two links (terms + privacy)
 *     with non-empty accessible names, built from the locale-aware Link
 *     with a single bare path (so exactly ONE /{locale} prefix — no
 *     /lt/lt/... double prefix is constructible);
 *  3. the signup form shows the notice BEFORE the Google button and again
 *     BEFORE the email/password submit; the login form shows it before
 *     its (account-creating) Google button — OAuth cannot bypass it;
 *  4. no consent-checkbox and no marketing checkbox exists on the paths
 *     (nothing to pre-check), and the copy never frames the Privacy
 *     Policy as a GDPR consent instrument ("I agree to the Privacy…");
 *  5. the linked legal routes exist for every routed locale (single
 *     [locale] segment pages).
 */

const ACTIVE_LOCALES = ["lt", "en", "ru", "nl", "de"] as const;
const web = join(__dirname, "..", "..");
const read = (rel: string) => readFileSync(join(web, rel), "utf8");

type Notice = { signup: string; googleLogin: string; controller: string };
const noticeOf = (loc: string): Notice =>
  JSON.parse(read(`messages/${loc}.json`)).auth.legalNotice;

// ---------------------------------------------------------------------------
// Render harness: real component, real copy, minimal next-intl mock.
// ---------------------------------------------------------------------------

const h = vi.hoisted(() => ({ locale: "lt" as string }));

vi.mock("next-intl", () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const fs = require("node:fs");
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const path = require("node:path");
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const react = require("react");
  const ns = (): Record<string, string> =>
    JSON.parse(
      fs.readFileSync(path.join(process.cwd(), `messages/${h.locale}.json`), "utf8"),
    ).auth.legalNotice;
  const rich = (
    msg: string,
    values: Record<string, (chunks: ReactNode) => ReactNode>,
  ): ReactNode => {
    const parts: ReactNode[] = [];
    const re = /<(\w+)>(.*?)<\/\1>/g;
    let last = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(msg))) {
      if (m.index > last) parts.push(msg.slice(last, m.index));
      parts.push(react.createElement(react.Fragment, { key: m.index }, values[m[1]](m[2])));
      last = m.index + m[0].length;
    }
    if (last < msg.length) parts.push(msg.slice(last));
    return react.createElement(react.Fragment, {}, ...parts);
  };
  const useTranslations = () => {
    const t = (key: string) => ns()[key] ?? `MISSING:${key}`;
    t.rich = (key: string, values: Record<string, (c: ReactNode) => ReactNode>) =>
      rich(ns()[key] ?? `MISSING:${key}`, values);
    return t;
  };
  return { useTranslations };
});

// The real `Link` from @/lib/i18n/navigation prepends exactly one
// /{locale}; the mock reproduces that so the rendered href is the final
// user-visible URL and a double prefix would be caught below.
vi.mock("@/lib/i18n/navigation", () => ({
  Link: ({ href, children }: { href: string; children: ReactNode }) =>
    createElement("a", { href: `/${h.locale}${href}` }, children),
}));

const { AuthLegalNotice } = await import("@/components/app/auth-legal-notice");

const renderNotice = (locale: string, variant: "signup" | "googleLogin") => {
  h.locale = locale;
  return renderToStaticMarkup(
    createElement(Fragment, {}, createElement(AuthLegalNotice, { variant })),
  );
};

const anchorsOf = (html: string): Array<{ href: string; text: string }> =>
  [...html.matchAll(/<a[^>]*href="([^"]*)"[^>]*>(.*?)<\/a>/g)].map((m) => ({
    href: m[1],
    text: m[2].replace(/<[^>]+>/g, "").trim(),
  }));

// ---------------------------------------------------------------------------
// 1 + 2: copy exists per locale and renders to two working, accessible links
// ---------------------------------------------------------------------------

describe("auth.legalNotice copy exists in every active locale", () => {
  for (const loc of ACTIVE_LOCALES) {
    it(`${loc}: signup/googleLogin/controller present, controller named, tags well-formed`, () => {
      const n = noticeOf(loc);
      for (const key of ["signup", "googleLogin", "controller"] as const) {
        expect(n[key]?.trim().length ?? 0, `${loc}.${key} empty`).toBeGreaterThan(20);
      }
      expect(n.controller).toContain("Nonstop Group");
      for (const key of ["signup", "googleLogin"] as const) {
        expect(n[key].match(/<terms>[^<]+<\/terms>/g)?.length).toBe(1);
        expect(n[key].match(/<privacy>[^<]+<\/privacy>/g)?.length).toBe(1);
      }
    });
  }

  it("locales are really translated (not copies of EN)", () => {
    const en = noticeOf("en");
    for (const loc of ACTIVE_LOCALES) {
      if (loc === "en") continue;
      expect(noticeOf(loc).signup).not.toBe(en.signup);
      expect(noticeOf(loc).controller).not.toBe(en.controller);
    }
  });

  it("privacy acknowledgement is never framed as GDPR consent", () => {
    const banned: Record<string, RegExp> = {
      lt: /sutinku su privatumo/i,
      en: /(agree|consent) to the privacy/i,
      ru: /соглаша\S* с политикой конфиденциальности/i,
      nl: /akkoord met het privacybeleid/i,
      de: /stimme der datenschutzerkl/i,
    };
    for (const loc of ACTIVE_LOCALES) {
      const n = noticeOf(loc);
      for (const key of ["signup", "googleLogin", "controller"] as const) {
        expect(n[key], `${loc}.${key} frames privacy as consent`).not.toMatch(banned[loc]);
      }
    }
  });
});

describe("rendered notice: two separate working links, one locale prefix", () => {
  for (const loc of ACTIVE_LOCALES) {
    for (const variant of ["signup", "googleLogin"] as const) {
      it(`${loc}/${variant}: terms + privacy links, no double prefix, controller line`, () => {
        const html = renderNotice(loc, variant);
        expect(html).not.toContain("MISSING:");
        const anchors = anchorsOf(html);
        expect(anchors.map((a) => a.href)).toEqual([
          `/${loc}/legal/terms`,
          `/${loc}/legal/privacy`,
        ]);
        for (const a of anchors) {
          expect(a.text.length, "accessible link name").toBeGreaterThan(3);
          expect(a.href).not.toContain(`/${loc}/${loc}/`);
        }
        expect(anchors[0].text).not.toBe(anchors[1].text);
        expect(html).toContain("Nonstop Group");
      });
    }
  }
});

// ---------------------------------------------------------------------------
// 3: placement — notice precedes every account-creating action
// ---------------------------------------------------------------------------

describe("notice placement in the real forms", () => {
  const signupSrc = read("components/app/signup-form.tsx");
  const loginSrc = read("components/app/login-form.tsx");

  it("signup form: notice before the Google button AND again before submit", () => {
    const notices = [...signupSrc.matchAll(/<AuthLegalNotice variant="signup"/g)].map(
      (m) => m.index ?? -1,
    );
    expect(notices).toHaveLength(2);
    const google = signupSrc.indexOf("<GoogleButton");
    const submit = signupSrc.indexOf('type="submit"');
    expect(google).toBeGreaterThan(-1);
    expect(submit).toBeGreaterThan(-1);
    expect(notices[0]).toBeLessThan(google);
    expect(notices[1]).toBeGreaterThan(google);
    expect(notices[1]).toBeLessThan(submit);
  });

  it("login form: googleLogin notice before its account-creating Google button", () => {
    const notice = loginSrc.indexOf('<AuthLegalNotice variant="googleLogin"');
    const google = loginSrc.indexOf("<GoogleButton");
    expect(notice).toBeGreaterThan(-1);
    expect(google).toBeGreaterThan(-1);
    expect(notice).toBeLessThan(google);
  });

  it("notice links go through the locale-aware navigation Link with bare paths", () => {
    const src = read("components/app/auth-legal-notice.tsx");
    expect(src).toContain('import { Link } from "@/lib/i18n/navigation"');
    expect(src).toContain('href="/legal/terms"');
    expect(src).toContain('href="/legal/privacy"');
    // A hardcoded locale in the href would double-prefix once Link adds its own.
    expect(src).not.toMatch(/href="\/(lt|en|ru|nl|de)\//);
  });
});

// ---------------------------------------------------------------------------
// 4: no checkbox, no marketing consent control on the signup paths
// ---------------------------------------------------------------------------

describe("no consent checkbox / no marketing consent on signup paths", () => {
  const files = [
    "components/app/auth-legal-notice.tsx",
    "components/app/signup-form.tsx",
    "components/app/login-form.tsx",
    "components/app/google-button.tsx",
  ];
  for (const f of files) {
    it(`${f}: no checkbox, nothing pre-checked, no marketing consent field`, () => {
      const src = read(f);
      expect(src).not.toMatch(/type="checkbox"/);
      expect(src).not.toMatch(/defaultChecked|\bchecked=\{true\}/);
      expect(src).not.toMatch(/marketingConsent|newsletterOptIn/i);
    });
  }
});

// ---------------------------------------------------------------------------
// 5: the linked legal routes actually exist for every routed locale
// ---------------------------------------------------------------------------

describe("linked legal routes exist (single [locale] segment — all routed locales)", () => {
  it("terms + privacy pages exist under app/[locale]/(marketing)/legal", () => {
    for (const page of ["terms", "privacy"]) {
      expect(
        existsSync(join(web, "app", "[locale]", "(marketing)", "legal", page, "page.tsx")),
        `${page} page missing`,
      ).toBe(true);
    }
  });

  it("active locales in this guard match lib/i18n/config activeLocales", () => {
    const cfg = read("lib/i18n/config.ts");
    const m = cfg.match(/activeLocales[^=]*=\s*\[([^\]]+)\]/);
    expect(m, "activeLocales not found").toBeTruthy();
    const cfgLocales = [...m![1].matchAll(/"(\w+)"/g)].map((x) => x[1]).sort();
    expect(cfgLocales).toEqual([...ACTIVE_LOCALES].sort());
  });
});
