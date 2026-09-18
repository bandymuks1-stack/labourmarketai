import type { ReactNode } from "react";

/**
 * WORK-WORLD PRIMITIVES — the shared visual grammar of LabourMarket.ai.
 *
 * The owner-accepted "Living Work World" direction (2026-09-18) is propagated
 * to the real product through THESE primitives, not page-by-page redesigns.
 * Every one is presentational and token-driven: it renders canonical facts a
 * caller already holds, adds no data source and no authority, and uses only
 * the canonical Tailwind tokens (brand = gold, brand-cyan = EVIDENCE,
 * trust-accent = VERIFICATION, text-* / surface-* / border-*). No raw hex.
 *
 * The one semantic rule these encode, once, for every surface:
 *   EVIDENCE (cyan) ≠ VERIFICATION (green).
 * `EvidenceState`/`EvidenceDot` colour by that rule and nothing else, so a
 * surface can never accidentally paint a self-attestation as verified.
 */

/** The canonical evidence standings, mirrored from
 *  `lib/organization-evidence/evidence-state.ts` (kept as a string union so a
 *  presentational primitive never imports the domain module). */
export type EvidenceStanding =
  | "ORGANIZATION_REPORTED"
  | "SELF_REPORTED"
  | "SELF_ATTESTED"
  | "ORGANIZATION_ATTESTED"
  | "THIRD_PARTY_ATTESTED"
  | "INDEPENDENTLY_VERIFIED"
  | "DISPUTED"
  | "CORRECTED"
  | "WITHDRAWN"
  | "UNKNOWN";

type Variant = "evidence" | "verified" | "attested" | "reported" | "unknown" | "contested";

/** The ONE mapping from a standing to a colour role. Verification is the only
 *  green; a self-attestation is cyan evidence, never green. */
export function evidenceVariant(state: EvidenceStanding): Variant {
  switch (state) {
    case "INDEPENDENTLY_VERIFIED":
      return "verified";
    case "ORGANIZATION_ATTESTED":
    case "THIRD_PARTY_ATTESTED":
      return "attested";
    case "SELF_ATTESTED":
    case "SELF_REPORTED":
      return "evidence";
    case "DISPUTED":
    case "CORRECTED":
      return "contested";
    case "WITHDRAWN":
    case "UNKNOWN":
      return "unknown";
    default:
      return "reported";
  }
}

const VARIANT_CLASS: Record<Variant, string> = {
  // brand-cyan = EVIDENCE_SUPPORTED in the provenance ladder
  evidence: "text-brand-cyan border-brand-cyan/40",
  // trust-accent = the ONLY verification colour
  verified: "text-trust-accent border-trust-accent/50",
  attested: "text-brand-champagne border-brand-champagne/40",
  reported: "text-text-muted border-border-subtle",
  unknown: "text-text-muted border-border-subtle border-dashed",
  contested: "text-state-amber border-state-amber/40",
};

/** The evidence-standing chip. `label` is caller-localized (the primitive
 *  stays i18n-agnostic). `data-variant` lets a guard assert the colour rule. */
