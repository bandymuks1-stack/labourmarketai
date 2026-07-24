import { setRequestLocale, getTranslations } from "next-intl/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { Link } from "@/lib/i18n/navigation";
import { requireSuperadmin } from "@/lib/auth/superadmin";
import { createClient } from "@/lib/supabase/server";

/**
 * Agent OS admin index (v1, read-only).
 *
 * Lists the 10 internal agent roles defined in `docs/agent-os/`. There is
 * no live agent runtime in v1 — each card is a static description + a
 * link to the corresponding doc + a "next safest action" line the owner
 * can review. Future iterations may wire each agent to a real digest.
 *
 * Server-gated by `requireSuperadmin(locale)`; non-admins are redirected
 * to `/dashboard` before any data is fetched.
 */
type AgentCard = {
  key: string;
  titleKey: string;
  summaryKey: string;
  docPath: string;
  scope: "owner_brief" | "ops" | "tester" | "security" | "sales";
};

const AGENTS: AgentCard[] = [
  { key: "chief-operator", titleKey: "chiefOperator.title", summaryKey: "chiefOperator.summary", docPath: "docs/agent-os/agents/chief-operator.md", scope: "owner_brief" },
  { key: "pr-readiness", titleKey: "prReadiness.title", summaryKey: "prReadiness.summary", docPath: "docs/agent-os/agents/pr-readiness.md", scope: "ops" },
  { key: "migration-auditor", titleKey: "migrationAuditor.title", summaryKey: "migrationAuditor.summary", docPath: "docs/agent-os/agents/migration-auditor.md", scope: "ops" },
  { key: "deploy-smoke", titleKey: "deploySmoke.title", summaryKey: "deploySmoke.summary", docPath: "docs/agent-os/agents/deploy-smoke.md", scope: "ops" },
  { key: "tester-journey", titleKey: "testerJourney.title", summaryKey: "testerJourney.summary", docPath: "docs/agent-os/agents/tester-journey.md", scope: "tester" },
  { key: "cv-profile", titleKey: "cvProfile.title", summaryKey: "cvProfile.summary", docPath: "docs/agent-os/agents/cv-profile.md", scope: "tester" },
  { key: "work-journal-evidence", titleKey: "workJournalEvidence.title", summaryKey: "workJournalEvidence.summary", docPath: "docs/agent-os/agents/work-journal-evidence.md", scope: "tester" },
  { key: "language-qa", titleKey: "languageQa.title", summaryKey: "languageQa.summary", docPath: "docs/agent-os/agents/language-qa.md", scope: "tester" },
  { key: "security-privacy", titleKey: "securityPrivacy.title", summaryKey: "securityPrivacy.summary", docPath: "docs/agent-os/agents/security-privacy.md", scope: "security" },
  { key: "pilot-sales-readiness", titleKey: "pilotSalesReadiness.title", summaryKey: "pilotSalesReadiness.summary", docPath: "docs/agent-os/agents/pilot-sales-readiness.md", scope: "sales" },
];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function asAny(supabase: SupabaseClient): any {
  return supabase as unknown;
}

