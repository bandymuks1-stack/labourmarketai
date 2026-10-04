import { ArrowRight } from "lucide-react";

import { PersonPortrait } from "@/components/app/identity/person-portrait";
import { CapabilityTag, type CapabilityTier } from "@/components/app/work-world/capability-tag";
import { RelationRail, type RailStage } from "@/components/app/work-world/relation-rail";
import { Spine, SpineItem } from "@/components/app/work-world/spine";
import { StateMark } from "@/components/app/work-world/state-mark";
import { WorkBar } from "@/components/app/work-world/work-bar";

/**
 * THE LIVING CV — the professional history that EMERGES from real work
 * (premium completion mission §9, §18). Not a résumé builder:
 *
 *   REAL WORK → EVIDENCE → CONFIRMATION → PROFESSIONAL HISTORY → CAPABILITY → NEXT
 *
 * Screen-only, above the print document. It answers the retention question:
 * "why keep using this after I get a job?" — because every job adds to a
 * history that is yours, not the employer's.
 *
 * Built from the product's shared vocabulary (components/app/work-world) so this
 * screen reads like every other one:
 *   · the RELATION RAIL shows which links of the chain are already true for
 *     this person — a map of what the data knows, never a progress bar;
 *   · the SPINE carries the engagements, newest first, the present marked,
 *     and the way forward drawn as NOT YET HISTORY;
 *   · the WORK BAR gives each engagement its honest layers (recorded, and the
 *     part a manager's record stands behind) — the numbers are always also
 *     written as text;
 *   · an engagement with no records is the UNKNOWN state, never a zero-length
 *     bar and never styled as a failure (SEP-7);
 *   · CAPABILITY TAGS carry what stands behind each skill — shape plus word,
 *     never colour alone.
 *
 * Pure and i18n-agnostic: the page passes resolved strings.
 */

export interface LivingCvEngagement {
  readonly id: string;
  readonly organization: string;
  readonly title: string | null;
  /** Already formatted: "03/2025 – now". */
  readonly period: string;
  readonly current: boolean;
  /** Hours; `null` = no work records exist for this engagement. */
  readonly recorded: { readonly hours: number; readonly confirmedHours: number } | null;
  /** Already formatted hours text from the page's own copy ("184 h · 56 h …"). */
  readonly recordedText: string | null;
}

export interface LivingCvStoryData {
  readonly name: string;
  readonly initials: string;
  readonly professions: readonly string[];
  readonly engagements: readonly LivingCvEngagement[];
  readonly skills: {
    readonly confirmed: readonly string[];
    readonly evidence: readonly string[];
    readonly declared: readonly string[];
  };
}

export interface LivingCvStoryLabels {
  readonly eyebrow: string;
  readonly title: string;
  readonly now: string;
  readonly noRecords: string;
  readonly legend: { readonly managerRecord: string; readonly recorded: string };
  readonly skillsTitle: string;
  readonly tiers: { readonly confirmed: string; readonly evidence: string; readonly declared: string };
  readonly rail: {
    readonly label: string;
    readonly work: string;
    readonly evidence: string;
    readonly confirmed: string;
    readonly history: string;
    readonly next: string;
  };
  readonly next: { readonly title: string; readonly body: string; readonly cta: string; readonly href: string };
}

/**
 * Which links of the chain are TRUE for this person, from the data the page
 * already holds. A link is done only when the record behind it exists; the
 * first link that is not done is the current one (the way forward).
 */
export function livingCvRail(
  data: LivingCvStoryData,
  labels: LivingCvStoryLabels["rail"],
): RailStage[] {
  const hasWork = data.engagements.some((e) => e.recorded !== null);
  const hasEvidence = data.skills.confirmed.length + data.skills.evidence.length > 0;
  const hasConfirmed =
    data.skills.confirmed.length > 0 ||
    data.engagements.some((e) => (e.recorded?.confirmedHours ?? 0) > 0);
  const hasHistory = data.engagements.length > 0;
  const done = [hasWork, hasEvidence, hasConfirmed, hasHistory];
  const firstOpen = done.findIndex((d) => !d);
  const stage = (i: number, id: string, label: string): RailStage => ({
    id,
    label,
    state: done[i] ? "done" : i === firstOpen ? "current" : "open",
  });
  return [
    stage(0, "work", labels.work),
    stage(1, "evidence", labels.evidence),
    stage(2, "confirmed", labels.confirmed),
    stage(3, "history", labels.history),
    // The last link is always the way forward: offered, never "complete".
    { id: "next", label: labels.next, state: firstOpen === -1 ? "current" : "open" },
  ];
}

