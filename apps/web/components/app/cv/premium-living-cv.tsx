import type { ReactNode } from "react";

import { PersonPortrait } from "@/components/app/identity/person-portrait";

/**
 * THE LIVING CV'S IDENTITY MOMENT — who this is, before anything is listed
 * (owner visual reference 2026-11-24, `docs/design/living-cv-reference-2026-11-24/`;
 * identity variant `cv-header` of lib/identity/player-identity.ts).
 *
 * The collectible identity card on a dark surface with a gold frame (the
 * person's consented photo, else their monogram; the name; the main
 * profession; the country), the header beside it (name, professions,
 * languages, the page's own actions) and the fact strip (years, projects,
 * hours). Every figure is passed in already resolved from the ONE experience
 * reading (lib/journal/professional-experience.ts, decision 0025); a fact
 * that is not known is not passed and therefore not drawn — never a 0, never
 * a rating, a score, a percentage or stars (README data rules, doctrine §7).
 *
 * WHAT IT DOES NOT LIST (owner P0 2026-11-23, "CV skills and work experience
 * shown twice"): skills and work history. Each skill and each job is listed
 * ONCE, by the page's own sections (pinned by lib/guards/cv-each-item-once.test.ts).
 *
 * No helper text (decision 0032). Pure and i18n-agnostic: the page passes
 * resolved strings.
 */

export type PremiumCvFact = { readonly value: string; readonly label: string; readonly testid?: string };

/** ISO-3166 alpha-2 → the flag as regional-indicator letters, or null. */
function flagOf(countryCode: string | null): string | null {
  const c = (countryCode ?? "").trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(c)) return null;
  return String.fromCodePoint(...[...c].map((ch) => 0x1f1e6 + ch.charCodeAt(0) - 65));
}

export function PremiumLivingCv({
  name,
  eyebrow,
  summary,
  facts,
  leadership,
  portraitUrl = null,
  initials = "",
  countryCode = null,
  countryName = null,
  languages = [],
  actions,
}: {
  readonly name: string;
  /** The professions line ("Plytelių klojėjas · Statybos darbai"). */
  readonly eyebrow: string;
  readonly summary: string | null;
  /** The fact strip: only known facts (years, projects, hours). */
  readonly facts: readonly PremiumCvFact[];
  /** The page's "organizations you lead" region, when there is one. */
  readonly leadership?: ReactNode;
  /** The person's consented photo, else null (the monogram is drawn). */
  readonly portraitUrl?: string | null;
  readonly initials?: string;
  readonly countryCode?: string | null;
  readonly countryName?: string | null;
  /** Language codes the person stated, upper-case. */
  readonly languages?: readonly string[];
  /** The page's own actions (Download CV, …), already rendered. */
  readonly actions?: ReactNode;
}) {
  const flag = flagOf(countryCode);
  return (
    <article className="flex flex-col gap-6 print:hidden" data-testid="premium-living-cv">
      <section
        className="relative isolate grid gap-6 overflow-hidden rounded-[28px] bg-[#0b1020] p-4 shadow-[inset_0_0_0_1px_rgb(var(--c-text-primary)/0.10)] sm:p-6 md:grid-cols-[minmax(0,15rem)_1fr] md:gap-8"
        data-testid="premium-cv-identity"
      >
        <div
          aria-hidden
          className="absolute inset-0 -z-10 bg-[radial-gradient(120%_90%_at_100%_0%,rgb(212_175_55/0.10),transparent_55%)]"
        />

        {/* THE COLLECTIBLE CARD — gold frame on a dark surface. */}
        <div
          className="mx-auto w-full max-w-[15rem] rounded-[22px] bg-[linear-gradient(160deg,#f5d77a,#b8860b_45%,#f0cf6b_70%,#8a6a12)] p-[2px] shadow-[0_18px_40px_-18px_rgb(212_175_55/0.55)]"
          data-testid="premium-cv-card"
        >
          <div className="flex flex-col items-center gap-3 rounded-[20px] bg-[radial-gradient(130%_80%_at_50%_0%,#2a2410,#0c0c0c_70%)] px-4 pb-5 pt-4">
            <PersonPortrait
              name={name}
              avatarUrl={portraitUrl}
              initials={initials}
              width="clamp(120px, 40vw, 176px)"
              testids={{ photo: "premium-cv-photo", monogram: "premium-cv-monogram" }}
            />
            <p
              className="text-center font-display text-lg font-semibold leading-tight text-[#f3d27a]"
              data-testid="premium-cv-card-name"
            >
              {name}
            </p>
            <p className="text-center text-meta uppercase tracking-wider text-[#e9dcb5]" data-testid="premium-cv-card-profession">
              {eyebrow}
            </p>
            {flag ? (
              <span
                className="text-2xl leading-none"
                role="img"
                aria-label={countryName ?? countryCode ?? undefined}
                data-testid="premium-cv-card-flag"
              >
                {flag}
              </span>
            ) : null}
          </div>
        </div>

        {/* THE HEADER — name, professions, languages, actions. */}
        <div className="flex min-w-0 flex-col gap-4">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0">
              <h1
                className="break-words font-display text-[clamp(1.8rem,5vw,2.75rem)] font-semibold leading-tight tracking-tight text-text-primary"
                data-testid="premium-cv-name"
              >
                {name}
              </h1>
              <p className="mt-1 text-text-secondary" data-testid="premium-cv-professions">
                {eyebrow}
              </p>
              {languages.length > 0 ? (
                <div className="mt-3 flex flex-wrap gap-2" data-testid="premium-cv-languages">
                  {languages.map((l) => (
                    <span
                      key={l}
                      className="inline-flex min-h-8 items-center rounded-full border border-[rgb(var(--c-text-primary)/0.18)] px-3 text-meta font-medium text-text-primary"
                    >
                      {l}
                    </span>
                  ))}
                </div>
              ) : null}
            </div>
            {actions ? (
              <div className="flex flex-wrap gap-2" data-testid="premium-cv-actions">
                {actions}
              </div>
            ) : null}
          </div>

          {summary ? <p className="max-w-[60ch] leading-relaxed text-text-secondary">{summary}</p> : null}

          {facts.length > 0 ? (
            <dl
              className="grid grid-cols-3 gap-2 border-t border-[rgb(var(--c-text-primary)/0.10)] pt-4 sm:gap-4"
              data-testid="premium-cv-facts"
            >
              {facts.map((f) => (
                <div
                  key={f.label}
                  className="flex min-w-0 flex-col rounded-xl bg-[rgb(var(--c-text-primary)/0.04)] px-3 py-3"
                  data-testid={f.testid}
                >
                  <dd className="order-1 truncate font-display text-[clamp(1.15rem,4vw,1.6rem)] font-semibold leading-none tabular-nums text-text-primary">
                    {f.value}
                  </dd>
                  <dt className="order-2 mt-1.5 text-meta text-text-muted">{f.label}</dt>
                </div>
              ))}
            </dl>
          ) : null}
        </div>
      </section>

      {leadership}
    </article>
  );
}
