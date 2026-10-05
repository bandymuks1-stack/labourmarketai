import Link from "next/link";
import { redirect } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { groupWorkAreas, UNKNOWN_WORK_AREA } from "@/lib/projects/work-areas";
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
import { MessageButton } from "@/components/app/message-button";
import { CountUp } from "@/components/app/today/count-up";
import { ProjectWorkGallery } from "@/components/app/project-work-gallery";
import { type Role } from "@/lib/auth/actions";
import { cn } from "@/lib/utils";
import { PersonAvatar } from "@/components/app/identity/identity-family";

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
  searchParams,
}: {
  params: Promise<{ locale: string; id: string }>;
  searchParams: Promise<{ area?: string }>;
}) {
  const { locale, id } = await params;
  const { area: rawArea } = await searchParams;
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

  const positionLabel = (workerId: string) => {
    const slug = positions.get(workerId) ?? null;
    if (slug && tProf.has(slug)) return tProf(slug);
    if (slug) return slug.replace(/-/g, " ");
    return t("positionUnknown");
  };

  // ── WORK AREAS (premium project field, 2026-09-29) ──────────────────────
  // People organized around the work: grouped by each person's PRIMARY
  // profession — the fact the stadium already reads. An assignment carries
  // no trade, so the grouping is named for what it is ("by primary
  // profession") and a person with none sits in an explicit unknown area.
  const UNKNOWN_AREA = UNKNOWN_WORK_AREA;
  const areas = groupWorkAreas({
    workers: ops.workers,
    positions,
    labelOf: (slug) => (tProf.has(slug) ? tProf(slug) : slug.replace(/-/g, " ")),
    unknownLabel: t("areaUnknown"),
  });
  const selectedArea = areas.some((a) => a.key === rawArea) ? rawArea! : null;
  const shownAreas = selectedArea ? areas.filter((a) => a.key === selectedArea) : areas;
  const areaHref = (key: string | null) =>
    `/${locale}/dashboard/projects/${id}${key ? `?area=${encodeURIComponent(key)}` : ""}#stadium-field`;
  const AREA_TONES = [
    "bg-brand-cyan/70",
    "bg-brand-blue/70",
    "bg-brand-violet/70",
    "bg-brand-orange/70",
    "bg-state-success/60",
    "bg-brand-purple/70",
  ];
  const toneOf = (i: number, key: string) =>
    key === UNKNOWN_AREA ? "bg-ink-500" : AREA_TONES[i % AREA_TONES.length];

  return (
    <div className="mx-auto flex w-full max-w-content flex-col gap-6" data-testid="project-stadium">
      {/* ── Arena header: real project facts only ── */}
      <header className="flex flex-col gap-2">
        <span className="inline-flex items-center gap-2 font-mono text-meta uppercase tracking-label text-text-muted">
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

        {/* W11 F7 — the way into this project's operating centre sits WITH the
            project's identity, not below the whole arena. It used to be the
            last element on a page that runs location → communication → confirm
            pulse → today's pulse → the field → the gallery → positions, so on
            a phone it was several screens of scrolling past the answer the
            manager already had. Same route, same manager-only destination;
            only its position changed, so nothing new is claimed. */}
        <Link
          href={`/${locale}/dashboard/projects/${id}/operations`}
          data-testid="stadium-open-operations"
          className="inline-flex min-h-11 w-fit items-center gap-1.5 rounded-md border border-brand-blue/40 px-4 py-2.5 text-sm font-medium text-brand-blue transition-colors duration-fast hover:bg-brand-blue/10"
        >
          {t("openOps")} →
        </Link>

        {/* THE FORMATION — who is on this project, by work area: the real
            count per primary profession as one band, each segment a door
            into that area of the field below. Counts, never a score. */}
        {hasTeam ? (
          <div
            className="mt-2 flex flex-col gap-3 rounded-2xl border border-ink-600 bg-surface-1/60 p-4 sm:p-6"
            data-testid="stadium-formation"
          >
            <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
              <div className="flex flex-col">
                <span className="font-mono text-meta uppercase tracking-label text-text-muted">
                  {place ?? t("teamLabel")}
                </span>
                <span className="font-display text-4xl font-bold leading-none tracking-tightest text-text-primary tabular-nums sm:text-5xl">
                  {ops.workers.length}
                </span>
              </div>
              <span className="font-mono text-meta uppercase tracking-label text-text-muted">
                {t("areaBasis")}
              </span>
            </div>
            <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-ink-800" aria-hidden>
              {areas.map((a, i) => (
                <span
                  key={a.key}
                  className={cn("rhythm-grow-x h-full border-r border-ink-900 last:border-r-0", toneOf(i, a.key))}
                  style={{ width: `${(a.workers.length / ops.workers.length) * 100}%`, animationDelay: `${i * 60}ms` }}
                />
              ))}
            </div>
            <nav aria-label={t("areasLabel")} className="flex flex-wrap gap-2" data-testid="stadium-areas">
              <Link
                href={areaHref(null)}
                aria-current={selectedArea === null ? "true" : undefined}
                className={cn(
                  "inline-flex min-h-11 items-center gap-2 rounded-full border px-4 font-mono text-meta uppercase tracking-label transition-colors",
                  selectedArea === null
                    ? "border-brand-blue text-brand-blue"
                    : "border-ink-500 text-text-secondary hover:border-brand-blue",
                )}
              >
                {t("allAreas")}
                <span className="tabular-nums text-text-primary">{ops.workers.length}</span>
              </Link>
              {areas.map((a, i) => (
                <Link
                  key={a.key}
                  href={areaHref(a.key)}
                  aria-current={selectedArea === a.key ? "true" : undefined}
                  data-testid={`stadium-area-${a.key}`}
                  className={cn(
                    "inline-flex min-h-11 items-center gap-2 rounded-full border px-4 text-sm transition-colors",
                    selectedArea === a.key
                      ? "border-brand-blue text-text-primary"
                      : "border-ink-500 text-text-secondary hover:border-brand-blue",
                  )}
                >
                  <span aria-hidden className={cn("size-2 rounded-full", toneOf(i, a.key))} />
                  {a.label}
                  <span className="font-mono tabular-nums text-text-primary">{a.workers.length}</span>
                </Link>
              ))}
            </nav>
          </div>
        ) : null}
      </header>

      {/* ── THE FIELD comes first: the people around the work are what a
            manager opens this page for. Location, communication and the
            pulses follow — same sections, same facts. ── */}
      {/* ── THE FIELD: real assigned workers as positioned cards ── */}
      <section id="stadium-field" className="flex scroll-mt-20 flex-col gap-3" data-testid="stadium-field">
        <h2 className="font-mono text-meta uppercase tracking-label text-text-muted">
          {t("fieldTitle")}
        </h2>
        {hasTeam ? (
          <div className="flex flex-col gap-6">
          {shownAreas.map((area) => (
          <div key={area.key} className="flex flex-col gap-3" data-testid={`stadium-area-block-${area.key}`}>
            <h3 className="flex items-baseline gap-3 border-b border-ink-600 pb-2">
              <span className="font-display text-lg font-semibold text-text-primary">{area.label}</span>
              <span className="font-mono text-sm tabular-nums text-text-muted">{area.workers.length}</span>
            </h3>
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {area.workers.map((w) => (
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
                  {/* The frame carries the TRUST state (confirmed skills); the
                      person inside is the ONE identity family. */}
                  <span
                    className={cn(
                      "flex shrink-0 rounded-xl border p-0.5",
                      w.confirmedSkills > 0
                        ? "border-trust-accent/50"
                        : "border-ink-500",
                    )}
                  >
                    <PersonAvatar person={{ id: w.workerId, name: w.name }} size={52} />
                  </span>
                  <div className="min-w-0">
                    <p className="font-display text-lg font-semibold leading-tight tracking-tightest text-text-primary group-hover:text-brand-blue">
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
                {/* WRITE — the person on the project opens the ONE conversation
                    (the §8.1 gate reads the caller's own authority over this
                    project; nothing is sent until the manager writes). */}
                <MessageButton
                  profileId={w.workerProfileId}
                  projectId={id}
                  labelKey="messageWorker"
                />
              </li>
            ))}
          </ul>
          </div>
          ))}
          </div>
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
              className="inline-flex min-h-11 items-center gap-2 rounded-md bg-gradient-cta px-5 py-3 text-sm font-semibold text-text-on-brand transition-transform duration-fast ease-out hover:-translate-y-0.5"
            >
              {t("emptyTeamCta")} →
            </Link>
          </div>
        )}
      </section>


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
    </div>
  );
}