export function LivingCvStory({
  data,
  labels,
}: {
  readonly data: LivingCvStoryData;
  readonly labels: LivingCvStoryLabels;
}) {
  const maxHours = Math.max(1, ...data.engagements.map((e) => e.recorded?.hours ?? 0));
  const tiers: readonly { readonly tier: CapabilityTier; readonly label: string; readonly skills: readonly string[] }[] = [
    { tier: "confirmed", label: labels.tiers.confirmed, skills: data.skills.confirmed },
    { tier: "evidence", label: labels.tiers.evidence, skills: data.skills.evidence },
    { tier: "declared", label: labels.tiers.declared, skills: data.skills.declared },
  ];
  return (
    <section
      aria-label={labels.title}
      className="flex flex-col gap-10 print:hidden"
      data-testid="living-cv-story"
    >
      {/* WHO — the person leads; the system's words follow. */}
      <header className="flex items-center gap-5">
        <PersonPortrait name={data.name} avatarUrl={null} initials={data.initials} width="76px" />
        <div className="min-w-0">
          <p className="text-support font-medium text-brand-blue">{labels.eyebrow}</p>
          <h2 className="mt-0.5 font-display text-2xl font-bold leading-tight tracking-tightest text-text-primary sm:text-4xl">
            {labels.title}
          </h2>
          {data.professions.length > 0 ? (
            <p className="mt-1 text-support text-text-secondary">{data.professions.join(" · ")}</p>
          ) : null}
        </div>
      </header>

      {/* WHERE IT STANDS — the chain, with the links that are already true. */}
      <RelationRail stages={livingCvRail(data, labels.rail)} label={labels.rail.label} />

      {/* HISTORY — newest first; each job adds to it; the next step is drawn
          as NOT YET HISTORY. */}
      <div className="flex flex-col gap-4">
        <div
          className="flex flex-wrap items-center gap-x-5 gap-y-1 text-meta text-text-secondary"
          aria-hidden
        >
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2 w-6 rounded-full bg-trust-accent" /> {labels.legend.managerRecord}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2 w-6 rounded-full bg-brand-cyan" /> {labels.legend.recorded}
          </span>
        </div>

        <Spine label={labels.title} testId="living-cv-timeline">
          {data.engagements.map((e) => {
            const rec = e.recorded;
            const confirmedShare =
              rec && rec.hours > 0 ? Math.min(100, (rec.confirmedHours / rec.hours) * 100) : 0;
            return (
              <SpineItem
                key={e.id}
                position={e.current ? "now" : "past"}
                testId="living-cv-engagement"
                data-has-records={rec ? "true" : "false"}
              >
                <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5">
                  <h3 className="font-display text-card-title font-semibold text-text-primary">
                    {e.organization}
                  </h3>
                  <p className="text-support text-text-secondary">
                    {e.current ? <span className="mr-2 font-medium text-brand-blue">{labels.now}</span> : null}
                    {e.period}
                  </p>
                </div>
                {e.title ? <p className="mt-0.5 text-support text-text-secondary">{e.title}</p> : null}

                {rec ? (
                  <div className="mt-3 flex flex-col gap-1.5">
                    <WorkBar
                      widthPercent={(rec.hours / maxHours) * 100}
                      confirmedPercent={confirmedShare}
                      label={e.recordedText ?? undefined}
                    />
                    {e.recordedText ? (
                      <p className="text-support text-text-secondary">{e.recordedText}</p>
                    ) : null}
                  </div>
                ) : (
                  <StateMark state="unknown" className="mt-3">
                    {labels.noRecords}
                  </StateMark>
                )}
              </SpineItem>
            );
          })}

          {/* NEXT — the history goes with the person. Not history yet. */}
          <SpineItem position="next" testId="living-cv-next">
            <p className="text-support font-medium text-brand-blue">{labels.next.title}</p>
            <p className="mt-0.5 max-w-prose text-support text-text-secondary">{labels.next.body}</p>
            <a
              href={labels.next.href}
              className="mt-3 inline-flex min-h-11 items-center gap-2 rounded-full border border-brand-blue px-4 text-support font-semibold text-text-primary transition-colors hover:bg-brand-blue/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue"
            >
              {labels.next.cta}
              <ArrowRight className="h-4 w-4" strokeWidth={1.75} aria-hidden />
            </a>
          </SpineItem>
        </Spine>
      </div>

      {/* CAPABILITY — what the work shows, by what stands behind it. */}
      {tiers.some((g) => g.skills.length > 0) ? (
        <div className="flex flex-col gap-4" data-testid="living-cv-skills">
          <h3 className="font-display text-card-title font-semibold text-text-primary">{labels.skillsTitle}</h3>
          <div className="flex flex-col gap-4">
            {tiers.map((g) =>
              g.skills.length === 0 ? null : (
                <div key={g.tier} data-tier={g.tier} className="flex flex-col gap-2">
                  <p className="text-meta text-text-secondary">{g.label}</p>
                  <ul className="flex flex-wrap gap-2">
                    {g.skills.map((s) => (
                      <li key={s}>
                        <CapabilityTag tier={g.tier}>{s}</CapabilityTag>
                      </li>
                    ))}
                  </ul>
                </div>
              ),
            )}
          </div>
        </div>
      ) : null}
    </section>
  );
}
