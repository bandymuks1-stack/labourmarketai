import { NextIntlClientProvider } from "next-intl";
import { getMessages, setRequestLocale } from "next-intl/server";
import { AmbientGlow } from "@/components/decor/ambient-glow";
import { Link } from "@/lib/i18n/navigation";
import {
  AUTH_CLIENT_MESSAGE_ROOTS,
  pickMessages,
} from "@/lib/i18n/client-messages";

/** Minimal chrome for auth flows (no marketing nav/footer). Centered panel
 *  on the page-ambient glow background.
 *
 *  Performance Reality Audit v2: the provider REPLACES the root layout's
 *  minimal message context with the auth pick (~28 KB) — the union client
 *  pick (~300 KB serialized) no longer ships on auth pages. Re-derived from
 *  this tree's import graph by client-messages-allowlist.test.ts. */
export default async function AuthLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  return (
    <NextIntlClientProvider
      messages={pickMessages(await getMessages(), AUTH_CLIENT_MESSAGE_ROOTS)}
    >
      <div className="relative min-h-screen">
        <AmbientGlow />
        <header className="relative z-10 mx-auto max-w-container px-6 py-6 sm:px-12">
          <Link
            href="/"
            className="font-display text-lg font-bold tracking-tightest text-text-primary"
          >
            LabourMarket<span className="text-gradient-accent">.ai</span>
          </Link>
        </header>
        <main className="relative z-10 mx-auto flex max-w-md flex-col px-6 pb-20">
          {children}
        </main>
      </div>
    </NextIntlClientProvider>
  );
}
