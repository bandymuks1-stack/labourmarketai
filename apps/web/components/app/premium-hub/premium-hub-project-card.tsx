import { getTranslations } from "next-intl/server";
import { HardHat, MapPin } from "lucide-react";

import type { ProjectVM } from "./premium-hub-data";
import {
  HubEmptyState,
  HubPanel,
  HubProgress,
  HubStat,
  HubUnavailable,
} from "./premium-hub-primitives";

/** Block D — Projekto / darbo paso kortelė. Real most-recent managed project:
 *  identity, handover stage, team-readiness ratio, and real photo/assignment
 *  counts. No defect model exists yet, so no defect stat is shown (never an
 *  invented count). Honest empty state when the caller has no project. */
export async function PremiumHubProjectCard({ project }: { project: ProjectVM }) {
  const t = await getTranslations("premiumHub");

  if (project.status === "unavailable") {
    return (
      <HubPanel eyebrow={t("project.title")} icon={HardHat} testid="premium-hub-project">
        <HubUnavailable message={t("unavailable")} />
      </HubPanel>
    );
  }

  if (project.status === "empty") {
    return (
      <HubPanel eyebrow={t("project.title")} icon={HardHat} testid="premium-hub-project">
        <HubEmptyState
          icon={HardHat}
          title={t("project.empty.title")}
          body={t("project.empty.body")}
          ctaLabel={t("project.empty.cta")}
          href="/dashboard/projects"
        />
      </HubPanel>
    );
  }

  const location = [project.city, project.country].filter(Boolean).join(", ");
  const readinessPct =
    project.assigned > 0 ? Math.round((project.ready / project.assigned) * 100) : null;

  return (
    <HubPanel eyebrow={t("project.title")} icon={HardHat} testid="premium-hub-project">
      <div className="flex flex-col gap-1">
        <h2 className="font-display text-lg font-bold tracking-tightest text-text-primary">
          {project.name ?? t("project.unnamed")}
        </h2>
        <div className="flex flex-wrap items-center gap-2">
          {location ? (
            <span className="inline-flex items-center gap-1 font-mono text-[10px] uppercase tracking-label text-text-muted">
              <MapPin className="h-3 w-3" strokeWidth={1.75} aria-hidden />
              {location}
            </span>
          ) : null}
          {project.handoverStatus ? (
            <span className="inline-flex w-fit items-center rounded-full border border-brand-blue/40 bg-brand-blue/5 px-2.5 py-0.5 font-mono text-[10px] uppercase tracking-label text-brand-blue">
              {t(`project.handover.${project.handoverStatus}`)}
            </span>
          ) : null}
        </div>
      </div>

      <div
        role="img"
        aria-label={t("project.imageAlt")}
        className="relative flex aspect-[16/9] items-center justify-center overflow-hidden rounded-xl border border-ink-600 bg-gradient-to-br from-brand-blue/10 via-ink-700 to-ink-800"
      >
        <HardHat className="h-10 w-10 text-text-muted" strokeWidth={1.5} aria-hidden />
      </div>

      {readinessPct !== null ? (
        <HubProgress
          label={t("project.stats.ready")}
          value={readinessPct}
          tone="success"
        />
      ) : null}

      <div className="grid grid-cols-2 gap-3">
        <HubStat value={project.assigned} label={t("project.stats.team")} />
        <HubStat value={project.photos} label={t("project.stats.photos")} />
      </div>
    </HubPanel>
  );
}
