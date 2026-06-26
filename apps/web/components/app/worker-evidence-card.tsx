import { getTranslations } from "next-intl/server";
import {
  EvidenceStatusStrip,
  type EvidenceStatus,
} from "@/components/app/evidence-status-strip";
import { EmptyState } from "@/components/app/empty-state";

/**
 * Worker-facing evidence view (v1). Shows what the worker's profile is actually
 * backed by, read straight from stored data — no score, no employer-facing
 * overclaim, no fake "verified by AI".
 *
 * Honest provenance, mapped to real stored state:
 *   - Manager-confirmed  → worker_skills.verified = true (the keystone
 *     confirm_entry_and_verify_skills RPC; a real human confirmation source).
 *   - Self-declared      → worker_skills the worker entered, not yet confirmed
 *     (awaiting manager confirmation — stated plainly, not hidden).
 *   - System-recorded    → count of the worker's own journal entries (evidence
 *     of activity, NOT an external verification).
 */
export async function WorkerEvidenceCard({
  confirmedSkills,
  selfDeclaredSkills,
  journalEntries,
}: {
  confirmedSkills: string[];
  selfDeclaredSkills: string[];
  journalEntries: number;
}) {
  const t = await getTranslations("workerEvidence");

  const hasAny =
    confirmedSkills.length > 0 || selfDeclaredSkills.length > 0 || journalEntries > 0;

  // Evidence status strip — which honest states this profile currently has.
  // self_declared is the baseline (the card always reflects the worker's own
  // record); "confirmed" is added ONLY when a real manager-confirmed skill
  // exists, so the strip never shows confirmed without a real signal.
  const evidenceActive: EvidenceStatus[] = ["self_declared"];
  if (selfDeclaredSkills.length > 0) evidenceActive.push("awaiting_confirmation");
  if (confirmedSkills.length > 0) evidenceActive.push("confirmed");

  return (
    <section className="card-border flex flex-col gap-3 p-4" data-testid="worker-evidence-card">
      <h2 className="font-display text-base font-semibold text-text-primary">{t("title")}</h2>

      {hasAny && <EvidenceStatusStrip active={evidenceActive} />}

      {confirmedSkills.length > 0 && (
        <div className="flex flex-col gap-1.5" data-testid="worker-evidence-confirmed">
          {/* Silent-trust rule: neutral tone, no green "verified" chip. */}
          <span className="font-mono text-[10px] uppercase tracking-label text-text-muted">
            {t("confirmed")}
          </span>
          <div className="flex flex-wrap gap-1.5">
            {confirmedSkills.map((name) => (
              <span
                key={name}
                className="rounded-full border border-ink-500 bg-ink-800 px-2 py-0.5 text-[11px] text-text-secondary"
              >
                {name}
              </span>
            ))}
          </div>
        </div>
      )}

      {selfDeclaredSkills.length > 0 && (
        <div className="flex flex-col gap-1.5" data-testid="worker-evidence-self-declared">
          <span className="font-mono text-[10px] uppercase tracking-label text-text-muted">
            {t("selfDeclared")}
          </span>
          <div className="flex flex-wrap gap-1.5">
            {selfDeclaredSkills.map((name) => (
              <span
                key={name}
                className="rounded-full border border-border bg-surface-muted px-2 py-0.5 text-[11px] text-text-secondary"
              >
                {name}
              </span>
            ))}
          </div>
        </div>
      )}

      <p className="text-[11px] text-text-secondary" data-testid="worker-evidence-entries">
        {t("systemEntries")}: <span className="font-semibold text-text-primary">{journalEntries}</span>
      </p>

      {!hasAny && (
        <EmptyState
          testId="worker-evidence-empty-state"
          title={t("emptyTitle")}
          why={t("empty")}
          cta={{
            label: t("emptyCta"),
            href: "/dashboard/journal",
            variant: "secondary",
          }}
        />
      )}

    </section>
  );
}
