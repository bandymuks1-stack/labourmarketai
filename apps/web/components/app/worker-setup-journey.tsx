import { getTranslations } from "next-intl/server";
import { CheckCircle2, Circle } from "lucide-react";

import { Link } from "@/lib/i18n/navigation";
import { getWorkerPlayerCard } from "@/lib/player-card/player-card";
import { deriveWorkerReadiness } from "@/lib/player-card/readiness";

/**
 * Wagon 4 — guided worker setup journey (UX Recovery Train).
 *
 * ONE worker journey: registration → work goal → experience (CV or
 * questions) → review → location → availability → profile ready. This is a
 * GUIDE over the canonical surfaces, not a second subsystem: every step
 * links to the EXISTING form that already persists the data (profession
 * picker + CV import + review live in the profile edit flow, location in
 * the work card, availability in the availability preferences) and every
 * done-state is derived from the SAME real readiness signals the Player
 * Card ring uses (deriveWorkerReadiness — real row counts, never a rating).
 *
 * Honesty rules: no fabricated progress (a step is done only when its
 * canonical signal exists), no internal model numbers shown, no architecture
 * vocabulary — the copy is plain worker language in every served locale.
 */

type StepKey = "goal" | "experience" | "review" | "location" | "availability";

export async function WorkerSetupJourney(): Promise<React.ReactElement | null> {
  const card = await getWorkerPlayerCard();
  if (!card) return null; // not a worker — the guide simply doesn't exist
  const readiness = deriveWorkerReadiness(card);
  const t = await getTranslations("setupJourney");

  const pillar = (key: string): boolean =>
    readiness.pillars.find((p) => p.key === key)?.met ?? false;

  const steps: Array<{ key: StepKey; done: boolean; href: string }> = [
    { key: "goal", done: pillar("profession"), href: "/dashboard/profile#profile-edit" },
    {
      key: "experience",
      // CV import or answering the questions ends in declared skills /
      // journal-backed evidence — the same canonical outcome either way.
      done: card.skillsDeclared > 0 || card.journalSupportedSkills > 0,
      href: "/dashboard/profile#profile-edit",
    },
    {
      key: "review",
      // Reviewing "what we found" = confirming the suggestions; confirmed
      // claims are exactly the declared-skills signal.
      done: pillar("skills"),
      href: "/dashboard/profile#profile-edit",
    },
    {
      key: "location",
      // The work card carries the location + preferred countries and is
      // only "done" when the worker explicitly confirmed it.
      done: pillar("workCard"),
      href: "/dashboard#work-card",
    },
    {
      key: "availability",
      done: pillar("availability"),
      href: "/dashboard/profile#cv-availability",
    },
  ];
  const doneCount = steps.filter((s) => s.done).length;
  const allDone = doneCount === steps.length;

  return (
    <section
      id="setup-journey"
      data-testid="worker-setup-journey"
      className="card-border flex scroll-mt-20 flex-col gap-4 p-6"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-display text-xl font-semibold tracking-tightest text-text-primary">
          {allDone ? t("readyTitle") : t("title")}
        </h2>
        <span
          className="font-mono text-meta uppercase tracking-label text-text-muted"
          data-testid="setup-journey-count"
        >
          {t("progress", { done: doneCount, total: steps.length })}
        </span>
      </div>
      <p className="max-w-prose text-sm leading-relaxed text-text-secondary">
        {allDone ? t("readyBody") : t("subtitle")}
      </p>

      <ol className="flex flex-col gap-2">
        {steps.map(({ key, done, href }, i) => (
          <li key={key}>
            <Link
              href={href as "/dashboard"}
              data-testid={`setup-step-${key}`}
              data-done={done ? "true" : "false"}
              className="group flex items-start gap-3 rounded-md border border-border-subtle p-3 transition-colors hover:border-brand-blue/60"
            >
              {done ? (
                <CheckCircle2
                  className="mt-0.5 h-5 w-5 shrink-0 text-state-success"
                  aria-hidden
                />
              ) : (
                <Circle
                  className="mt-0.5 h-5 w-5 shrink-0 text-text-muted"
                  aria-hidden
                />
              )}
              <span className="flex flex-col gap-0.5">
                <span className="text-sm font-medium text-text-primary">
                  {i + 1}. {t(`steps.${key}.title`)}
                </span>
                {!done && (
                  <span className="text-xs leading-relaxed text-text-secondary">
                    {t(`steps.${key}.hint`)}
                  </span>
                )}
              </span>
            </Link>
          </li>
        ))}
      </ol>
    </section>
  );
}
