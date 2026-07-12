import {
  Briefcase,
  Building2,
  CalendarDays,
  Hammer,
  HardHat,
  Hexagon,
  MapPin,
  Wrench,
} from "lucide-react";

import { VISUAL_TOKENS } from "@/lib/visual/tokens";

/** Industry-category glyph map. Keeps the icon catalogue local so
 *  future slices can pull from the same Lucide family without
 *  importing every icon at the top of the file. Honest fallback
 *  for unknown categories so the surface never breaks. */
const INDUSTRY_GLYPH = {
  general: Briefcase,
  construction: HardHat,
  trades: Wrench,
  manufacturing: Hammer,
  office: Building2,
  other: Hexagon,
} as const;

export type JobDemandIndustryKey = keyof typeof INDUSTRY_GLYPH;

/** Second slice of the Visual Information System / Visual
 *  Dashboard OS direction (Agentai visual-sprint pack 2026-05-28).
 *  Pairs with the worker visual card (PR #88) — same card radius,
 *  border, surface, chip tokens. Consumer pages map domain rows
 *  to this entity before rendering; the component is purely
 *  presentational. */
export interface JobDemandCardEntity {
  readonly id: string;
  readonly title: string;
  readonly industryKey: JobDemandIndustryKey;
  readonly companyName: string;
  readonly region: string;
  /** At most 4 chips rendered. */
  readonly requiredSkills: readonly string[];
  /** Honest UTC iso string for "posted X ago" line. Component
   *  renders it verbatim — the caller formats / localises. */
  readonly postedAtLabel: string;
  /** Owner-consent stamp from the data layer; null when the
   *  posting has not been owner-approved (then the card shows
   *  "owner-approved laukia"). Avoids fabricating approval. */
  readonly ownerApprovedBy: string | null;
}

export function JobDemandCard({
  job,
}: {
  readonly job: JobDemandCardEntity;
}) {
  const Glyph = INDUSTRY_GLYPH[job.industryKey] ?? INDUSTRY_GLYPH.other;
  const skills = job.requiredSkills.slice(0, 4);
  return (
    <article
      // Interaction contract (user-journey repair v1): presentational card,
      // no link/handler — no hover elevation that impersonates a button.
      className={`group relative flex flex-col gap-3 rounded-2xl ${VISUAL_TOKENS.cardBorder} border ${VISUAL_TOKENS.cardSurface} p-4 shadow-sm`}
      data-testid={`job-demand-card-${job.id}`}
    >
      <header className="flex items-start gap-3">
        <div
          className={`flex h-12 w-12 items-center justify-center rounded-xl ${VISUAL_TOKENS.chipSurface}`}
          aria-hidden="true"
        >
          <Glyph className="h-5 w-5" />
        </div>
        <div className="flex flex-1 flex-col">
          <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
            {job.title}
          </h3>
          <p className="flex flex-wrap items-center gap-1 text-xs text-zinc-500 dark:text-zinc-400">
            <span>{job.companyName}</span>
            <span aria-hidden="true">·</span>
            <span className="inline-flex items-center gap-0.5">
              <MapPin className="h-3 w-3" aria-hidden="true" />
              {job.region}
            </span>
          </p>
        </div>
      </header>

      {skills.length > 0 && (
        <ul className="flex flex-wrap gap-1.5">
          {skills.map((skill) => (
            <li
              key={skill}
              className={`inline-flex items-center rounded-full ${VISUAL_TOKENS.chipSurface} px-2 py-0.5 text-xs font-medium ${VISUAL_TOKENS.chipText}`}
            >
              {skill}
            </li>
          ))}
        </ul>
      )}

      <footer className="flex items-center justify-between gap-2 text-xs text-zinc-600 dark:text-zinc-400">
        <span className="inline-flex items-center gap-1">
          <CalendarDays className="h-3.5 w-3.5" aria-hidden="true" />
          {job.postedAtLabel}
        </span>
        <span className="inline-flex items-center gap-1 text-zinc-700 dark:text-zinc-300">
          {job.ownerApprovedBy ? (
            <>✓ {job.ownerApprovedBy}</>
          ) : (
            <span className="italic text-zinc-500 dark:text-zinc-400">
              owner-approved laukia
            </span>
          )}
        </span>
      </footer>
    </article>
  );
}
