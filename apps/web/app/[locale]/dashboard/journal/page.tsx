import { redirect } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import {
  JournalEntryComposer,
  type JournalEngagement,
} from "@/components/app/journal-entry-composer";
import { JournalEntryRow } from "@/components/app/journal-entry-row";
import {
  EvidenceStatusStrip,
  type EvidenceStatus,
} from "@/components/app/evidence-status-strip";
import { formatDuration } from "@/lib/journal/format-duration";
import {
  groupLinkedSkillIdsByEntry,
  type EntrySkillLinkRow,
} from "@/lib/journal/journal-entry-skills";
import {
  deriveReviewResult,
  deriveReviewTimeline,
  type ReviewResult,
} from "@/lib/journal/review-status";
import { EvidenceDecisionTimeline } from "@/components/app/evidence-decision-timeline";
import { createClient } from "@/lib/supabase/server";
import { listMyPendingWorkerInvitations } from "@/lib/worker/invitations";
import { Link } from "@/lib/i18n/navigation";

// Worker-side relationships that grant access to the Work Journal (§13.1).
// A worker without an active engagement here has nothing to log against.
const WORKER_RELATIONSHIPS = [
  "employee",
  "freelancer",
  "consultant",
  "owner",
  "collaborator",
];

// Worker-facing review/evidence result per entry (slice
// manager-review-evidence-result-v1). Derived purely from the append-only
// evidence rows; latest decision wins.
const STATUS_CLASS: Record<ReviewResult, string> = {
  submitted: "text-state-warning",
  approved: "text-state-success",
  rejected: "text-state-error",
  changes_requested: "text-brand-blue",
};

/** Worker "Mano dienoraštis" — the closed self-declare loop (M1). Logs work
 *  against an engagement context; entries stay private (visibility 'closed')
 *  until a manager confirms them (§13). */
