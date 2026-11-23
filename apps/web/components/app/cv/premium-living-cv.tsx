import type { ReactNode } from "react";

import { Accented, Eyebrow } from "@/components/app/premium/grammar";

/**
 * THE LIVING CV'S IDENTITY MOMENT — who this is, before anything is listed
 * (frozen premium design class 4e695e261, ported as grammar onto canonical
 * data): the name, the professions, the headline figures, and the
 * organizations the person leads.
 *
 * WHAT IT DOES NOT LIST (owner P0 2026-11-23, "CV skills and work experience
 * shown twice"): skills and work history. They used to have regions here
 * ("What you can do", "Where you have worked") built from the same rows the
 * page's own sections list below — so every skill and every job stood twice
 * on one screen, and the skill region was a second presentation beside the
 * canonical one (no claim folding, eight items then "+N more"). Each skill
 * and each job is now listed ONCE, by the page's sections: skills through
 * `presentSkills` (lib/cv-export/skill-presentation.ts, with the potential
 * capabilities of decision 0023), history through the one experience reading
 * (lib/journal/professional-experience.ts, decision 0025). Pinned by
 * lib/guards/cv-each-item-once.test.ts.
 *
 * Pure and i18n-agnostic: the page passes resolved strings.
 */

export type PremiumCvFact = { readonly value: string; readonly label: string };

export function PremiumLivingCv({
  name,
  eyebrow,
  summary,
  facts,
  leadership,
}: {
  readonly name: string;
  readonly eyebrow: string;
  readonly summary: string | null;
  readonly facts: readonly PremiumCvFact[];
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

      {leadership}
    </article>
  );
}
