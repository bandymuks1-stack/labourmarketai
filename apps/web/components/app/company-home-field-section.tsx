import { getTranslations } from "next-intl/server";
import {
  AlertTriangle,
  ArrowRight,
  Ban,
  Bell,
  CalendarClock,
  CheckCircle2,
  CircleDashed,
  FileWarning,
  Handshake,
  Play,
  UserPlus,
  Users,
} from "lucide-react";

import { Link } from "@/lib/i18n/navigation";
import { createUtcFormatter } from "@/lib/time/display";
import { CAPABILITY_CHOICES } from "@/lib/organizations/capability-choices";
import type { CustomerRequestRow } from "@/lib/buyer/customer-requests";
import type { ClientConnectionInvite } from "@/lib/agency/bridge-model";
import type { AgencyClient } from "@/lib/agency/clients-model";
import {
  COMPANY_HOME_BLOCK_LIMIT,
  attentionChipHref,
  selectOpenNeeds,
  type RiskSignal,
} from "@/lib/company/company-home-field-model";
import type { CompanyHomeField, HomeProjectRow } from "@/lib/company/company-home-field";

/**
 * THE ORGANISATION'S HOME — projects in time × who is free (frozen design
 * contract §2.6 C1, §5 P5; design system §I): capabilities strip → each active
 * project as ONE row [now | next (derived) | risk] → four objects: who is free
 * now · missing within 4 weeks · needs you · partners.
 *
 * An in-page section of the declared company surface (the #1453 shape), not a
 * standalone card and not a second dashboard. NO conversation here — the chat
 * stays on demand; every object leads to the SAME page or action the chat
 * would dispatch (open project / operations / the need / planning / invite),
 * so nothing is visual-only. No KPI tiles: a number appears only where it
 * leads to an action. Empty states say what is true and offer the one next
 * step. State is never carried by colour alone (edge + icon + text).
 */

type Tone = "now" | "next" | "risk" | "ok" | "quiet";

const TONE_EDGE: Record<Tone, string> = {
  now: "border-l-4 border-l-brand-cyan",
  next: "border-l-4 border-l-ink-500 border-dashed",
  risk: "border-l-4 border-l-state-amber",
  ok: "border-l-4 border-l-state-success",
  quiet: "border-l-4 border-l-ink-600",
};

const ACTION_LINK =
  "inline-flex min-h-11 items-center gap-1.5 rounded-control border border-ink-500 bg-ink-800/40 px-3 py-2 text-xs font-medium text-text-primary transition-colors hover:border-brand-blue focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-cyan";
const PRIMARY_LINK =
  "inline-flex min-h-11 items-center gap-1.5 rounded-control border border-brand-blue/50 bg-brand-blue/10 px-3 py-2 text-xs font-semibold text-brand-blue transition-colors hover:border-brand-blue focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-cyan";

export interface CompanyHomePartners {
  /** Agencies connected to (or inviting) this company — client side of the bridge. */
  readonly agencies: readonly ClientConnectionInvite[] | null;
  /** The agency's own client records — staffing-agency mode only. */
  readonly clients: readonly AgencyClient[] | null;
  /** The company's own teams (brigades), when the model is applied. */
  readonly teams: readonly { readonly id: string; readonly name: string; readonly members: number }[] | null;
}

