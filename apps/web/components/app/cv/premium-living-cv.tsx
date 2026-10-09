import type { ReactNode } from "react";

import { Accented, EvidenceBar, Eyebrow, LevelMark, RegionHead, Stamp, type EvidenceLevel } from "@/components/app/premium/grammar";

/**
 * THE LIVING CV — a working life as a reader asks about it (frozen premium
 * design class 4e695e261, ported as grammar onto canonical data):
 *
 *   WHO (identity moment) → WHAT they can do → WHERE and with whom they did it
 *
 * Every line appears only when there is something true to say; a thin CV is
 * thin, never padded. Evidence is a quiet property of each line (a mark, a
 * bar and the same numbers in words), never a table of its own. Leadership of
 * an organization is rendered by the page beside this, never as hours here.
 *
 * Pure and i18n-agnostic: the page passes resolved strings.
 */

export type PremiumCvFact = { readonly value: string; readonly label: string };

export type PremiumCvCapability = {
  readonly key: string;
  readonly label: string;
  readonly level: EvidenceLevel;
  /** Hours the person's records attribute to the skill; null = none recorded. */
  readonly hours: number | null;
  readonly confirmedHours: number;
  /** Already-localised "12 h confirmed · 40 h recorded" (also the bar's label). */
  readonly evidenceText: string;
};

export type PremiumCvExperience = {
  readonly key: string;
  /** Formatted "06/2025 – 11/2025" / "03/2024 – now"; null when undated. */
  readonly period: string | null;
  readonly title: string;
  readonly subtitle: string | null;
  /** "800 h stated as a period total · organisation records", already localised. */
  readonly detail: string | null;
  /** Where the line comes from, already localised ("Your record", "Organisation records"). */
  readonly source: string;
  readonly level: EvidenceLevel;
  readonly current: boolean;
};

