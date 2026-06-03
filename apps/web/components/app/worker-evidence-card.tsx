import { getTranslations } from "next-intl/server";

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

  return (
    <section className="card-border flex flex-col gap-3 p-4" data-testid="worker-evidence-card">
      <h2 className="font-display text-base font-semibold text-text-primary">{t("title")}</h2>
      <p className="text-xs leading-relaxed text-text-secondary">{t("intro")}</p>

      {confirmedSkills.length > 0 && (
        <div className="flex flex-col gap-1.5" data-testid="worker-evidence-confirmed">
          <span className="font-mono text-[10px] uppercase tracking-label text-emerald-600">
            {t("confirmed")}
          </span>
          <div className="flex flex-wrap gap-1.5">
            {confirmedSkills.map((name) => (
              <span
                key={name}
                className="rounded-full border border-emerald-500/40 bg-emerald-500/10 px-2 py-0.5 text-[11px] text-emerald-700"
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
          <span className="text-[10px] text-amber-700">{t("awaitingNote")}</span>
        </div>
      )}

      <p className="text-[11px] text-text-secondary" data-testid="worker-evidence-entries">
        {t("systemEntries")}: <span className="font-semibold text-text-primary">{journalEntries}</span>
      </p>

      {!hasAny && <p className="text-[11px] text-text-muted">{t("empty")}</p>}

      {/* Honest "who can confirm this today" line — names ONLY the confirmer
          roles the backend can actually store (manager / owner / external
          (client) manager) and states plainly that an entry stays
          self-declared until one of them confirms it. No broad confirmer
          (parent/teacher/buyer) is claimed; adding those is a deferred
          migration (docs/design/universal-confirmation-roles-v1.md). */}
      <p
        className="text-[11px] leading-relaxed text-text-secondary"
        data-testid="worker-evidence-who-can-confirm"
      >
        {t("whoCanConfirm")}
      </p>

      <p className="text-[10px] leading-relaxed text-text-muted">{t("footnote")}</p>
    </section>
  );
}
