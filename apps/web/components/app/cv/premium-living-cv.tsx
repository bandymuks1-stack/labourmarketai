import type { ReactNode } from "react";

import { PersonPortrait } from "@/components/app/identity/person-portrait";

/**
 * Living CV identity and canonical facts, before the detailed sections.
 * The owner's 2026-11-25 correction makes both identities inherit the page
 * theme. Gold marks identity; it does not create a second colour environment.
 * All figures and labels are resolved by the page's existing canonical reader.
 * Skills and work records remain in their own addressed blocks, once each.
 */
export function LivingCvIdentityFrame({ children, testId }: { readonly children: ReactNode; readonly testId: string }) {
  return (
    <div
      className="living-cv-identity-frame mx-auto w-full max-w-[12rem] self-start rounded-2xl border border-brand-blue/35 bg-ink-800 p-2 text-text-primary shadow-sm"
      data-testid={testId}
    >
      {children}
    </div>
  );
}

export type PremiumCvFact = { readonly value: string; readonly label: string; readonly testid?: string };

/** ISO-3166 alpha-2 to the stated country's flag, or null. */
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
  portraitUrl = null,
  initials = "",
  countryCode = null,
  countryName = null,
  languages = [],
  actions,
}: {
  readonly name: string;
  readonly eyebrow: string;
  readonly summary: string | null;
  readonly facts: readonly PremiumCvFact[];
  readonly portraitUrl?: string | null;
  readonly initials?: string;
  readonly countryCode?: string | null;
  readonly countryName?: string | null;
  readonly languages?: readonly string[];
  readonly actions?: ReactNode;
}) {
  const flag = flagOf(countryCode);
  const factGridColumns = facts.length === 2
    ? "grid-cols-2"
    : "grid-cols-[repeat(auto-fit,minmax(min(100%,8rem),1fr))]";
  return (
    <article className="print:hidden" data-testid="premium-living-cv">
      <section
        className="grid min-w-0 grid-cols-[6.5rem_minmax(0,1fr)] items-start gap-x-4 gap-y-5 rounded-2xl border border-ink-600 bg-ink-800 p-4 sm:gap-x-6 sm:p-6 md:grid-cols-[12rem_minmax(0,1fr)]"
        data-testid="premium-cv-identity"
      >
        <div className="min-w-0 md:row-span-3">
          <LivingCvIdentityFrame testId="premium-cv-card">
            <div className="flex min-w-0 flex-col items-center gap-2 rounded-xl bg-ink-700/40 py-2 md:gap-3 md:py-4">
              <PersonPortrait
                name={name}
                avatarUrl={portraitUrl}
                initials={initials}
                width="clamp(76px, 14vw, 144px)"
                className="max-w-full"
                testids={{ photo: "premium-cv-photo", monogram: "premium-cv-monogram" }}
              />
              <p aria-hidden="true" className="sr-only" data-testid="premium-cv-card-name">{name}</p>
              <p aria-hidden="true" className="sr-only" data-testid="premium-cv-card-profession">{eyebrow}</p>
              {flag ? (
                <span className="text-xl leading-none text-text-primary" role="img" aria-label={countryName ?? countryCode ?? undefined} data-testid="premium-cv-card-flag">
                  {flag}
                </span>
              ) : null}
            </div>
          </LivingCvIdentityFrame>
        </div>

        <div className="flex min-w-0 flex-col gap-3 md:col-start-2">
          <div className="flex min-w-0 flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0">
              <h1 className="break-words font-display text-[clamp(1.5rem,3.5vw,2.5rem)] font-semibold leading-tight tracking-tight text-text-primary" data-testid="premium-cv-name">{name}</h1>
              <p className="mt-1 text-sm leading-relaxed text-text-secondary sm:text-base" data-testid="premium-cv-professions">{eyebrow}</p>
            </div>
          </div>
          {languages.length > 0 ? (
            <div className="flex flex-wrap gap-1.5" data-testid="premium-cv-languages">
              {languages.map((l) => (
                <span key={l} className="inline-flex min-h-7 items-center rounded-md border border-ink-600 bg-ink-700/40 px-2 text-meta font-medium text-text-secondary">{l}</span>
              ))}
            </div>
          ) : null}
        </div>

        <div className="col-span-2 flex min-w-0 flex-col gap-4 md:col-span-1 md:col-start-2">
          {summary ? <p className="max-w-[72ch] text-sm leading-relaxed text-text-secondary">{summary}</p> : null}
          {actions ? (
            <div className="flex flex-wrap gap-2 max-sm:[&>*]:flex-1" data-testid="premium-cv-actions">{actions}</div>
          ) : null}
        </div>

        {facts.length > 0 ? (
          <dl className={["col-span-2 grid min-w-0", factGridColumns, "gap-3 border-t border-ink-600 pt-4 md:col-span-1 md:col-start-2 sm:gap-5"].join(" ")} data-testid="premium-cv-facts">
            {facts.map((f) => (
              <div key={f.label} className="flex min-w-0 flex-col gap-1.5" data-testid={f.testid}>
                <dd className="order-1 min-w-0 whitespace-normal break-words font-display text-[clamp(1.25rem,3vw,2rem)] font-semibold leading-tight tracking-tight tabular-nums text-text-primary">{f.value}</dd>
                <dt className="order-2 text-meta leading-relaxed text-text-muted">{f.label}</dt>
              </div>
            ))}
          </dl>
        ) : null}
      </section>
    </article>
  );
}