export function PremiumLivingCv({
  name,
  eyebrow,
  summary,
  facts,
  capabilities,
  capabilitiesHead,
  experience,
  experienceHead,
  hiddenCapabilities,
  moreLabel,
  emptyCapabilities,
  emptyExperience,
  leadership,
}: {
  readonly name: string;
  readonly eyebrow: string;
  readonly summary: string | null;
  readonly facts: readonly PremiumCvFact[];
  readonly capabilities: readonly PremiumCvCapability[];
  readonly capabilitiesHead: { readonly eyebrow: string; readonly title: string };
  readonly experience: readonly PremiumCvExperience[];
  readonly experienceHead: { readonly eyebrow: string; readonly title: string };
  readonly hiddenCapabilities: number;
  readonly moreLabel: string;
  readonly emptyCapabilities: string;
  readonly emptyExperience: string;
  /** The page's "organizations you lead" region, when there is one. */
  readonly leadership?: ReactNode;
}) {
  // Exactly ONE accent word (the grammar's rule): the last word of the name.
  const parts = name.trim().split(/\s+/);
  const last = parts.length > 1 ? parts[parts.length - 1] : null;
  const lead = last ? parts.slice(0, -1).join(" ") : name;
  return (
    <article className="flex flex-col gap-14 print:hidden" data-testid="premium-living-cv">
      {/* THE IDENTITY MOMENT — who this is, before anything is listed. */}
      <section
        className="relative isolate overflow-hidden rounded-[32px] p-6 shadow-[inset_0_0_0_1px_rgb(var(--c-text-primary)/0.10)] md:p-12"
        data-testid="premium-cv-identity"
      >
        <div
          aria-hidden
          className="absolute inset-0 -z-10 bg-[radial-gradient(120%_90%_at_100%_0%,rgb(var(--c-brand-orange)/0.10),transparent_55%)]"
        />
        <Eyebrow>{eyebrow}</Eyebrow>
        <h1 className="mt-3 font-display text-[clamp(2.4rem,7vw,5rem)] font-semibold leading-[0.95] tracking-[-0.05em] text-text-primary">
          {last ? <Accented text={`${lead} *${last}*`} /> : lead}
        </h1>
        {summary ? <p className="mt-5 max-w-[56ch] text-[1.05rem] leading-relaxed text-text-secondary">{summary}</p> : null}
        {facts.length > 0 ? (
          <dl className="mt-8 flex flex-wrap gap-x-10 gap-y-4" data-testid="premium-cv-facts">
            {facts.map((f) => (
              <div key={f.label} className="flex flex-col">
                <dd className="order-1 font-display text-[1.6rem] font-semibold leading-none tabular-nums text-text-primary">{f.value}</dd>
                <dt className="order-2 mt-1.5 text-meta text-text-muted">{f.label}</dt>
              </div>
            ))}
          </dl>
        ) : null}
      </section>

      {/* WHAT THEY CAN DO */}
      <section className="flex flex-col gap-4" data-testid="premium-cv-capabilities">
        <RegionHead eyebrow={capabilitiesHead.eyebrow} title={capabilitiesHead.title} className="mb-2" />
        {capabilities.length === 0 ? (
          <p className="text-sm text-text-secondary">{emptyCapabilities}</p>
        ) : (
          <ul className="flex flex-col">
            {capabilities.map((c) => (
              <li
                key={c.key}
                data-level={c.level}
                className="grid grid-cols-[1fr_auto] items-center gap-x-6 gap-y-1 border-t border-text-primary/10 py-3.5 first:border-t-0 sm:grid-cols-[1fr_5.5rem_12rem_4.5rem]"
              >
                <span className="flex items-center gap-3 text-[1rem] font-medium text-text-primary">
                  <LevelMark level={c.level} />
                  {c.label}
                </span>
                <span className="max-sm:hidden">
                  <EvidenceBar
                    confirmed={c.confirmedHours}
                    recorded={Math.max((c.hours ?? 0) - c.confirmedHours, 0)}
                    width={80}
                    label={c.evidenceText}
                  />
                </span>
                <span className="text-meta text-text-muted max-sm:order-3 max-sm:col-span-2">{c.evidenceText}</span>
                <span className="text-right font-display text-[1rem] font-semibold tabular-nums text-text-secondary">
                  {c.hours !== null && c.hours > 0 ? `${Math.round(c.hours)} h` : "—"}
                </span>
              </li>
            ))}
          </ul>
        )}
        {hiddenCapabilities > 0 ? <p className="text-support text-text-muted">{moreLabel}</p> : null}
      </section>

      {/* WHERE AND WITH WHOM */}
      <section className="flex flex-col gap-4" data-testid="premium-cv-experience">
        <RegionHead eyebrow={experienceHead.eyebrow} title={experienceHead.title} className="mb-2" />
        {experience.length === 0 ? (
          <p className="text-sm text-text-secondary">{emptyExperience}</p>
        ) : (
          <ol className="flex flex-col">
            {experience.map((e) => (
              <li
                key={e.key}
                data-level={e.level}
                className={`grid grid-cols-1 gap-x-6 gap-y-1.5 border-t border-text-primary/10 py-5 first:border-t-0 ${e.period ? "md:grid-cols-[9.5rem_1fr]" : ""}`}
                data-testid="premium-cv-experience-row"
              >
                {e.period ? <Stamp className="pt-1">{e.period}</Stamp> : null}
                <div className="flex min-w-0 flex-col gap-1">
                  <p className="flex items-center gap-2.5 text-[1.02rem] font-medium leading-snug text-text-primary">
                    <LevelMark level={e.level} />
                    {e.title}
                  </p>
                  {e.subtitle ? <p className="text-support text-text-secondary">{e.subtitle}</p> : null}
                  {e.detail ? <p className="text-meta text-text-muted">{e.detail}</p> : null}
                  <Stamp className="!text-[0.66rem]">{e.source}</Stamp>
                </div>
              </li>
            ))}
          </ol>
        )}
      </section>

      {leadership}
    </article>
  );
}
