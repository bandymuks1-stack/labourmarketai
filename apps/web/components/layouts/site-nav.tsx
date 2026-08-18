import { getLocale, getTranslations } from "next-intl/server";
import { Link } from "@/lib/i18n/navigation";
import { buttonLinkClassName } from "@/components/ui/Button";
import { AuthCtaLink } from "@/components/layouts/auth-cta-link";
import { MobileNavMenu } from "@/components/layouts/mobile-nav-menu";
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
    | "jobs"
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
  // FIRST, deliberately. `/jobs` is the public board over 39,241 live imported
  // vacancies and the highest-intent destination on the marketing site — a
  // visitor looking for work wants the ads, not an audience page about them.
  // It shipped with NO link from anywhere: the only route in was the card on
  // the board itself, so a person landing on the homepage could not reach it
  // at all and a crawler had no internal path to it either.
  { key: "jobs", href: "/jobs", visibility: "always" },
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

  // ONE definition, rendered in exactly one place at any given width: in the
  // header from `sm` up, inside the disclosure below it. Sharing the fragment
  // is what keeps the two mounts from drifting into different destinations.
  const authCtas = (
    <>
      <AuthCtaLink
        relPath={`/${locale}/auth/login`}
        className="flex min-h-11 items-center text-sm text-text-secondary transition-colors hover:text-text-primary sm:min-h-0"
      >
        {t("login")}
      </AuthCtaLink>
      <AuthCtaLink
        relPath={`/${locale}/auth/signup`}
        className={buttonLinkClassName("primary", "sm")}
      >
        {t("startNow")}
      </AuthCtaLink>
    </>
  );

  return (
    <header className="relative z-20 border-b border-ink-600/60">
      {/* Beta foundation audit M1 (measured 2026-08-08): at 320px this row's
          contents were 545px wide, and `html { overflow-x: hidden }` CLIPPED
          the excess rather than scrolling it — so the theme toggle and the
          locale switcher were already off-screen on a phone before this PR
          added anything. The mobile gap/padding are tightened here (same
          pattern the dashboard header already uses) and the auth CTAs move
          into the disclosure below `sm`, which is what buys the room. */}
      <div className="mx-auto flex max-w-container items-center gap-2 px-4 py-4 sm:gap-6 sm:px-12">
        <Link
          href="/"
          className="min-w-0 shrink truncate font-display text-base font-bold tracking-tightest text-text-primary sm:text-lg"
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

        <div className="ml-auto flex shrink-0 items-center gap-2 sm:gap-3 md:gap-4">
          {/* Auth CTAs pin to the app origin on marketing hosts so OAuth's
              PKCE round-trip stays same-origin (see AuthCtaLink).

              Below `sm` they render inside the disclosure instead (same two
              links, one tap away) — see `authCtas` and the measurement note
              on the row above. Keeping them here at every width is what made
              the header 545px wide on a 320px screen. */}
          <div className="hidden items-center gap-3 sm:flex sm:gap-4">{authCtas}</div>
          {/* F1: the public header must always offer the theme toggle —
              visible on every viewport, never folded into the mobile menu. */}
          <ThemeToggleIcon
            labels={{ toDark: t("themeToDark"), toLight: t("themeToLight") }}
          />
          {/* Pre-Advertising Launch Readiness v1: the language switcher must
              be reachable on mobile too. A LT/PL/RU worker arriving from a paid
              ad on the wrong locale had no way to change language below 640px.
              Stays visible on every viewport, never folded into the mobile
              menu. */}
          <LocaleSwitcher className="flex" compactBelowSm />
          {/* Beta foundation audit M1: below lg the primary links above are
              display:none, which used to leave a phone visitor with NO path to
              any marketing page from the header. The disclosure menu carries
              the SAME link list (incl. the vision gate) — the list is built
              here so this server component stays the single source of truth. */}
          <MobileNavMenu
            className="lg:hidden"
            items={links.map((l) => ({ key: l.key, href: l.href, label: t(l.key) }))}
            openLabel={t("menuOpen")}
            closeLabel={t("menuClose")}
            // Below `sm` the panel also carries the auth CTAs the header row
            // cannot fit; from `sm` up the whole section is display:none and
            // the header renders them instead. `sm:hidden` sits on the
            // SECTION, not inside it — on an inner wrapper it left an empty
            // bordered strip in the panel at 768px.
            //
            // The `key` is REQUIRED even though this is a lone slot prop, not
            // a list: MobileNavMenu renders it in a static-children array
            // beside {items.map(...)}, and the dev JSX runtime cannot mark a
            // Flight-deserialized element as validated (`_store.validated` is
            // non-writable once an element has crossed the server→client
            // boundary), so React demands a key. Without it every public page
            // logged a "unique key prop" warning.
            authSection={
              <div
                key="mobile-nav-auth"
                data-testid="mobile-nav-auth"
                className="mt-1.5 flex flex-col items-start gap-2 border-t border-ink-600 px-3 pb-1 pt-3 sm:hidden"
              >
                {authCtas}
              </div>
            }
          />
        </div>
      </div>
    </header>
  );
}
