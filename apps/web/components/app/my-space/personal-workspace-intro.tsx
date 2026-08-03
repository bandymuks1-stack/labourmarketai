import { getTranslations } from "next-intl/server";

import { Link } from "@/lib/i18n/navigation";
import { Card } from "@/components/ui/Card";
import { pillLinkClassName } from "@/components/ui/Button";
import { ResultShell, type ResultShellStatus } from "@/components/ui/ResultShell";
import { getWorkerPlayerCard } from "@/lib/player-card/player-card";
import {
  deriveWorkerReadiness,
  type ReadinessPillarKey,
} from "@/lib/player-card/readiness";
import { readinessNextSteps } from "@/lib/player-card/readiness-steps";

/**
 * "Mano erdvė" — the PERSONAL STATE of the one chat-first workspace (visual S2).
 *
 * THIS IS NOT A SCREEN. It has no route, no navigation entry and no dismiss
 * state; it renders inside the existing `/dashboard` conversation while that
 * conversation is still OPENING, and the first real turn removes it. A route
 * would fire the Product Gate's `second_dashboard` rule (A-01) and would rebuild
 * exactly what W3 Package 4 deleted (`/dashboard/advanced` + MyZone).
 *
 * It ADDS NO SOURCE OF TRUTH. Everything below already exists:
 *   readiness      → `deriveWorkerReadiness` (the ONE canonical model, already
 *                    read by the player-card ring, the setup journey, the
 *                    state strip and the live-profile list)
 *   next action    → `readinessNextSteps` (each step is a real in-app route)
 *   action labels  → `playerCard.readinessSteps.action.*` (existing copy)
 *   the person     → `getWorkerPlayerCard()` (cached, the canonical card read)
 *
 * HONESTY (doctrine §19a + `my-space-human-entry.test.ts`): no percentage, no
 * score, no OVR, no trust/reputation, no AI claim. Readiness is a state WORD
 * plus real met/total signals, and a met pillar never re-asks for what is
 * already done — a complete profile gets no completion CTA at all.
 *
 * Server component: it renders to the client conversation through a slot prop,
 * so the chat stays a client component and gains no data layer.
 */

/** The pillars in the order the readiness model reports them. */
const PILLAR_ORDER: readonly ReadinessPillarKey[] = [
  "profession",
  "availability",
  "skills",
  "journal",
  "evidence",
  "workCard",
];

/** At most one primary + two secondary actions — a front door offers a next
 *  step, not a backlog. */
const MAX_SECONDARY_ACTIONS = 2;

export async function PersonalWorkspaceIntro() {
  const t = await getTranslations("auth.dashboard.mySpace");
  const tState = await getTranslations("profileState.readiness");
  const tStep = await getTranslations("playerCard.readinessSteps");

  let card: Awaited<ReturnType<typeof getWorkerPlayerCard>> = null;
  let readFailed = false;
  try {
    card = await getWorkerPlayerCard();
  } catch {
    // Honest degradation: the front door never invents a state it could not
    // read, and never prints the underlying error.
    readFailed = true;
  }

  // The card is not readable (no worker record yet, or the read failed). The
  // space says so plainly instead of rendering an empty premium shell.
  if (!card) {
    const status: ResultShellStatus = readFailed ? "error" : "unavailable";
    return (
      <Card compact className="mt-6">
        <ResultShell
          status={status}
          title={t("title")}
          description={t("unavailable")}
          testId="personal-workspace-intro"
        />
      </Card>
    );
  }

  const readiness = deriveWorkerReadiness(card);
  const steps = readinessNextSteps(readiness);
  const primary = steps[0] ?? null;
  const secondary = steps.slice(1, 1 + MAX_SECONDARY_ACTIONS);
  const metByKey = new Map(readiness.pillars.map((p) => [p.key, p.met]));

  // `ready` only when every signal the model tracks is met — the shell may
  // never promote a status, so "ready" here means literally nothing is missing.
  const status: ResultShellStatus = steps.length === 0 ? "ready" : "partial";

  return (
    <Card compact className="mt-6">
      <ResultShell
        status={status}
        title={t("title")}
        description={t("intro")}
        testId="personal-workspace-intro"
        actions={
          <>
            {primary ? (
              <Link
                href={primary.href as "/dashboard/profile"}
                className={pillLinkClassName}
                data-testid="personal-workspace-primary-action"
              >
                {tStep(`action.${primary.pillar}`)}
              </Link>
            ) : null}
            {secondary.map((step) => (
              <Link
                key={step.pillar}
                href={step.href as "/dashboard/profile"}
                className={pillLinkClassName}
                data-testid={`personal-workspace-secondary-${step.pillar}`}
              >
                {tStep(`action.${step.pillar}`)}
              </Link>
            ))}
            <Link
              href="/dashboard/profile"
              className={pillLinkClassName}
              data-testid="personal-workspace-profile-link"
            >
              {t("profileCta")}
            </Link>
          </>
        }
      >
        <div className="flex flex-col gap-3">
          <p className="text-basis text-text-secondary">
            <span className="font-mono text-meta uppercase tracking-label text-text-muted">
              {t("readinessLabel")}
            </span>{" "}
            <span data-testid="personal-workspace-readiness-level">
              {tState(readiness.level)}
            </span>
          </p>
          {/* The six real signals, each shown as met or still open. A count of
              met signals is NOT a score: it is how many of six concrete,
              user-controlled facts exist. */}
          <ul className="grid gap-1.5 sm:grid-cols-2" data-testid="personal-workspace-pillars">
            {PILLAR_ORDER.map((key) => {
              const met = metByKey.get(key) ?? false;
              return (
                <li
                  key={key}
                  data-pillar={key}
                  data-met={met ? "true" : "false"}
                  className="flex items-center gap-2 text-basis"
                >
                  <span
                    aria-hidden
                    className={met ? "text-state-success" : "text-text-muted"}
                  >
                    {met ? "✓" : "○"}
                  </span>
                  <span className={met ? "text-text-secondary" : "text-text-muted"}>
                    {t(`pillars.${key}`)}
                  </span>
                </li>
              );
            })}
          </ul>
          <p className="text-meta text-text-muted">{t("unverifiedNote")}</p>
        </div>
      </ResultShell>
    </Card>
  );
}
