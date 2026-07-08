import { getTranslations } from "next-intl/server";
import { HardHat } from "lucide-react";

import type { HubProject } from "./premium-hub-fixtures";
import { HubPanel, HubProgress, HubStat } from "./premium-hub-primitives";

/** Block D — Projekto / darbo paso kortelė. The project as a living object:
 *  object visual, work progress, evidence status, defects, handover percent. */
export async function PremiumHubProjectCard({ project }: { project: HubProject }) {
  const t = await getTranslations("premiumHub");
  return (
    <HubPanel eyebrow={t("project.title")} icon={HardHat} testid="premium-hub-project">
      <h2 className="font-display text-lg font-bold tracking-tightest text-text-primary">
        {project.name}
      </h2>

      {/* Object visual placeholder — no real photo yet, so a marked concept
          frame rather than a fake image. */}
      <div
        role="img"
        aria-label={t("project.imageAlt")}
        className="relative flex aspect-[16/9] items-center justify-center overflow-hidden rounded-xl border border-ink-600 bg-gradient-to-br from-brand-blue/10 via-ink-700 to-ink-800"
      >
        <HardHat className="h-10 w-10 text-text-muted" strokeWidth={1.5} aria-hidden />
      </div>

      <HubProgress
        label={t("project.stats.handover")}
        value={project.handoverPercent}
        tone="success"
      />

      <div className="grid grid-cols-3 gap-3">
        <HubStat
          value={`${project.workDone}/${project.workTotal}`}
          label={t("project.stats.works")}
        />
        <HubStat
          value={project.photosPresent ? t("project.photosPresent") : t("project.photosAbsent")}
          label={t("project.stats.photos")}
        />
        <HubStat
          value={project.defects}
          label={t("project.stats.defects")}
          tone={project.defects > 0 ? "warning" : "default"}
        />
      </div>
    </HubPanel>
  );
}
