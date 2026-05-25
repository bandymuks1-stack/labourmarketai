import { setRequestLocale, getTranslations } from "next-intl/server";
import { Link } from "@/lib/i18n/navigation";
import { requireSuperadmin } from "@/lib/auth/superadmin";

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

export default async function AdminAgentOsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  await requireSuperadmin(locale);
  setRequestLocale(locale);
  const t = await getTranslations("agentOs");

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="font-display text-3xl font-bold tracking-tightest text-text-primary">
          {t("title")}
        </h1>
        <p className="text-sm text-text-secondary">{t("subtitle")}</p>
      </header>

      <section className="card-border bg-state-warning/5 p-4 text-xs leading-relaxed text-text-secondary">
        <p className="font-mono text-[10px] uppercase tracking-label text-text-muted">
          {t("statusEyebrow")}
        </p>
        <p className="mt-1">{t("statusV1Body")}</p>
      </section>

      <div className="grid gap-3 md:grid-cols-2">
        {AGENTS.map((a) => (
          <article
            key={a.key}
            className="card-border flex flex-col gap-2 p-4"
            data-testid={`agent-os-card-${a.key}`}
          >
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
          href="/dashboard/admin/pilot-telemetry"
          className="rounded-md border border-brand-blue/40 px-4 py-2 text-xs text-text-secondary hover:border-brand-blue hover:text-text-primary"
        >
          {t("links.telemetry")}
        </Link>
        <Link
          href="/dashboard/admin/language-feedback"
          className="rounded-md border border-brand-blue/40 px-4 py-2 text-xs text-text-secondary hover:border-brand-blue hover:text-text-primary"
        >
          {t("links.languageFeedback")}
        </Link>
        <Link
          href="/dashboard/admin"
          className="rounded-md border border-ink-500 px-4 py-2 text-xs text-text-secondary hover:border-brand-blue hover:text-text-primary"
        >
          {t("links.adminHome")}
        </Link>
      </section>

      <p className="text-[11px] text-text-muted">{t("footnote")}</p>
    </div>
  );
}