export default async function JournalPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams?: Promise<{ editing?: string | string[] }>;
}) {
  const { locale } = await params;
  const sp = (await searchParams) ?? {};
  const editingId =
    typeof sp.editing === "string" && sp.editing.trim().length > 0
      ? sp.editing.trim()
      : null;
  setRequestLocale(locale);
  const t = await getTranslations("journal");
  const tSpaces = await getTranslations("spaces");
  const tRel = await getTranslations("relationshipTypes");
  const tRole = await getTranslations("auth.signup.role");
  const tUnit = await getTranslations("productivityUnits");
  const tProf = await getTranslations("professions");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/${locale}/auth/login`);

  const { data: worker } = await supabase
    .from("workers")
    .select("id")
    .eq("profile_id", user.id)
    .maybeSingle();

  // Active worker-side engagements — the journal is only meaningful with one.
  const { data: ecRows } = await supabase
    .from("engagement_contexts")
    .select(
      "id, relationship_slug, title, is_primary, journal_review_enabled, organizations(display_name, legal_name, organization_type)",
    )
    .eq("profile_id", user.id)
    .eq("status", "active")
    .in("relationship_slug", WORKER_RELATIONSHIPS)
    .order("is_primary", { ascending: false });
  // State 4 vs 5: the worker has a context but review may not be enabled by
  // the owner yet. Honest signal — they can log work, but it won't be
  // confirmable until review is enabled for them.
  const anyReviewEnabled = (ecRows ?? []).some(
    (r) => (r as { journal_review_enabled?: boolean }).journal_review_enabled === true,
  );

  const engagements: JournalEngagement[] = (ecRows ?? []).map((e) => {
    const org = e.organizations as
      | {
          display_name: string | null;
          legal_name: string | null;
          organization_type: string | null;
        }
      | null;
    // Disambiguate same-relationship engagements (e.g. owning a company AND an
    // agency both show "Owner") by falling back to the org TYPE label when the
    // org has no display/legal name — never a bare "—". Reuses existing role
    // labels (company/agency), so no new i18n keys.
    const typeLabel =
      org?.organization_type === "company"
        ? tRole("company")
        : org?.organization_type === "agency"
          ? tRole("agency")
          : null;
    const orgName =
      org?.display_name ?? org?.legal_name ?? typeLabel ?? e.title ?? "—";
    // A personal worker engagement (no organization) reads clearer as a
    // named personal entry than a bare "— · Darbuotojas". Role model unchanged.
    const label = org
      ? `${orgName} · ${tRel(e.relationship_slug)}`
      : t("personalEntry");
    return {
      id: e.id,
      label,
      isPrimary: e.is_primary,
    };
  });

  if (!worker || engagements.length === 0) {
    // Fix C — distinguish the REAL reason there is no writable context, so
    // the worker knows the exact next step instead of a flat "no context".
    const pending = await listMyPendingWorkerInvitations();
    let hasRosterLink = false;
    let rosterOrgName: string | null = null;
    if (worker) {
      const [cw, aw] = await Promise.all([
        supabase.from("company_workers").select("companies(display_name, legal_name)").eq("worker_id", worker.id).eq("status", "active").limit(1),
        supabase.from("agency_workers").select("agencies(legal_name)").eq("worker_id", worker.id).eq("status", "active").limit(1),
      ]);
      hasRosterLink = (cw.data?.length ?? 0) > 0 || (aw.data?.length ?? 0) > 0;
      const cwOrg = (cw.data?.[0] as { companies?: { display_name: string | null; legal_name: string | null } | null } | undefined)?.companies;
      const awOrg = (aw.data?.[0] as { agencies?: { legal_name: string | null } | null } | undefined)?.agencies;
      rosterOrgName =
        cwOrg?.display_name ?? cwOrg?.legal_name ?? awOrg?.legal_name ?? null;
    }
    const contextState =
      pending.length > 0 ? "pending" : hasRosterLink ? "roster" : "none";
    // Surface the REAL org the worker is waiting on (no fabrication) — which
    // makes the canonical "owner must provision you" path concrete.
    const noContextOrg =
      contextState === "pending"
        ? (pending[0]?.orgName ?? null)
        : contextState === "roster"
          ? rosterOrgName
          : null;
    return (
      <div className="flex flex-col gap-6">
        <header>
          <h1 className="font-display text-3xl font-bold tracking-tightest text-text-primary">
            {t("navTitle")}
          </h1>
        </header>
        <div className="card-border max-w-2xl p-6">
          <p className="text-sm leading-relaxed text-text-secondary">
            {noContextOrg
              ? t(`noContext.${contextState}Named`, { org: noContextOrg })
              : t(`noContext.${contextState}`)}
          </p>
          {contextState === "pending" && (
            <Link
              href="/dashboard"
              className="mt-3 inline-flex items-center gap-1.5 rounded-md border border-brand-blue px-3 py-1.5 text-xs font-semibold text-text-primary hover:border-brand-blue/80"
            >
              {t("noContextCta")}
            </Link>
          )}
        </div>
      </div>
    );
  }

  // The worker's work directions (primary + additional) for the entry form —
  // so the journal is no longer locked to one tiler template.
  const { data: dirRows } = await supabase
    .from("worker_professions")
    .select("is_primary, professions(slug)")
    .eq("worker_id", worker.id)
    .order("is_primary", { ascending: false });
  const directions = (dirRows ?? [])
    .map((r) => (r.professions as { slug: string } | null)?.slug ?? null)
    .filter((s): s is string => s !== null)
    .map((slug) => ({ slug, name: tProf(slug) }));

  // Worker's saved skills — used by the composer to surface
  // "this entry could strengthen X" suggestions for the rule-based parser.
  const tSkillName = await getTranslations("skillNames");
  const { data: workerSkillRows } = await supabase
    .from("worker_skills")
    .select("skills(slug)")
    .eq("worker_id", worker.id);
  const workerSkills = (workerSkillRows ?? [])
    .map((r) => (r.skills as { slug: string | null } | null)?.slug ?? null)
    .filter((slug): slug is string => !!slug)
    .map((slug) => ({ slug, name: tSkillName(slug) }));

  // Journal Entry ↔ Skill links v1 — the worker's declared skills (id + name)
  // they can mark an entry as supporting, plus their current durable links.
  const { data: skillIdRows } = await supabase
    .from("worker_skills")
    .select("skill_id, skills(slug)")
    .eq("worker_id", worker.id);
  const availableSkillsForLinks = (skillIdRows ?? [])
    .map((r) => {
      const slug = (r.skills as { slug: string | null } | null)?.slug ?? null;
      return slug && r.skill_id
        ? { id: r.skill_id as string, name: tSkillName(slug) }
        : null;
    })
    .filter((x): x is { id: string; name: string } => x !== null)
    .sort((a, b) => a.name.localeCompare(b.name));

  // Durable links read — gracefully no-ops if the migration is not applied yet
  // (mirrors the v3-column fallback below), so the page stays renderable.
  let linksByEntry = new Map<string, string[]>();
  let skillLinksReady = false;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const linkRes = await (supabase as any)
    .from("journal_entry_skills")
    .select("journal_entry_id, skill_id")
    .eq("worker_id", worker.id);
  if (!linkRes.error) {
    skillLinksReady = true;
    linksByEntry = groupLinkedSkillIdsByEntry(
      (linkRes.data ?? []) as EntrySkillLinkRow[],
    );
  }

  // Entries with their metrics + confirmation status. The select reads the
  // v3 lifecycle columns (deleted_at, superseded_by) so the list filter
  // hides soft-deleted rows and entries that the worker has superseded
  // pre-confirmation. The columns themselves only exist after migration
  // 0018 is applied; the leading try/catch keeps the page renderable on
  // older DBs by falling back to the legacy projection.
  type JournalEntryRow = {
    id: string;
    original_text: string;
    created_at: string;
    deleted_at?: string | null;
    superseded_by?: string | null;
    journal_entry_metrics:
      | {
          metric_slug: string;
          value_text: string | null;
          value_numeric: number | null;
          unit_slug: string | null;
        }[]
      | null;
    journal_entry_confirmations:
      | { confirmation_scope: unknown; created_at?: string | null }[]
      | null;
  };
  let entries: JournalEntryRow[] | null = null;
  // Cast the supabase client through `any` for the v3 select — the
  // `deleted_at` / `superseded_by` columns are present at runtime after
  // migration 0018 but aren't in the generated Supabase types until those
  // are regenerated. The runtime path falls back to the legacy projection
  // when the v3 columns are still missing on the target DB.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const v3 = await (supabase.from("journal_entries") as any)
    .select(
      "id, original_text, created_at, deleted_at, superseded_by, journal_entry_metrics(metric_slug, value_text, value_numeric, unit_slug), journal_entry_confirmations(confirmation_scope, created_at, confirmer_role)",
    )
    .eq("worker_id", worker.id)
    .order("created_at", { ascending: false });
  if (v3.error) {
    const legacy = await supabase
      .from("journal_entries")
      .select(
        "id, original_text, created_at, journal_entry_metrics(metric_slug, value_text, value_numeric, unit_slug), journal_entry_confirmations(confirmation_scope, created_at, confirmer_role)",
      )
      .eq("worker_id", worker.id)
      .order("created_at", { ascending: false });
    entries = legacy.data as JournalEntryRow[] | null;
  } else {
    const rows = (v3.data ?? []) as JournalEntryRow[];
    entries = rows.filter((e) => !e.deleted_at && !e.superseded_by);
  }

  // Evidence Status Strip (v1) for the list status zone — a compact legend
  // showing which honest states the worker's entries are actually in. Derived
  // purely from the existing review result; "confirmed" lights up ONLY when a
  // real approved confirmation exists, never automatically.
  const evidenceStatuses = (entries ?? []).map((e) =>
    deriveReviewResult(e.journal_entry_confirmations),
  );
  const journalEvidenceActive: EvidenceStatus[] = ["self_declared"];
  if (
    evidenceStatuses.some((s) => s === "submitted" || s === "changes_requested")
  )
    journalEvidenceActive.push("awaiting_confirmation");
  if (evidenceStatuses.some((s) => s === "approved"))
    journalEvidenceActive.push("confirmed");

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col gap-1">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h1 className="font-display text-3xl font-bold tracking-tightest text-text-primary">
            {t("navTitle")}
          </h1>
          <Link
            href="/dashboard/account"
            className="shrink-0 rounded-md border border-brand-blue/40 px-2.5 py-1 text-xs font-medium text-brand-blue transition-colors hover:bg-brand-blue/10"
            data-testid="room-my-spaces-link"
          >
            {tSpaces("mySpaces")} →
          </Link>
        </div>
      </header>

      {/* P0 UX rescue: removed the read-only project-context note and the
          self-progress counter (noise, not actionable here). The pilot note is
          kept but demoted to ONE compact footnote — it is guard-required
          (journal-evidence-clarity + product-readiness) and stays honest
          (private + not yet externally confirmed). */}
      <p className="order-5 text-[11px] leading-relaxed text-text-muted">
        {t("pilotBackboneNote")}
      </p>

      {/* v4 — when the worker arrived via ?editing=<id> from the entries
          list, prefill the composer with that entry's original_text and
          flip its save path to the supersede RPC. Only unconfirmed
          entries are eligible (the lookup filters by zero confirmations);
          a confirmed-id is silently ignored so the worker can't be tricked
          into "editing" a confirmed entry — they would need the explicit
          correction-request UI for that. */}
      {!anyReviewEnabled && (
        <p
          className="order-4 text-[11px] leading-relaxed text-text-muted"
          data-testid="journal-review-not-enabled-note"
        >
          {t("reviewNotEnabledNote")}
        </p>
      )}
      <div id="journal-composer" className="order-2">
        <JournalEntryComposer
          engagements={engagements}
          directions={directions}
          workerSkills={workerSkills}
          editingEntry={
            editingId
              ? ((entries ?? []).find(
                  (e) =>
                    e.id === editingId &&
                    (e.journal_entry_confirmations ?? []).length === 0,
                )
                  ? {
                      id: editingId,
                      originalText:
                        (entries ?? []).find((e) => e.id === editingId)
                          ?.original_text ?? "",
                    }
                  : null)
              : null
          }
        />
      </div>

      {/* Entry list — lifted to the top so a worker who just logged work sees
          their entries first (P0 UX rescue), not a wall of notices + the form.
          Visual order is set with `order-*` on these flex-column children. */}
      <section id="journal-entries" className="order-1 flex flex-col gap-3 scroll-mt-4" data-testid="journal-entries">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="flex items-baseline gap-2 font-display text-lg font-semibold text-text-primary">
            {t("listTitle")}
            {(entries ?? []).length > 0 && (
              <span
                className="font-mono text-xs font-normal text-text-muted"
                data-testid="journal-entries-count"
              >
                {(entries ?? []).length}
              </span>
            )}
          </h2>
          {/* ONE clear primary action — jump to the create/edit composer below
              (the single create surface; no duplicate route). */}
          <a
            href="#journal-composer"
            className="inline-flex w-fit items-center gap-1.5 rounded-md bg-gradient-to-r from-brand-blue to-brand-cyan px-3 py-1.5 text-sm font-semibold text-ink-900 transition-opacity hover:opacity-90"
            data-testid="journal-new-entry-cta"
          >
            + {t("newEntry")}
          </a>
        </div>
        {/* Honest "who can confirm" line above the entry list: the status chips
            below show "confirmed / awaiting", so name plainly who can actually
            move an entry to confirmed today — only manager / owner / external
            (client) manager. Until then it stays self-declared. No broad
            confirmer is implied. */}
        <p
          className="text-[11px] leading-relaxed text-text-muted"
          data-testid="journal-who-can-confirm"
        >
          {t("whoCanConfirm")}
        </p>
        {/* Evidence Status Strip — one compact legend in the status zone (not
            per row, to avoid overloading the list) that visually separates a
            worker's own self-declared record from a real confirmation. */}
        {(entries ?? []).length > 0 && (
          <EvidenceStatusStrip
            active={journalEvidenceActive}
            data-testid="journal-evidence-status-strip"
          />
        )}
        {(entries ?? []).length === 0 ? (
          <p className="text-sm text-text-secondary">{t("listEmpty")}</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {(entries ?? []).map((e) => {
              const status = deriveReviewResult(e.journal_entry_confirmations);
              // Evidence Decision Timeline v1 — the real, ordered human-decision
              // history (append-only rows). Empty while still submitted → the
              // timeline shows "created → waiting", never a fabricated step.
              const timeline = deriveReviewTimeline(e.journal_entry_confirmations);
              const metrics = e.journal_entry_metrics ?? [];
              const area =
                metrics.find((m) => m.metric_slug === "quantity") ??
                metrics.find((m) => m.metric_slug === "area_done");
              const site = metrics.find((m) => m.metric_slug === "site_name");
              const dir = metrics.find((m) => m.metric_slug === "work_direction");
              // v3 — Delete control is offered only when the entry has no
              // external confirmations yet. The RPC re-enforces the same
              // rule server-side, so a stale client can't escalate.
              const canDelete = (e.journal_entry_confirmations ?? []).length === 0;
              return (
                <JournalEntryRow
                  key={e.id}
                  entryId={e.id}
                  canDelete={canDelete}
                  skillLinks={
                    skillLinksReady
                      ? {
                          availableSkills: availableSkillsForLinks,
                          linkedSkillIds: linksByEntry.get(e.id) ?? [],
                        }
                      : undefined
                  }
                >
                  <div className="flex items-start justify-between gap-3">
                    <p className="text-sm text-text-primary">{e.original_text}</p>
                    <span
                      className={`shrink-0 font-mono text-[11px] uppercase tracking-label ${STATUS_CLASS[status]}`}
                    >
                      {t(`entry.status.${status}`)}
                    </span>
                  </div>
                  <EvidenceDecisionTimeline
                    createdAt={e.created_at}
                    events={timeline}
                  />
                  <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-text-muted">
                    {dir?.value_text && <span>{tProf(dir.value_text)}</span>}
                    {site?.value_text && <span>{site.value_text}</span>}
                    {area?.value_numeric != null && (
                      <span>
                        {/* Time-class units (hours / minutes / days) get the
                            human-readable formatter so a saved "195 min" row
                            reads "3 val. 15 min." in the entries list, not
                            an opaque minute count. Other quantity units
                            (square_meters, pieces, kg, …) fall through to
                            the legacy locale-aware unit label. */}
                        {area.unit_slug === "hours" ||
                        area.unit_slug === "minutes" ||
                        area.unit_slug === "days"
                          ? formatDuration(
                              area.value_numeric,
                              area.unit_slug,
                              locale === "en" ? "en" : "lt",
                            )
                          : `${area.value_numeric} ${
                              area.unit_slug ? tUnit(area.unit_slug) : ""
                            }`}
                      </span>
                    )}
                    <span>
                      {new Date(e.created_at).toLocaleDateString(locale)}
                    </span>
                  </div>
                </JournalEntryRow>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
