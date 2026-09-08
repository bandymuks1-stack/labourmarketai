import type { Metadata, Viewport } from "next";
import { Bricolage_Grotesque, Inter, JetBrains_Mono } from "next/font/google";
import { hasLocale, NextIntlClientProvider } from "next-intl";
import { getMessages, setRequestLocale } from "next-intl/server";
import {
  BASE_CLIENT_MESSAGE_ROOTS,
  pickMessages,
} from "@/lib/i18n/client-messages";
import { notFound } from "next/navigation";
import { routing } from "@/lib/i18n/routing";
import { ThemeReapply } from "@/components/app/theme-reapply";
import { MARKETING_ORIGIN } from "@/lib/domain/canonical";
import { BRAND_NAME, BRAND_SEO, resolveActiveLocale } from "@/lib/seo/metadata";
import "../globals.css";

// TASK 07 typography lock (owner, 2026-06-11): Bricolage Grotesque carries
// display/headings/cards, JetBrains Mono carries numbers/labels, Inter stays
// body. Pure token swap — components keep font-display/font-sans/font-mono.
// latin-ext is REQUIRED: LT diacritics (ąčęėįšųūž) live outside base latin.
//
// Cyrillic (RU locale, 2026-06-12): Bricolage Grotesque ships NO cyrillic
// subset (Google Fonts: latin/latin-ext/vietnamese only), so display-role
// Cyrillic glyphs fall through the stack to Inter — the explicit fallback
// declared in tokens/typography.ts. `adjustFontFallback: false` is REQUIRED
// for that: next/font's synthetic "Bricolage Grotesque Fallback" (Arial-
// based) carries Cyrillic glyphs and would silently swallow them before
// Inter otherwise. Inter + JetBrains Mono load the cyrillic subset so RU
// never renders in a random system face.
const display = Bricolage_Grotesque({
  subsets: ["latin", "latin-ext"],
  variable: "--font-display",
  adjustFontFallback: false,
});
const sans = Inter({
  subsets: ["latin", "latin-ext", "cyrillic", "cyrillic-ext"],
  variable: "--font-sans",
});
const mono = JetBrains_Mono({
  subsets: ["latin", "latin-ext", "cyrillic"],
  variable: "--font-mono",
});

// Brand SEO defaults for the whole locale subtree. Per-page canonical +
// hreflang are intentionally NOT set here — pages set those via
// buildPageMetadata() so a subpage never inherits the homepage's canonical
// (which would deindex it). The apex (labourmarket.ai) is the metadataBase
// so every relative/OG URL resolves to the public marketing surface.
// PWA baseline (audit PR9): browser-chrome theme color follows the ink-900
// page token in both schemes (app/globals.css); viewport-fit=cover lets the
// bottom nav honour iOS safe-area insets it already pads for.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#06070D" },
    { media: "(prefers-color-scheme: light)", color: "#F4F6FB" },
  ],
};

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const active = resolveActiveLocale(locale);
  const brand = BRAND_SEO[active];
  return {
    metadataBase: new URL(MARKETING_ORIGIN),
    title: brand.title,
    description: brand.description,
    applicationName: BRAND_NAME,
    // iOS add-to-home-screen metadata (audit PR9). No offline claim — just
    // honest install chrome matching the manifest.
    appleWebApp: {
      capable: true,
      title: BRAND_NAME,
      statusBarStyle: "black-translucent",
    },
    robots: { index: true, follow: true },
    openGraph: {
      type: "website",
      siteName: BRAND_NAME,
      title: brand.title,
      description: brand.description,
    },
    twitter: {
      card: "summary_large_image",
      title: brand.title,
      description: brand.description,
    },
  };
}

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

/**
 * P2-1 (2026-09-03): a request like `/foo.xml` or `/old-file.json` skips the
 * i18n middleware (its matcher excludes dotted paths) and reaches this
 * segment with `locale = "foo.xml"`. The layout rejects it with notFound()
 * below, but Next renders layout and page CONCURRENTLY, and the landing page
 * throws `RangeError: Incorrect locale information provided` from
 * Intl.NumberFormat first — a 500 for every unknown apex path with an
 * extension (reproduced on the local production build). With
 * `dynamicParams = false` the router answers 404 for any locale outside
 * generateStaticParams() BEFORE rendering anything, so the frozen landing
 * file is never touched and the root not-found (#1445) serves the reply.
 * Locales are a closed set — nothing an active locale could do is narrowed.
 */
export const dynamicParams = false;

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) {
    notFound();
  }
  setRequestLocale(locale);

  return (
    <html
      lang={locale}
      className={`${display.variable} ${sans.variable} ${mono.variable}`}
      suppressHydrationWarning
    >
      <head>
        {/* No-flash theme bootstrap: resolve the theme before paint so the
            light↔dark token swap never flickers. LIGHT is the product default
            (`:root`), so the attribute is always stamped to a definite value —
            every reader (toggles, ThemeReapply, tests) sees one truth. */}
        <script
          dangerouslySetInnerHTML={{
            __html:
              "(function(){try{var s=localStorage.getItem('theme');var t=s==='dark'?'dark':'light';document.documentElement.dataset.theme=t;}catch(e){document.documentElement.dataset.theme='light';}})();",
          }}
        />
      </head>
      <body>
        {/* Locale-theme continuity (area D): a locale switch re-renders
            <html lang> and React strips the bootstrap's data-theme — this
            watcher restores the saved theme before the next paint. */}
        <ThemeReapply />
        {/* Performance Reality Audit v1+v2: v1 replaced the FULL runtime
            message tree (~440 KB minified serialized into EVERY page's RSC
            flight payload) with the union client allowlist. v2 moves the
            per-surface picks into the route-group layouts ((marketing),
            auth, onboarding, dashboard, design) — a nested provider
            REPLACES `messages` for its subtree — so the root ships only
            what renders OUTSIDE every group provider: the [locale] error
            boundary (~0.1 KB). getTranslations on the server keeps the
            full tree. Guard: lib/guards/client-messages-allowlist.test.ts. */}
        <NextIntlClientProvider
          messages={pickMessages(
            await getMessages(),
            BASE_CLIENT_MESSAGE_ROOTS,
          )}
        >
          {children}
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
