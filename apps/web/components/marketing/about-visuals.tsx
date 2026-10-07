import type { ReactNode } from "react";

/**
 * The visual explanation on /about — REAL WORK ACCUMULATING INTO VERIFIED
 * PROFESSIONAL AND ORGANISATIONAL HISTORY (owner decision 2026-09-30: the
 * platform is not a game; no sports, card, level or ranking imagery).
 *
 * Every component here is presentational and receives already-translated
 * strings, so the page owns the copy and the locale set stays one catalogue.
 * Tokens only (no raw colours, no bespoke fonts): the same surface, border and
 * brand tokens the rest of the marketing tree uses, so both themes work.
 * Nothing animates and nothing is client-side — the page explains a system, it
 * does not perform one.
 */

/** A short chain of labelled steps with connectors — the base primitive. */
function Connector({ vertical = false, tone }: { vertical?: boolean; tone: string }) {
  return vertical ? (
    <span aria-hidden className={`mx-auto block h-2 w-px ${tone}`} />
  ) : (
    <span aria-hidden className={`hidden h-px min-w-3 flex-1 sm:block ${tone}`} />
  );
}

const TONES = {
  cyan: { line: "bg-brand-cyan/50", dot: "bg-brand-cyan", ring: "border-brand-cyan/50", tint: "bg-brand-cyan/10" },
  blue: { line: "bg-brand-blue/50", dot: "bg-brand-blue", ring: "border-brand-blue/50", tint: "bg-brand-blue/10" },
  violet: { line: "bg-brand-violet/50", dot: "bg-brand-violet", ring: "border-brand-violet/50", tint: "bg-brand-violet/10" },
  success: { line: "bg-state-success/50", dot: "bg-state-success", ring: "border-state-success/50", tint: "bg-state-success/10" },
  amber: { line: "bg-state-amber/50", dot: "bg-state-amber", ring: "border-state-amber/50", tint: "bg-state-amber/10" },
} as const;
export type AboutTone = keyof typeof TONES;

/** One horizontal rail: five nodes joined by two-way connectors, the last one
 *  emphasised, and a bar underneath that fills left to right — the history
 *  accumulating. */
function Rail({
  label,
  steps,
  tone,
  ariaLabel,
}: {
  label: string;
  steps: readonly string[];
  tone: AboutTone;
  ariaLabel: string;
}) {
  const c = TONES[tone];
  return (
    <div className="flex flex-col gap-3">
      <p className="font-mono text-meta uppercase tracking-label text-text-muted">{label}</p>
      <ol aria-label={ariaLabel} className="flex flex-col gap-1 sm:flex-row sm:items-stretch sm:gap-0">
        {steps.map((step, i) => {
          const last = i === steps.length - 1;
          return (
            <li key={step} className="flex flex-col gap-1 sm:flex-1 sm:flex-row sm:items-center sm:gap-0">
              <div
                className={`flex flex-1 flex-row items-center gap-3 rounded-md border px-3 py-2 sm:flex-col sm:items-start sm:justify-center sm:gap-1 sm:py-3 ${
                  last ? `${c.ring} ${c.tint}` : "border-border-subtle bg-surface-1"
                }`}
              >
                <span aria-hidden className="flex items-center gap-2">
                  <span className={`size-1.5 rounded-full ${c.dot}`} />
                  <span className="font-mono text-meta text-text-muted">{String(i + 1).padStart(2, "0")}</span>
                </span>
                <span
                  className={`font-display text-sm font-semibold leading-tight tracking-tightest ${
                    last ? "text-text-primary" : "text-text-secondary"
                  }`}
                >
                  {step}
                </span>
              </div>
              {!last ? (
                <>
                  <Connector tone={c.line} />
                  <span className="sm:hidden">
                    <Connector vertical tone={c.line} />
                  </span>
                </>
              ) : null}
            </li>
          );
        })}
      </ol>
      {/* The accumulation bar: a schematic, five equal segments that grow in
          weight — history building up, not a measurement. */}
      <div aria-hidden className="grid grid-cols-5 items-end gap-1">
        {[1, 2, 3, 4, 5].map((n) => (
          <span
            key={n}
            className={`rounded-sm ${c.dot}`}
            style={{ height: `${4 + n * 3}px`, opacity: 0.25 + n * 0.15 }}
          />
        ))}
      </div>
    </div>
  );
}

