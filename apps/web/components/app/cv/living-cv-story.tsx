import { BadgeCheck, Camera, CircleDashed, Compass, PenLine } from "lucide-react";

import { PersonPortrait } from "@/components/app/identity/person-portrait";
import { cn } from "@/lib/utils";

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
 * Each engagement carries a work bar in three honest layers:
 *   · manager's record   — hours a manager's record stands behind (green + check)
 *   · recorded           — hours the person recorded (cyan)
 *   · nothing recorded   — a dashed "no work records yet" state (UNKNOWN ≠ ZERO:
 *                          an engagement with no records is NOT drawn as a
 *                          zero-length bar, and is never styled as a failure)
 * Bar length is relative recorded volume across engagements; the numbers are
 * always also written as text. Skill tiers use shape + glyph + label, never
 * colour alone. Pure and i18n-agnostic: the page passes resolved strings.
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
  /** The person's OWN consented photo (profiles.avatar_url, signed), or null. */
  readonly avatarUrl?: string | null;
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
  readonly next: { readonly label: string; readonly title: string; readonly body: string; readonly cta: string; readonly href: string };
}

export function LivingCvStory({
  data,
  labels,
}: {
  readonly data: LivingCvStoryData;
  readonly labels: LivingCvStoryLabels;
}) {
  const maxHours = Math.max(1, ...data.engagements.map((e) => e.recorded?.hours ?? 0));
  return (
    <section
      aria-label={labels.title}
      className="relative isolate overflow-hidden rounded-3xl bg-surface-1/60 p-5 shadow-[0_0_0_1px_rgb(var(--c-ink-600)/0.7),0_30px_70px_-40px_rgb(0_0_0/0.7)] print:hidden sm:p-8"
      data-testid="living-cv-story"
    >
      {/* The person's light: the same warm lit edge as the identity stage. */}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(70%_60%_at_10%_0%,rgb(var(--c-brand-blue)/0.12),transparent_66%)]"
      />
      <div className="flex items-center gap-4 sm:gap-6">
        <span className="rounded-2xl shadow-[0_0_0_2px_rgb(var(--c-brand-blue)/0.55),0_0_40px_rgb(var(--c-brand-blue)/0.2)]">
          <PersonPortrait
            name={data.name}
            avatarUrl={data.avatarUrl ?? null}
            initials={data.initials}
            width="clamp(80px, 24vw, 128px)"
            className="rounded-2xl"
          />
        </span>
        <div className="min-w-0 [overflow-wrap:anywhere]">
          <p className="text-support font-medium text-text-muted">{labels.eyebrow}</p>
          <p className="font-display text-2xl font-bold leading-tight tracking-tightest text-text-primary sm:text-4xl">
            {data.name}
          </p>
          {data.professions.length > 0 ? (
            <p className="mt-1 text-support text-text-secondary">{data.professions.join(" · ")}</p>
          ) : null}
          <h2 className="mt-2 text-support font-medium text-text-secondary">{labels.title}</h2>
        </div>
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-1 text-support text-text-secondary" aria-hidden>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2 w-6 rounded-full bg-trust-accent" /> {labels.legend.managerRecord}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2 w-6 rounded-full bg-brand-cyan" /> {labels.legend.recorded}
        </span>
      </div>

      {/* PROFESSIONAL HISTORY — newest first; each job adds to it. */}
      <ol className="relative mt-6 flex flex-col gap-5 border-l-2 border-ink-600 pl-5" data-testid="living-cv-timeline">
        {data.engagements.map((e) => {
          const rec = e.recorded;
          const width = rec ? Math.max(6, Math.round((rec.hours / maxHours) * 100)) : 0;
          const confirmedShare = rec && rec.hours > 0 ? Math.min(100, Math.round((rec.confirmedHours / rec.hours) * 100)) : 0;
          return (
            <li key={e.id} className="relative" data-testid="living-cv-engagement" data-has-records={rec ? "true" : "false"}>
              <span
                aria-hidden
                className={cn(
                  "absolute -left-[1.78rem] top-1.5 h-3 w-3 rounded-full border-2 bg-ink-900",
                  e.current ? "border-brand-blue" : "border-ink-500",
                )}
              />
              <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5">
                <p className="font-semibold text-text-primary">
                  {e.organization}
                  {e.title ? <span className="font-normal text-text-secondary"> · {e.title}</span> : null}
                </p>
                <p className="text-support text-text-secondary">
                  {e.current ? <span className="mr-2 font-semibold text-brand-blue">{labels.now}</span> : null}
                  {e.period}
                </p>
              </div>

              {rec ? (
                <div className="mt-2">
                  <div className="h-2.5 rounded-full bg-ink-700" style={{ width: `${width}%` }} role="img" aria-label={e.recordedText ?? undefined}>
                    <div className="h-full rounded-full bg-brand-cyan">
                      <div className="h-full rounded-full bg-trust-accent" style={{ width: `${confirmedShare}%` }} />
                    </div>
                  </div>
                  <p className="mt-1 flex flex-wrap items-center gap-x-2 text-sm text-text-secondary">
                    {rec.confirmedHours > 0 ? (
                      <span className="inline-flex items-center gap-1 font-medium text-trust-accent">
                        <BadgeCheck className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
                        {labels.legend.managerRecord}
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 font-medium text-brand-cyan">
                        <span aria-hidden className="h-2.5 w-2.5 rounded-full border-2 border-brand-cyan" />
                        {labels.legend.recorded}
                      </span>
                    )}
                    {e.recordedText ? <span>{e.recordedText}</span> : null}
                  </p>
                </div>
              ) : (
                <p className="mt-2 inline-flex min-h-6 items-center gap-1.5 rounded-md border border-dotted border-ink-500 px-2 text-support text-text-secondary">
                  <CircleDashed className="h-3 w-3" strokeWidth={1.75} aria-hidden />
                  {labels.noRecords}
                </p>
              )}
            </li>
          );
        })}
      </ol>

      {/* CAPABILITY — what the work shows, tiered by what stands behind it. */}
      <div className="mt-8" data-testid="living-cv-skills">
        <h3 className="text-support font-medium text-text-secondary">{labels.skillsTitle}</h3>
        <div className="mt-3 flex flex-col gap-3">
          <SkillTier
            label={labels.tiers.confirmed}
            skills={data.skills.confirmed}
            icon={<BadgeCheck className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />}
            chip="border-trust-accent text-trust-accent border-solid"
            tier="confirmed"
          />
          <SkillTier
            label={labels.tiers.evidence}
            skills={data.skills.evidence}
            icon={<Camera className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />}
            chip="border-brand-cyan text-brand-cyan border-solid"
            tier="evidence"
          />
          <SkillTier
            label={labels.tiers.declared}
            skills={data.skills.declared}
            icon={<PenLine className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />}
            chip="border-ink-500 text-text-secondary border-dashed"
            tier="declared"
          />
        </div>
      </div>

      {/* NEXT — the history goes with the person. */}
      <div
        className="mt-8 flex flex-col gap-3 rounded-2xl border border-dashed border-ink-500 p-4 sm:flex-row sm:items-center sm:justify-between"
        data-testid="living-cv-next"
      >
        <div className="flex items-start gap-3">
          <Compass className="mt-0.5 h-5 w-5 shrink-0 text-brand-blue" strokeWidth={1.75} aria-hidden />
          <div>
            <p className="text-support font-medium text-brand-blue">{labels.next.label}</p>
            <p className="font-semibold text-text-primary">{labels.next.title}</p>
            <p className="text-sm text-text-secondary">{labels.next.body}</p>
          </div>
        </div>
        <a
          href={labels.next.href}
          className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-full border border-brand-blue px-4 text-sm font-semibold text-text-primary transition-colors hover:bg-brand-blue/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue"
        >
          {labels.next.cta} →
        </a>
      </div>
    </section>
  );
}

function SkillTier({
  label,
  skills,
  icon,
  chip,
  tier,
}: {
  readonly label: string;
  readonly skills: readonly string[];
  readonly icon: React.ReactNode;
  readonly chip: string;
  readonly tier: string;
}) {
  if (skills.length === 0) return null;
  return (
    <div data-tier={tier}>
      <p className="text-meta text-text-secondary">{label}</p>
      <ul className="mt-1.5 flex flex-wrap gap-1.5">
        {skills.map((s) => (
          <li key={s} className={cn("inline-flex min-h-7 items-center gap-1.5 rounded-full border px-2.5 text-sm", chip)}>
            {icon}
            <span className="text-text-primary">{s}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
