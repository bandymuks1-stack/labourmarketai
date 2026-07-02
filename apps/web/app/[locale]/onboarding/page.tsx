import { redirect } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { AmbientGlow } from "@/components/decor/ambient-glow";
import { OnboardingWizard } from "@/components/app/onboarding-wizard";
import { SessionTelemetry } from "@/components/app/session-telemetry";
import { Link } from "@/lib/i18n/navigation";
import { createClient } from "@/lib/supabase/server";
import { listMyPendingWorkerInvitations } from "@/lib/worker/invitations";

/** Unified onboarding shell. Role is picked here (Step 1), so we no longer
 *  pre-read active_role. Display name is prefilled from the auth identity:
 *  Google's full_name > name > the email's local part. */
export default async function OnboardingPage({
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

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, onboarded_at")
    .eq("id", user.id)
    .single();

  // Already onboarded — a direct visit shouldn't show the form again.
  if (profile?.onboarded_at) redirect(`/${locale}/dashboard`);

  // Slice 10 — an invited-but-not-yet-onboarded user lands here; surface the
  // real pending invitation so they aren't confused by a bare role-start screen.
  const pendingInvites = await listMyPendingWorkerInvitations();
  const tOnboard = await getTranslations("auth.onboarding");

  const meta = (user.user_metadata ?? {}) as Record<string, unknown>;
  const metaFullName =
    typeof meta.full_name === "string" ? meta.full_name : "";
  const metaName = typeof meta.name === "string" ? meta.name : "";
  const emailLocal = user.email ? user.email.split("@")[0] : "";
  const defaultName =
    [profile?.full_name, metaFullName, metaName, emailLocal]
      .map((v) => (v ?? "").trim())
      .find((v) => v.length > 0) ?? "";

  return (
    <div className="relative min-h-screen">
      {/* New users reach onboarding BEFORE any dashboard layout mounts —
          without this, login_succeeded fires after onboarding_started
          (funnel order inversion) and onboarding drop-offs count as
          "never logged in" (audit F-T4). Dedup key prevents double-fire
          once the user later reaches the dashboard in the same tab. */}
      <SessionTelemetry />
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
        {pendingInvites.length > 0 && (
          <div
            className="card-border mb-4 bg-brand-blue/5 p-4"
            data-testid="onboarding-pending-invite"
          >
            <p className="text-sm leading-relaxed text-text-secondary">
              {tOnboard("pendingInviteNote", { org: pendingInvites[0].orgName })}
            </p>
          </div>
        )}
        <OnboardingWizard defaultName={defaultName} />
      </main>
    </div>
  );
}
