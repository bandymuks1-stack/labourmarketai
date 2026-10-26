import { redirect } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/lib/i18n/navigation";
import {
  JournalInboxEntry,
  type InboxEntry,
} from "@/components/app/journal-inbox-entry";
import {
  EvidenceStatusStrip,
  type EvidenceStatus,
} from "@/components/app/evidence-status-strip";
import { EmptyState } from "@/components/app/empty-state";
import { createClient } from "@/lib/supabase/server";
import { readCounterpartyQueue } from "@/lib/journal/counterparty-review";
import { queueBucket } from "@/lib/journal/counterparty-review-model";
import { recognizeEntryDepth } from "@/lib/structuring/recognize-entry";
import { reviewerHoursOf } from "@/lib/journal/reviewer-hours";
import { countConfirmedEntriesFromRows } from "@/lib/journal/review-status";
import {
  WORKER_NAME_FIELDS,
  resolveWorkerName,
  type WorkerNameRow,
} from "@/lib/journal/worker-name";
import { PageTitle } from "@/components/app/premium/page-title";

// Structured-field slugs that have a localized label; others fall back to slug.
const FIELD_LABEL_SLUGS = new Set(["site_name", "tile_type", "area_done"]);

/** Manager review inbox (§13.2 + slice manager-review-evidence-result-v1).
 *  Lists ONLY the real reviewable entries: the gated set from the SECURITY
 *  DEFINER `reviewable_journal_entry_ids` RPC (migration 0034) — entries the
 *  caller manages (or any, if admin) where the worker's employment relationship
 *  has journal_review_enabled = true and there is no evidence row yet. The
 *  manager records approve / reject / request-changes evidence per entry. */
