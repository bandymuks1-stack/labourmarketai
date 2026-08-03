"use client";

import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import type { PersonalWorkspaceIntro as IntroModel } from "@/lib/workspace/personal-workspace-intro";
import type { PersonalWorkspaceLabels } from "@/lib/workspace/personal-workspace-labels";

/**
 * "Mano erdvė" — the first block of the conversation-first home (S2).
 *
 * IT IS NOT A DASHBOARD. It has no route of its own, it owns no data, it reads
 * nothing and it derives nothing: the server hands it a finished model built
 * from the ONE canonical readiness source plus an already-resolved label bag,
 * and every action it offers is dispatched into the conversation's EXISTING
 * chip handler. It renders only while the conversation is still opening, so
 * the chat — not this block — remains the workspace.
 *
 * Honesty: no percentage, no count, no score, no ring, no rating, no
 * verification claim. What is already known is named; the one thing that
 * matters most next is named; everything else is left unsaid rather than
 * guessed.
 */
export function PersonalWorkspaceIntro({
  intro,
  labels,
  onAction,
}: {
  intro: IntroModel;
  labels: PersonalWorkspaceLabels;
  /** The conversation's own dispatcher — the same one the thread chips use. */
  onAction: (chipId: string) => void;
}) {
  if (intro.kind === "hidden") return null;

  // The person's real name when the product has one, then the space they are
  // actually in. No name → the space name alone; never an invented one.
  const spaceLine = [intro.displayName, labels.spaceKind]
    .filter(Boolean)
    .join(" · ");

  return (
    <Card compact className="text-left">
      <div data-testid="personal-workspace-intro" className="flex flex-col gap-4">
        <header className="flex flex-col gap-1.5">
          <p className="font-mono text-meta uppercase tracking-label text-text-muted">
            {spaceLine}
          </p>
          <h2 className="font-display text-card-title font-bold tracking-tightest text-text-primary">
            {labels.title}
          </h2>
          <p className="text-support text-text-secondary">{labels.intro}</p>
        </header>

        {intro.kind === "unavailable" ? (
          // The person HAS a work profile; its readiness simply could not be
          // read right now. Said plainly, with no readiness claim and no CTA
          // that pretends to know what is missing.
          <p
            data-testid="personal-workspace-intro-unavailable"
            className="text-support text-text-secondary"
          >
            {labels.readinessUnavailable}
          </p>
        ) : (
          <>
            {/* What this space holds, in the person's own plain words — the
                six dimensions of a work profile, never a score of them. */}
            <section className="flex flex-col gap-1.5">
              <h3 className="font-mono text-meta uppercase tracking-label text-text-muted">
                {labels.workProfile}
              </h3>
              <ul className="flex flex-wrap gap-x-3 gap-y-1 text-meta text-text-secondary">
                {labels.dimensions.map((dimension) => (
                  <li key={dimension}>{dimension}</li>
                ))}
              </ul>
            </section>

            <section className="flex flex-col gap-1.5">
              <h3 className="font-mono text-meta uppercase tracking-label text-text-muted">
                {labels.readinessLabel}
              </h3>
              {intro.met.length > 0 && (
                <p
                  data-testid="personal-workspace-intro-known"
                  className="text-support text-text-secondary"
                >
                  <span className="text-state-success">{labels.readinessKnown}</span>{" "}
                  {intro.met.map((key) => labels.pillar[key]).join(" · ")}
                </p>
              )}
              {intro.nextMissing === null ? (
                <p
                  data-testid="personal-workspace-intro-complete"
                  className="text-support text-text-secondary"
                >
                  {labels.readinessComplete}
                </p>
              ) : (
                <p
                  data-testid="personal-workspace-intro-next"
                  className="text-support text-text-primary"
                >
                  <span className="text-text-muted">{labels.readinessNext}</span>{" "}
                  {labels.pillar[intro.nextMissing]}
                </p>
              )}
            </section>

            {/* Everything named above is SELF-DECLARED. The block never claims
                verification, so it says so rather than letting "already set"
                read as "checked by us". */}
            <p
              data-testid="personal-workspace-intro-self-declared"
              className="text-meta text-text-muted"
            >
              {labels.unverifiedNote}
            </p>

            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                size="sm"
                data-testid="personal-workspace-intro-primary"
                onClick={() => onAction(intro.primary.id)}
              >
                {labels.action[intro.primary.labelKey]}
              </Button>
              {intro.secondary.map((action) => (
                <Button
                  key={action.id}
                  type="button"
                  variant="pill"
                  data-testid={`personal-workspace-intro-secondary-${action.labelKey}`}
                  onClick={() => onAction(action.id)}
                >
                  {labels.action[action.labelKey]}
                </Button>
              ))}
            </div>
          </>
        )}
      </div>
    </Card>
  );
}
