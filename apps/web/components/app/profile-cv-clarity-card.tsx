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
 *
 * Each actionable step now reflects REAL saved state (Added / To add)
 * when the parent passes `state` — read straight from persisted data, so
 * it can never drift from what is stored. `awaitingProof` stays a calm
 * informational note (no chip), and there is no aggregate %/score.
 */
type ActionableStep = "about" | "skills" | "journal" | "selfDeclared";

export async function ProfileCvClarityCard({
  state,
}: {
  state?: Partial<Record<ActionableStep, boolean>>;
} = {}) {
  const t = await getTranslations("profileCvClarity");
  const steps = [
    "about",
    "skills",
    "journal",
    "selfDeclared",
    "awaitingProof",
  ] as const;
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
        {steps.map((key) => {
          const done =
            state && key !== "awaitingProof"
              ? state[key as ActionableStep]
              : undefined;
          return (
            <li
              key={key}
              // Mobile: stacked card (label → body → status) so the columns
              // never collapse into unreadable narrow strips. sm+: original row.
              className="flex flex-col gap-1 rounded-md border border-border/40 p-2.5 sm:flex-row sm:items-baseline sm:gap-3 sm:rounded-none sm:border-0 sm:p-0"
              data-testid={`profile-cv-step-${key}`}
            >
              <span className="font-mono text-[10px] uppercase tracking-label text-text-muted sm:shrink-0">
                {t(`step.${key}.label`)}
              </span>
              <span className="flex-1 text-text-secondary">
                {t(`step.${key}.body`)}
              </span>
              {typeof done === "boolean" && (
                <span
                  data-status={done ? "done" : "todo"}
                  className={`w-fit shrink-0 rounded-sm border px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-label ${
                    done
                      ? "border-state-success/40 text-state-success"
                      : "border-state-warning/40 text-state-warning"
                  }`}
                >
                  {done ? t("statusDone") : t("statusTodo")}
                </span>
              )}
            </li>
          );
        })}
      </ul>
      <p className="text-[11px] leading-relaxed text-text-muted">
        {t("footnote")}
      </p>
    </section>
  );
}
