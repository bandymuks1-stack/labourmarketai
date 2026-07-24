import { redirect } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { Link } from "@/lib/i18n/navigation";
import { createClient } from "@/lib/supabase/server";
import { getAssistView } from "@/lib/assist/assist";
import { ORG_SUMMARY_SOURCE_KEYS } from "@/lib/assist/assist-model";
import type { Role } from "@/lib/auth/actions";

/**
 * AI assistance centre (control room PR J, capability gap map §10) — ONE
 * controlled surface that is honest in EVERY provider state.
 *
 * Honest by construction (guard: lib/guards/assist-centre.test.ts):
 *  - "What needs my attention" is DETERMINISTIC: composed from the caller's
 *    own real records (notification spine, derived document expiry, derived
 *    finance overdue) — the same numbers those surfaces already show. Every
 *    row names its source and links the REAL page that resolves it.
 *  - The summaries are assembled from real fields by fixed rules (evidence
 *    report tiers, the caller's own project rows) with a visible source
 *    list. No text on this page is produced by a language model.
 *  - The AI provider card shows the runtime's true state (disabled / mock /
 *    live) from the existing config resolver — never a key, never a claim
 *    that generation happened. Generation is deliberately NOT wired in this
 *    slice: the provider is unconfigured in production and the suggestion
 *    audit store is an owner-gated migration (gap map §10 gate register).
 *  - No prompt input, no chat, no confirm-writes — nothing is generated, so
 *    there is nothing to accept. Read-only links throughout (keyboard
 *    accessible by construction).
 */

export const dynamic = "force-dynamic";

const ROLES = new Set<Role>(["worker", "company", "agency", "customer"]);

