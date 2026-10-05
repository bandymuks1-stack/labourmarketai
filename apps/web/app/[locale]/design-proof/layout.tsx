import type { ReactNode } from "react";
import { NextIntlClientProvider } from "next-intl";
import { getMessages, setRequestLocale } from "next-intl/server";

import { pickClientMessages } from "@/lib/i18n/client-messages";

/**
 * The design-proof tree renders REAL components (the four-region home, the
 * identity family, the shell) that can reach whole-tree client
 * `useTranslations()` consumers, so — like the dashboard — it ships the FULL
 * client pick. It is development evidence only: the page 404s in production
 * (`design-proof-not-in-production.test.ts`).
 */
export default async function DesignProofLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <NextIntlClientProvider messages={pickClientMessages(await getMessages())}>{children}</NextIntlClientProvider>;
}
