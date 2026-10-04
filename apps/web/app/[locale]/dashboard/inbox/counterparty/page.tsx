import { redirect } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { Link } from "@/lib/i18n/navigation";
import { EmptyState } from "@/components/app/empty-state";
import {
  CounterpartyReviewCard,
  type CounterpartyCardView,
} from "@/components/app/counterparty-review-card";
import { createClient } from "@/lib/supabase/server";
import {
  readCounterpartyEntryView,
  readCounterpartyQueue,
} from "@/lib/journal/counterparty-review";
import {
  partitionQueue,
  queueBucket,
  type QueueBucket,
  type QueueRow,
} from "@/lib/journal/counterparty-review-model";
import { recognizeEntryDepth } from "@/lib/structuring/recognize-entry";

export const dynamic = "force-dynamic";

// Structured-field slugs that have a localized label (same set as the manager inbox).
const FIELD_LABEL_SLUGS = new Set(["site_name", "tile_type", "area_done"]);
/** Bounded: one detail read per card. The newest submissions come first. */
const MAX_CARDS = 40;

const BUCKET_ORDER: readonly QueueBucket[] = [
  "to_decide",
  "disputed",
  "waiting_for_worker",
  "accepted",
];

/**
 * CLIENT REVIEW QUEUE - the legitimate counterparty of a worker's work
 * (client / customer / contracting party / project owner) decides the work
 * the worker explicitly submitted to them.
 *
 * Only the authorized representative of the counterparty organization sees a
 * row here: `list_counterparty_review_queue_v1` re-derives the caller and the
 * authority from the work relationship (a registered counterparty link backed
 * by a real project assignment, the worker's explicit submission, and no
 * shared organization with the worker). The worker never sees a decision
 * surface for their own work; a manager of the worker's own organization is
 * not the counterparty (employer review lives in the manager inbox).
 *
 * A failed read is UNKNOWN, never "nothing to review".
 */
export default async function CounterpartyQueuePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("journal.counterparty.queue");
  const tField = await getTranslations("journal");
  const tUnit = await getTranslations("productivityUnits");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/${locale}/auth/login`);

  const queue = await readCounterpartyQueue(supabase);
  const loadFailed = queue === null;
  const rows: QueueRow[] = (queue ?? []).slice(0, MAX_CARDS);
  const truncated = (queue ?? []).length > MAX_CARDS;
  const parts = partitionQueue(rows);

  const views = new Map<string, CounterpartyCardView>();
  await Promise.all(
    rows.map(async (row) => {
      const bucket = queueBucket(row);
      const read = await readCounterpartyEntryView(supabase, row.entryId);
      if (!read) {
        views.set(row.entryId, {
          entryId: row.entryId,
          bucket,
          latestDecision: row.latestDecision,
          workerName: null,
          projectName: null,
          partyRole: row.partyRole,
          originalText: row.originalText,
          submittedAt: row.submittedAt,
          workDate: null,
          isResubmission: row.resubmissionOfEntryId !== null,
          metrics: [],
          hours: null,
          photos: [],
          history: [],
          detailAvailable: false,
        });
        return;
      }
      const { detail, photos } = read;
      const workDate =
        detail.metrics.find(
          (m) => m.slug === "work_date" && /^\d{4}-\d{2}-\d{2}$/.test(m.valueText ?? ""),
        )?.valueText ?? null;
      const metrics = detail.metrics.flatMap((m) => {
        if (FIELD_LABEL_SLUGS.has(m.slug)) {
          const value =
            m.valueNumeric != null
              ? `${m.valueNumeric}${m.unitSlug ? ` ${tUnit(m.unitSlug)}` : ""}`
              : (m.valueText ?? "");
          return value ? [{ label: tField(`field.${m.slug}`), value }] : [];
        }
        if (m.slug === "quantity" && m.valueNumeric != null) {
          return [
            {
              label: t("card.quantity"),
              value: `${m.valueNumeric}${m.unitSlug ? ` ${tUnit(m.unitSlug)}` : ""}`,
            },
          ];
        }
        return [];
      });
      const depth = recognizeEntryDepth(detail.originalText);
      const hours = depth.hours
        ? `${depth.hours.value} ${tUnit(depth.hours.unit)}${
            depth.hours.certain ? "" : ` (${t("card.hoursUnclear")})`
          }`
        : null;
      views.set(row.entryId, {
        entryId: row.entryId,
        bucket,
        latestDecision: row.latestDecision,
        workerName: detail.subjectName,
        projectName: detail.projectName,
        partyRole: detail.partyRole ?? row.partyRole,
        originalText: detail.originalText,
        submittedAt: detail.submittedAt ?? row.submittedAt,
        workDate,
        isResubmission: detail.resubmissionOfEntryId !== null,
        metrics,
        hours,
        photos: photos.map((p) => ({ id: p.id, fileName: p.fileName, signedUrl: p.signedUrl })),
        history: detail.history.map((h) => ({ decision: h.decision, note: h.note, at: h.at })),
        detailAvailable: true,
      });
    }),
  );

  return (
    <div className="flex flex-col gap-6" data-testid="counterparty-queue">
      <header className="flex flex-col gap-2">
        <h1 className="font-display text-3xl font-bold tracking-tightest text-text-primary">
          {t("title")}
        </h1>
        <p className="text-sm leading-relaxed text-text-secondary">{t("lead")}</p>
        <p className="text-meta leading-relaxed text-text-muted">{t("honestNote")}</p>
        {!loadFailed ? (
          <div
            className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-text-secondary"
            data-testid="counterparty-queue-summary"
          >
            {BUCKET_ORDER.map((b) => (
              <span key={b}>
                {t(`bucket.${b}`)}:{" "}
                <span className="font-semibold text-text-primary">{parts[b].length}</span>
              </span>
            ))}
          </div>
        ) : null}
        <Link
          href="/dashboard/inbox"
          className="w-fit text-xs font-medium text-brand-blue hover:underline"
        >
          {t("employerInboxLink")}
        </Link>
      </header>

      {loadFailed ? (
        <p
          role="alert"
          className="rounded-md border border-state-warning/40 bg-state-warning/10 p-4 text-sm text-text-secondary"
          data-testid="counterparty-queue-load-failed"
        >
          {t("loadFailed")}
        </p>
      ) : rows.length === 0 ? (
        <EmptyState
          testId="counterparty-queue-empty"
          title={t("emptyTitle")}
          why={t("empty")}
          next={t("emptyNext")}
        />
      ) : (
        BUCKET_ORDER.filter((b) => parts[b].length > 0).map((b) => (
          <section key={b} className="flex flex-col gap-3" aria-label={t(`bucket.${b}`)}>
            <h2 className="font-mono text-meta uppercase tracking-label text-text-muted">
              {t(`bucket.${b}`)} · {parts[b].length}
            </h2>
            <ul className="flex flex-col gap-3">
              {parts[b].map((row) => {
                const view = views.get(row.entryId);
                return view ? <CounterpartyReviewCard key={row.entryId} view={view} /> : null;
              })}
            </ul>
          </section>
        ))
      )}
      {truncated ? (
        <p className="text-meta text-text-muted" data-testid="counterparty-queue-truncated">
          {t("truncated", { n: MAX_CARDS })}
        </p>
      ) : null}
    </div>
  );
}
