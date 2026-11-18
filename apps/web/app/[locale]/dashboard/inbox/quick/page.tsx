import { redirect } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/lib/i18n/navigation";
import type { QuickConfirmEntryView } from "@/components/app/quick-confirm-card";
import { QuickConfirmQueue } from "@/components/app/quick-confirm-queue";
import { quickConfirmEntryView } from "@/lib/journal/quick-confirm-model";
import { fetchQuickReviewQueue } from "@/lib/journal/review-queue";
import { groupByOrganization, reviewScopeOf, rowsInScope } from "@/lib/journal/review-scope";
import { getActiveOrganizationContext } from "@/lib/company/active-organization";
import { fetchBatchExceptions } from "@/lib/journal/batch-review";
import { createClient } from "@/lib/supabase/server";
import { utcDayKey, utcTodayKey } from "@/lib/time/display";
import { PageTitle } from "@/components/app/premium/page-title";
import { dashboardPageMetadata } from "@/lib/navigation/dashboard-metadata";

// The document title names this page (WCAG 2.4.2) — lib/navigation/dashboard-metadata.ts.
export const generateMetadata = dashboardPageMetadata("/dashboard/inbox/quick");


/** One-Tap Confirm (S3.5) — the manager's mobile-first confirm queue. Same
 *  gated reviewable set as the inbox, same write RPCs; this view only cuts
 *  the interaction down to one glance + one tap per entry (≤10s on a phone),
 *  with the reject path right next to it and a summarised batch confirm for
 *  the day. No auto-confirm: every confirmation is an explicit manager tap. */
export default async function QuickConfirmPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("journal");
  const tSkill = await getTranslations("skillNames");
  const tUnit = await getTranslations("productivityUnits");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/${locale}/auth/login`);

  // FAILED ≠ EMPTY (SEP-7): a read that failed gets its own named state below,
  // never the "nothing to review" empty state.
  let queue: Awaited<ReturnType<typeof fetchQuickReviewQueue>> | null;
  try {
    queue = await fetchQuickReviewQueue();
  } catch {
    queue = null;
  }
  // ONE ORGANIZATION'S CONTEXT (decision 0024). The reviewable set spans every organization
  // the reader reviews. With an organization active, this page shows its entries only, the
  // same set its "waiting for approval" counts name, and says how many wait elsewhere.
  // With none active it shows every entry, grouped by organization and labelled on each
  // card, never one unlabelled pile.
  const scope = reviewScopeOf((await getActiveOrganizationContext()).activeOrganizationId);
  const scoped = rowsInScope(queue ?? [], scope);
  const groups = scope.kind === "all" ? groupByOrganization(scoped.rows) : [];
  const labelled = groups.length > 1 || groups.some((g) => g.organizationId === null);
  const organizationLabel = (name: string | null) => name ?? t("inbox.quick.unnamedOrganization");
  const ordered = scope.kind === "all" ? groups.flatMap((g) => g.rows) : scoped.rows;
  const entries: QuickConfirmEntryView[] = ordered.map((e) => ({
    ...quickConfirmEntryView(e, tSkill, tUnit),
    ...(labelled ? { organization: organizationLabel(e.organizationName) } : {}),
  }));

  // "Confirm all of today" — strictly the entries created today. "Today" is
  // the canonical UTC day (W12), the same day the entry is filed under
  // everywhere else; deriving it from the server's ambient zone made the batch
  // disagree with the date printed on the cards it was batching.
  const todayKey = utcTodayKey();
  const todays = entries.filter((e) => utcDayKey(e.createdAt) === todayKey);

  // Exceptions pyramid (DESIGN_SOUL §3): the REAL server-flagged exceptions
  // for the batch candidates, surfaced BEFORE the confirm click. RPC absent
  // → empty map (the write side then enforces nothing extra either).
  const exceptionMap =
    queue === null
      ? new Map<string, never>()
      : await fetchBatchExceptions(todays.map((e) => e.id));
  const exceptions = Object.fromEntries(exceptionMap);

  return (
    <div className="mx-auto flex w-full max-w-content flex-col gap-5">
      <header className="flex flex-col gap-1.5">
        <PageTitle>{t("inbox.quick.title")}</PageTitle>
        <p className="text-xs leading-relaxed text-text-secondary">
          {t("inbox.quick.subtitle")}
        </p>
        <Link
          href="/dashboard/inbox"
          className="w-fit text-xs font-medium text-brand-blue hover:underline"
          data-testid="quick-detailed-link"
        >
          {t("inbox.quick.detailedReview")} →
        </Link>
      </header>

      {labelled ? (
        <p className="text-sm leading-relaxed text-text-secondary" data-testid="quick-by-organization">
          {t("inbox.quick.byOrganization")}{" "}
          {groups.map((g) => `${organizationLabel(g.organizationName)}: ${g.rows.length}`).join(" · ")}
        </p>
      ) : null}
      {scoped.elsewhere > 0 ? (
        <p className="text-sm leading-relaxed text-text-secondary" data-testid="quick-elsewhere">
          {t("inbox.quick.elsewhere", { n: scoped.elsewhere })}
        </p>
      ) : null}

      {/* One client boundary that stays mounted across the post-tap
          revalidation, so the manager's receipt survives the queue emptying
          (empty state + batch + cards all live inside it). */}
      <QuickConfirmQueue
        entries={entries}
        todays={todays}
        exceptions={exceptions}
        unavailable={queue === null}
      />
    </div>
  );
}
