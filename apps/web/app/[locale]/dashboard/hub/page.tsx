import { redirect } from "next/navigation";
import { setRequestLocale } from "next-intl/server";

import { createClient } from "@/lib/supabase/server";
import { PremiumHubScreen } from "@/components/app/premium-hub/premium-hub-screen";

/**
 * Premium Hub — a canonical premium dashboard surface (concept preview). Lives
 * under /dashboard, which middleware gates; the explicit getUser check mirrors
 * the other dashboard rooms (belt-and-suspenders). Renders stand-in preview data
 * only — no DB reads yet (see docs/launch/premium-hub-screen-data-bindings.md).
 */
export default async function PremiumHubPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/${locale}/auth/login`);

  return <PremiumHubScreen />;
}