export function EvidenceState({
  state,
  label,
  className = "",
}: {
  state: EvidenceStanding;
  label: string;
  className?: string;
}) {
  const variant = evidenceVariant(state);
  return (
    <span
      data-testid="ww-evidence-state"
      data-state={state}
      data-variant={variant}
      className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 font-mono text-meta font-semibold uppercase tracking-label ${VARIANT_CLASS[variant]} ${className}`}
    >
      <EvidenceDot state={state} />
      {label}
    </span>
  );
}

const DOT_CLASS: Record<Variant, string> = {
  evidence: "bg-brand-cyan",
  verified: "bg-trust-accent",
  attested: "bg-brand-champagne",
  reported: "bg-ink-500",
  unknown: "bg-transparent ring-1 ring-inset ring-ink-500",
  contested: "bg-state-amber",
};

/** The diamond node marker — the recurring evidence glyph. */
export function EvidenceDot({ state, className = "" }: { state: EvidenceStanding; className?: string }) {
  const variant = evidenceVariant(state);
  return (
    <span
      aria-hidden
      data-testid="ww-evidence-dot"
      className={`inline-block h-[7px] w-[7px] rotate-45 rounded-[2px] ${DOT_CLASS[variant]} ${className}`}
    />
  );
}

/** A person as a real presence: a photo when one exists (and is permitted),
 *  an intentional initial fallback otherwise — never a fabricated face. */
export function PersonPresence({
  name,
  role,
  photoUrl,
  available,
  gold = false,
  size = 44,
}: {
  name: string;
  role?: string | null;
  photoUrl?: string | null;
  available?: boolean;
  gold?: boolean;
  size?: number;
}) {
  const initial = (name.trim()[0] ?? "·").toUpperCase();
  return (
    <span className="flex items-center gap-3" data-testid="ww-person">
      <span
        className={`relative grid flex-none place-items-center overflow-hidden rounded-full font-display font-bold ${
          gold ? "bg-gradient-metallic text-text-on-brand" : "bg-surface-2 text-text-secondary"
        }`}
        style={{ width: size, height: size, fontSize: Math.round(size * 0.38) }}
      >
        {photoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={photoUrl} alt="" className="h-full w-full object-cover" />
        ) : (
          initial
        )}
      </span>
      <span className="min-w-0">
        <span className="block truncate text-sm font-semibold text-text-primary">{name}</span>
        {role ? <span className="block truncate text-xs text-text-muted">{role}</span> : null}
        {available ? (
          <span className="mt-0.5 inline-flex items-center gap-1.5 text-xs text-text-secondary">
            <span className="h-2 w-2 rounded-full bg-state-live shadow-[0_0_10px_rgb(var(--c-state-live))]" />
            available
          </span>
        ) : null}
      </span>
    </span>
  );
}

/** Work × time × place: N filled positions of a total, as a capacity band. */
export function CapacityBand({
  filled,
  total,
  leftLabel,
  rightLabel,
}: {
  filled: number;
  total: number;
  leftLabel: string;
  rightLabel: string;
}) {
  const pct = total > 0 ? Math.min(100, Math.max(0, (filled / total) * 100)) : 0;
  return (
    <span
      data-testid="ww-capacity-band"
      className="relative block h-14 overflow-hidden rounded-lg border border-border-subtle bg-surface-1"
    >
      <span
        className="absolute inset-y-0 left-0 border-r-2 border-brand-blue bg-brand-blue/20"
        style={{ width: `${pct}%` }}
      />
      <span className="absolute inset-0 flex items-center justify-between px-3.5 font-mono text-xs text-text-secondary">
        <span>{leftLabel}</span>
        <span>{rightLabel}</span>
      </span>
    </span>
  );
}

/** A period of real work as a TIME RIBBON, not a lump. One continuous band
 *  over the whole period, divided into the months it touches, each labelled
 *  with its DERIVED even share. The total is the one canonical figure; the
 *  month segments are a display allocation, never source-observed days — the
 *  caller supplies both the total figure and that warning label. Renders
 *  nothing when there is nothing honest to derive. */
export function PeriodBand({
  totalLabel,
  derivedLabel,
  months,
}: {
  /** The canonical total, already formatted (e.g. "800 h"). */
  totalLabel: string;
  /** "Derived equal monthly share · not source days." */
  derivedLabel: string;
  /** Oldest→newest month shares from the canonical projection. */
  months: readonly { readonly month: string; readonly hours: number }[];
}) {
  if (months.length === 0) return null;
  return (
    <div data-testid="ww-period-band" className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between gap-2">
        <span className="font-mono text-sm font-semibold text-brand-cyan" data-testid="ww-period-total">
          {totalLabel}
        </span>
        <span className="font-mono text-meta uppercase tracking-label text-text-muted">
          {months[0].month} → {months[months.length - 1].month}
        </span>
      </div>
      {/* The band: one cyan-edged span, divided into equal month segments. */}
      <div className="flex h-9 overflow-hidden rounded-md border border-brand-cyan/40 bg-brand-cyan/5">
        {months.map((m, i) => (
          <div
            key={m.month}
            data-month={m.month}
            data-hours={m.hours.toFixed(2)}
            className={`flex flex-1 items-center justify-center ${
              i === 0 ? "" : "border-l border-brand-cyan/25"
            }`}
          >
            <span className="font-mono text-meta tabular-nums text-brand-cyan">{m.hours.toFixed(2)}</span>
          </div>
        ))}
      </div>
      <span className="font-mono text-meta uppercase tracking-label text-text-muted">{derivedLabel}</span>
    </div>
  );
}

/** Canonical spatial/temporal context. Mono, because it is machine-precise. */
export function PlaceTimeStamp({ children }: { children: ReactNode }) {
  return (
    <span data-testid="ww-place-time" className="font-mono text-xs tracking-label text-text-muted">
      {children}
    </span>
  );
}

/** THE WORK SPINE — the signature motif. Real work anchored to org · time ·
 *  place · evidence, on a continuous cyan line. Reused on identity, journal,
 *  history and demand so the whole product reads as one work world. */
export function WorkSpine({ children }: { children: ReactNode }) {
  return (
    <ol data-testid="ww-spine" className="relative flex list-none flex-col pl-7">
      <span
        aria-hidden
        className="absolute bottom-1.5 left-[6px] top-1.5 w-0.5 bg-gradient-to-b from-brand-cyan/55 to-brand-cyan/10"
      />
      {children}
    </ol>
  );
}

export function WorkSpineNode({
  state = "ORGANIZATION_REPORTED",
  solid,
  children,
}: {
  state?: EvidenceStanding;
  solid?: boolean;
  children: ReactNode;
}) {
  const variant = evidenceVariant(state);
  const border =
    variant === "verified"
      ? "border-trust-accent"
      : variant === "attested"
        ? "border-brand-champagne"
        : "border-brand-cyan";
  const fill = solid ? DOT_CLASS[variant] : "bg-ink-900";
  return (
    <li data-testid="ww-spine-node" className="relative pb-5 last:pb-0">
      <span
        aria-hidden
        className={`absolute left-[-25px] top-1.5 h-3 w-3 rotate-45 rounded-[3px] border-2 ${border} ${fill}`}
      />
      {children}
    </li>
  );
}
