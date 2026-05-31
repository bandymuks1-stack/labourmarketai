import { redirect } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/lib/i18n/navigation";
import {
  JournalInboxEntry,
  type InboxEntry,
} from "@/components/app/journal-inbox-entry";
import { createClient } from "@/lib/supabase/server";
import { recognizeEntryDepth } from "@/lib/structuring/recognize-entry";

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
  const tUnit = await getTranslations("productivityUnits");
  const tSkill = await getTranslations("skillNames");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/${locale}/auth/login`);

  // Gated reviewable set (migration 0034). Degrades to an empty inbox until the
  // RPC is applied (42883) — honest, no mock data.
  let reviewableIds: string[] = [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: idRows } = await (supabase as any).rpc(
    "reviewable_journal_entry_ids",
  );
  if (Array.isArray(idRows)) {
    reviewableIds = idRows
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .map((r: any) =>
        typeof r === "string"
          ? r
          : (r?.reviewable_journal_entry_ids ?? r?.id ?? null),
      )
      .filter((v: unknown): v is string => typeof v === "string");
  }

  let pending: InboxEntry[] = [];
  if (reviewableIds.length > 0) {
    const { data: rows } = await supabase
      .from("journal_entries")
      .select(
        "id, original_text, created_at, worker_id, journal_entry_metrics(metric_slug, value_text, value_numeric, unit_slug), workers!inner(profiles(full_name, email))",
      )
      .in("id", reviewableIds)
      .order("created_at", { ascending: true });

    const unconfirmed = rows ?? [];

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

    pending = unconfirmed.map((r) => {
      const prof = (r.workers as { profiles: { full_name: string | null; email: string | null } | null } | null)
        ?.profiles;
      const workerName =
        prof?.full_name ?? (prof?.email ? prof.email.split("@")[0] : "—");
      const metrics = (r.journal_entry_metrics ?? []).map((m) => {
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
      const hours = depth.hours
        ? {
            value: depth.hours.value,
            unit: tUnit(depth.hours.unit),
            certain: depth.hours.certain,
          }
        : null;
      return {
        id: r.id,
        originalText: r.original_text,
        workerName,
        createdAt: r.created_at,
        metrics,
        skills: r.worker_id ? (skillsByWorker.get(r.worker_id) ?? []) : [],
        recognized,
        hours,
        certainty: depth.certainty,
        needsClarification: depth.needsClarification,
      };
    });
  }

  // Confirmed entries the caller can see (RLS-scoped: own / their org).
  let confirmedCount = 0;
  const { data: confRows } = await supabase
    .from("journal_entry_confirmations")
    .select("confirmation_scope");
  if (Array.isArray(confRows)) {
    confirmedCount = confRows.filter((r) => {
      const s = (r as { confirmation_scope?: { action?: string; decision?: string } | null }).confirmation_scope ?? null;
      return s?.decision === "approved" || s?.action === "confirm";
    }).length;
  }

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-2">
        <h1 className="font-display text-3xl font-bold tracking-tightest text-text-primary">
          {t("inbox.title")}
        </h1>
        <div
          className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-text-secondary"
          data-testid="inbox-summary"
        >
          <span>
            {t("inbox.summary.pending")}:{" "}
            <span className="font-semibold text-text-primary">{pending.length}</span>
          </span>
          <span>
            {t("inbox.summary.confirmed")}:{" "}
            <span className="font-semibold text-text-primary">{confirmedCount}</span>
          </span>
        </div>
        <p
          className="text-[11px] leading-relaxed text-text-muted"
          data-testid="inbox-project-note"
        >
          {t("inbox.projectNote")}
        </p>
        <Link
          href="/dashboard/inbox/report"
          className="w-fit text-xs font-medium text-brand-blue hover:underline"
          data-testid="inbox-report-link"
        >
          {t("inbox.openReport")}
        </Link>
      </header>

      {pending.length === 0 ? (
        <p className="text-sm text-text-secondary">{t("inbox.empty")}</p>
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