/** The first-screen picture: two rails, one for a person and one for a company. */
export function AboutSystemMap(props: {
  people: { label: string; steps: readonly string[] };
  companies: { label: string; steps: readonly string[] };
  accumulate: string;
  ariaLabel: string;
}) {
  return (
    <div
      className="flex flex-col gap-8 rounded-md border border-border-subtle bg-surface-1/60 p-5 sm:p-8"
      data-testid="about-system-map"
    >
      <Rail label={props.people.label} steps={props.people.steps} tone="cyan" ariaLabel={props.ariaLabel} />
      <Rail label={props.companies.label} steps={props.companies.steps} tone="blue" ariaLabel={props.ariaLabel} />
      <p className="max-w-prose text-sm leading-relaxed text-text-secondary">{props.accumulate}</p>
    </div>
  );
}

/** The whole-lifecycle strip: a wrapping run of small steps. Explanatory, not
 *  the boundary of the system (the note says so). */
export function AboutLifecycle({ label, steps, note }: { label: string; steps: readonly string[]; note: string }) {
  return (
    <div className="flex flex-col gap-3" data-testid="about-lifecycle">
      <p className="font-mono text-meta uppercase tracking-label text-text-muted">{label}</p>
      <ol className="flex flex-wrap items-center gap-x-1 gap-y-2">
        {steps.map((step, i) => (
          <li key={step} className="flex items-center gap-1">
            <span className="rounded-sm border border-border-subtle bg-surface-1 px-2.5 py-1 text-xs text-text-secondary">
              {step}
            </span>
            {i < steps.length - 1 ? (
              <span aria-hidden className="font-mono text-xs text-text-muted">
                →
              </span>
            ) : null}
          </li>
        ))}
      </ol>
      <p className="max-w-prose text-xs leading-relaxed text-text-muted">{note}</p>
    </div>
  );
}