export default async function AdminAgentOsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  await requireSuperadmin(locale);
  setRequestLocale(locale);
  const t = await getTranslations("agentOs");

  // Live counts for the "Pilot command center" panel (Phase 8 of the
  // pilot-launch sprint). Pulls from tables the admin can read via RLS:
  // pilot_events, language_feedback, pilot_drafts. Honest about zero
  // state — if a table is missing on the target DB (migration not yet
  // applied), the count surfaces as null and the panel shows "—".
  const supabase = await createClient();
  const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  // Helper — count or null on RLS / missing-table error.
  const toCount = (r: { count?: number; error: unknown }) =>
    r.error ? null : (r.count ?? 0);

  const [
    eventsRecent,
    eventsErrors,
    feedbackOpen,
    draftsTotal,
    supportThreads,
    conversationMessages,
    companyDrafts,
    agencyDrafts,
    buyerDrafts,
  ] = await Promise.all([
    asAny(supabase)
      .from("pilot_events")
      .select("id", { count: "exact", head: true })
      .gte("created_at", since24h)
      .then(toCount),
    asAny(supabase)
      .from("pilot_events")
      .select("id", { count: "exact", head: true })
      .eq("result", "error")
      .gte("created_at", since24h)
      .then(toCount),
    asAny(supabase)
      .from("language_feedback")
      .select("id", { count: "exact", head: true })
      .eq("status", "open")
      .then(toCount),
    asAny(supabase)
      .from("pilot_drafts")
      .select("id", { count: "exact", head: true })
      .then(toCount),
    asAny(supabase)
      .from("conversations")
      .select("id", { count: "exact", head: true })
      .eq("kind", "support")
      .then(toCount),
    asAny(supabase)
      .from("conversation_messages")
      .select("id", { count: "exact", head: true })
      .then(toCount),
    asAny(supabase)
      .from("pilot_drafts")
      .select("id", { count: "exact", head: true })
      .eq("draft_type", "company_request")
      .then(toCount),
    asAny(supabase)
      .from("pilot_drafts")
      .select("id", { count: "exact", head: true })
      .eq("draft_type", "agency_offer")
      .then(toCount),
    asAny(supabase)
      .from("pilot_drafts")
      .select("id", { count: "exact", head: true })
      .eq("draft_type", "buyer_request")
      .then(toCount),
  ]);

  // Pilot Start Checklist — Workstream A. One "has been observed" signal
  // per critical flow. v2 reuses the counts from the command-center
  // Promise.all above to avoid duplicate round-trips. Login + journal
  // signals are the only extra queries.
  const [loginSignal, journalSignal] = await Promise.all([
    asAny(supabase)
      .from("pilot_events")
      .select("id", { count: "exact", head: true })
      .in("event_name", ["google_oauth_start"])
      .then(toCount),
    asAny(supabase)
      .from("pilot_events")
      .select("id", { count: "exact", head: true })
      .eq("event_name", "journal_save_success")
      .then(toCount),
  ]);

  const checklist: { key: string; observed: number | null }[] = [
    { key: "login", observed: loginSignal },
    { key: "journal", observed: journalSignal },
    { key: "language", observed: feedbackOpen },
    { key: "telemetry", observed: eventsRecent },
    { key: "drafts", observed: draftsTotal },
    { key: "communication", observed: conversationMessages },
  ];

  // Mission-control visual slice (PR C of mega-sprint v2, P8). Scoped to
  // THIS page only — no global redesign, no nav rework, no copy change.
  // Pure Tailwind treatment over the existing data + structure.
  const SCOPE_ACCENT: Record<AgentCard["scope"], string> = {
    owner_brief: "from-brand-blue/40 via-brand-blue/10 to-transparent",
    ops: "from-state-success/40 via-state-success/10 to-transparent",
    tester: "from-brand-orange/40 via-brand-orange/10 to-transparent",
    security: "from-state-danger/40 via-state-danger/10 to-transparent",
    sales: "from-state-warning/40 via-state-warning/10 to-transparent",
  };

  return (
    <div
      className="relative flex flex-col gap-6"
      data-testid="agent-os-mission-control"
    >
      {/* Ambient HUD glow — page-scoped, pointer-events-none so it never
          intercepts clicks. Two radial gradients give depth without
          adding a new wrapper layout. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 -top-12 -z-10 h-72 bg-[radial-gradient(ellipse_at_top,_rgba(57,124,255,0.18),_transparent_60%),radial-gradient(ellipse_at_top_right,_rgba(255,138,69,0.10),_transparent_55%)]"
      />

      <header className="flex flex-col gap-1">
        <p className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-label text-brand-blue">
          <span
            aria-hidden="true"
            className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-brand-blue shadow-[0_0_8px_rgba(57,124,255,0.8)]"
          />
          {t("missionEyebrow")}
        </p>
        <h1 className="font-display text-3xl font-bold tracking-tightest text-text-primary [text-shadow:_0_0_24px_rgba(57,124,255,0.18)]">
          {t("title")}
        </h1>
        <p className="text-sm text-text-secondary">{t("subtitle")}</p>
      </header>

      <section className="card-border relative overflow-hidden bg-state-warning/5 p-4 text-xs leading-relaxed text-text-secondary">
        <span
          aria-hidden="true"
          className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-state-warning/60 to-transparent"
        />
        <p className="font-mono text-[10px] uppercase tracking-label text-text-muted">
          {t("statusEyebrow")}
        </p>
        <p className="mt-1">{t("statusV1Body")}</p>
      </section>

      {/* Pilot command center — Phase 8 of the pilot-launch sprint.
          Live counts pulled from pilot_events / language_feedback /
          pilot_drafts via admin RLS. Honest "—" when a table is missing
          (e.g. 0020 not applied yet). */}
      <section
        className="card-border relative flex flex-col gap-3 overflow-hidden bg-gradient-to-br from-ink-800/40 via-transparent to-brand-blue/[0.04] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.04),0_0_32px_rgba(57,124,255,0.06)]"
        data-testid="agent-os-command-center"
      >
        <span
          aria-hidden="true"
          className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-brand-blue/60 to-transparent"
        />
        <header className="flex items-baseline justify-between gap-2">
          <h2 className="font-display text-base font-semibold text-text-primary">
            {t("commandCenter.title")}
          </h2>
          <span className="font-mono text-[10px] uppercase tracking-label text-text-muted">
            {t("commandCenter.window")}
          </span>
        </header>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="group relative overflow-hidden rounded-md border border-ink-600/60 bg-ink-900/40 p-3 transition-colors hover:border-brand-blue/50">
            <span
              aria-hidden="true"
              className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-brand-blue/50 to-transparent opacity-60"
            />
            <p className="font-mono text-[10px] uppercase tracking-label text-text-muted">
              {t("commandCenter.metric.events24h")}
            </p>
            <p className="mt-1 font-display text-2xl font-bold text-text-primary [text-shadow:_0_0_16px_rgba(57,124,255,0.25)]">
              {eventsRecent ?? "—"}
            </p>
          </div>
          <div className="group relative overflow-hidden rounded-md border border-ink-600/60 bg-ink-900/40 p-3 transition-colors hover:border-state-danger/50">
            <span
              aria-hidden="true"
              className={`absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-state-danger/50 to-transparent ${
                (eventsErrors ?? 0) > 0 ? "opacity-90" : "opacity-30"
              }`}
            />
            <p className="font-mono text-[10px] uppercase tracking-label text-text-muted">
              {t("commandCenter.metric.errors24h")}
            </p>
            <p
              className={`mt-1 font-display text-2xl font-bold ${
                (eventsErrors ?? 0) > 0
                  ? "text-state-danger [text-shadow:_0_0_16px_rgba(232,72,72,0.45)]"
                  : "text-text-primary"
              }`}
            >
              {eventsErrors ?? "—"}
            </p>
          </div>
          <div className="group relative overflow-hidden rounded-md border border-ink-600/60 bg-ink-900/40 p-3 transition-colors hover:border-brand-orange/50">
            <span
              aria-hidden="true"
              className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-brand-orange/50 to-transparent opacity-60"
            />
            <p className="font-mono text-[10px] uppercase tracking-label text-text-muted">
              {t("commandCenter.metric.languageOpen")}
            </p>
            <p className="mt-1 font-display text-2xl font-bold text-text-primary">
              {feedbackOpen ?? "—"}
            </p>
          </div>
          <div className="group relative overflow-hidden rounded-md border border-ink-600/60 bg-ink-900/40 p-3 transition-colors hover:border-state-success/50">
            <span
              aria-hidden="true"
              className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-state-success/50 to-transparent opacity-60"
            />
            <p className="font-mono text-[10px] uppercase tracking-label text-text-muted">
              {t("commandCenter.metric.draftsTotal")}
            </p>
            <p className="mt-1 font-display text-2xl font-bold text-text-primary">
              {draftsTotal ?? "—"}
            </p>
            <p className="mt-1 font-mono text-[10px] text-text-muted">
              {t("commandCenter.metric.draftsBreakdown", {
                company: companyDrafts ?? 0,
                agency: agencyDrafts ?? 0,
                buyer: buyerDrafts ?? 0,
              })}
            </p>
          </div>
          <div className="rounded-md border border-ink-600/60 p-3">
            <p className="font-mono text-[10px] uppercase tracking-label text-text-muted">
              {t("commandCenter.metric.supportThreads")}
            </p>
            <p className="mt-1 font-display text-2xl font-bold text-text-primary">
              {supportThreads ?? "—"}
            </p>
          </div>
          <div className="rounded-md border border-ink-600/60 p-3">
            <p className="font-mono text-[10px] uppercase tracking-label text-text-muted">
              {t("commandCenter.metric.communicationMessages")}
            </p>
            <p className="mt-1 font-display text-2xl font-bold text-text-primary">
              {conversationMessages ?? "—"}
            </p>
          </div>
        </div>
        <p className="text-[11px] text-text-muted">
          {t("commandCenter.footnote")}
        </p>
      </section>

      {/* Pilot Start Checklist (Workstream A). Each row = one critical
          flow. "✓" when at least one signal observed; "—" when the table
          is missing on this DB. Read-only; admin only via the page gate. */}
      <section
        className="card-border relative flex flex-col gap-3 overflow-hidden p-4"
        data-testid="pilot-start-checklist"
      >
        <span
          aria-hidden="true"
          className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-state-success/50 to-transparent"
        />
        <header className="flex items-baseline justify-between gap-2">
          <h2 className="font-display text-base font-semibold text-text-primary">
            {t("checklist.title")}
          </h2>
          <span className="font-mono text-[10px] uppercase tracking-label text-text-muted">
            {t("checklist.scope")}
          </span>
        </header>
        <ul className="flex flex-col gap-1.5 text-xs">
          {checklist.map((row) => {
            const status =
              row.observed === null
                ? "unknown"
                : row.observed > 0
                  ? "ok"
                  : "pending";
            const symbol = status === "ok" ? "✓" : status === "pending" ? "·" : "—";
            const colour =
              status === "ok"
                ? "text-state-success"
                : status === "pending"
                  ? "text-text-muted"
                  : "text-state-warning";
            return (
              <li
                key={row.key}
                className="flex items-center justify-between gap-3"
                data-testid={`pilot-checklist-${row.key}`}
              >
                <span className={`font-mono text-sm font-bold ${colour}`}>
                  {symbol}
                </span>
                <span className="flex-1 text-text-secondary">
                  {t(`checklist.item.${row.key}`)}
                </span>
                <span className="font-mono text-[10px] text-text-muted">
                  {row.observed === null ? "—" : row.observed}
                </span>
              </li>
            );
          })}
        </ul>
        <p className="text-[11px] leading-relaxed text-text-muted">
          {t("checklist.footnote")}
        </p>
      </section>

      <div className="grid gap-3 md:grid-cols-2">
        {AGENTS.map((a) => (
          <article
            key={a.key}
            className="card-border group relative flex flex-col gap-2 overflow-hidden p-4 transition-colors hover:border-brand-blue/40"
            data-testid={`agent-os-card-${a.key}`}
          >
            <span
              aria-hidden="true"
              className={`pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r ${SCOPE_ACCENT[a.scope]}`}
            />
            <span
              aria-hidden="true"
              className="pointer-events-none absolute -top-12 -right-12 h-32 w-32 rounded-full bg-brand-blue/[0.04] blur-2xl opacity-0 transition-opacity group-hover:opacity-100"
            />
            <header className="flex items-baseline justify-between gap-2">
              <h2 className="font-display text-base font-semibold text-text-primary">
                {t(a.titleKey)}
              </h2>
              <span className="font-mono text-[10px] uppercase tracking-label text-text-muted">
                {t(`scope.${a.scope}`)}
              </span>
            </header>
            <p className="text-xs leading-relaxed text-text-secondary">
              {t(a.summaryKey)}
            </p>
            <p className="mt-1 font-mono text-[10px] text-text-muted">
              {a.docPath}
            </p>
          </article>
        ))}
      </div>

      <section className="flex flex-wrap gap-3">
        <Link
          href="/dashboard/admin/telemetry"
          className="rounded-md border border-brand-blue/40 bg-brand-blue/[0.04] px-4 py-2 text-xs text-text-secondary transition-all hover:border-brand-blue hover:bg-brand-blue/[0.08] hover:text-text-primary hover:shadow-[0_0_16px_rgba(57,124,255,0.25)]"
        >
          {t("links.telemetry")}
        </Link>
        <Link
          href="/dashboard/admin/language-feedback"
          className="rounded-md border border-brand-blue/40 bg-brand-blue/[0.04] px-4 py-2 text-xs text-text-secondary transition-all hover:border-brand-blue hover:bg-brand-blue/[0.08] hover:text-text-primary hover:shadow-[0_0_16px_rgba(57,124,255,0.25)]"
        >
          {t("links.languageFeedback")}
        </Link>
        <Link
          href="/dashboard/admin"
          className="rounded-md border border-ink-500 px-4 py-2 text-xs text-text-secondary transition-all hover:border-brand-blue hover:text-text-primary"
        >
          {t("links.adminHome")}
        </Link>
      </section>

      <p className="text-[11px] text-text-muted">{t("footnote")}</p>
    </div>
  );
}
