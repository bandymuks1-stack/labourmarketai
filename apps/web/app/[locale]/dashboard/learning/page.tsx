import { redirect } from "next/navigation";
import { setRequestLocale, getTranslations } from "next-intl/server";

import { createClient } from "@/lib/supabase/server";
import {
  listVisibleReviewItems,
  listManagedLearningPolicies,
} from "@/lib/learning/learning";
import {
  LearningReviewSection,
  type LearningLabels,
} from "@/components/app/learning-review-section";

/**
 * Learning — human-in-loop learning review surface (W6 Phase 1). Authenticated
 * dashboard surface: a worker sees suggestions about their own work
 * (transparency); an org manager reviews their org's queue and sees the
 * (default-OFF) auto-confirmation policy. RLS scopes every row to the caller.
 *
 * Honest degradation: until the owner applies the human_in_loop_learning
 * migration, the actions return `needs-migration` and the section shows a calm
 * "not available yet" state — never an error, never a fake suggestion. Learning
 * never confirms; only the audited spine RPC does, gated by live manager
 * authority.
 */
export default async function LearningPage({
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
  if (!user) redirect(`/${locale}/auth/login?next=/${locale}/dashboard/learning`);

  const t = await getTranslations("learning");
  const itemsResult = await listVisibleReviewItems();
  const policiesResult = await listManagedLearningPolicies();

  // The caller's own workers.id — rows about the viewer render as read-only
  // transparency rows (a subject never reviews suggestions about themselves).
  const { data: ownWorker } = await supabase
    .from("workers")
    .select("id")
    .eq("profile_id", user.id)
    .maybeSingle();
  const viewerWorkerId = ownWorker?.id ?? null;
  const needsMigration =
    itemsResult.kind === "needs-migration" || policiesResult.kind === "needs-migration";
  const items = itemsResult.kind === "ok" ? itemsResult.rows : [];
  const policies = policiesResult.kind === "ok" ? policiesResult.rows : [];

  const labels: LearningLabels = {
    title: t("title"),
    lead: t("lead"),
    notAvailable: t("notAvailable"),
    empty: t("empty"),
    workerHeading: t("worker.heading"),
    workerIntro: t("worker.intro"),
    kind: {
      confirm_skill: t("kind.confirm_skill"),
      review_skill: t("kind.review_skill"),
      dismiss: t("kind.dismiss"),
    },
    skillFallback: t("skillFallback"),
    workerFallback: t("workerFallback"),
    noteLabel: t("noteLabel"),
    managerContextLink: t("managerContextLink"),
    ownContextLink: t("ownContextLink"),
    manager: {
      queueHeading: t("manager.queueHeading"),
      approve: t("manager.approve"),
      reject: t("manager.reject"),
      applyPolicy: t("manager.applyPolicy"),
      policyHeading: t("manager.policyHeading"),
      policyState: t("manager.policyState"),
      policyOff: t("manager.policyOff"),
      policyOn: t("manager.policyOn"),
      note: t("manager.note"),
      statusLabel: {
        pending: t("manager.status.pending"),
        approved: t("manager.status.approved"),
        rejected: t("manager.status.rejected"),
        superseded: t("manager.status.superseded"),
        auto_actioned: t("manager.status.auto_actioned"),
      },
    },
    errorGeneric: t("errorGeneric"),
  };

  return (
    <div className="flex flex-col gap-4" data-testid="learning-page">
      <header className="flex flex-col gap-1">
        <h1 className="font-display text-2xl font-bold tracking-tightest text-text-primary">
          {t("pageTitle")}
        </h1>
        <p className="text-sm leading-relaxed text-text-secondary">{t("pageLead")}</p>
      </header>
      <LearningReviewSection
        initialItems={items}
        policies={policies}
        needsMigration={needsMigration}
        labels={labels}
        viewerWorkerId={viewerWorkerId}
      />
    </div>
  );
}