export default async function InboxPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("journal");
  const tField = await getTranslations("journal");
  const tTier = await getTranslations("evidenceTier");
  const tUnit = await getTranslations("productivityUnits");
  const tSkill = await getTranslations("skillNames");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/${locale}/auth/login`);

  // Gated reviewable set (migration 0034, applied). A failed RPC — an RLS or
  // network failure, or the function missing (42883) — is UNKNOWN, not an
  // empty inbox: "nothing to review" is a claim of completeness the page can
  // only make after a read that answered (SEP-7). `loadFailed` renders an
  // honest "could not load" state instead.
  let reviewableIds: string[] = [];
  let loadFailed = false;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: idRows, error: idError } = await (supabase as any).rpc(
    "reviewable_journal_entry_ids",
  );
  if (idError) {
    loadFailed = true;
  } else if (Array.isArray(idRows)) {
    reviewableIds = idRows
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .map((r: any) =>
        typeof r === "string"
          ? r
          : (r?.reviewable_journal_entry_ids ?? r?.id ?? null),
      )
      .filter((v: unknown): v is string => typeof v === "string");
  }

  // CLIENT REVIEW is its own surface (/dashboard/inbox/counterparty): entries
  // submitted to this caller as a client / customer / contracting party are
  // decided there (accept / request correction / dispute), never as an
  // employer confirmation with skill verification. The employer set above is
  // employer-only (20261003150550); this only counts what waits over there.
  const counterpartyQueue = await readCounterpartyQueue(supabase);
  const counterpartyToDecide = (counterpartyQueue ?? []).filter(
    (r) => queueBucket(r) === "to_decide",
  ).length;

  let pending: InboxEntry[] = [];
  if (!loadFailed && reviewableIds.length > 0) {
    // LEFT join on workers, never !inner (walk 2026-10-11): a learner's
    // workers row is hidden from their institution by least privilege
    // (can_view_worker: student grants no worker visibility), so an inner join
    // dropped every student entry the institution may read AND review. The
    // name falls back to NO_READABLE_NAME; the entry itself stays reviewable.
    const { data: rows, error: rowsError } = await supabase
      .from("journal_entries")
      .select(
        `id, original_text, created_at, worker_id, engagement_contexts(organization_id), journal_entry_metrics(metric_slug, value_text, value_numeric, unit_slug, source, created_at), workers(${WORKER_NAME_FIELDS})`,
      )
      .in("id", reviewableIds)
      .order("created_at", { ascending: true });
    // The ids answered but the entries did not: the manager must not be
    // shown an empty queue over rows that exist.
    if (rowsError) loadFailed = true;

    const unconfirmed = rowsError ? [] : (rows ?? []);

    // WHO CAN ACTUALLY DECIDE. Seeing the queue is `manages_organization()`;
    // deciding needs an ACTIVE manager/owner/external_manager engagement in the
    // entry's organization (the RPC's own `no_reviewer_engagement` rule). A
    // manager without it used to be shown live "Approve" buttons that refused
    // on click. The read below mirrors that predicate so the card can say so up
    // front; the RPC stays the authority, and a failed read leaves the buttons
    // (never hides an action on a guess).
    const { data: engRows, error: engError } = await supabase
      .from("engagement_contexts")
      .select("organization_id")
      .eq("profile_id", user.id)
      .eq("status", "active")
      .in("relationship_slug", ["manager", "owner", "external_manager"]);
    const reviewerOrgs = new Set(
      (engRows ?? []).map((e) => e.organization_id).filter(Boolean) as string[],
    );

    // Batch the workers' declared skills WITH ids + verified state — the manager
    // picks which of these the entry proves, to confirm/verify them.
    const workerIds = [
      ...new Set(unconfirmed.map((r) => r.worker_id).filter(Boolean)),
    ] as string[];
    const skillsByWorker = new Map<
      string,
      { id: string; name: string; verified: boolean }[]
    >();
    if (workerIds.length > 0) {
      const { data: ws } = await supabase
        .from("worker_skills")
        .select("worker_id, skill_id, verified, skills(slug)")
        .in("worker_id", workerIds);
      for (const r of ws ?? []) {
        const slug = (r.skills as { slug: string | null } | null)?.slug;
        if (!r.worker_id || !r.skill_id || !slug) continue;
        const list = skillsByWorker.get(r.worker_id) ?? [];
        list.push({ id: r.skill_id, name: tSkill(slug), verified: r.verified === true });
        skillsByWorker.set(r.worker_id, list);
      }
    }

    // A manager confirms what THIS entry shows, never the worker's whole skill
    // list (walk 2026-10-11: every unverified skill of the worker was offered,
    // pre-ticked, so one submit verified skills detected in unrelated entries).
    // Only skills linked to the entry are offered; unreadable links → none.
    const linksByEntry = new Map<string, Set<string>>();
    const entryIds = unconfirmed.map((r) => r.id);
    if (entryIds.length > 0) {
      const { data: links, error: linksError } = await supabase
        .from("journal_entry_skills")
        .select("journal_entry_id, skill_id")
        .in("journal_entry_id", entryIds);
      if (!linksError) {
        for (const l of links ?? []) {
          if (!l.journal_entry_id || !l.skill_id) continue;
          const set = linksByEntry.get(l.journal_entry_id) ?? new Set<string>();
          set.add(l.skill_id);
          linksByEntry.set(l.journal_entry_id, set);
        }
      }
    }

    pending = unconfirmed.map((r) => {
      const workerName = resolveWorkerName(r.workers as WorkerNameRow);
      // The reviewer sees only metrics that have a human label. The parser's
      // provenance rows (work_date, parsed_fragment, fragment_*, pipeline_
      // version …) stay in the database but are never shown as raw slugs — the
      // work date is carried separately and rendered as the entry's date.
      const workDate =
        (r.journal_entry_metrics ?? []).find(
          (m) => m.metric_slug === "work_date" && /^\d{4}-\d{2}-\d{2}$/.test(m.value_text ?? ""),
        )?.value_text ?? null;
      const metrics = (r.journal_entry_metrics ?? [])
        .filter((m) => FIELD_LABEL_SLUGS.has(m.metric_slug))
        .map((m) => {
        const label = FIELD_LABEL_SLUGS.has(m.metric_slug)
          ? tField(`field.${m.metric_slug}`)
          : m.metric_slug;
        const value =
          m.value_numeric != null
            ? `${m.value_numeric}${m.unit_slug ? ` ${tUnit(m.unit_slug)}` : ""}`
            : (m.value_text ?? "");
        return { label, value };
      });
      // Deterministic recognition from the free text — informational
      // suggestions (not verified facts), computed at read time, no storage.
      const depth = recognizeEntryDepth(r.original_text ?? "");
      const recognized = depth.works.map((w) => ({
        slug: w.slug,
        name: tSkill(w.slug),
        evidence: w.evidence,
      }));
      // The STORED work time by the one canonical rule — what the timesheet
      // and calendar count — never a re-parse of the text (reviewer-hours.ts).
      const stored = reviewerHoursOf({
        id: r.id,
        createdAt: r.created_at,
        metrics: r.journal_entry_metrics ?? [],
      });
      const hours = stored
        ? { value: stored.value, unit: tUnit(stored.unit), certain: stored.certain }
        : null;
      return {
        id: r.id,
        originalText: r.original_text,
        workerName,
        createdAt: r.created_at,
        workDate,
        canApprove: engError
          ? true
          : reviewerOrgs.has(
              ((r as unknown as { engagement_contexts?: { organization_id?: string | null } | null })
                .engagement_contexts?.organization_id ?? "") as string,
            ),
        metrics,
        skills: r.worker_id
          ? (skillsByWorker.get(r.worker_id) ?? []).filter((s) =>
              linksByEntry.get(r.id)?.has(s.id),
            )
          : [],
        recognized,
        hours,
        certainty: depth.certainty,
        needsClarification: depth.needsClarification,
      };
    });
  }

  // Confirmed ENTRIES the caller can see (RLS-scoped: own / their org) —
  // counted once per entry by the latest-wins rule, never per decision row
  // (an entry approved twice is one entry; one approved then sent back is
  // not confirmed). Employer decisions only: a client's acceptance is a
  // different claim (CLIENT_ACCEPTED), counted on the client review surface.
  // An unreadable read is UNKNOWN ("—"), never 0.
  let confirmedCount: number | null = null;
  let autoConfirmedCount = 0;
  const { data: confRows, error: confError } = await supabase
    .from("journal_entry_confirmations")
    .select("entry_id, confirmation_scope, created_at");
  if (!confError && Array.isArray(confRows)) {
    const counted = countConfirmedEntriesFromRows(confRows);
    confirmedCount = counted.confirmed;
    // W6 slice 1: policy-written confirmations are surfaced with their honest
    // marker — an automatic confirmation never hides inside the count.
    autoConfirmedCount = counted.automatic;
  }

  // Manager Evidence Review Clarity v1 — the inbox lists only unconfirmed
  // entries awaiting this reviewer, so the legend shows them as self-declared +
  // awaiting. "confirmed" lights up ONLY when the caller already has real
  // confirmed evidence in scope — never automatically.
  const reviewLegend: EvidenceStatus[] = ["self_declared"];
  if (pending.length > 0) reviewLegend.push("awaiting_confirmation");
  if (confirmedCount !== null && confirmedCount > 0) reviewLegend.push("confirmed");

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-2">
        <PageTitle>{t("inbox.title")}</PageTitle>
        <div
          className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-text-secondary"
          data-testid="inbox-summary"
        >
          <span>
            {t("inbox.summary.pending")}:{" "}
            <span className="font-semibold text-text-primary">
              {loadFailed ? "—" : pending.length}
            </span>
          </span>
          <span>
            {t("inbox.summary.confirmed")}:{" "}
            <span className="font-semibold text-text-primary">{confirmedCount ?? "—"}</span>
          </span>
        </div>
        <p
          className="text-meta leading-relaxed text-text-muted"
          data-testid="inbox-project-note"
        >
          {t("inbox.projectNote")}
        </p>
        {/* Review clarity — what the manager's review actually does, plus the
            shared evidence-status legend so the reviewer sees the lifecycle
            their decision moves an entry through. Honest, no auto-confirm. */}
        <p
          className="text-xs leading-relaxed text-text-secondary"
          data-testid="inbox-review-clarity-lead"
        >
          {t("inbox.reviewClarity.lead")}
        </p>
        <EvidenceStatusStrip active={reviewLegend} data-testid="inbox-evidence-status-strip" />
        {autoConfirmedCount > 0 ? (
          <p
            className="text-meta leading-relaxed text-text-muted"
            data-testid="inbox-auto-confirm-note"
          >
            {autoConfirmedCount} · {tTier("autoConfirmQualifier")}
          </p>
        ) : null}
        <div className="flex flex-wrap gap-x-4">
          <Link
            href="/dashboard/inbox/quick"
            className="w-fit text-xs font-medium text-brand-blue hover:underline"
            data-testid="inbox-quick-link"
          >
            {t("inbox.quick.openQuick")}
          </Link>
          <Link
            href="/dashboard/inbox/counterparty"
            className="w-fit text-xs font-medium text-brand-blue hover:underline"
            data-testid="inbox-counterparty-link"
          >
            {t("counterparty.queue.openLink")}
            {counterpartyToDecide > 0 ? ` (${counterpartyToDecide})` : ""}
          </Link>
          <Link
            href="/dashboard/inbox/report"
            className="w-fit text-xs font-medium text-brand-blue hover:underline"
            data-testid="inbox-report-link"
          >
            {t("inbox.openReport")}
          </Link>
        </div>
      </header>

      {loadFailed ? (
        <p
          role="alert"
          className="rounded-md border border-state-warning/40 bg-state-warning/10 p-4 text-sm text-text-secondary"
          data-testid="inbox-load-failed"
        >
          {t("inbox.loadFailed")}
        </p>
      ) : pending.length === 0 ? (
        <EmptyState
          testId="inbox-empty-state"
          title={t("inbox.emptyTitle")}
          why={t("inbox.empty")}
          next={t("inbox.emptyNext")}
        />
      ) : (
        <ul className="flex flex-col gap-3">
          {pending.map((e) => (
            <JournalInboxEntry key={e.id} entry={e} />
          ))}
        </ul>
      )}
    </div>
  );
}
