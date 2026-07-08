import { redirect } from "next/navigation";
import { setRequestLocale } from "next-intl/server";

import { createClient } from "@/lib/supabase/server";
import { PremiumHubScreen } from "@/components/app/premium-hub/premium-hub-screen";
import { getPremiumHubViewModel } from "@/components/app/premium-hub/premium-hub-data";

// Authenticated per-user surface — never served from a stale cache, or a logged-in
// user could see another render's data.
export const dynamic = "force-dynamic";

/**
 * Premium Hub — a canonical premium dashboard surface backed by REAL RLS-scoped
 * data. Lives under /dashboard, which middleware gates; the explicit getUser
 * check mirrors the other dashboard rooms (belt-and-suspenders). The view model
 * (premium-hub-data.ts) reads only the caller's own data via existing helpers —
 * no fixtures. See docs/launch/premium-hub-screen-data-bindings.md.
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

  const vm = await getPremiumHubViewModel();
  return <PremiumHubScreen vm={vm} />;
}