/** A labelled audience block: a lead, a flow of steps and a short list. */
export function AboutAudience({
  id,
  heading,
  lead,
  flow,
  participants,
  pointsLabel,
  points,
  tone,
}: {
  id: string;
  heading: string;
  lead: string;
  flow: readonly string[];
  participants?: readonly string[];
  pointsLabel: string;
  points: readonly string[];
  tone: AboutTone;
}) {
  const c = TONES[tone];
  return (
    <section id={id} className="scroll-mt-24 flex flex-col gap-5" data-testid={`about-${id}`}>
      <h2 className="font-display text-2xl font-bold tracking-tightest text-text-primary sm:text-3xl">
        {heading}
      </h2>
      <p className="max-w-prose text-base leading-relaxed text-text-secondary">{lead}</p>
      {flow.length > 0 ? (
        <ol className="flex flex-wrap items-center gap-x-1 gap-y-2">
          {flow.map((step, i) => (
            <li key={step} className="flex items-center gap-1">
              <span className={`rounded-sm border px-2.5 py-1 text-xs text-text-secondary ${c.ring} ${c.tint}`}>
                {step}
              </span>
              {i < flow.length - 1 ? (
                <span aria-hidden className="font-mono text-xs text-text-muted">
                  →
                </span>
              ) : null}
            </li>
          ))}
        </ol>
      ) : null}
      {participants && participants.length > 0 ? (
        <ul className="flex flex-wrap gap-2" data-testid="about-participants">
          {participants.map((p) => (
            <li key={p} className={`rounded-sm border px-3 py-1.5 text-sm text-text-secondary ${c.ring} ${c.tint}`}>
              {p}
            </li>
          ))}
        </ul>
      ) : null}
      <div className="flex flex-col gap-2 rounded-md border border-border-subtle bg-surface-1 p-4">
        <p className="font-mono text-meta uppercase tracking-label text-text-muted">{pointsLabel}</p>
        <ul className="flex flex-col gap-1.5">
          {points.map((point) => (
            <li key={point} className="flex items-start gap-2 text-sm leading-relaxed text-text-secondary">
              <span aria-hidden className={`mt-2 size-1 shrink-0 rounded-full ${c.dot}`} />
              <span>{point}</span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

/** The evidence graph: one record's chain on the left, the several views it
 *  feeds on the right, joined by a single line — one event, several views, no
 *  copies. */
export function AboutEvidenceGraph({
  heading,
  lead,
  chainLabel,
  chain,
  projectionsLabel,
  projections,
  note,
}: {
  heading: string;
  lead: string;
  chainLabel: string;
  chain: readonly string[];
  projectionsLabel: string;
  projections: readonly string[];
  note: string;
}) {
  return (
    <section id="evidence" className="scroll-mt-24 flex flex-col gap-6" data-testid="about-evidence">
      <div className="flex flex-col gap-3">
        <h2 className="font-display text-2xl font-bold tracking-tightest text-text-primary sm:text-3xl">
          {heading}
        </h2>
        <p className="max-w-prose text-base leading-relaxed text-text-secondary">{lead}</p>
      </div>
      <div className="grid gap-6 rounded-md border border-border-subtle bg-surface-1/60 p-5 sm:p-8 lg:grid-cols-[1.1fr_auto_1fr] lg:items-center">
        <div className="flex flex-col gap-3">
          <p className="font-mono text-meta uppercase tracking-label text-text-muted">{chainLabel}</p>
          <ol className="flex flex-col">
            {chain.map((step, i) => (
              <li key={step} className="flex gap-3">
                <span aria-hidden className="flex flex-col items-center">
                  <span
                    className={`mt-1.5 size-2.5 rounded-full border ${
                      i === chain.length - 1
                        ? "border-state-success bg-state-success"
                        : "border-brand-cyan bg-surface-1"
                    }`}
                  />
                  {i < chain.length - 1 ? <span className="w-px flex-1 bg-brand-cyan/40" /> : null}
                </span>
                <span
                  className={`pb-3 text-sm leading-snug ${
                    i === chain.length - 1 ? "font-semibold text-text-primary" : "text-text-secondary"
                  }`}
                >
                  {step}
                </span>
              </li>
            ))}
          </ol>
        </div>
        <span aria-hidden className="hidden font-mono text-2xl text-text-muted lg:block">
          →
        </span>
        <div className="flex flex-col gap-3">
          <p className="font-mono text-meta uppercase tracking-label text-text-muted">{projectionsLabel}</p>
          <ul className="flex flex-col gap-2">
            {projections.map((view) => (
              <li
                key={view}
                className="flex items-center gap-3 rounded-md border border-brand-violet/40 bg-brand-violet/10 px-3 py-2.5 text-sm text-text-primary"
              >
                <span aria-hidden className="size-1.5 shrink-0 rounded-full bg-brand-violet" />
                {view}
              </li>
            ))}
          </ul>
        </div>
      </div>
      <p className="max-w-prose rounded-md border border-brand-blue/30 bg-brand-blue/5 px-3 py-2 text-sm leading-relaxed text-text-secondary">
        {note}
      </p>
    </section>
  );
}

function ValuePanel({
  label,
  heights,
  stages,
  points,
  tone,
  strong,
}: {
  label: string;
  heights: readonly number[];
  stages: readonly string[];
  points: readonly string[];
  tone: AboutTone;
  strong?: boolean;
}) {
  const c = TONES[tone];
  return (
    <div
      className={`flex flex-col gap-4 rounded-md border p-5 ${
        strong ? `${c.ring} ${c.tint}` : "border-border-subtle bg-surface-1"
      }`}
    >
      <p className={`font-display text-lg font-bold tracking-tightest ${strong ? "text-text-primary" : "text-text-secondary"}`}>
        {label}
      </p>
      <div aria-hidden className="grid h-28 grid-cols-4 items-end gap-2">
        {heights.map((h, i) => (
          <span key={stages[i]} className={`rounded-sm ${strong ? c.dot : "bg-text-muted/40"}`} style={{ height: `${h}%` }} />
        ))}
      </div>
      <ul aria-hidden className="grid grid-cols-4 gap-2 font-mono text-meta text-text-muted">
        {stages.map((s) => (
          <li key={s} className="truncate">
            {s}
          </li>
        ))}
      </ul>
      <ul className="flex flex-col gap-1.5">
        {points.map((point) => (
          <li key={point} className="flex items-start gap-2 text-sm leading-relaxed text-text-secondary">
            <span aria-hidden className={`mt-2 size-1 shrink-0 rounded-full ${strong ? c.dot : "bg-text-muted"}`} />
            <span>{point}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Two schematic value curves: a conventional job board peaks at the search and
 *  falls after hiring; here value keeps growing with every real period of work.
 *  Bars are labelled stages, not measurements (the schematic note says so). */
export function AboutBeforeAfter({
  heading,
  lead,
  stages,
  boardLabel,
  boardPoints,
  platformLabel,
  platformPoints,
  schematicNote,
  conclusion,
}: {
  heading: string;
  lead: string;
  stages: readonly string[];
  boardLabel: string;
  boardPoints: readonly string[];
  platformLabel: string;
  platformPoints: readonly string[];
  schematicNote: string;
  conclusion: string;
}) {
  const boardHeights = [100, 34, 14, 8];
  const platformHeights = [30, 48, 74, 100];
  return (
    <section id="after-hire" className="scroll-mt-24 flex flex-col gap-6" data-testid="about-after-hire">
      <div className="flex flex-col gap-3">
        <h2 className="font-display text-2xl font-bold tracking-tightest text-text-primary sm:text-3xl">
          {heading}
        </h2>
        <p className="max-w-prose text-base leading-relaxed text-text-secondary">{lead}</p>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <ValuePanel label={boardLabel} heights={boardHeights} stages={stages} points={boardPoints} tone="amber" />
        <ValuePanel label={platformLabel} heights={platformHeights} stages={stages} points={platformPoints} tone="success" strong />
      </div>
      <p className="font-mono text-meta text-text-muted">{schematicNote}</p>
      <p className="max-w-prose font-display text-lg font-semibold leading-snug tracking-tightest text-text-primary">
        {conclusion}
      </p>
    </section>
  );
}

/** FACT ≠ DERIVED ≠ CONFIRMED, three visibly different treatments — solid,
 *  dashed, and ticked — so the difference survives without reading. */
export function AboutTrustTiers({
  heading,
  lead,
  tiers,
  noLabel,
  no,
}: {
  heading: string;
  lead: string;
  tiers: readonly { term: string; meaning: string; example: string }[];
  noLabel: string;
  no: readonly string[];
}) {
  const look = [
    { box: "border-solid border-brand-cyan/60 bg-brand-cyan/10", mark: <span className="size-2 rounded-full bg-brand-cyan" /> },
    { box: "border-dashed border-state-amber/70 bg-state-amber/10", mark: <span className="size-2 rounded-full border border-dashed border-state-amber" /> },
    { box: "border-solid border-state-success/60 bg-state-success/10", mark: <span className="font-mono text-xs font-bold text-state-success">✓</span> },
  ] as const;
  return (
    <section id="trust" className="scroll-mt-24 flex flex-col gap-6" data-testid="about-trust">
      <div className="flex flex-col gap-3">
        <h2 className="font-display text-2xl font-bold tracking-tightest text-text-primary sm:text-3xl">
          {heading}
        </h2>
        <p className="max-w-prose text-base leading-relaxed text-text-secondary">{lead}</p>
      </div>
      <dl className="grid gap-4 md:grid-cols-3">
        {tiers.map((tier, i) => (
          <div key={tier.term} className={`flex flex-col gap-2 rounded-md border-2 p-4 ${look[i]?.box ?? look[0].box}`}>
            <dt className="flex items-center gap-2 font-display text-lg font-bold tracking-tightest text-text-primary">
              <span aria-hidden className="flex size-4 items-center justify-center">
                {look[i]?.mark}
              </span>
              {tier.term}
            </dt>
            <dd className="text-sm leading-relaxed text-text-secondary">{tier.meaning}</dd>
            <dd className="text-xs leading-relaxed text-text-muted">{tier.example}</dd>
          </div>
        ))}
      </dl>
      <div className="flex flex-col gap-2">
        <p className="font-mono text-meta uppercase tracking-label text-text-muted">{noLabel}</p>
        <ul className="flex flex-wrap gap-2">
          {no.map((item) => (
            <li key={item} className="rounded-sm border border-border-subtle bg-surface-1 px-3 py-1.5 text-sm text-text-secondary line-through decoration-text-muted/60">
              <span className="no-underline">{item}</span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

function BulletList({ items, tone }: { items: readonly string[]; tone: AboutTone }) {
  return (
    <ul className="flex flex-col gap-1.5">
      {items.map((item) => (
        <li key={item} className="flex items-start gap-2 text-sm leading-relaxed text-text-secondary">
          <span aria-hidden className={`mt-2 size-1 shrink-0 rounded-full ${TONES[tone].dot}`} />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}

function Glyph({ children }: { children: ReactNode }) {
  return (
    <svg aria-hidden viewBox="0 0 24 24" className="size-5 shrink-0" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
      {children}
    </svg>
  );
}

/** Private detail on one side, what public discovery never shows on the other. */
export function AboutPrivacySplit({
  heading,
  lead,
  privateLabel,
  privateItems,
  publicNotLabel,
  publicNot,
  control,
}: {
  heading: string;
  lead: string;
  privateLabel: string;
  privateItems: readonly string[];
  publicNotLabel: string;
  publicNot: readonly string[];
  control: string;
}) {
  return (
    <section id="privacy" className="scroll-mt-24 flex flex-col gap-6" data-testid="about-privacy">
      <div className="flex flex-col gap-3">
        <h2 className="font-display text-2xl font-bold tracking-tightest text-text-primary sm:text-3xl">
          {heading}
        </h2>
        <p className="max-w-prose text-base leading-relaxed text-text-secondary">{lead}</p>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <div className="flex flex-col gap-3 rounded-md border border-brand-cyan/40 bg-brand-cyan/5 p-5">
          <p className="flex items-center gap-2 font-display text-lg font-bold tracking-tightest text-text-primary">
            <span className="text-brand-cyan">
              <Glyph>
                <rect x="5" y="11" width="14" height="9" rx="2" />
                <path d="M8 11V8a4 4 0 0 1 8 0v3" />
              </Glyph>
            </span>
            {privateLabel}
          </p>
          <BulletList items={privateItems} tone="cyan" />
        </div>
        <div className="flex flex-col gap-3 rounded-md border border-border-subtle bg-surface-1 p-5">
          <p className="flex items-center gap-2 font-display text-lg font-bold tracking-tightest text-text-primary">
            <span className="text-text-muted">
              <Glyph>
                <path d="M3 3l18 18" />
                <path d="M10.6 6.1A9.8 9.8 0 0 1 12 6c5 0 8.5 4 9.5 6a12 12 0 0 1-2.4 3.1M6.4 7.6C4.4 9 3 11 2.5 12c1 2 4.5 6 9.5 6 1.3 0 2.5-.3 3.6-.7" />
                <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" />
              </Glyph>
            </span>
            {publicNotLabel}
          </p>
          <BulletList items={publicNot} tone="amber" />
        </div>
      </div>
      <p className="max-w-prose text-sm leading-relaxed text-text-secondary">{control}</p>
    </section>
  );
}
