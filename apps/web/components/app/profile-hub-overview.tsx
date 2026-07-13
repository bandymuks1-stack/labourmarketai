import { getTranslations } from "next-intl/server";
import { Link } from "@/lib/i18n/navigation";
import { deriveProfileNextAction } from "@/lib/dashboard/next-action";
import { skillEvidenceStatus } from "@/lib/profile/skill-evidence";
import {
  buildPlayerCardMinimum,
  type PlayerCardMinimumSource,
} from "@/lib/identity/player-card-minimum";

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
  cardSource,
  availability,
}: {
  cvProvided: boolean;
  selfDeclaredCount: number;
  hasWorker: boolean;
  journalCount: number;
  /** Evidence-support summary for workers (journal → skill linkage v1).
   *  Omitted for non-workers (no work-journal access yet). */
  skillEvidence?: { declared: number; supported: number; unsupported: number };
  /** Already-fetched identity fields. When provided, the CV(about) + skills
   *  pillar presence is sourced from the ONE minimum Player Card contract
   *  (`buildPlayerCardMinimum().missing`) — the single source of "what's
   *  missing", so this hub and the player card never disagree. No new
   *  checklist, no percentage. Falls back to the raw booleans when omitted. */
  cardSource?: PlayerCardMinimumSource;
  /** Worker availability presence (real workers.availability_status /
   *  available_from). Rendered as the 4th pillar deep-linking the ONE
   *  canonical editor (dashboard Work Card) — never a duplicate editor. */
  availability?: { readonly set: boolean };
}) {
  const t = await getTranslations("profileHub");

  // Consolidation (launch audit §7.3): identity-essential presence flows through
  // the contract's `missing` list, not a parallel ad-hoc computation.
  const card = cardSource ? buildPlayerCardMinimum(cardSource) : null;
  const aboutOk = card ? !card.missing.includes("about") : cvProvided;
  const skillsOk = card ? !card.missing.includes("skills") : selfDeclaredCount > 0;

  // ONE deterministic next action from real signals (no AI/network/random).
  const nextAction = deriveProfileNextAction({
    cvProvided,
    selfDeclaredCount,
    hasWorker,
    unsupportedSkillCount: skillEvidence?.unsupported ?? 0,
  });
  const journalIsPrimary = nextAction.href === "/dashboard/journal";

  // Each pillar is tappable to its EXISTING fill surface — so "X is missing"
  // is an action, not a passive label. CV + skills live in the in-page editor
  // (`#profile-edit`, same anchor the primary action/CV-import link already
  // use); journal evidence lives on the canonical journal route. No new route,
  // no new copy.
  const pillars: {
    key: "cv" | "skills" | "journal" | "availability";
    label: string;
    value: string;
    ok: boolean;
    href: string;
  }[] = [
    {
      key: "cv",
      label: t("pillars.cv.label"),
      value: cvProvided ? t("pillars.cv.yes") : t("pillars.cv.no"),
      ok: aboutOk,
      href: "#profile-edit",
    },
    {
      key: "skills",
      label: t("pillars.skills.label"),
      value:
        selfDeclaredCount > 0
          ? t("pillars.skills.count", { n: selfDeclaredCount })
          : t("pillars.skills.none"),
      ok: skillsOk,
      href: "#profile-edit",
    },
    {
      key: "journal",
      label: t("pillars.journal.label"),
      value: !hasWorker
        ? t("pillars.journal.preparing")
        : journalCount > 0
          ? t("pillars.journal.available", { n: journalCount })
          : t("pillars.journal.none"),
      ok: hasWorker && journalCount > 0,
      href: "/dashboard/journal",
    },
    // Availability pillar (PR9): matching's availability tier is honest —
    // unknown is missing data, never an assumed yes. The tap target is the
    // ONE canonical Work Card editor on the dashboard.
    ...(hasWorker && availability
      ? [
          {
            key: "availability" as const,
            label: t("pillars.availability.label"),
            value: availability.set
              ? t("pillars.availability.yes")
              : t("pillars.availability.no"),
            ok: availability.set,
            href: "/dashboard#work-card",
          },
        ]
      : []),
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

      <ul
        className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4"
        data-testid="profile-hub-pillars"
        // Honest, machine-checkable view of the identity-card essentials still
        // missing — sourced from the ONE contract, never a percentage/score.
        data-card-missing={card ? card.missing.join(",") : undefined}
      >
        {pillars.map((p) => {
          // Whole card is the tap target (min 52px tall → mobile-safe), with a
          // clear hover/active/focus affordance so it reads as pressable.
          const cardCls =
            "flex min-h-[3.25rem] flex-col gap-1 rounded-md border border-border/40 p-3 transition-colors hover:border-brand-blue focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue active:border-brand-blue";
          const body = (
            <>
              <span className="flex items-center justify-between gap-2 font-mono text-[10px] uppercase tracking-label text-text-muted">
                {p.label}
                <span aria-hidden className="text-text-muted">
                  {p.href.startsWith("#") ? "↓" : "→"}
                </span>
              </span>
              <span
                data-status={p.ok ? "ok" : "todo"}
                className={`text-xs font-medium ${
                  p.ok ? "text-state-success" : "text-text-secondary"
                }`}
              >
                {p.value}
              </span>
            </>
          );
          return (
            <li key={p.key}>
              {p.href.startsWith("#") ? (
                <a
                  href={p.href}
                  className={cardCls}
                  data-testid={`profile-hub-pillar-${p.key}`}
                >
                  {body}
                </a>
              ) : (
                <Link
                  href={p.href}
                  className={cardCls}
                  data-testid={`profile-hub-pillar-${p.key}`}
                >
                  {body}
                </Link>
              )}
            </li>
          );
        })}
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
          {/* systemic-ux-skills-v1: ONE deterministic status line that always
              agrees with the count above — never "6 iš 21" next to a flat
              "Dar nėra darbo įrašų...". */}
          {(() => {
            const status = skillEvidenceStatus(skillEvidence);
            if (!status) return null;
            return (
              <p
                className="text-[11px] leading-relaxed text-text-muted"
                data-testid="profile-hub-skill-evidence-status"
                data-status={status}
              >
                {t(`evidence.status_${status}`)}
              </p>
            );
          })()}
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
        {/* ONE primary next action — contextual, from the deterministic helper.
            Either finish the profile (in-page editor) or, when a worker's skills
            lack work-journal evidence, go add it (canonical journal route). */}
        {journalIsPrimary ? (
          <Link
            href="/dashboard/journal"
            className="inline-flex w-fit items-center gap-1.5 rounded-md bg-gradient-to-r from-brand-blue to-brand-cyan px-3.5 py-1.5 text-sm font-semibold text-ink-900 transition-opacity hover:opacity-90"
            data-testid="profile-hub-primary-action"
          >
            {t(nextAction.labelKey)} →
          </Link>
        ) : (
          <a
            href="#profile-edit"
            className="inline-flex w-fit items-center gap-1.5 rounded-md bg-gradient-to-r from-brand-blue to-brand-cyan px-3.5 py-1.5 text-sm font-semibold text-ink-900 transition-opacity hover:opacity-90"
            data-testid="profile-hub-primary-action"
          >
            {t(nextAction.labelKey)} ↓
          </a>
        )}
        {/* Secondary bridge to the Work Journal — only when it is NOT already
            the primary action, so there is never a duplicate journal link. */}
        {hasWorker && !journalIsPrimary && (
          <Link
            href="/dashboard/journal"
            className="inline-flex w-fit items-center gap-1 text-sm font-medium text-brand-blue transition-colors hover:text-brand-cyan"
            data-testid="profile-hub-journal-link"
          >
            {t("journalLink")} →
          </Link>
        )}
        {/* Make the EXISTING CV import path discoverable from the lead card —
            shown only when no CV text is saved yet, so it is an honest next
            step, not noise. Anchors to the in-page editor where the paste/
            upload panel already lives (no new upload/parser/storage). */}
        {!aboutOk && (
          <a
            href="#profile-edit"
            className="inline-flex w-fit items-center gap-1 text-sm font-medium text-brand-blue transition-colors hover:text-brand-cyan"
            data-testid="profile-hub-cv-import-link"
          >
            {t("cvImportLink")} ↓
          </a>
        )}
        {/* Review matched opportunities (PR9): the profile is not a dead end —
            once a worker exists, the REAL board (matching + interest status)
            is one tap away. Existing route, no new surface. */}
        {hasWorker && (
          <Link
            href="/dashboard/opportunities"
            className="inline-flex w-fit items-center gap-1 text-sm font-medium text-brand-blue transition-colors hover:text-brand-cyan"
            data-testid="profile-hub-opportunities-link"
          >
            {t("opportunitiesLink")} →
          </Link>
        )}
      </div>
    </section>
  );
}
