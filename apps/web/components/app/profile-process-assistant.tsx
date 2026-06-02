import { getTranslations } from "next-intl/server";
import { Link } from "@/lib/i18n/navigation";
import {
  deriveProfileProcessBrain,
  type ProfileProcessSignals,
} from "@/lib/process-brain/profile-process-brain";

/**
 * Internal AI Process Brain v0 — UI surface (Stage 0).
 *
 * Renders the deterministic process-brain output inside the canonical
 * /dashboard/profile hub. It explains, in plain language, what the system sees
 * (CV + skills + work-journal evidence), what is still missing, and the
 * suggested next steps — each with a "Why this is suggested" reason and a link
 * to an EXISTING canonical destination. It suggests only: no mutation, no
 * verification, no action call. The two safety disclaimers are always shown.
 *
 * Pure server component (no client JS, no onClick, no fetch). All copy comes
 * from the `processAssistant` i18n namespace (LT + EN parity guarded).
 */
export async function ProfileProcessAssistant({
  signals,
}: {
  signals: ProfileProcessSignals;
}) {
  const t = await getTranslations("processAssistant");
  const brain = deriveProfileProcessBrain(signals);

  const renderHref = (href: string, label: string, key: string) =>
    href.startsWith("#") ? (
      <a
        key={key}
        href={href}
        className="text-xs font-medium text-brand-blue transition-colors hover:text-brand-cyan"
      >
        {label} ↓
      </a>
    ) : (
      <Link
        key={key}
        href={href as "/dashboard/journal"}
        className="text-xs font-medium text-brand-blue transition-colors hover:text-brand-cyan"
      >
        {label} →
      </Link>
    );

  return (
    <section
      className="card-border flex flex-col gap-4 p-5"
      data-testid="profile-process-assistant"
    >
      <header className="flex flex-col gap-1">
        <span className="font-mono text-[10px] uppercase tracking-label text-text-muted">
          {t("title")}
        </span>
        <p className="text-xs leading-relaxed text-text-secondary">
          {t("intro")}
        </p>
      </header>

      <div className="grid gap-3 sm:grid-cols-2">
        {brain.knownSignals.length > 0 && (
          <div className="flex flex-col gap-1.5" data-testid="process-known">
            <span className="font-mono text-[10px] uppercase tracking-label text-text-muted">
              {t("knownHeading")}
            </span>
            <ul className="flex flex-col gap-1">
              {brain.knownSignals.map((s) => (
                <li key={s.key} className="text-xs text-state-success">
                  • {t(s.labelKey, s.params)}
                </li>
              ))}
            </ul>
          </div>
        )}

        {brain.missingSignals.length > 0 && (
          <div className="flex flex-col gap-1.5" data-testid="process-missing">
            <span className="font-mono text-[10px] uppercase tracking-label text-text-muted">
              {t("missingHeading")}
            </span>
            <ul className="flex flex-col gap-1">
              {brain.missingSignals.map((s) => (
                <li key={s.key} className="text-xs text-text-secondary">
                  • {t(s.labelKey, s.params)}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {brain.suggestedNextActions.length > 0 ? (
        <div className="flex flex-col gap-2" data-testid="process-actions">
          <span className="font-mono text-[10px] uppercase tracking-label text-text-muted">
            {t("actionsHeading")}
          </span>
          <ul className="flex flex-col gap-2.5">
            {brain.suggestedNextActions.map((a) => (
              <li
                key={a.id}
                className="flex flex-col gap-1 rounded-md border border-border/40 p-3"
                data-testid={`process-action-${a.id}`}
              >
                {renderHref(a.href, t(a.labelKey), a.id)}
                {/* Every suggestion explains WHY it is suggested. */}
                <p className="text-[11px] leading-relaxed text-text-muted">
                  <span className="font-mono uppercase tracking-label">
                    {t("whyLabel")}:
                  </span>{" "}
                  {t(a.reasonKey)}
                </p>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="text-xs text-text-secondary" data-testid="process-all-good">
          {t("allGood")}
        </p>
      )}

      {/* Always-on safety disclaimers — this layer suggests, never verifies. */}
      <div
        className="flex flex-col gap-0.5 border-t border-border/40 pt-3"
        data-testid="process-safety"
      >
        {brain.safetyDisclaimers.map((key) => (
          <p key={key} className="text-[11px] leading-relaxed text-text-muted">
            {t(key)}
          </p>
        ))}
      </div>
    </section>
  );
}
