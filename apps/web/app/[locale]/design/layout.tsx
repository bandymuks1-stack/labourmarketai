import { NextIntlClientProvider } from "next-intl";
import { getMessages, setRequestLocale } from "next-intl/server";
import { pickClientMessages } from "@/lib/i18n/client-messages";

/** Performance Reality Audit v2 (route-group provider subsetting): the
 *  /design dev gallery renders dashboard client components — including the
 *  bottom nav's dynamic whole-tree `useTranslations()` — so it needs the
 *  FULL union client pick. The page is `notFound()` in production builds
 *  (PR15 hardening), so this weight is dev-only. Purely a message-scope
 *  wrapper — no chrome, no layout change. */
export default async function DesignLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  return (
    <NextIntlClientProvider messages={pickClientMessages(await getMessages())}>
      {children}
    </NextIntlClientProvider>
  );
}
