import { redirect } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/lib/i18n/navigation";
import { EmptyState } from "@/components/app/empty-state";
import {
  QuickConfirmCard,
  type QuickConfirmEntryView,
} from "@/components/app/quick-confirm-card";
import { QuickConfirmBatch } from "@/components/app/quick-confirm-batch";
import { fetchQuickReviewQueue } from "@/lib/journal/review-queue";
import { fetchBatchExceptions } from "@/lib/journal/batch-review";
import { createClient } from "@/lib/supabase/server";
import { utcDayKey, utcTodayKey } from "@/lib/time/display";

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

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/${locale}/auth/login`);

  const queue = await fetchQuickReviewQueue();
  const entries: QuickConfirmEntryView[] = queue.map((e) => ({
    id: e.id,
    workerName: e.workerName,
    createdAt: e.createdAt,
    originalText: e.originalText,
    recognizedNames: e.recognizedSlugs.map((slug) => tSkill(slug)),
    skills: e.skillsToConfirm.map((s) => ({ id: s.id, name: tSkill(s.slug) })),
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
  const exceptionMap = await fetchBatchExceptions(todays.map((e) => e.id));
  const exceptions = Object.fromEntries(exceptionMap);

  return (
    <div className="mx-auto flex w-full max-w-content flex-col gap-5">
      <header className="flex flex-col gap-1.5">
        <h1 className="font-display text-2xl font-bold tracking-tightest text-text-primary">
          {t("inbox.quick.title")}
        </h1>
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

      {entries.length === 0 ? (
        <EmptyState
          testId="quick-empty-state"
          title={t("inbox.emptyTitle")}
          why={t("inbox.empty")}
          next={t("inbox.emptyNext")}
        />
      ) : (
        <>
          {todays.length > 1 ? (
            <QuickConfirmBatch entries={todays} exceptions={exceptions} />
          ) : null}
          <ul className="flex flex-col gap-3">
            {entries.map((e) => (
              <QuickConfirmCard key={e.id} entry={e} />
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
