import type { Metadata } from "next";
import { Bricolage_Grotesque, Inter, JetBrains_Mono } from "next/font/google";
import { hasLocale, NextIntlClientProvider } from "next-intl";
import { setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { routing } from "@/lib/i18n/routing";
import { CANONICAL_ORIGIN } from "@/lib/domain/canonical";
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

export const metadata: Metadata = {
  metadataBase: new URL(CANONICAL_ORIGIN),
  title: "labourmarket.ai — the living labour market",
  description:
    "A real-time, two-sided labour-market platform connecting workers, companies and agencies.",
  alternates: {
    canonical: "/",
  },
};

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
        <NextIntlClientProvider>{children}</NextIntlClientProvider>
      </body>
    </html>
  );
}
