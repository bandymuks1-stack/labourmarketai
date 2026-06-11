import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { MapPin, Users } from "lucide-react";

import type { ProjectMapCard } from "@/lib/projects/map";
import { CountUp } from "@/components/app/today/count-up";

/**
 * Manager MAP (TASK 07 slice 2 — MAP → ARENA → DRAFT). The infrastructure
 * view: each project is an arena card with its REAL team size and one click
 * into the ARENA (operations board) — max 2 clicks from map to action
 * (DESIGN_SOUL §4). No score, no fake activity; a project with zero workers
 * shows a plain zero and points at the draft.
 */
export async function ProjectMap({
  projects,
  locale,
}: {
  projects: ProjectMapCard[];
  locale: string;
}) {
  const t = await getTranslations("projects.map");
  if (projects.length === 0) return null;

  return (
    <section className="flex flex-col gap-3" data-testid="project-map">
      <h2 className="font-mono text-[10px] uppercase tracking-label text-text-muted">
        {t("title")}
      </h2>
      <ul className="grid gap-4 sm:grid-cols-2">
        {projects.map((p) => (
          <li key={p.id}>
            <Link
              href={`/${locale}/dashboard/projects/${p.id}/operations`}
              data-testid="project-operations-link"
              className="card-border glow-hover rise-in flex h-full flex-col gap-3 p-5"
            >
              <span className="font-display text-lg font-semibold tracking-tightest text-text-primary">
                {p.title ?? t("untitled")}
              </span>
              {p.city ? (
                <span className="inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-label text-text-muted">
                  <MapPin className="h-3.5 w-3.5" aria-hidden />
                  {p.city}
                </span>
              ) : null}
              <span className="mt-auto flex items-end justify-between gap-3">
                <span className="flex items-center gap-2">
                  <Users className="h-4 w-4 text-brand-cyan" aria-hidden />
                  <CountUp
                    text={String(p.assignedCount)}
                    className="font-mono text-2xl font-bold tracking-tightest text-text-primary"
                  />
                  <span className="font-mono text-[10px] uppercase tracking-label text-text-muted">
                    {t("teamLabel")}
                  </span>
                </span>
                <span className="font-mono text-[10px] uppercase tracking-label text-brand-blue">
                  {t("openArena")} →
                </span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