export default async function AssistPage({
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
  if (!user) redirect(`/${locale}/auth/login`);

  const { data: profile } = await supabase
    .from("profiles")
    .select("active_role")
    .eq("id", user.id)
    .single();
  const role: Role = ROLES.has(profile?.active_role as Role)
    ? (profile!.active_role as Role)
    : "worker";

  const t = await getTranslations("assist");
  const tAll = await getTranslations();

  const view = await getAssistView(role);
  const dateFmt = new Intl.DateTimeFormat(locale, { dateStyle: "medium" });

  const sourcesList = (keys: readonly string[], testid: string) => (
    <p
      className="flex flex-wrap items-center gap-2 text-[11px] text-text-muted"
      data-testid={testid}
    >
      <span className="font-mono uppercase tracking-label">
        {t("sources.label")}:
      </span>
      {keys.map((k) => (
        <span
          key={k}
          className="inline-flex items-center rounded-full border border-ink-500 px-2 py-0.5"
        >
          {t(`sources.${k}`)}
        </span>
      ))}
    </p>
  );

  return (
    <div className="flex flex-col gap-6" data-testid="assist-page">
      <header className="flex flex-col gap-1">
        <p className="font-mono text-[10px] uppercase tracking-label text-brand-orange">
          {t("eyebrow")}
        </p>
        <h1 className="font-display text-3xl font-bold tracking-tightest text-text-primary">
          {t("title")}
        </h1>
        <p className="text-sm text-text-secondary">{t("intro")}</p>
      </header>

      {/* Section 1 — What needs my attention (deterministic composition). */}
      <section
        className="flex flex-col gap-3"
        data-testid="assist-attention"
        aria-labelledby="assist-attention-heading"
      >
        <h2
          id="assist-attention-heading"
          className="font-display text-lg font-semibold tracking-tight text-text-primary"
        >
          {t("attention.title")}
        </h2>
        <p className="text-xs text-text-muted">{t("attention.note")}</p>

        {view.attention.length === 0 ? (
          <p
            className="rounded-md border border-dashed border-ink-500 p-4 text-sm text-text-secondary"
            data-testid="assist-attention-empty"
          >
            {t("attention.empty")}
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {view.attention.map((item) => (
              <li key={item.id}>
                <Link
                  href={item.href as "/dashboard"}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-ink-500 bg-ink-800/30 p-3 transition-colors hover:border-brand-blue focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue"
                  data-testid={`assist-attention-row-${item.id}`}
                >
                  <span className="flex min-w-0 flex-col gap-1">
                    <span className="break-words text-sm font-medium text-text-primary">
                      {tAll(item.labelKey)}
                    </span>
                    <span className="flex flex-wrap items-center gap-2 font-mono text-[10px] uppercase tracking-label text-text-muted">
                      <span className="inline-flex items-center rounded-full border border-ink-500 px-2 py-0.5">
                        {t(`sources.${item.sourceKey}`)}
                      </span>
                      {item.moduleLabelKey ? (
                        <span>{tAll(item.moduleLabelKey)}</span>
                      ) : null}
                    </span>
                  </span>
                  <span className="flex shrink-0 items-center gap-2">
                    <span className="inline-flex min-w-6 items-center justify-center rounded-full bg-brand-blue/15 px-2 py-0.5 text-xs font-semibold tabular-nums text-brand-blue">
                      {item.count}
                    </span>
                    <span className="text-xs text-text-secondary">
                      {t("attention.open")} →
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Section 2 — deterministic summaries (real fields, sources shown). */}
      <section
        className="flex flex-col gap-3"
        data-testid="assist-summaries"
        aria-labelledby="assist-summaries-heading"
      >
        <h2
          id="assist-summaries-heading"
          className="font-display text-lg font-semibold tracking-tight text-text-primary"
        >
          {t("summaries.title")}
        </h2>
        <p className="text-xs text-text-muted">{t("summaries.note")}</p>

        {view.workerSummary ? (
          <div
            className="flex flex-col gap-3 rounded-md border border-ink-500 bg-ink-800/30 p-4"
            data-testid="assist-worker-summary"
          >
            <h3 className="text-sm font-semibold text-text-primary">
              {t("summaries.worker.title")}
            </h3>
            <dl className="grid grid-cols-2 gap-2 sm:grid-cols-5">
              {(
                [
                  ["totalSkills", view.workerSummary.totalSkills],
                  ["workSupported", view.workerSummary.workSupported],
                  ["confirmed", view.workerSummary.confirmed],
                  ["journalEntries", view.workerSummary.journalEntries],
                  ["confirmations", view.workerSummary.confirmations],
                ] as const
              ).map(([key, value]) => (
                <div
                  key={key}
                  className="flex flex-col gap-0.5 rounded-md border border-ink-500 bg-ink-800/40 p-3"
                >
                  <dt className="font-mono text-[10px] uppercase tracking-label text-text-muted">
                    {t(`summaries.worker.${key}`)}
                  </dt>
                  <dd className="text-lg font-semibold tabular-nums text-text-primary">
                    {value}
                  </dd>
                </div>
              ))}
            </dl>
            {sourcesList(view.workerSummary.sourceKeys, "assist-sources")}
            <Link
              href={view.workerSummary.href as "/dashboard"}
              className="w-fit text-sm font-medium text-brand-blue hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue"
              data-testid="assist-worker-summary-link"
            >
              {t("summaries.worker.link")} →
            </Link>
          </div>
        ) : null}

        {view.projects.state !== "not-applicable" ? (
          <div
            className="flex flex-col gap-3 rounded-md border border-ink-500 bg-ink-800/30 p-4"
            data-testid="assist-project-summary"
          >
            <h3 className="text-sm font-semibold text-text-primary">
              {t("summaries.org.title")}
            </h3>
            {view.projects.state === "error" ? (
              <p className="text-sm text-text-secondary">
                {t("summaries.org.error")}
              </p>
            ) : view.projects.rows.length === 0 ? (
              <p className="text-sm text-text-secondary">
                {t("summaries.org.empty")}
              </p>
            ) : (
              <ul className="flex flex-col gap-2">
                {view.projects.rows.map((p) => (
                  <li key={p.id}>
                    <Link
                      href={p.href as "/dashboard"}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-ink-500 bg-ink-800/40 p-3 transition-colors hover:border-brand-blue focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue"
                      data-testid={`assist-project-row-${p.id}`}
                    >
                      <span className="flex min-w-0 flex-col gap-1">
                        <span className="break-words text-sm font-medium text-text-primary">
                          {p.title?.trim() ? p.title : p.id.slice(0, 8)}
                          {p.city ? ` — ${p.city}` : ""}
                        </span>
                        <span className="flex flex-wrap items-center gap-2 font-mono text-[10px] uppercase tracking-label text-text-muted">
                          <span className="inline-flex items-center rounded-full border border-ink-500 px-2 py-0.5">
                            {tAll(p.statusKey)}
                          </span>
                          {p.startDate ? (
                            <span>
                              {dateFmt.format(new Date(p.startDate))}
                              {p.endDate
                                ? ` – ${dateFmt.format(new Date(p.endDate))}`
                                : ""}
                            </span>
                          ) : null}
                          <span>
                            {t("summaries.org.teamSize", {
                              count: p.assignedCount,
                            })}
                          </span>
                        </span>
                      </span>
                      <span className="shrink-0 text-xs text-text-secondary">
                        {t("summaries.org.link")} →
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
            {sourcesList(ORG_SUMMARY_SOURCE_KEYS, "assist-sources")}
          </div>
        ) : null}

        {!view.workerSummary && view.projects.state === "not-applicable" ? (
          <p
            className="rounded-md border border-dashed border-ink-500 p-4 text-sm text-text-secondary"
            data-testid="assist-summaries-none"
          >
            {t("summaries.none")}
          </p>
        ) : null}
      </section>

      {/* Section 3 — honest AI provider state (never a key, never a claim). */}
      <section
        className="flex flex-col gap-3 rounded-md border border-ink-500 bg-ink-800/30 p-4"
        data-testid="assist-provider"
        aria-labelledby="assist-provider-heading"
      >
        <h2
          id="assist-provider-heading"
          className="font-display text-lg font-semibold tracking-tight text-text-primary"
        >
          {t("provider.title")}
        </h2>

        <p className="flex flex-wrap items-center gap-2 text-sm">
          <span className="font-mono text-[10px] uppercase tracking-label text-text-muted">
            {t("provider.stateLabel")}
          </span>
          <span
            className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-semibold ${
              view.provider.state === "disabled"
                ? "border-ink-500 text-text-secondary"
                : "border-brand-blue/50 bg-brand-blue/10 text-brand-blue"
            }`}
            data-testid={`assist-provider-state-${view.provider.state}`}
          >
            {t(`provider.state.${view.provider.state}`)}
          </span>
        </p>

        <p className="text-xs text-text-muted">
          {t(`provider.reason.${view.provider.reason}`)}
        </p>

        {view.provider.state === "disabled" ? (
          <div
            className="flex flex-col gap-2"
            data-testid="assist-provider-disabled"
          >
            <p className="text-sm text-text-secondary">
              {t("provider.disabledBody")}
            </p>
            <p className="text-sm text-text-secondary">
              {t("provider.whenEnabled")}
            </p>
            <p className="rounded-md border border-brand-orange/40 bg-brand-orange/5 px-3 py-2 text-xs text-text-secondary">
              {t("provider.gates")}
            </p>
          </div>
        ) : (
          <div
            className="flex flex-col gap-2"
            data-testid="assist-provider-configured"
          >
            {view.provider.provider ? (
              <p className="text-sm text-text-secondary">
                <span className="font-mono text-[10px] uppercase tracking-label text-text-muted">
                  {t("provider.providerLabel")}:{" "}
                </span>
                {view.provider.provider}
              </p>
            ) : null}
            {view.provider.model ? (
              <p className="text-sm text-text-secondary">
                <span className="font-mono text-[10px] uppercase tracking-label text-text-muted">
                  {t("provider.modelLabel")}:{" "}
                </span>
                {view.provider.model}
              </p>
            ) : null}
            <p className="rounded-md border border-brand-orange/40 bg-brand-orange/5 px-3 py-2 text-xs text-text-secondary">
              {t("provider.notWired")}
            </p>
          </div>
        )}
      </section>
    </div>
  );
}
