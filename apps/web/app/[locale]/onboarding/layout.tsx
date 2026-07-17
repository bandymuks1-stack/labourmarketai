import { NextIntlClientProvider } from "next-intl";
import { getMessages, setRequestLocale } from "next-intl/server";
import {
  AUTH_CLIENT_MESSAGE_ROOTS,
  pickMessages,
} from "@/lib/i18n/client-messages";

/** Performance Reality Audit v2 (route-group provider subsetting): the
 *  onboarding tree's client components (OnboardingWizard) reach only the
 *  `auth` namespace, so this provider REPLACES the root layout's minimal
 *  message context with the auth pick (~28 KB) instead of the union client
 *  pick (~300 KB serialized). Purely a message-scope wrapper — no chrome,
 *  no layout change. Re-derived from this tree's import graph by
 *  lib/guards/client-messages-allowlist.test.ts on every CI run. */
export default async function OnboardingLayout({
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
      {children}
    </NextIntlClientProvider>
  );
}
