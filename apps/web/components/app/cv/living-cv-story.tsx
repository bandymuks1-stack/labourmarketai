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
 * THREE PROVENANCE CLASSES, three shapes (never colour alone):
 *   · CONFIRMED  — a manager/employer's record stands behind hours:
 *                  solid green rail + filled check node
 *   · RECORDED   — hours the person recorded: cyan rail + ringed node
 *   · DECLARED   — the person's own statement, no work records: dashed,
 *                  unfilled (UNKNOWN ≠ ZERO: never drawn as a failure)
 * The FUTURE ("next") uses none of them: hatched, dashed, labelled "not part
 * of your record", so it can never be mistaken for verified history.
 * Bar length is relative recorded volume across engagements; the numbers are
 * always also written as text. Pure and i18n-agnostic: the page passes
 * resolved strings.
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
  /** The three provenance classes, in words (never colour alone). */
  readonly legend: {
    readonly declared: string;
    readonly declaredHint: string;
    readonly recorded: string;
    readonly recordedHint: string;
    readonly managerRecord: string;
    readonly managerRecordHint: string;
  };
  /** The first-screen promise: what this page is, in three short lines. */
  readonly promise: { readonly mine: string; readonly grows: string; readonly follows: string };
  readonly keyTitle: string;
  readonly historyTitle: string;
  readonly skillsTitle: string;
  readonly tiers: { readonly confirmed: string; readonly evidence: string; readonly declared: string };
  readonly next: {
    readonly label: string;
    readonly title: string;
    readonly body: string;
    readonly cta: string;
    readonly href: string;
    /** "Not part of your record" — the future is never drawn as history. */
    readonly notRecord: string;
  };
}

type Provenance = "confirmed" | "recorded" | "declared";

const NODE: Record<Provenance, string> = {
  confirmed: "border-trust-accent bg-trust-accent text-ink-900",
  recorded: "border-brand-cyan bg-ink-900",
  declared: "border-dashed border-ink-500 bg-ink-900",
};
const CARD: Record<Provenance, string> = {
  confirmed:
    "border-y border-r border-l-4 border-y-ink-600 border-r-ink-600 border-l-trust-accent bg-trust-accent/[0.06]",
  recorded:
    "border-y border-r border-l-4 border-y-ink-600 border-r-ink-600 border-l-brand-cyan bg-surface-1/40",
  declared: "border border-dashed border-ink-500 bg-transparent",
};
const TONE: Record<Provenance, string> = {
  confirmed: "text-trust-accent",
  recorded: "text-brand-cyan",
  declared: "text-text-secondary",
};

function ProvIcon({ prov }: { readonly prov: Provenance }) {
  if (prov === "confirmed") return <BadgeCheck className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />;
  if (prov === "recorded") return <Camera className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />;
  return <PenLine className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />;
}

