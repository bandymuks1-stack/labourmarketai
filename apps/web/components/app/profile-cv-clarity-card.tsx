import { getTranslations } from "next-intl/server";

/**
 * Profile / CV clarity card (Priority 4 of the next-layer v2 sprint).
 * Read-only step list that tells a real worker the shape of the
 * profile they're building, what they've already self-declared, what
 * still needs evidence, and what is NOT yet externally confirmed.
 *
 * Honest framing — no fake "verified" badges, no fake "AI matched"
 * claims, no "100% complete" gamification. Just a calm checklist that
 * explains the surface around them.
 *
 * Server component. No client JS. No telemetry call. Pure render.
 */
export async function ProfileCvClarityCard() {
  const t = await getTranslations("profileCvClarity");
  const steps = [
    { key: "about" as const, status: "info" as const },
    { key: "skills" as const, status: "info" as const },
    { key: "journal" as const, status: "info" as const },
    { key: "selfDeclared" as const, status: "info" as const },
    { key: "awaitingProof" as const, status: "info" as const },
  ];
  return (
    <section
      className="card-border flex flex-col gap-3 p-4"
      data-testid="profile-cv-clarity-card"
    >
      <header className="flex items-baseline justify-between gap-2">
        <h2 className="font-display text-base font-semibold text-text-primary">
          {t("title")}
        </h2>
        <span className="font-mono text-[10px] uppercase tracking-label text-text-muted">
          {t("scope")}
        </span>
      </header>
      <p className="text-xs leading-relaxed text-text-secondary">{t("intro")}</p>
      <ul className="flex flex-col gap-1.5 text-xs">
        {steps.map((s) => (
          <li
            key={s.key}
            className="flex items-baseline gap-3"
            data-testid={`profile-cv-step-${s.key}`}
          >
            <span className="font-mono text-[10px] uppercase tracking-label text-text-muted">
              {t(`step.${s.key}.label`)}
            </span>
            <span className="flex-1 text-text-secondary">
              {t(`step.${s.key}.body`)}
            </span>
          </li>
        ))}
      </ul>
      <p className="text-[11px] leading-relaxed text-text-muted">
        {t("footnote")}
      </p>
    </section>
  );
}
