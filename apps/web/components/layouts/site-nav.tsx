import { getLocale, getTranslations } from "next-intl/server";
import { Link } from "@/lib/i18n/navigation";
import { buttonLinkClassName } from "@/components/ui/Button";
import { AuthCtaLink } from "@/components/layouts/auth-cta-link";
import { NavAuthCtas } from "@/components/layouts/nav-auth-ctas";
import { MobileNavMenu } from "@/components/layouts/mobile-nav-menu";
import { IntentMegaMenu } from "@/components/layouts/intent-mega-menu";
import type { RenderedIntent } from "@/components/layouts/intent-icons";
import { ASSISTANT_HREF, PUBLIC_INTENTS } from "@/lib/navigation/public-intents";
import { INSTITUTION_DOOR_NEXT } from "@/lib/marketing/public-doors";
import { LocaleSwitcher } from "@/components/marketing/locale-switcher";
import { ThemeToggleIcon } from "@/components/ui/theme-toggle-icon";
import { LmLogo } from "@/components/ui/lm-logo";
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
    | "market"
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
//
// ── THE THREE AUDIENCE ITEMS LEFT THE BAR (owner window 11 §16) ────────────
//
// `Darbuotojams · Įmonėms · Agentūroms` sat in the primary navigation and, with
// `Darbo skelbimai` beside them, told every visitor the same thing before they
// read a word of the page: *this is a job board, and you are one of three kinds
// of person.* That is the §16 misreading and the §20 identity trap, stated by
// the navigation itself.
//
// NOTHING BECAME UNREACHABLE, which is the condition the owner set. The three
// pages keep two real paths, and both name the audience:
//   · the FOOTER already links all three plus `/jobs` (site-footer.tsx);
//   · the STARTING CONTEXTS section links each one by name, in the place where
//     a person is actually deciding where to begin.
//
// `Darbo skelbimai` STAYS in the bar. It is not a role — it is the public board
// over the live imported vacancies, the highest-intent destination on the
// marketing site, and the only internal path a crawler has to it.
//
// `Rinka` is new and points at the market map section — the landing's answer to
// "where does this work?" (§17).
const ALL_LINKS: readonly NavLink[] = [
  { key: "jobs", href: "/jobs", visibility: "always" },
  { key: "market", href: "/#market", visibility: "always" },
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

/**
 * `goalsOnPage` — the landing shows the six goals as cards on its first
 * screen, so its header bar does not repeat them (owner gate 2026-11-12: no
 * duplicated main menu on one screen). The bar keeps "More" and the assistant
 * there; on every inner page it carries the six goals.
 */
export async function SiteNav({
  goalsOnPage = false,
}: { goalsOnPage?: boolean } = {}) {
  const t = await getTranslations("nav");
  // "My space" already exists as the dashboard's own tab label; reusing it keeps
  // the frozen `nav` namespace untouched.
  const tSpace = await getTranslations("auth.dashboard.tabs");
  const locale = await getLocale();
  const links = visibleLinks();
  // Premium navigation (owner P0 2026-11-12): the six intents, labels resolved
  // HERE so the desktop mega-menu and the mobile menu render ONE list. The
  // strings live in their own `siteNav` namespace — `nav` is frozen with the
  // landing (lib/guards/landing-freeze.ts).
  const tIntent = await getTranslations("siteNav");
  const intents: RenderedIntent[] = PUBLIC_INTENTS.map((intent) => ({
    id: intent.id,
    iconKey: intent.iconKey,
    title: tIntent(`intents.${intent.id}.title`),
    short: tIntent(`intents.${intent.id}.short`),
    description: tIntent(`intents.${intent.id}.description`),
    links: intent.links.map((link) => ({
      id: link.id,
      href: link.href,
      label: tIntent(`links.${link.id}`),
      account: link.account,
    })),
  }));
  // "Ask the assistant" — the existing conversation home (`/dashboard` IS the
  // chat). A signed-out visitor is sent to login and lands back in it.
  const assistant = { href: ASSISTANT_HREF, label: tIntent("assistant") };

  // ONE definition, rendered in exactly one place at any given width: in the
  // header from `sm` up, inside the disclosure below it. Sharing the fragment
  // is what keeps the two mounts from drifting into different destinations.
  // Each destination is defined ONCE and placed where the width allows:
  //   every width  — Sign in (or, signed in, "My space") in the header row;
  //   from `sm`    — Sign up beside it;
  //   below `sm`   — Sign up is the first thing in the menu.
  // Owner fix list 2026-11-12: on a phone neither was visible in the header.
  const loginCta = (
    <AuthCtaLink
      relPath={`/${locale}/auth/login`}
      className="flex min-h-11 items-center whitespace-nowrap rounded-control px-1 text-sm font-medium text-text-primary transition-colors hover:text-brand-blue sm:px-0 sm:font-normal sm:text-text-secondary sm:hover:text-text-primary"
    >
      {t("login")}
    </AuthCtaLink>
  );
  const signupCta = (
    <AuthCtaLink
      relPath={`/${locale}/auth/signup`}
      className={buttonLinkClassName("primary", "sm")}
    >
      {/* Named for what it does (owner 2026-11-12): "Start now" did not say
          that it creates an account. */}
      {tIntent("signUp")}
    </AuthCtaLink>
  );
  const memberCta = (
    <AuthCtaLink
      relPath={`/${locale}/dashboard`}
      className={buttonLinkClassName("primary", "sm")}
    >
      {tSpace("overview")}
    </AuthCtaLink>
  );
  // Behind "More" and in the phone menu: the older links, then the one door
  // for schools, colleges and universities (owner P0 2026-11-13: they can
  // register but had no entry). It opens the existing institution setup —
  // sign-in first for a visitor — until the audience page exists; it is not
  // a seventh goal.
  const moreLinks = [
    ...links.map((l) => ({ key: l.key as string, href: l.href, label: t(l.key) })),
    { key: "education", href: INSTITUTION_DOOR_NEXT, label: tIntent("education") },
  ];
  // ONE goal bar element, placed by the page: the header's second row on
  // inner pages; on the landing (no goals in it) it sits in the first row.
  const megaMenu = (
    <IntentMegaMenu
      className="hidden lg:block"
      intents={intents}
      goalsOnPage={goalsOnPage}
      navLabel={tIntent("trigger")}
      accountLabel={tIntent("account")}
      assistant={assistant}
      more={{
        label: tIntent("more"),
        links: moreLinks,
      }}
    />
  );
  const themeLabels = { toDark: t("themeToDark"), toLight: t("themeToLight") };

  return (
    <header className="relative z-20 border-b border-ink-600/60">
      {/* ONE NAVIGATION (owner fix list 2026-11-12): the row below carries the
          brand and the account controls only; the six goals are the one
          navigation bar, and the older links (jobs, market, how it works,
          pricing, about) sit behind its "More" and in the footer. */}
      {/* Beta foundation audit M1 (measured 2026-08-08): at 320px this row's
          contents were 545px wide, and `html { overflow-x: hidden }` CLIPPED
          the excess rather than scrolling it — so the theme toggle and the
          locale switcher were already off-screen on a phone before this PR
          added anything. The mobile gap/padding are tightened here (same
          pattern the dashboard header already uses) and the auth CTAs move
          into the disclosure below `sm`, which is what buys the room. */}
      <div className="mx-auto flex max-w-container items-center gap-2 px-3 py-3 sm:gap-6 sm:px-12 sm:py-4">
        <Link
          href="/"
          className="flex shrink-0 items-center gap-1.5 font-display text-sm font-bold tracking-tightest text-text-primary sm:gap-2 sm:text-lg"
        >
          {/* The mark is decorative here — the wordmark beside it already
              names the product, so announcing both would read it twice. */}
          <LmLogo title="" className="h-6 w-auto shrink-0 sm:h-7" />
          {/* NEVER A CUT BRAND (measured 2026-10-28): at 375px the wordmark
              was 3px too wide and rendered "LabourMarket…". The 6px gap below
              `sm` and the compact locale switcher without its arrow give it
              room from 360px up (124/124px measured); under 360px there is no
              room beside the three header controls, so only the mark shows and
              the name stays for screen readers. */}
          {/* THE NAME IS NEVER CUT (owner fix list 2026-11-12): the wordmark
              is whole at every width from 360px — it does not shrink or
              truncate; the controls beside it were made to fit instead (theme
              toggle in the menu below `sm`, a compact language chip). Under
              360px only the mark shows and the name stays for screen readers. */}
          <span className="whitespace-nowrap max-[359px]:sr-only">
            LabourMarket<span className="text-gradient-accent">.ai</span>
          </span>
        </Link>

        {goalsOnPage && megaMenu}

        <div className="ml-auto flex shrink-0 items-center gap-2 sm:gap-3 md:gap-4">
          {/* Auth CTAs pin to the app origin on marketing hosts so OAuth's
              PKCE round-trip stays same-origin (see AuthCtaLink). Sign in is
              in this row at every width; Sign up joins it from `sm` and is the
              first thing in the menu below that. */}
          <div className="flex items-center gap-2 sm:gap-4" data-testid="header-auth">
            <NavAuthCtas
              guest={
                <>
                  {loginCta}
                  <span className="hidden sm:inline-flex">{signupCta}</span>
                </>
              }
              member={memberCta}
            />
          </div>
          {/* The theme toggle is in the header from `sm` up and inside the
              menu below it (owner fix list 2026-11-12: on a 360px phone it
              took the slot Sign in needs). Still one tap away at every width. */}
          <span className="hidden sm:inline-flex">
            <ThemeToggleIcon labels={themeLabels} />
          </span>
          <LocaleSwitcher className="flex" compactBelowSm />
          {/* Beta foundation audit M1: below lg the primary links above are
              display:none, which used to leave a phone visitor with NO path to
              any marketing page from the header. The disclosure menu carries
              the SAME link list (incl. the vision gate) — the list is built
              here so this server component stays the single source of truth. */}
          <MobileNavMenu
            className="lg:hidden"
            items={moreLinks}
            openLabel={t("menuOpen")}
            closeLabel={t("menuClose")}
            intents={intents}
            accountLabel={tIntent("account")}
            assistant={assistant}
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
                className="mb-1.5 flex flex-wrap items-center justify-between gap-2 border-b border-ink-600 px-3 pb-3 pt-1.5 sm:hidden"
              >
                <NavAuthCtas guest={signupCta} member={null} />
                <ThemeToggleIcon labels={themeLabels} testId="menu-theme-toggle" />
              </div>
            }
          />
        </div>
      </div>
      {/* THE INTENT BAR (owner P0 2026-11-12): the six intents are the first
          level of the header from `lg` up — six plainly named choices, always
          visible, each two actions from the start of its function. Below `lg`
          the same six open the menu above. The panel anchors to the <header>
          (the nearest positioned box), so it spans the full width. */}
      {!goalsOnPage && megaMenu}
    </header>
  );
}
