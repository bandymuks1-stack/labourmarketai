import Link from "next/link";
import { redirect } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import {
  Activity,
  CalendarDays,
  ClipboardCheck,
  FileWarning,
  MapPin,
  MessageSquare,
  NotebookPen,
  ShieldCheck,
  Users,
} from "lucide-react";

import { createClient } from "@/lib/supabase/server";
import { getProjectStadium } from "@/lib/projects/stadium";
import { getWorkerProjectView } from "@/lib/projects/worker-project-access";
import { WorkerProjectPanel } from "@/components/app/worker-project-panel";
import {
  deriveProjectLocation,
  formatProjectPlace,
} from "@/lib/projects/location";
import { ConfirmPulse } from "@/components/app/arena/confirm-pulse";
import { CountUp } from "@/components/app/today/count-up";
import { ProjectWorkGallery } from "@/components/app/project-work-gallery";
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

  // RC2 role-aware routing (F11): one canonical project route that branches
  // by real permission. Managers get the stadium; an ASSIGNED worker gets a
  // scoped member view of their own project; only a user with genuinely no
  // relation sees the honest no-access state. Nobody with a valid relation
  // is ever dumped on a dead "this board is for managers" page.
  const stadium = MANAGER_ROLES.has(role) ? await getProjectStadium(id) : null;
  if (!stadium) {
    const workerView = await getWorkerProjectView(id);
    if (workerView) {
      return (
        <WorkerProjectPanel locale={locale} projectId={id} view={workerView} />
      );
    }
    return (
      <div className="mx-auto flex w-full max-w-content flex-col gap-4">
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

  // systemic-ux-project-v1: honest location status (no fake marker) + project
  // place line, reusing the signal-only market-map mappability rule.
  const location = deriveProjectLocation({
    city: ops.project.city,
    country: ops.project.country,
  });
  const place = formatProjectPlace(location);
  const tLoc = await getTranslations("projectOps.stadium.location");
  const tComm = await getTranslations("projectOps.stadium.communication");
  const locationStatusText =
    location.status === "missing"
      ? tLoc("statusMissing")
      : location.status === "verified"
        ? tLoc("statusVerified")
        : location.status === "unverified"
          ? tLoc("statusUnverified")
          : tLoc("statusTextOnly");

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
    <div className="mx-auto flex w-full max-w-content flex-col gap-6" data-testid="project-stadium">
      {/* ── Arena header: real project facts only ── */}
      <header className="flex flex-col gap-2">
        <span className="inline-flex items-center gap-2 font-mono text-meta uppercase tracking-label text-brand-cyan">
          <Activity className="h-3.5 w-3.5" aria-hidden />
          {t("eyebrow")}
        </span>
        <h1 className="font-display text-3xl font-bold tracking-tightest text-text-primary">
          {ops.project.title ?? tOps("untitledProject")}
        </h1>
        <div className="flex flex-wrap gap-2">
          {ops.project.city ? (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-ink-500 bg-ink-800 px-3 py-1 font-mono text-meta uppercase tracking-label text-text-secondary">
              <MapPin className="h-3 w-3" aria-hidden />
              {ops.project.city}
            </span>
          ) : null}
          {ops.project.startDate ? (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-ink-500 bg-ink-800 px-3 py-1 font-mono text-meta uppercase tracking-label text-text-secondary">
              <CalendarDays className="h-3 w-3" aria-hidden />
              {ops.project.startDate}
            </span>
          ) : null}
          <span className="inline-flex items-center gap-1.5 rounded-full border border-ink-500 bg-ink-800 px-3 py-1 font-mono text-meta uppercase tracking-label text-text-secondary">
            <Users className="h-3 w-3" aria-hidden />
            {t("fieldCount", { n: ops.counters.totalAssigned })}
          </span>
        </div>
      </header>

      {/* ── Location: a project is a real work object, with honest place
            context. NO fake marker — a map point only ever appears with
            verified coordinates (systemic-ux-project-v1). ── */}
      <section
        className="card-border flex flex-col gap-2 p-5"
        data-testid="project-location"
        data-location-status={location.status}
      >
        <h2 className="inline-flex items-center gap-2 font-mono text-meta uppercase tracking-label text-text-muted">
          <MapPin className="h-3.5 w-3.5" aria-hidden />
          {tLoc("title")}
        </h2>
        {place ? (
          <p className="text-base font-semibold text-text-primary">{place}</p>
        ) : null}
        <p className="text-xs leading-relaxed text-text-secondary">
          {locationStatusText}
        </p>
        {!location.mappable && (
          <div
            className="mt-1 flex items-center gap-2 rounded-md border border-dashed border-ink-500 px-3 py-3 text-meta leading-relaxed text-text-muted"
            data-testid="project-location-no-marker"
          >
            <MapPin className="h-4 w-4 shrink-0 text-text-muted" aria-hidden />
            {tLoc("noMarkerNote")}
          </div>
        )}
      </section>

      {/* ── Communication: every project has a clearly-scoped way in. The
            real chat persistence is the existing inbox; a dedicated
            project-bound thread is an owner-gated follow-up. No fake chat. ── */}
      <section
        className="card-border flex flex-col gap-3 p-5"
        data-testid="project-communication"
      >
        <h2 className="inline-flex items-center gap-2 font-mono text-meta uppercase tracking-label text-text-muted">
          <MessageSquare className="h-3.5 w-3.5" aria-hidden />
          {tComm("title")}
        </h2>
        <p className="text-xs leading-relaxed text-text-secondary">
          {tComm("context")}
        </p>
        <Link
          href={`/${locale}/dashboard/communication`}
          data-testid="project-chat-cta"
          className="inline-flex min-h-11 w-fit items-center gap-2 rounded-md border border-brand-blue/40 px-4 py-2.5 text-sm font-medium text-brand-blue transition-colors duration-fast hover:bg-brand-blue/10"
        >
          <MessageSquare className="h-4 w-4" aria-hidden />
          {tComm("cta")}
        </Link>
        <p className="text-meta leading-relaxed text-text-muted">
          {tComm("notReadyNote")}
        </p>
      </section>

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
        <h2 className="font-mono text-meta uppercase tracking-label text-text-muted">
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
                {/* F2/RC2: a fielded worker card opens the permitted person
                    page (fail-closed by can_view_worker RLS there). */}
                <Link
                  href={`/${locale}/dashboard/people/${w.workerId}`}
                  className="group flex items-center gap-3"
                  data-testid={`stadium-player-open-${w.workerId}`}
                >
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
                    <p className="truncate font-display text-base font-semibold tracking-tightest text-text-primary group-hover:text-brand-blue">
                      {w.name}
                    </p>
                    <p className="truncate font-mono text-meta uppercase tracking-label text-text-muted">
                      {positionLabel(w.workerId)}
                    </p>
                  </div>
                </Link>
                <div className="flex flex-wrap gap-2">
                  <span className="inline-flex items-center gap-1.5 rounded-md border border-ink-600 bg-ink-800/40 px-2 py-1 font-mono text-meta text-text-secondary">
                    <NotebookPen className="h-3 w-3" aria-hidden />
                    {w.journalEntries}
                  </span>
                  <span
                    className={cn(
                      "inline-flex items-center gap-1.5 rounded-md border px-2 py-1 font-mono text-meta",
                      w.confirmedSkills > 0
                        ? "border-state-success/30 bg-state-success/10 text-state-success"
                        : "border-ink-600 bg-ink-800/40 text-text-secondary",
                    )}
                  >
                    <ShieldCheck className="h-3 w-3" aria-hidden />
                    {w.confirmedSkills}
                  </span>
                  {w.openReviewItems > 0 ? (
                    <span className="inline-flex items-center gap-1.5 rounded-md border border-state-warning/30 bg-state-warning/10 px-2 py-1 font-mono text-meta text-state-warning">
                      <ClipboardCheck className="h-3 w-3" aria-hidden />
                      {w.openReviewItems}
                    </span>
                  ) : null}
                  {w.docsMissing > 0 ? (
                    <span className="inline-flex items-center gap-1.5 rounded-md border border-state-warning/30 bg-state-warning/10 px-2 py-1 font-mono text-meta text-state-warning">
                      <FileWarning className="h-3 w-3" aria-hidden />
                      {t("docsMissingChip", { n: w.docsMissing })}
                    </span>
                  ) : w.docsChecked > 0 ? (
                    <span className="inline-flex items-center gap-1.5 rounded-md border border-state-success/30 bg-state-success/10 px-2 py-1 font-mono text-meta text-state-success">
                      <ShieldCheck className="h-3 w-3" aria-hidden />
                      {t("docsCheckedChip", { n: w.docsChecked })}
                    </span>
                  ) : null}
                </div>
                <p className="text-meta leading-relaxed text-text-muted">
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

      {/* ── Work gallery: photo evidence from this project's journal entries.
            Read-only projection of what workers attached to their OWN entries;
            visibility is exactly the session's RLS (WAGON 8, areas 15/16). ── */}
      <div id="project-gallery" className="scroll-mt-20">
        <ProjectWorkGallery
          projectId={id}
          workerNames={
            new Map(ops.workers.map((w) => [w.workerId, w.name] as const))
          }
        />
      </div>

      {/* ── Missing positions: the needs model does not exist yet — say so ── */}
      <section className="flex flex-col gap-2" data-testid="stadium-positions-note">
        <h2 className="font-mono text-meta uppercase tracking-label text-text-muted">
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
