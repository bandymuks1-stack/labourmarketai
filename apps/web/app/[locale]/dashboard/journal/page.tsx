import { redirect } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import {
  JournalEntryComposer,
  type JournalEngagement,
} from "@/components/app/journal-entry-composer";
import { createClient } from "@/lib/supabase/server";

// Worker-side relationships that grant access to the Work Journal (§13.1).
// A worker without an active engagement here has nothing to log against.
const WORKER_RELATIONSHIPS = [
  "employee",
  "freelancer",
  "consultant",
  "owner",
  "collaborator",
];

type EntryStatus = "submitted" | "confirmed" | "rejected";

function statusOf(
  confirmations: { confirmation_scope: unknown }[] | null,
): EntryStatus {
  if (!confirmations || confirmations.length === 0) return "submitted";
  const rejected = confirmations.some(
    (c) => (c.confirmation_scope as { action?: string } | null)?.action === "reject",
  );
  return rejected ? "rejected" : "confirmed";
}

const STATUS_CLASS: Record<EntryStatus, string> = {
  submitted: "text-state-warning",
  confirmed: "text-state-success",
  rejected: "text-state-error",
};

/** Worker "Mano dienoraštis" — the closed self-declare loop (M1). Logs work
 *  against an engagement context; entries stay private (visibility 'closed')
 *  until a manager confirms them (§13). */
export default async function JournalPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("journal");
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
      "id, relationship_slug, title, is_primary, organizations(display_name, legal_name, organization_type)",
    )
    .eq("profile_id", user.id)
    .eq("status", "active")
    .in("relationship_slug", WORKER_RELATIONSHIPS)
    .order("is_primary", { ascending: false });

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
    return {
      id: e.id,
      label: `${orgName} · ${tRel(e.relationship_slug)}`,
      isPrimary: e.is_primary,
    };
  });

  if (!worker || engagements.length === 0) {
    return (
      <div className="flex flex-col gap-6">
        <header>
          <h1 className="font-display text-3xl font-bold tracking-tightest text-text-primary">
            {t("navTitle")}
          </h1>
        </header>
        <div className="card-border max-w-2xl p-6">
          <p className="text-sm leading-relaxed text-text-secondary">
            {t("noEngagement")}
          </p>
        </div>
      </div>
    );
  }

  // Self-progress counts by confidence bin (§15 private self-view).
  const { data: skills } = await supabase
    .from("worker_skills")
    .select("confidence_bin")
    .eq("worker_id", worker.id);
  const bins = { red: 0, green: 0, yellow: 0 };
  for (const s of skills ?? []) {
    const b = s.confidence_bin as keyof typeof bins;
    if (b in bins) bins[b] += 1;
  }
  const totalSkills = skills?.length ?? 0;

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

  // Entries with their metrics + confirmation status.
  const { data: entries } = await supabase
    .from("journal_entries")
    .select(
      "id, original_text, created_at, journal_entry_metrics(metric_slug, value_text, value_numeric, unit_slug), journal_entry_confirmations(confirmation_scope)",
    )
    .eq("worker_id", worker.id)
    .order("created_at", { ascending: false });

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col gap-1">
        <h1 className="font-display text-3xl font-bold tracking-tightest text-text-primary">
          {t("navTitle")}
        </h1>
      </header>

      {/* Honest pilot framing — the manager / client confirmation + audit
          layer ships with PR #18 (issue #32). Until then, journal entries
          live with `visibility_scope: "closed"` and there is no external
          attestation yet. Surface that clearly so workers can't be misled
          into thinking the legal backbone is fully live. */}
      <p className="card-border bg-state-warning/5 text-text-secondary p-3 text-xs leading-relaxed">
        {t("pilotBackboneNote")}
      </p>

      {/* Self-progress counter (§15) */}
      <div className="card-border flex flex-col gap-2 p-4">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
          <span className="font-display text-sm font-semibold text-text-primary">
            {t("self_progress.title", { n: totalSkills })}
          </span>
          <span className="text-xs text-state-success">
            {t("self_progress.strongly_confirmed", { n: bins.yellow })}
          </span>
          <span className="text-xs text-text-secondary">
            {t("self_progress.confirmed", { n: bins.green })}
          </span>
          <span className="text-xs text-text-muted">
            {t("self_progress.awaiting", { n: bins.red })}
          </span>
        </div>
        {bins.red > 0 && (
          // Honest explanation of the awaiting count — without it the row
          // reads as "you owe the system 8 entries" instead of "8 of your
          // self-declared skills don't yet have journal evidence".
          <p className="text-[11px] leading-relaxed text-text-muted">
            {t("self_progress.awaitingHint")}
          </p>
        )}
      </div>

      <JournalEntryComposer
        engagements={engagements}
        directions={directions}
        workerSkills={workerSkills}
      />

      {/* Entry list */}
      <section className="flex flex-col gap-3">
        <h2 className="font-display text-lg font-semibold text-text-primary">
          {t("listTitle")}
        </h2>
        {(entries ?? []).length === 0 ? (
          <p className="text-sm text-text-secondary">{t("listEmpty")}</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {(entries ?? []).map((e) => {
              const status = statusOf(e.journal_entry_confirmations);
              const metrics = e.journal_entry_metrics ?? [];
              // Generalised: quantity (any work) + legacy area_done fallback.
              const area =
                metrics.find((m) => m.metric_slug === "quantity") ??
                metrics.find((m) => m.metric_slug === "area_done");
              const site = metrics.find((m) => m.metric_slug === "site_name");
              const dir = metrics.find((m) => m.metric_slug === "work_direction");
              return (
                <li key={e.id} className="card-border p-4">
                  <div className="flex items-start justify-between gap-3">
                    <p className="text-sm text-text-primary">{e.original_text}</p>
                    <span
                      className={`shrink-0 font-mono text-[11px] uppercase tracking-label ${STATUS_CLASS[status]}`}
                    >
                      {t(`entry.status.${status}`)}
                    </span>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-text-muted">
                    {dir?.value_text && <span>{tProf(dir.value_text)}</span>}
                    {site?.value_text && <span>{site.value_text}</span>}
                    {area?.value_numeric != null && (
                      <span>
                        {area.value_numeric}{" "}
                        {area.unit_slug ? tUnit(area.unit_slug) : ""}
                      </span>
                    )}
                    <span>
                      {new Date(e.created_at).toLocaleDateString(locale)}
                    </span>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
