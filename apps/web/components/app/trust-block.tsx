import type { OwnTrustSignals } from "@/lib/profile/trust-signals";

/**
 * Honest trust block (Workstream C) — the visible end of the trust chain:
 * declared skills → journal entries → manager confirmations → portable
 * trust on the human. Data-derived counts ONLY; zero renders as a plain
 * zero with the growth hint, never inflated, never "verified" without the
 * manager-confirmed flag behind it.
 *
 * Low-fidelity preview, bus pakeista TASK 07 (living-arena po owner
 * vizualinio užrakto) — logika ir sąžiningi skaičiai lieka.
 */
export interface TrustBlockLabels {
  readonly title: string;
  readonly caption: string;
  readonly verifiedSkills: string;
  readonly managerConfirmations: string;
  readonly journalEntries: string;
  readonly zeroHint: string;
}

export function TrustBlock({
  signals,
  labels,
}: {
  readonly signals: OwnTrustSignals;
  readonly labels: TrustBlockLabels;
}) {
  const allZero =
    signals.verifiedSkills === 0 &&
    signals.managerConfirmations === 0 &&
    signals.journalEntries === 0;
  return (
    <section
      className="card-border flex flex-col gap-3 p-4"
      data-testid="profile-trust-block"
    >
      <div>
        <h2 className="font-display text-lg font-semibold text-text-primary">
          {labels.title}
        </h2>
        <p className="text-xs text-text-secondary">{labels.caption}</p>
      </div>
      <dl className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Stat
          value={signals.verifiedSkills}
          label={labels.verifiedSkills}
          highlight={signals.verifiedSkills > 0}
          testId="trust-verified-skills"
        />
        <Stat
          value={signals.managerConfirmations}
          label={labels.managerConfirmations}
          highlight={signals.managerConfirmations > 0}
          testId="trust-confirmations"
        />
        <Stat
          value={signals.journalEntries}
          label={labels.journalEntries}
          highlight={false}
          testId="trust-entries"
        />
      </dl>
      {allZero ? (
        <p className="rounded-md border border-dashed border-ink-500 px-3 py-2 text-xs text-text-muted">
          {labels.zeroHint}
        </p>
      ) : null}
    </section>
  );
}

function Stat({
  value,
  label,
  highlight,
  testId,
}: {
  readonly value: number;
  readonly label: string;
  readonly highlight: boolean;
  readonly testId: string;
}) {
  return (
    <div className="rounded-md border border-ink-600 bg-ink-800/30 p-3">
      <dt className="font-mono text-[10px] uppercase tracking-label text-text-muted">
        {label}
      </dt>
      <dd
        className={`mt-1 font-display text-2xl font-bold ${
          highlight ? "text-state-success" : "text-text-primary"
        }`}
        data-testid={testId}
      >
        {value}
      </dd>
    </div>
  );
}
