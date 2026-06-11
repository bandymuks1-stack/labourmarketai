import Link from "next/link";
import { redirect } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import {
  Activity,
  CalendarDays,
  ClipboardCheck,
  FileWarning,
  MapPin,
  NotebookPen,
  ShieldCheck,
  Users,
} from "lucide-react";

import { createClient } from "@/lib/supabase/server";
import { getProjectStadium } from "@/lib/projects/stadium";
import { ConfirmPulse } from "@/components/app/arena/confirm-pulse";
import { CountUp } from "@/components/app/today/count-up";
import { type Role } from "@/lib/auth/actions";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

const MANAGER_ROLES = new Set<Role>(["company", "agency"]);

/**
 * STADIONAS (TASK 07 slice 3) — the live project visualization. The project
 * as an arena: who is on the field today (real active assignments), their
 * positions (real primary professions), the day's journal pulse (real
 * RLS-readable entries), confirmation + F5 document-readiness signals.
 *
 * ONLY real data or honest empty states (handoff T07.3): an empty team says
 * "pradėk draftą", an unknown position says it is unknown, the needs model
 * does not exist yet and says so — no fake liveliness, no fake movements.
 */
export default async function ProjectStadiumPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("projectOps.stadium");
  const tOps = await getTranslations("projectOps");
  const tProf = await getTranslations("professions");

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
  const role = (profile?.active_role as Role) ?? "worker";
  if (!MANAGER_ROLES.has(role)) {
    return (
      <div className="flex max-w-2xl flex-col gap-4">
        <h1 className="font-display text-3xl font-bold tracking-tightest text-text-primary">
          {t("eyebrow")}
        </h1>
        <p className="card-border p-4 text-sm text-text-secondary">
          {tOps("managerOnly")}
        </p>
      </div>
    );
  }

  const stadium = await getProjectStadium(id);
  if (!stadium) {
    return (
      <div className="flex max-w-2xl flex-col gap-4">
        <h1 className="font-display text-3xl font-bold tracking-tightest text-text-primary">
          {t("eyebrow")}
        </h1>
        <p
          className="card-border p-4 text-sm text-text-secondary"
          data-testid="stadium-not-authorized"
        >
          {tOps("notAuthorized")}
        </p>
      </div>
    );
  }

  const { ops, positions, entriesToday } = stadium;
  const hasTeam = ops.workers.length > 0;

  const initialsOf = (name: string) => {
    const parts = name.trim().split(/\s+/).slice(0, 2);
    return parts.map((p) => p[0]?.toUpperCase() ?? "").join("") || "•";
  };
  const positionLabel = (workerId: string) => {
    const slug = positions.get(workerId) ?? null;
    if (slug && tProf.has(slug)) return tProf(slug);
    if (slug) return slug.replace(/-/g, " ");
    return t("positionUnknown");
  };

  return (
    <div className="flex max-w-4xl flex-col gap-6" data-testid="project-stadium">
      {/* ── Arena header: real project facts only ── */}
      <header className="flex flex-col gap-2">
        <span className="inline-flex items-center gap-2 font-mono text-[10px] uppercase tracking-label text-brand-cyan">
          <Activity className="h-3.5 w-3.5" aria-hidden />
          {t("eyebrow")}
        </span>
        <h1 className="font-display text-3xl font-bold tracking-tightest text-text-primary">
          {ops.project.title ?? tOps("untitledProject")}
        </h1>
        <div className="flex flex-wrap gap-2">
          {ops.project.city ? (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-ink-500 bg-ink-800 px-3 py-1 font-mono text-[10px] uppercase tracking-label text-text-secondary">
              <MapPin className="h-3 w-3" aria-hidden />
              {ops.project.city}
            </span>
          ) : null}
          {ops.project.startDate ? (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-ink-500 bg-ink-800 px-3 py-1 font-mono text-[10px] uppercase tracking-label text-text-secondary">
              <CalendarDays className="h-3 w-3" aria-hidden />
              {ops.project.startDate}
            </span>
          ) : null}
          <span className="inline-flex items-center gap-1.5 rounded-full border border-ink-500 bg-ink-800 px-3 py-1 font-mono text-[10px] uppercase tracking-label text-text-secondary">
            <Users className="h-3 w-3" aria-hidden />
            {t("fieldCount", { n: ops.counters.totalAssigned })}
          </span>
        </div>
      </header>

      {/* ── Confirm pulse — the S3.5 queue in the stadium rhythm ── */}
      <ConfirmPulse />

      {/* ── Today's journal pulse: real RLS-readable entries only ── */}
      <section
        className="card-border glow-hover flex flex-wrap items-center gap-4 p-5"
        data-testid="stadium-today-pulse"
      >
        <NotebookPen
          className={cn(
            "h-6 w-6 shrink-0",
            entriesToday > 0 ? "text-state-live" : "text-text-muted",
          )}
          aria-hidden
        />
        {entriesToday > 0 ? (
          <>
            <CountUp
              text={String(entriesToday)}
              className="font-mono text-3xl font-bold tracking-tightest text-text-primary"
            />
            <span className="min-w-0 flex-1 text-sm leading-relaxed text-text-secondary">
              {t("todayCount", { n: entriesToday })}
            </span>
          </>
        ) : (
          <span className="min-w-0 flex-1 text-sm leading-relaxed text-text-secondary">
            {t("todayZero")}
          </span>
        )}
      </section>

      {/* ── THE FIELD: real assigned workers as positioned cards ── */}
      <section className="flex flex-col gap-3" data-testid="stadium-field">
        <h2 className="font-mono text-[10px] uppercase tracking-label text-text-muted">
          {t("fieldTitle")}
        </h2>
        {hasTeam ? (
          <ul className="grid gap-4 sm:grid-cols-2">
            {ops.workers.map((w) => (
              <li
                key={w.workerId}
                className="card-border rise-in flex flex-col gap-3 p-4"
                data-testid="stadium-player"
              >
                <div className="flex items-center gap-3">
                  <span
                    aria-hidden
                    className={cn(
                      "flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border bg-ink-700 font-display text-sm font-bold text-text-primary",
                      w.confirmedSkills > 0
                        ? "border-trust-accent/50"
                        : "border-ink-500",
                    )}
                  >
                    {initialsOf(w.name)}
                  </span>
                  <div className="min-w-0">
                    <p className="truncate font-display text-base font-semibold tracking-tightest text-text-primary">
                      {w.name}
                    </p>
                    <p className="truncate font-mono text-[10px] uppercase tracking-label text-text-muted">
                      {positionLabel(w.workerId)}
                    </p>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <span className="inline-flex items-center gap-1.5 rounded-md border border-ink-600 bg-ink-800/40 px-2 py-1 font-mono text-[11px] text-text-secondary">
                    <NotebookPen className="h-3 w-3" aria-hidden />
                    {w.journalEntries}
                  </span>
                  <span
                    className={cn(
                      "inline-flex items-center gap-1.5 rounded-md border px-2 py-1 font-mono text-[11px]",
                      w.confirmedSkills > 0
                        ? "border-state-success/30 bg-state-success/10 text-state-success"
                        : "border-ink-600 bg-ink-800/40 text-text-secondary",
                    )}
                  >
                    <ShieldCheck className="h-3 w-3" aria-hidden />
                    {w.confirmedSkills}
                  </span>
                  {w.openReviewItems > 0 ? (
                    <span className="inline-flex items-center gap-1.5 rounded-md border border-state-warning/30 bg-state-warning/10 px-2 py-1 font-mono text-[11px] text-state-warning">
                      <ClipboardCheck className="h-3 w-3" aria-hidden />
                      {w.openReviewItems}
                    </span>
                  ) : null}
                  {w.docsMissing > 0 ? (
                    <span className="inline-flex items-center gap-1.5 rounded-md border border-state-warning/30 bg-state-warning/10 px-2 py-1 font-mono text-[11px] text-state-warning">
                      <FileWarning className="h-3 w-3" aria-hidden />
                      {t("docsMissingChip", { n: w.docsMissing })}
                    </span>
                  ) : w.docsChecked > 0 ? (
                    <span className="inline-flex items-center gap-1.5 rounded-md border border-state-success/30 bg-state-success/10 px-2 py-1 font-mono text-[11px] text-state-success">
                      <ShieldCheck className="h-3 w-3" aria-hidden />
                      {t("docsCheckedChip", { n: w.docsChecked })}
                    </span>
                  ) : null}
                </div>
                <p className="text-[11px] leading-relaxed text-text-muted">
                  {w.lastActivity
                    ? t("lastActivity", { date: w.lastActivity.slice(0, 10) })
                    : t("noActivity")}
                </p>
              </li>
            ))}
          </ul>
        ) : (
          <div
            className="card-border flex flex-col items-start gap-3 p-6"
            data-testid="stadium-empty-team"
          >
            <p className="text-sm leading-relaxed text-text-secondary">
              {t("emptyTeam")}
            </p>
            <Link
              href={`/${locale}/dashboard/projects`}
              data-testid="stadium-draft-cta"
              className="inline-flex min-h-11 items-center gap-2 rounded-md bg-gradient-to-r from-brand-blue to-brand-cyan px-5 py-3 text-sm font-semibold text-ink-900 transition-transform duration-fast ease-out hover:-translate-y-0.5"
            >
              {t("emptyTeamCta")} →
            </Link>
          </div>
        )}
      </section>

      {/* ── Missing positions: the needs model does not exist yet — say so ── */}
      <section className="flex flex-col gap-2" data-testid="stadium-positions-note">
        <h2 className="font-mono text-[10px] uppercase tracking-label text-text-muted">
          {t("positionsTitle")}
        </h2>
        <p className="rounded-md border border-dashed border-ink-500 px-3 py-2 text-xs leading-relaxed text-text-muted">
          {t("positionsEmpty")}
        </p>
      </section>

      {/* ── One step deeper: the management ARENA ── */}
      <Link
        href={`/${locale}/dashboard/projects/${id}/operations`}
        data-testid="stadium-open-operations"
        className="inline-flex min-h-11 w-fit items-center gap-1.5 rounded-md border border-brand-blue/40 px-4 py-2.5 text-sm font-medium text-brand-blue transition-colors duration-fast hover:bg-brand-blue/10"
      >
        {t("openOps")} →
      </Link>
    </div>
  );
}
