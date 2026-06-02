import { getTranslations } from "next-intl/server";
import { Link } from "@/lib/i18n/navigation";

/**
 * Profile/CV/Evidence hub overview — the unifying "professional passport"
 * lead card on /dashboard/profile. It states, in one calm place, that CV,
 * skills and work-journal evidence belong to ONE profile, shows the honest
 * status of each pillar from REAL saved data, carries the single honest
 * "not yet verified" disclaimer, and offers ONE primary next action plus a
 * bridge to the Work Journal (so journal evidence is never a dead-end count).
 *
 * Honesty contract (PLATFORM_DOCTRINE §7; CLAUDE.md "no unlabeled fake data"):
 *   - Skills shown here are SELF-DECLARED — never labelled verified/confirmed.
 *   - The CV pillar reflects the saved profile text (the text-first CV input);
 *     document upload is a separate, not-yet-active scaffold.
 *   - Journal evidence is the worker's OWN entry count — activity, not external
 *     verification. With no worker engagement yet, the connection is honestly
 *     "being prepared" (no invented count).
 *
 * Pure server component. No client JS, no onClick, no fake state. The primary
 * action anchors to the in-page editing flow (`#profile-edit`); all real
 * operations stay in the existing canonical components below it.
 */
export async function ProfileHubOverview({
  cvProvided,
  selfDeclaredCount,
  hasWorker,
  journalCount,
  skillEvidence,
}: {
  cvProvided: boolean;
  selfDeclaredCount: number;
  hasWorker: boolean;
  journalCount: number;
  /** Evidence-support summary for workers (journal → skill linkage v1).
   *  Omitted for non-workers (no work-journal access yet). */
  skillEvidence?: { declared: number; supported: number; unsupported: number };
}) {
  const t = await getTranslations("profileHub");

  const pillars: { label: string; value: string; ok: boolean }[] = [
    {
      label: t("pillars.cv.label"),
      value: cvProvided ? t("pillars.cv.yes") : t("pillars.cv.no"),
      ok: cvProvided,
    },
    {
      label: t("pillars.skills.label"),
      value:
        selfDeclaredCount > 0
          ? t("pillars.skills.count", { n: selfDeclaredCount })
          : t("pillars.skills.none"),
      ok: selfDeclaredCount > 0,
    },
    {
      label: t("pillars.journal.label"),
      value: !hasWorker
        ? t("pillars.journal.preparing")
        : journalCount > 0
          ? t("pillars.journal.available", { n: journalCount })
          : t("pillars.journal.none"),
      ok: hasWorker && journalCount > 0,
    },
  ];

  return (
    <section
      className="card-border flex flex-col gap-4 p-5"
      data-testid="profile-hub-overview"
    >
      <header className="flex flex-col gap-1">
        <span className="font-mono text-[10px] uppercase tracking-label text-text-muted">
          {t("eyebrow")}
        </span>
        <h2 className="font-display text-lg font-semibold text-text-primary">
          {t("lead")}
        </h2>
        <p className="text-xs leading-relaxed text-text-secondary">
          {t("explainer")}
        </p>
      </header>

      <ul className="grid gap-2 sm:grid-cols-3" data-testid="profile-hub-pillars">
        {pillars.map((p) => (
          <li
            key={p.label}
            className="flex flex-col gap-1 rounded-md border border-border/40 p-3"
          >
            <span className="font-mono text-[10px] uppercase tracking-label text-text-muted">
              {p.label}
            </span>
            <span
              data-status={p.ok ? "ok" : "todo"}
              className={`text-xs font-medium ${
                p.ok ? "text-state-success" : "text-text-secondary"
              }`}
            >
              {p.value}
            </span>
          </li>
        ))}
      </ul>

      {/* Journal → skill evidence-support layer (v1). Derived from stored
          per-skill provenance — honest "supported by work entries" vs
          "not yet supported", never a verification claim. Workers only. */}
      {skillEvidence && skillEvidence.declared > 0 && (
        <div
          className="flex flex-col gap-1 rounded-md border border-border/40 p-3"
          data-testid="profile-hub-skill-evidence"
        >
          <p className="text-xs leading-relaxed text-text-secondary">
            {t("evidence.intro")}
          </p>
          <p className="text-xs font-medium text-text-primary">
            {t("evidence.supported", {
              supported: skillEvidence.supported,
              declared: skillEvidence.declared,
            })}
          </p>
          {skillEvidence.unsupported > 0 && (
            <p
              className="text-[11px] leading-relaxed text-text-muted"
              data-testid="profile-hub-skill-evidence-none"
            >
              {t("evidence.noneYet")}
            </p>
          )}
        </div>
      )}

      {/* The single honest verification disclaimer for the unified profile. */}
      <p
        className="text-[11px] leading-relaxed text-text-muted"
        data-testid="profile-hub-not-verified"
      >
        {t("notVerified")}
      </p>

      <div className="flex flex-wrap items-center gap-3">
        {/* ONE primary next action — anchors to the canonical in-page editor. */}
        <a
          href="#profile-edit"
          className="inline-flex w-fit items-center gap-1.5 rounded-md bg-gradient-to-r from-brand-blue to-brand-cyan px-3.5 py-1.5 text-sm font-semibold text-ink-900 transition-opacity hover:opacity-90"
          data-testid="profile-hub-primary-action"
        >
          {t("primaryAction")} ↓
        </a>
        {/* Bridge to the Work Journal so evidence is never a dead-end count. */}
        {hasWorker && (
          <Link
            href="/dashboard/journal"
            className="inline-flex w-fit items-center gap-1 text-sm font-medium text-brand-blue transition-colors hover:text-brand-cyan"
            data-testid="profile-hub-journal-link"
          >
            {t("journalLink")} →
          </Link>
        )}
      </div>
    </section>
  );
}
