import type { Metadata, Viewport } from "next";
import { Bricolage_Grotesque, Inter, JetBrains_Mono } from "next/font/google";
import { hasLocale, NextIntlClientProvider } from "next-intl";
import { getMessages, setRequestLocale } from "next-intl/server";
import { pickClientMessages } from "@/lib/i18n/client-messages";
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
        {/* No-flash theme bootstrap: apply the saved theme before paint so the
            dark↔light token swap never flickers. Default is dark (:root). */}
        <script
          dangerouslySetInnerHTML={{
            __html:
              "(function(){try{var t=localStorage.getItem('theme');if(t==='light'||t==='dark'){document.documentElement.dataset.theme=t;}}catch(e){}})();",
          }}
        />
      </head>
      <body>
        {/* Locale-theme continuity (area D): a locale switch re-renders
            <html lang> and React strips the bootstrap's data-theme — this
            watcher restores the saved theme before the next paint. */}
        <ThemeReapply />
        {/* Performance Reality Audit v1: the provider previously inherited
            the FULL runtime message tree (~440 KB minified), serializing
            every namespace — server-only ones included — into the RSC
            flight payload of EVERY page. Client components can only reach
            the allowlisted roots (guard-derived from source), so only that
            subset ships; getTranslations on the server keeps the full tree. */}
        <NextIntlClientProvider messages={pickClientMessages(await getMessages())}>
          {children}
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