export function LivingCvStory({
  data,
  labels,
}: {
  readonly data: LivingCvStoryData;
  readonly labels: LivingCvStoryLabels;
}) {
  const maxHours = Math.max(1, ...data.engagements.map((e) => e.recorded?.hours ?? 0));
  const classify = (e: LivingCvEngagement): Provenance =>
    e.recorded ? (e.recorded.confirmedHours > 0 ? "confirmed" : "recorded") : "declared";
  const text: Record<Provenance, string> = {
    confirmed: labels.legend.managerRecord,
    recorded: labels.legend.recorded,
    declared: labels.legend.declared,
  };
  const hint: Record<Provenance, string> = {
    confirmed: labels.legend.managerRecordHint,
    recorded: labels.legend.recordedHint,
    declared: labels.legend.declaredHint,
  };
  return (
    <section
      aria-label={labels.title}
      className="relative isolate overflow-hidden rounded-3xl bg-surface-1/60 p-4 shadow-[0_0_0_1px_rgb(var(--c-ink-600)/0.7),0_30px_70px_-40px_rgb(0_0_0/0.7)] print:hidden sm:p-8"
      data-testid="living-cv-story"
    >
      {/* The person's light: the same warm lit edge as the identity stage. */}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(70%_60%_at_10%_0%,rgb(var(--c-brand-blue)/0.12),transparent_66%)]"
      />
      <div className="flex items-center gap-4 sm:gap-6">
        <span className="shrink-0 rounded-2xl shadow-[0_0_0_2px_rgb(var(--c-brand-blue)/0.55),0_0_40px_rgb(var(--c-brand-blue)/0.2)]">
          <PersonPortrait
            name={data.name}
            avatarUrl={data.avatarUrl ?? null}
            initials={data.initials}
            width="clamp(72px, 20vw, 120px)"
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
        </div>
      </div>

      {/* FIRST SCREEN, in three lines: it is mine, it grows when I work, it
          can follow me. Everything else on the page is one scroll away. */}
      <div className="mt-5">
        <h2 className="font-display text-xl font-bold leading-snug tracking-tightest text-text-primary sm:text-2xl">
          {labels.promise.mine}
        </h2>
        <p className="mt-1 text-sm text-text-secondary">
          {labels.promise.grows} {labels.promise.follows}
        </p>
      </div>

      {/* HOW TO READ EACH LINE — three provenance classes, each its own shape. */}
      <ul className="mt-4 grid gap-2 sm:grid-cols-3" aria-label={labels.keyTitle} data-testid="living-cv-key">
        {(["declared", "recorded", "confirmed"] as const).map((k) => (
          <li key={k} data-provenance={k} className={cn("flex items-start gap-2 rounded-xl p-2.5 text-sm", CARD[k])}>
            <span className={cn("mt-0.5 shrink-0", TONE[k])}>
              <ProvIcon prov={k} />
            </span>
            <span className="min-w-0">
              <span className={cn("block font-semibold", TONE[k])}>{text[k]}</span>
              <span className="block text-meta text-text-secondary">{hint[k]}</span>
            </span>
          </li>
        ))}
      </ul>

      {/* PROFESSIONAL HISTORY — newest first; each job adds to it. */}
      <h3 className="mt-7 text-support font-medium text-text-secondary">{labels.historyTitle}</h3>
      <ol className="relative mt-3 flex flex-col gap-3 border-l-2 border-ink-600 pl-6" data-testid="living-cv-timeline">
        {data.engagements.map((e) => {
          const rec = e.recorded;
          const prov = classify(e);
          const width = rec ? Math.max(6, Math.round((rec.hours / maxHours) * 100)) : 0;
          const confirmedShare =
            rec && rec.hours > 0 ? Math.min(100, Math.round((rec.confirmedHours / rec.hours) * 100)) : 0;
          return (
            <li
              key={e.id}
              className="relative"
              data-testid="living-cv-engagement"
              data-has-records={rec ? "true" : "false"}
              data-provenance={prov}
            >
              <span
                aria-hidden
                className={cn(
                  "absolute -left-[2.07rem] top-3 flex h-4 w-4 items-center justify-center rounded-full border-2",
                  NODE[prov],
                )}
              >
                {prov === "confirmed" ? <BadgeCheck className="h-3 w-3" strokeWidth={3} /> : null}
                {prov === "recorded" ? <span className="h-1.5 w-1.5 rounded-full bg-brand-cyan" /> : null}
              </span>
              <div className={cn("rounded-xl p-3", CARD[prov])}>
                <p className={cn("inline-flex items-center gap-1.5 text-meta font-semibold", TONE[prov])}>
                  <ProvIcon prov={prov} />
                  {text[prov]}
                </p>
                <div className="mt-1 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5">
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
                    <div
                      className="h-2 rounded-full bg-ink-700"
                      style={{ width: `${width}%` }}
                      role="img"
                      aria-label={e.recordedText ?? undefined}
                    >
                      <div className="h-full rounded-full bg-brand-cyan">
                        <div className="h-full rounded-full bg-trust-accent" style={{ width: `${confirmedShare}%` }} />
                      </div>
                    </div>
                    {e.recordedText ? <p className="mt-1 text-sm text-text-secondary">{e.recordedText}</p> : null}
                  </div>
                ) : (
                  <p className="mt-2 inline-flex min-h-6 items-center gap-1.5 text-support text-text-secondary">
                    <CircleDashed className="h-3 w-3" strokeWidth={1.75} aria-hidden />
                    {labels.noRecords}
                  </p>
                )}
              </div>
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

      {/* NEXT — the FUTURE. Hatched, dashed, outside the record colours and
          labelled "not part of your record": never mistaken for history. */}
      <div
        className="mt-8 flex flex-col gap-3 rounded-2xl border border-dashed border-ink-500 bg-[repeating-linear-gradient(135deg,transparent_0_9px,rgb(var(--c-ink-600)/0.35)_9px_10px)] p-4 sm:flex-row sm:items-center sm:justify-between"
        data-testid="living-cv-next"
        data-provenance="future"
      >
        <div className="flex items-start gap-3">
          <Compass className="mt-0.5 h-5 w-5 shrink-0 text-brand-blue" strokeWidth={1.75} aria-hidden />
          <div>
            <p className="text-support font-medium text-brand-blue">
              {labels.next.label} · <span className="text-text-secondary">{labels.next.notRecord}</span>
            </p>
            <p className="font-semibold text-text-primary">{labels.next.title}</p>
            <p className="text-sm text-text-secondary">{labels.next.body}</p>
          </div>
        </div>
        <a
          href={labels.next.href}
          className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-full border border-brand-blue bg-ink-900/80 px-4 text-sm font-semibold text-text-primary transition-colors hover:bg-brand-blue/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue"
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
