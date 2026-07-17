"use client";

/**
 * Opportunity Discovery — "Kur dar gali pritaikyti savo įgūdžius".
 *
 * Shows a few REAL, deterministically-computed adjacent professional directions
 * for the worker, derived server-side from the single canonical skill/adjacency
 * map (lib/opportunities/adjacent-directions.ts → lib/taxonomy/profession-skills).
 * Explainability is real: each direction states the worker's own shared skills.
 * No AI wording, no percentages, no fabricated courses/salary, honest limitation
 * states. Analytics carry only a bounded `surface` key (no skills / profile text).
 */
import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/lib/i18n/navigation";
import { recordEvent } from "@/lib/telemetry/task";
import type { AdjacentDirectionLimitation } from "@/lib/opportunities/adjacent-directions";

const SURFACE = "opportunity_directions" as const;
const INITIAL_VISIBLE = 3;
// Fixed, existing canonical worker routes (the profile hub + the opportunity
// board). Held here rather than passed from the dashboard page so the page
// keeps no hard-coded route islands (dashboard-module-registry guard).
const OPPORTUNITIES_HREF = "/dashboard/opportunities";
const PROFILE_HREF = "/dashboard/profile";

export interface DirectionView {
  readonly professionId: string;
  readonly professionName: string;
  readonly sharedSkills: readonly string[];
  readonly missingSkills: readonly string[];
}

export function OpportunityDirectionsCard({
  directions,
  limitationState,
  opportunitiesHref = OPPORTUNITIES_HREF,
  profileHref = PROFILE_HREF,
}: {
  readonly directions: readonly DirectionView[];
  readonly limitationState: AdjacentDirectionLimitation;
  readonly opportunitiesHref?: string;
  readonly profileHref?: string;
}) {
  const t = useTranslations("opportunityDirections");
  const [expanded, setExpanded] = useState(false);
  const viewedRef = useRef(false);

  useEffect(() => {
    if (viewedRef.current) return;
    viewedRef.current = true;
    recordEvent("opportunity_directions_viewed", { surface: SURFACE });
  }, []);

  const headingId = "opportunity-directions-heading";

  // Honest limitation: not enough skills to compute directions.
  if (limitationState === "insufficient_skills" || directions.length === 0) {
    // "no_reliable_directions" and "insufficient_skills" both render an honest,
    // non-fake state — never an empty pretend list.
    const isInsufficient = limitationState === "insufficient_skills";
    return (
      <section className="card-border flex flex-col gap-3 p-4" aria-labelledby={headingId}>
        <h2
          id={headingId}
          className="font-display text-base font-semibold tracking-tight text-text-primary"
        >
          {t("heading")}
        </h2>
        <p className="text-sm leading-relaxed text-text-secondary">
          {isInsufficient ? t("insufficientBody") : t("noneBody")}
        </p>
        {isInsufficient ? (
          <Link
            href={profileHref}
            className="text-sm font-medium text-brand-blue hover:underline"
            onClick={() =>
              recordEvent("opportunity_profile_update_clicked", { surface: SURFACE })
            }
          >
            {t("addProfileCta")}
          </Link>
        ) : null}
      </section>
    );
  }

  const visible = expanded ? directions : directions.slice(0, INITIAL_VISIBLE);
  const hasMore = directions.length > INITIAL_VISIBLE;

  return (
    <section className="card-border flex flex-col gap-3 p-4" aria-labelledby={headingId}>
      <div className="flex flex-col gap-1">
        <h2
          id={headingId}
          className="font-display text-base font-semibold tracking-tight text-text-primary"
        >
          {t("heading")}
        </h2>
        <p className="text-sm leading-relaxed text-text-secondary">{t("intro")}</p>
      </div>

      <ul className="flex flex-col divide-y divide-border/40">
        {visible.map((d) => (
          <li key={d.professionId} className="py-3 first:pt-0 last:pb-0">
            <div className="flex flex-col gap-1.5">
              <h3 className="text-sm font-semibold text-text-primary">
                {d.professionName}
              </h3>
              <p className="text-xs leading-relaxed text-text-secondary">
                <span className="text-text-muted">{t("fitBecause")} </span>
                {d.sharedSkills.join(", ")}
              </p>
              {d.missingSkills.length > 0 ? (
                <p className="text-xs leading-relaxed text-text-muted">
                  {t("couldStrengthen")} {d.missingSkills.join(", ")}
                </p>
              ) : null}
            </div>
          </li>
        ))}
      </ul>

      {hasMore ? (
        <button
          type="button"
          className="self-start rounded-md border border-ink-600 px-3 py-1 text-xs font-medium text-text-secondary transition-colors hover:border-brand-blue/50 hover:text-brand-blue"
          aria-expanded={expanded}
          onClick={() => {
            const next = !expanded;
            setExpanded(next);
            if (next) recordEvent("opportunity_direction_opened", { surface: SURFACE });
          }}
        >
          {expanded ? t("showLess") : t("showMore")}
        </button>
      ) : null}

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 pt-1">
        <Link
          href={opportunitiesHref}
          className="text-sm font-medium text-brand-blue hover:underline"
          onClick={() => recordEvent("opportunity_jobs_opened", { surface: SURFACE })}
        >
          {t("viewOpportunities")}
        </Link>
        <Link
          href={profileHref}
          className="text-sm font-medium text-text-secondary hover:text-brand-blue hover:underline"
          onClick={() =>
            recordEvent("opportunity_profile_update_clicked", { surface: SURFACE })
          }
        >
          {t("addSkills")}
        </Link>
      </div>
    </section>
  );
}
