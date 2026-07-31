import { getLocale, getTranslations } from "next-intl/server";
import { Link } from "@/lib/i18n/navigation";
import { Button } from "@/components/ui/Button";
import { AuthCtaLink } from "@/components/layouts/auth-cta-link";
import { LocaleSwitcher } from "@/components/marketing/locale-switcher";
import { ThemeToggleIcon } from "@/components/ui/theme-toggle-icon";
import { isVisionPublic } from "@/lib/config/vision-publication";

// `/vision` is gated by `lib/config/vision-publication.ts`. While the
// flag is `false`, the route stays reachable by direct URL (so the
// owner can run the production smoke against it) but is NOT surfaced
// in the public site nav. The flip to `true` is a one-line
// owner-authored PR after smoke PASSES.
type LinkVisibility = "always" | "vision-gate";
type NavLink = {
  key:
    | "workers"
    | "companies"
    | "agencies"
    | "how"
    | "pricing"
    | "about"
    | "vision";
  href: string;
  visibility: LinkVisibility;
};

// Canonical public IA (nav/funnel consistency PR): every label names its
// real destination — audience pages by audience, Kainos, Apie. No template
// labels ("Solutions"/"Resources"/"Company") pointing at unrelated routes.
// PR-H global landing: "How it works" points at a REAL landing anchor
// (#how-it-works — now carried by <ProductChainBand>, which IS the
// how-it-works answer since the rebuild).
//
// "Partneriams" (`/#partners`) WAS REMOVED on 2026-07-31. Its target section
// left the landing with the rebuild — `audience-value-sections.tsx` is no
// longer rendered — so the item scrolled nowhere for every visitor who
// clicked it. Restoring the anchor would have meant inventing a partners
// section to justify a nav item; the audience it named already has a real
// page behind "Agentūroms" (/for-agencies). A nav item that goes nowhere is a
// dead CTA, and the shortest honest fix is to stop offering it.
const ALL_LINKS: readonly NavLink[] = [
  { key: "workers", href: "/for-workers", visibility: "always" },
  { key: "companies", href: "/for-companies", visibility: "always" },
  { key: "agencies", href: "/for-agencies", visibility: "always" },
  { key: "how", href: "/#how-it-works", visibility: "always" },
  { key: "pricing", href: "/pricing", visibility: "always" },
  { key: "about", href: "/about", visibility: "always" },
  { key: "vision", href: "/vision", visibility: "vision-gate" },
];

function visibleLinks(): readonly NavLink[] {
  return ALL_LINKS.filter((l) =>
    l.visibility === "always" ? true : isVisionPublic(),
  );
}

export async function SiteNav() {
  const t = await getTranslations("nav");
  const locale = await getLocale();
  const links = visibleLinks();

  return (
    <header className="relative z-20 border-b border-ink-600/60">
      <div className="mx-auto flex max-w-container items-center gap-6 px-6 py-4 sm:px-12">
        <Link
          href="/"
          className="font-display text-lg font-bold tracking-tightest text-text-primary"
        >
          LabourMarket<span className="text-gradient-accent">.ai</span>
        </Link>

        <nav className="hidden items-center gap-6 lg:flex">
          {links.map((l) => (
            <Link
              key={l.key}
              href={l.href}
              className="text-sm text-text-secondary transition-colors hover:text-text-primary"
            >
              {t(l.key)}
            </Link>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-3 sm:gap-4">
          {/* Auth CTAs pin to the app origin on marketing hosts so OAuth's
              PKCE round-trip stays same-origin (see AuthCtaLink). */}
          <AuthCtaLink
            relPath={`/${locale}/auth/login`}
            className="text-sm text-text-secondary transition-colors hover:text-text-primary"
          >
            {t("login")}
          </AuthCtaLink>
          <AuthCtaLink relPath={`/${locale}/auth/signup`}>
            <Button size="sm">{t("startNow")}</Button>
          </AuthCtaLink>
          {/* F1: the public header must always offer the theme toggle —
              visible on every viewport (mobile has no separate menu). */}
          <ThemeToggleIcon
            labels={{ toDark: t("themeToDark"), toLight: t("themeToLight") }}
          />
          {/* Pre-Advertising Launch Readiness v1: the language switcher must
              be reachable on mobile too. A LT/PL/RU worker arriving from a paid
              ad on the wrong locale had no way to change language below 640px
              (there is no mobile nav menu). Now visible on every viewport. */}
          <LocaleSwitcher className="flex" />
        </div>
      </div>
    </header>
  );
}