export async function CompanyHomeFieldSection({
  locale,
  capabilities,
  field,
  needs,
  partners,
}: {
  readonly locale: string;
  readonly capabilities: readonly string[];
  readonly field: CompanyHomeField;
  readonly needs:
    | { readonly kind: "ok"; readonly rows: readonly CustomerRequestRow[] }
    | { readonly kind: "needs-migration" }
    | { readonly kind: "error" };
  readonly partners: CompanyHomePartners;
}) {
  const t = await getTranslations("companyHome");
  const tRoot = await getTranslations();
  const tStatus = await getTranslations("projects.map.status");
  // UTC-pinned (W12): the canonical formatter handles date-only strings and
  // returns null for absent/invalid input, so every empty state stays intact.
  const day = createUtcFormatter(locale, { day: "numeric", month: "short" });

  const declared = CAPABILITY_CHOICES.filter((c) => capabilities.includes(c.slug));
  const statusLabel = (s: HomeProjectRow["status"]): string =>
    s ? tStatus(s) : t("projects.status.unknown");

  const riskLine = (s: RiskSignal): string => {
    switch (s.code) {
      case "overdue_tasks":
        return t("projects.riskOverdue", { count: s.count });
      case "blocked_stages":
        return t("projects.riskBlocked", { count: s.count });
      case "missing_documents":
        return t("projects.riskDocs", { count: s.count });
      case "nobody_on_live_project":
        return t("projects.riskNobody");
    }
  };

  // ── missing within 4 weeks: open needs + document gaps (already read) ──
  const openNeeds = needs.kind === "ok" ? selectOpenNeeds(needs.rows) : [];
  const docGaps =
    field.projects.kind === "ok"
      ? field.projects.rows
          .map((r) => ({
            projectId: r.projectId,
            title: r.title,
            count: r.risk.find((s) => s.code === "missing_documents")?.count ?? 0,
          }))
          .filter((g) => g.count > 0)
      : [];

  // ── partners: only from reads that exist for this company; omitted otherwise ──
  const agencyRows = (partners.agencies ?? []).slice(0, COMPANY_HOME_BLOCK_LIMIT);
  const clientRows = (partners.clients ?? []).slice(0, COMPANY_HOME_BLOCK_LIMIT);
  const teamRows = (partners.teams ?? []).slice(0, COMPANY_HOME_BLOCK_LIMIT);
  const partnersReadable =
    partners.agencies !== null || partners.clients !== null || partners.teams !== null;
  const partnerCount = agencyRows.length + clientRows.length + teamRows.length;

  const projectsHref = "/dashboard/projects" as "/dashboard";
  const planningHref = "/dashboard/company/planning" as "/dashboard";
  const inviteHref = "/dashboard/network?type=join_as_employee" as "/dashboard";
  const partnerInviteHref = "/dashboard/network" as "/dashboard";

  return (
    <section
      aria-labelledby="company-home-field-title"
      data-testid="company-home-field"
      className="flex flex-col gap-5 rounded-card border border-ink-600 border-t-4 border-t-brand-orange bg-surface-1/40 p-4 sm:p-5"
    >
      {/* ── capabilities strip: what the organisation does, all at once ── */}
      <header className="flex flex-col gap-2">
        <p className="font-mono text-meta uppercase tracking-label text-brand-orange">
          {t("eyebrow")}
        </p>
        <h2
          id="company-home-field-title"
          className="font-display text-xl font-semibold tracking-tightest text-text-primary"
        >
          {t("title")}
        </h2>
        <div className="flex flex-wrap items-center gap-1.5" data-testid="company-home-roles">
          <span className="sr-only">{t("rolesLabel")}</span>
          {declared.length > 0 ? (
            declared.map((c) => (
              <span
                key={c.slug}
                data-testid={`company-home-role-${c.slug}`}
                className="rounded-full border border-brand-orange/40 bg-brand-orange/5 px-2.5 py-1 text-meta font-medium text-text-primary"
              >
                {tRoot(c.labelKey)}
              </span>
            ))
          ) : (
            <span className="text-meta text-text-muted">{t("rolesNone")}</span>
          )}
          <a
            href="#company-capabilities"
            className="ml-1 inline-flex min-h-11 items-center text-meta font-medium text-brand-blue hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-cyan"
            data-testid="company-home-roles-edit"
          >
            {t("rolesDeclare")} →
          </a>
        </div>
      </header>

      {/* ── projects in time: one row per active project ── */}
      <div className="flex flex-col gap-2" data-testid="company-home-projects">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="font-display text-sm font-semibold text-text-primary">
            {t("projects.heading")}
          </h3>
          {field.projects.kind === "ok" && field.projects.total > field.projects.rows.length ? (
            <Link
              href={projectsHref}
              className="text-meta font-medium text-brand-blue hover:underline"
              data-testid="company-home-projects-more"
            >
              {t("projects.more", { count: field.projects.total - field.projects.rows.length })} →
            </Link>
          ) : null}
        </div>

        {field.projects.kind === "ok" ? (
          <ol className="flex flex-col gap-2">
            {field.projects.rows.map((p) => {
              const nowTone: Tone =
                p.timeline.now.kind === "in_progress"
                  ? "now"
                  : p.timeline.now.kind === "blocked"
                    ? "risk"
                    : "quiet";
              const riskTone: Tone = !p.riskKnown ? "quiet" : p.risk.length > 0 ? "risk" : "ok";
              const summary = [
                p.title,
                statusLabel(p.status),
                p.timeline.now.kind === "in_progress" || p.timeline.now.kind === "blocked"
                  ? `${t("projects.now")}: ${p.timeline.now.name}`
                  : t("projects.nowNone"),
                p.riskKnown && p.risk.length > 0
                  ? `${t("projects.risk")}: ${p.risk.map(riskLine).join(", ")}`
                  : null,
                t("projects.operations"),
              ]
                .filter(Boolean)
                .join(" · ");
              return (
                <li key={p.projectId}>
                  <article
                    aria-label={summary}
                    data-testid={`company-home-project-${p.projectId}`}
                    className="grid min-w-0 gap-3 rounded-card border border-ink-600 bg-ink-800/40 p-3 md:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)]"
                  >
                    {/* identity: name · status · people chips */}
                    <div className="flex min-w-0 flex-col gap-1.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <Link
                          href={`/dashboard/projects/${p.projectId}` as "/dashboard"}
                          className="min-w-0 break-words font-display text-base font-semibold text-text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-cyan"
                          data-testid="company-home-project-open"
                        >
                          {p.title}
                        </Link>
                        <span className="rounded-full border border-ink-500 px-2 py-0.5 font-mono text-meta uppercase tracking-label text-text-secondary">
                          {statusLabel(p.status)}
                        </span>
                      </div>
                      <div className="flex flex-wrap items-center gap-1.5">
                        <Users className="h-3.5 w-3.5 text-text-muted" aria-hidden />
                        <span className="text-meta text-text-secondary">
                          {t("projects.peopleCount", { count: p.people })}
                        </span>
                        {p.peopleNames.map((n, i) => (
                          <span
                            key={`${p.projectId}-${i}`}
                            className="rounded-full bg-ink-700 px-2 py-0.5 text-meta text-text-primary"
                          >
                            {n}
                          </span>
                        ))}
                        {p.people > p.peopleNames.length ? (
                          <span className="text-meta text-text-muted">
                            +{p.people - p.peopleNames.length}
                          </span>
                        ) : null}
                      </div>
                      <div className="mt-1 flex flex-wrap gap-2">
                        <Link
                          href={`/dashboard/projects/${p.projectId}/operations` as "/dashboard"}
                          className={PRIMARY_LINK}
                          data-testid="company-home-project-operations"
                        >
                          {t("projects.operations")}
                          <ArrowRight className="h-3.5 w-3.5" aria-hidden />
                        </Link>
                        {p.people === 0 ? (
                          <Link
                            href={
                              `/dashboard/network?type=join_project&project=${p.projectId}` as "/dashboard"
                            }
                            className={ACTION_LINK}
                            data-testid="company-home-project-invite"
                          >
                            <UserPlus className="h-3.5 w-3.5" aria-hidden />
                            {t("projects.invite")}
                          </Link>
                        ) : null}
                      </div>
                    </div>

                    {/* NOW — a fact from stage status */}
                    <div className={`flex min-w-0 flex-col gap-1 rounded-control bg-ink-900/40 px-3 py-2 ${TONE_EDGE[nowTone]}`}>
                      <span className="font-mono text-meta uppercase tracking-label text-text-muted">
                        {t("projects.now")}
                      </span>
                      {p.timeline.now.kind === "in_progress" ? (
                        <span className="inline-flex items-start gap-1.5 text-sm text-text-primary">
                          <Play className="mt-0.5 h-3.5 w-3.5 shrink-0 text-brand-cyan" aria-hidden />
                          <span className="min-w-0 break-words">{p.timeline.now.name}</span>
                        </span>
                      ) : p.timeline.now.kind === "blocked" ? (
                        <span className="inline-flex items-start gap-1.5 text-sm text-text-primary">
                          <Ban className="mt-0.5 h-3.5 w-3.5 shrink-0 text-state-amber" aria-hidden />
                          <span className="min-w-0 break-words">
                            {t("projects.nowBlocked", { name: p.timeline.now.name })}
                          </span>
                        </span>
                      ) : p.timeline.now.kind === "unavailable" ? (
                        <span className="text-sm text-text-muted">{t("projects.stagesUnavailable")}</span>
                      ) : (
                        <span className="text-sm text-text-muted">{t("projects.nowNone")}</span>
                      )}
                      {p.timeline.total > 0 ? (
                        <span className="font-mono text-meta text-text-muted tabular-nums">
                          {t("projects.stagesDone", { done: p.timeline.done, total: p.timeline.total })}
                        </span>
                      ) : null}
                    </div>

                    {/* NEXT — derived from the stage order, said so */}
                    <div className={`flex min-w-0 flex-col gap-1 rounded-control bg-ink-900/40 px-3 py-2 ${TONE_EDGE.next}`}>
                      <span className="font-mono text-meta uppercase tracking-label text-text-muted">
                        {t("projects.next")}
                      </span>
                      {p.timeline.next.kind === "derived" ? (
                        <>
                          <span className="inline-flex items-start gap-1.5 text-sm text-text-primary">
                            <CircleDashed className="mt-0.5 h-3.5 w-3.5 shrink-0 text-text-secondary" aria-hidden />
                            <span className="min-w-0 break-words">
                              {p.timeline.next.name}
                              {day(p.timeline.next.plannedStart)
                                ? ` · ${t("projects.nextFrom", { date: day(p.timeline.next.plannedStart) ?? "" })}`
                                : ""}
                            </span>
                          </span>
                          <span className="text-meta italic text-text-muted" data-testid="company-home-next-derived">
                            {t("projects.nextDerived")}
                          </span>
                        </>
                      ) : p.timeline.next.kind === "unavailable" ? (
                        <span className="text-sm text-text-muted">{t("projects.stagesUnavailable")}</span>
                      ) : (
                        <span className="text-sm text-text-muted">{t("projects.nextNone")}</span>
                      )}
                    </div>

                    {/* RISK — the chat's project-risk facts, organisation context only */}
                    <div className={`flex min-w-0 flex-col gap-1 rounded-control bg-ink-900/40 px-3 py-2 ${TONE_EDGE[riskTone]}`}>
                      <span className="font-mono text-meta uppercase tracking-label text-text-muted">
                        {t("projects.risk")}
                      </span>
                      {!p.riskKnown ? (
                        <span className="text-sm text-text-muted">{t("projects.riskUnknown")}</span>
                      ) : p.risk.length === 0 ? (
                        <span className="inline-flex items-center gap-1.5 text-sm text-text-secondary">
                          <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-state-success" aria-hidden />
                          {t("projects.riskNone")}
                        </span>
                      ) : (
                        <ul className="flex flex-col gap-0.5">
                          {p.risk.map((s) => (
                            <li key={s.code} className="inline-flex items-start gap-1.5 text-sm text-text-primary">
                              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-state-amber" aria-hidden />
                              <span className="min-w-0 break-words">{riskLine(s)}</span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </article>
                </li>
              );
            })}
          </ol>
        ) : field.projects.kind === "empty" ? (
          <div className="flex flex-col gap-2 rounded-card border border-dashed border-ink-500 p-4" data-testid="company-home-projects-empty">
            <p className="text-sm text-text-secondary">{t("projects.empty")}</p>
            <Link href="/dashboard/company/projects/new" className={`${PRIMARY_LINK} w-fit`}>
              {t("projects.emptyCta")}
              <ArrowRight className="h-3.5 w-3.5" aria-hidden />
            </Link>
          </div>
        ) : field.projects.kind === "no-company" ? (
          <p className="text-sm text-text-muted">{t("projects.noCompany")}</p>
        ) : (
          <p className="text-sm text-text-muted" data-testid="company-home-projects-error">
            {t("projects.error")}
          </p>
        )}
      </div>

      {/* ── four objects ── */}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {/* capacity now — the chat's who-is-free read */}
        <section
          aria-labelledby="company-home-capacity-title"
          data-testid="company-home-capacity"
          className="flex min-w-0 flex-col gap-2 rounded-card border border-ink-600 bg-ink-800/40 p-3"
        >
          <h3 id="company-home-capacity-title" className="inline-flex items-center gap-1.5 font-display text-sm font-semibold text-text-primary">
            <Users className="h-4 w-4 text-brand-cyan" aria-hidden />
            {t("capacity.heading")}
          </h3>
          {field.capacity.kind === "ok" ? (
            <>
              <p className="font-mono text-meta text-text-muted">
                {day(field.capacity.from) ?? field.capacity.from} – {day(field.capacity.to) ?? field.capacity.to}
              </p>
              <ul className="flex flex-col gap-1">
                {field.capacity.rows.map((w) => (
                  <li
                    key={w.workerId}
                    className={`flex flex-wrap items-center justify-between gap-1 rounded-control bg-ink-900/40 px-2.5 py-1.5 ${w.state === "free" ? TONE_EDGE.ok : TONE_EDGE.quiet}`}
                    data-testid={`company-home-capacity-${w.state}`}
                  >
                    <span className="min-w-0 break-words text-sm text-text-primary">{w.label}</span>
                    <span className="inline-flex items-center gap-1 text-meta text-text-secondary">
                      {w.state === "free" ? (
                        <>
                          <CheckCircle2 className="h-3 w-3 text-state-success" aria-hidden />
                          {t("capacity.free")}
                        </>
                      ) : (
                        <>
                          <CalendarClock className="h-3 w-3 text-text-muted" aria-hidden />
                          {w.unavailableUntil
                            ? t("capacity.awayUntil", { date: day(w.unavailableUntil) ?? w.unavailableUntil })
                            : t("capacity.away")}
                        </>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
              {!field.capacity.absencesKnown ? (
                <p className="text-meta text-text-muted">{t("capacity.absencesUnknown")}</p>
              ) : null}
              {field.capacity.rosterTotal > field.capacity.rows.length ? (
                <p className="text-meta text-text-muted">
                  {t("capacity.more", { count: field.capacity.rosterTotal - field.capacity.rows.length })}
                </p>
              ) : null}
              <div className="mt-auto flex flex-wrap gap-2 pt-1">
                <Link href={projectsHref} className={PRIMARY_LINK} data-testid="company-home-capacity-assign">
                  {t("capacity.assign")}
                  <ArrowRight className="h-3.5 w-3.5" aria-hidden />
                </Link>
                <Link href={planningHref} className={ACTION_LINK}>
                  {t("capacity.plan")}
                </Link>
              </div>
            </>
          ) : field.capacity.kind === "empty" ? (
            <>
              <p className="text-sm text-text-secondary">{t("capacity.empty")}</p>
              <Link href={inviteHref} className={`${PRIMARY_LINK} mt-auto w-fit`} data-testid="company-home-capacity-invite">
                <UserPlus className="h-3.5 w-3.5" aria-hidden />
                {t("capacity.emptyCta")}
              </Link>
            </>
          ) : (
            <p className="text-sm text-text-muted">{t("capacity.error")}</p>
          )}
        </section>

        {/* missing within 4 weeks — open needs + document gaps */}
        <section
          aria-labelledby="company-home-missing-title"
          data-testid="company-home-missing"
          className="flex min-w-0 flex-col gap-2 rounded-card border border-ink-600 bg-ink-800/40 p-3"
        >
          <h3 id="company-home-missing-title" className="inline-flex items-center gap-1.5 font-display text-sm font-semibold text-text-primary">
            <CircleDashed className="h-4 w-4 text-state-amber" aria-hidden />
            {t("missing.heading")}
          </h3>
          {openNeeds.length === 0 && docGaps.length === 0 ? (
            <p className="text-sm text-text-secondary">{t("missing.nothing")}</p>
          ) : null}
          {openNeeds.length > 0 ? (
            <ul className="flex flex-col gap-1">
              {openNeeds.map((n) => (
                <li
                  key={n.id}
                  className={`flex flex-col gap-1 rounded-control border border-dashed border-ink-500 bg-ink-900/40 px-2.5 py-1.5`}
                  data-testid="company-home-need"
                >
                  <span className="min-w-0 break-words text-sm text-text-primary">{n.title}</span>
                  <span className="font-mono text-meta text-text-muted">
                    {[
                      n.teamSize ? t("missing.people", { count: n.teamSize }) : null,
                      n.startPeriod ? t("missing.from", { period: n.startPeriod }) : null,
                      n.location ?? null,
                    ]
                      .filter(Boolean)
                      .join(" · ") || t(`missing.status.${n.status}`)}
                  </span>
                  {n.status === "draft" ? (
                    <a href="#demand-intake" className={`${ACTION_LINK} w-fit`} data-testid="company-home-need-continue">
                      {t("missing.continueDraft")}
                    </a>
                  ) : (
                    <Link
                      href={`/dashboard/company/scouting?request=${n.id}` as "/dashboard"}
                      className={`${ACTION_LINK} w-fit`}
                      data-testid="company-home-need-open"
                    >
                      {t("missing.openNeed")}
                      <ArrowRight className="h-3.5 w-3.5" aria-hidden />
                    </Link>
                  )}
                </li>
              ))}
            </ul>
          ) : null}
          {docGaps.length > 0 ? (
            <ul className="flex flex-col gap-1">
              {docGaps.map((g) => (
                <li
                  key={g.projectId}
                  className={`flex flex-col gap-1 rounded-control bg-ink-900/40 px-2.5 py-1.5 ${TONE_EDGE.risk}`}
                  data-testid="company-home-doc-gap"
                >
                  <span className="inline-flex items-start gap-1.5 text-sm text-text-primary">
                    <FileWarning className="mt-0.5 h-3.5 w-3.5 shrink-0 text-state-amber" aria-hidden />
                    <span className="min-w-0 break-words">
                      {t("missing.gapsRow", { count: g.count, project: g.title })}
                    </span>
                  </span>
                  <Link
                    href={`/dashboard/projects/${g.projectId}/operations` as "/dashboard"}
                    className={`${ACTION_LINK} w-fit`}
                  >
                    {t("missing.gapsCta")}
                    <ArrowRight className="h-3.5 w-3.5" aria-hidden />
                  </Link>
                </li>
              ))}
            </ul>
          ) : null}
          <a href="#demand-intake" className={`${PRIMARY_LINK} mt-auto w-fit`} data-testid="company-home-need-new">
            {t("missing.needsCta")}
          </a>
        </section>

        {/* needs you — the chat's opening brief, without the chat */}
        <section
          aria-labelledby="company-home-attention-title"
          data-testid="company-home-attention"
          className="flex min-w-0 flex-col gap-2 rounded-card border border-ink-600 bg-ink-800/40 p-3"
        >
          <h3 id="company-home-attention-title" className="inline-flex items-center gap-1.5 font-display text-sm font-semibold text-text-primary">
            <Bell className="h-4 w-4 text-brand-orange" aria-hidden />
            {t("attention.heading")}
          </h3>
          {field.attention.kind === "brief" ? (
            <>
              <ul className="flex flex-col gap-1">
                {field.attention.lines.map((line, i) => (
                  <li
                    key={i}
                    className={`rounded-control bg-ink-900/40 px-2.5 py-1.5 text-sm text-text-primary ${TONE_EDGE.risk}`}
                    data-testid="company-home-attention-line"
                  >
                    {line}
                  </li>
                ))}
              </ul>
              <div className="mt-auto flex flex-wrap gap-2 pt-1">
                {field.attention.chips.map((chip) => {
                  const href = attentionChipHref(chip.id);
                  if (!href) return null;
                  return href.includes("#") ? (
                    <a key={chip.id} href={href.replace(/^\/dashboard\/company/, "")} className={ACTION_LINK}>
                      {chip.label}
                    </a>
                  ) : (
                    <Link key={chip.id} href={href as "/dashboard"} className={ACTION_LINK}>
                      {chip.label}
                      <ArrowRight className="h-3.5 w-3.5" aria-hidden />
                    </Link>
                  );
                })}
              </div>
            </>
          ) : field.attention.kind === "unavailable" ? (
            <p className="inline-flex items-center gap-1.5 text-sm text-text-secondary" data-testid="company-home-attention-unavailable">
              <AlertTriangle className="h-3.5 w-3.5 text-state-amber" aria-hidden />
              {t("attention.unavailable")}
            </p>
          ) : (
            <p className="inline-flex items-center gap-1.5 text-sm text-text-secondary" data-testid="company-home-attention-none">
              <CheckCircle2 className="h-3.5 w-3.5 text-state-success" aria-hidden />
              {t("attention.none")}
            </p>
          )}
        </section>

        {/* partners — only from reads that exist; omitted when none does */}
        {partnersReadable ? (
          <section
            aria-labelledby="company-home-partners-title"
            data-testid="company-home-partners"
            className="flex min-w-0 flex-col gap-2 rounded-card border border-ink-600 bg-ink-800/40 p-3"
          >
            <h3 id="company-home-partners-title" className="inline-flex items-center gap-1.5 font-display text-sm font-semibold text-text-primary">
              <Handshake className="h-4 w-4 text-brand-blue" aria-hidden />
              {t("partners.heading")}
            </h3>
            {partnerCount === 0 ? (
              <p className="text-sm text-text-secondary">{t("partners.empty")}</p>
            ) : (
              <ul className="flex flex-col gap-1">
                {agencyRows.map((a) => (
                  <li key={a.id} className={`flex flex-wrap items-center justify-between gap-1 rounded-control bg-ink-900/40 px-2.5 py-1.5 ${a.status === "pending" ? TONE_EDGE.risk : TONE_EDGE.quiet}`} data-testid="company-home-partner-agency">
                    <span className="min-w-0 break-words text-sm text-text-primary">{a.agencyName}</span>
                    <span className="text-meta text-text-secondary">
                      {t("partners.agency")} · {a.status === "pending" ? t("partners.pending") : t(`partners.status.${a.status}`)}
                    </span>
                  </li>
                ))}
                {clientRows.map((c) => (
                  <li key={c.id} className={`flex flex-wrap items-center justify-between gap-1 rounded-control bg-ink-900/40 px-2.5 py-1.5 ${TONE_EDGE.quiet}`} data-testid="company-home-partner-client">
                    <span className="min-w-0 break-words text-sm text-text-primary">{c.name}</span>
                    <span className="text-meta text-text-secondary">{t("partners.client")}</span>
                  </li>
                ))}
                {teamRows.map((tm) => (
                  <li key={tm.id} className={`flex flex-wrap items-center justify-between gap-1 rounded-control bg-ink-900/40 px-2.5 py-1.5 ${TONE_EDGE.quiet}`} data-testid="company-home-partner-team">
                    <span className="min-w-0 break-words text-sm text-text-primary">{tm.name}</span>
                    <span className="text-meta text-text-secondary">
                      {t("partners.team")} · {t("partners.members", { count: tm.members })}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            <div className="mt-auto flex flex-wrap gap-2 pt-1">
              {agencyRows.some((a) => a.status === "pending") ? (
                <a href="#company-partners-bridge" className={PRIMARY_LINK} data-testid="company-home-partners-answer">
                  {t("partners.answer")}
                </a>
              ) : null}
              <Link href={partnerInviteHref} className={ACTION_LINK} data-testid="company-home-partners-invite">
                <UserPlus className="h-3.5 w-3.5" aria-hidden />
                {t("partners.invite")}
              </Link>
            </div>
          </section>
        ) : null}
      </div>
    </section>
  );
}
