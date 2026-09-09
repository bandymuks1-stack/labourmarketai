import { redirect } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { AmbientGlow } from "@/components/decor/ambient-glow";
import { LocaleSwitcher } from "@/components/marketing/locale-switcher";
import { OnboardingWizard } from "@/components/app/onboarding-wizard";
import { SessionTelemetry } from "@/components/app/session-telemetry";
import { Link } from "@/lib/i18n/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSafeReturnPath, isSafeReturnPath } from "@/lib/auth/redirect";
import { listMyPendingWorkerInvitations } from "@/lib/worker/invitations";
import { EDUCATION_TYPE_SLUGS } from "@/lib/worker/worker-education-model";
import { DOOR_WORDS_KEY, readLandingHandoff } from "@/lib/onboarding/landing-handoff";

/** Unified onboarding shell. Role is picked here (Step 1), so we no longer
 *  pre-read active_role. Display name is prefilled from the auth identity:
 *  Google's full_name > name > the email's local part. */
export default async function OnboardingPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ next?: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  // Deep-link continuity (core-network area B): the auth callback forwards
  // ?next= here so an invite link (or any protected destination) survives
  // first-time registration — onboarding completion returns to it.
  const { next } = await searchParams;
  const safeNext = isSafeReturnPath(next) ? (next as string) : null;
  // The landing sentence (`/dashboard?say=…` inside `next`) becomes the
  // wizard's DEFAULTS — the family the router read is pre-ticked and a
  // profession the sentence names is pre-chosen. Read on the server: the
  // recogniser's lexicon never ships in the wizard's client bundle.
  const handoff = readLandingHandoff(safeNext);
  // The landing DOOR (`/dashboard/start/company?capability=…` inside `next`)
  // ticks the card it routes to; its plain words — the button the person
  // pressed on the landing — are shown back from the landing catalogue,
  // resolved here so the wizard's client bundle keeps the auth allowlist.
  const tDoors = handoff.door.length > 0 ? await getTranslations("landing.cta") : null;
  const doorWords = tDoors
    ? handoff.door
        .map((intent) => DOOR_WORDS_KEY[intent])
        .filter((key): key is NonNullable<typeof key> => key !== undefined)
        .map((key) => tDoors(key))
        .join(" · ") || null
    : null;

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

  // Already onboarded — a direct visit shouldn't show the form again; an
  // attached safe ?next= still wins over the generic dashboard.
  if (profile?.onboarded_at) {
    redirect(getSafeReturnPath(safeNext, locale));
  }

  // Slice 10 — an invited-but-not-yet-onboarded user lands here; surface the
  // real pending invitation so they aren't confused by a bare role-start screen.
  const pendingInvites = await listMyPendingWorkerInvitations();
  const tOnboard = await getTranslations("auth.onboarding");
  // Student step (universal first-run router): the education-type registry
  // labels, resolved here on the server from the CV namespace so the wizard's
  // client bundle keeps the auth allowlist (no `cvSections` root shipped).
  const tEducationTypes = await getTranslations("cvSections.educationTypes");
  const educationTypeOptions = EDUCATION_TYPE_SLUGS.map((slug) => ({
    slug,
    label: tEducationTypes(slug),
  }));

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
          once the user later reaches the dashboard in the same tab.
          surface="onboarding": this is the ONE surface allowed to emit
          `signup_completed` from the pending marker — every genuinely new
          account passes through here first. */}
      <SessionTelemetry surface="onboarding" />
      <AmbientGlow />
      {/* V8 W4-B: language stays switchable DURING onboarding — the wizard
          writes profiles.locale from the URL locale at completion, so the
          person must be able to correct the language before that happens.
          (The layout is a pure message-scope wrapper; this page owns the
          chrome, so the switcher mounts here, mirroring the auth header.) */}
      <header className="relative z-10 mx-auto flex max-w-container items-center justify-between gap-3 px-6 py-6 sm:px-12">
        <Link
          href="/"
          className="font-display text-lg font-bold tracking-tightest text-text-primary"
        >
          LabourMarket<span className="text-gradient-accent">.ai</span>
        </Link>
        <LocaleSwitcher compactBelowSm />
      </header>
      <main className="relative z-10 mx-auto flex w-full max-w-md flex-col px-6 pb-20 sm:max-w-lg lg:max-w-2xl">
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
        <OnboardingWizard
          defaultName={defaultName}
          returnTo={safeNext}
          educationTypeOptions={educationTypeOptions}
          saidSentence={handoff.sentence || null}
          defaultIntents={handoff.intents}
          defaultProfessionSlug={handoff.professionSlug}
          doorIntents={handoff.door}
          doorWords={doorWords}
        />
      </main>
    </div>
  );
}
