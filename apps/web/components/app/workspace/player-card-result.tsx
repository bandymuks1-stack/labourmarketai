"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";

import { WorkCardEditor } from "@/components/app/work-card-editor";
import { WorkerPlayerCard } from "@/components/app/worker-player-card";
import { loadPlayerCardResult } from "@/lib/player-card/player-card-result";
import type { PlayerCardResult as PlayerCardResultView } from "@/lib/player-card/player-card-result";

/**
 * THE PLAYER CARD RESULT — W3 row 1.
 *
 * NOT A SECOND CARD. It renders `WorkerPlayerCard`, the same component the
 * journal identity block renders, with the same server-derived data. The
 * capability had TWO renderers before this: the canonical card embedded in the
 * chat THREAD, and a lesser person block inside the premium hub on
 * `/dashboard/advanced` — mounted twice. Both are gone; this is the one.
 *
 * WHY THE PANEL AND NOT THE THREAD. A card in the thread scrolls away with the
 * conversation and is re-pushed on every ask, so a person could end up with
 * three copies of themselves in one session, each frozen at a different moment.
 * The panel holds ONE, current, and the chat says what changed.
 *
 * THE STATE SET, because a result panel is where someone is waiting:
 *
 *   idle     first paint, before the read is requested
 *   loading  the read is in flight (announced, never a blank frame)
 *   error    the action threw — offers RETRY, never a false emptiness
 *   blocked  no worker row, or the read degraded — the reason is STATED
 *   ready    the real card
 *
 * There is no `empty` state and that is deliberate: a card always has a
 * subject — the person. Its own blocks carry their honest empty states (no
 * skills yet, no evidence yet), which is the truthful place for emptiness. A
 * whole-card "empty" would be a claim that the person does not exist.
 *
 * NOTHING IS COMPUTED HERE. No score, no rating, no total. Every number is a
 * count of the person's own rows, produced by the canonical model.
 *
 * NO ROUTING — like every result body, `onOpenFull` is the workspace layer's
 * callback to the full profile, which stays reachable from every state.
 */

type Phase =
  | { readonly kind: "idle" }
  | { readonly kind: "loading" }
  | { readonly kind: "error" }
  | { readonly kind: "loaded"; readonly view: PlayerCardResultView };

export function PlayerCardResult({
  onOpenFull,
}: {
  onOpenFull: (route: string) => void;
}) {
  const t = useTranslations("conversation.results");
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  // Bumping this re-runs the read — that is the whole of RETRY.
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setPhase({ kind: "loading" });
    loadPlayerCardResult()
      .then((view) => {
        if (!cancelled) setPhase({ kind: "loaded", view });
      })
      .catch(() => {
        // "We could not read it" and "there is nothing" are different answers.
        if (!cancelled) setPhase({ kind: "error" });
      });
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);

  if (phase.kind === "idle" || phase.kind === "loading") {
    return (
      <p
        className="text-basis text-text-muted"
        data-testid="player-card-loading"
        aria-busy="true"
      >
        {t("pendingInline")}
      </p>
    );
  }

  if (phase.kind === "error") {
    return (
      <div className="flex flex-col gap-3" data-testid="player-card-error">
        <p className="text-basis text-text-secondary">{t("playerCardError")}</p>
        <button
          type="button"
          onClick={retry}
          data-testid="player-card-retry"
          className="min-h-11 self-start rounded-full border border-ink-500 px-3.5 text-support font-medium text-text-secondary hover:border-brand-blue hover:text-brand-blue"
        >
          {t("retry")}
        </button>
      </div>
    );
  }

  const { view } = phase;

  if (view.kind === "blocked") {
    // The server said why. It is repeated verbatim rather than replaced with a
    // friendlier sentence that would hide which of the reasons applied.
    return (
      <div className="flex flex-col gap-3" data-testid="player-card-blocked">
        <p className="text-basis text-text-secondary">{view.message}</p>
        <button
          type="button"
          onClick={() => onOpenFull("/dashboard/profile")}
          data-testid="player-card-open-full"
          className="min-h-11 self-start rounded-full border border-ink-500 px-3.5 text-support font-medium text-text-secondary hover:border-brand-blue hover:text-brand-blue"
        >
          {t("openFull")}
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4" data-testid="player-card-result">
      <WorkerPlayerCard
        card={view.card}
        labels={view.labels}
        thermometer={view.thermometer}
        avatarUrl={view.avatarUrl}
      />

      {/* THE EDITOR THE ABSORB HAD TO CARRY. It was folded into the premium
          hub's person block on the route being deleted, and it is the ONLY
          availability / location / pay editor in the product. `workEditor` is
          null for any identity without a worker row, so a non-worker gets the
          card and no worker-only controls — and the save RPCs still enforce
          that server-side, which is where it counts. */}
      {view.workEditor && view.workEditorLabels ? (
        <div
          className="flex flex-col gap-3 rounded-card border border-ink-600 p-4"
          data-testid="player-card-work-editor"
        >
          <span className="font-mono text-meta uppercase tracking-label text-brand-orange">
            {view.workEditorLabels.nextEyebrow}
          </span>
          <WorkCardEditor
            state={view.workEditor.state}
            nextHref={view.workEditor.next.href}
            values={view.workEditor.values}
            labels={view.workEditorLabels}
          />
        </div>
      ) : null}

      <button
        type="button"
        onClick={() => onOpenFull("/dashboard/profile")}
        data-testid="player-card-open-full"
        className="min-h-11 self-start rounded-full border border-ink-500 px-3.5 text-support font-medium text-text-secondary hover:border-brand-blue hover:text-brand-blue"
      >
        {t("openFull")}
      </button>
    </div>
  );
}
