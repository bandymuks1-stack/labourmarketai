"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";

import { cn } from "@/lib/utils";
import { PLAYER_CARD_MODES, type PlayerCardMode } from "@/lib/player-card/card-modes";
import type { PlayerCardWorldModel } from "@/lib/player-card/card-world";

/**
 * THE SAME PERSON, SEEN AS … — the Professional Player Card's modes
 * (owner command 2026-09-29 §9: IDENTITY → WORK → SKILLS → EVIDENCE →
 * HISTORY → NEXT).
 *
 * The modes are STATES OF ONE WORLD (premium addendum E): when the browser
 * can draw it, the person's professional world is the hero — the person at
 * the centre, the five satellites around them, and a choice re-forms that
 * world (the camera travels, the rows behind the chosen satellite come
 * forward). The server-rendered sections below stay the readable facts of
 * the same mode; the mode control stays for keyboard and screen readers.
 *
 * The world is loaded only when the card is on screen and WebGL exists; with
 * neither, the card is exactly what it was (the floor).
 *
 * The mode is shareable state: it can arrive as `initialMode` (a page
 * reading `?card=`, the chat asking to "show my skills") and a choice is
 * written back to `?card=` without a navigation.
 */
const PlayerCardWorldScene = dynamic(() => import("./player-card-world-scene"), {
  ssr: false,
  loading: () => null,
});

function canDrawWorld(): boolean {
  try {
    const c = document.createElement("canvas");
    return Boolean(c.getContext("webgl2") ?? c.getContext("webgl"));
  } catch {
    return false;
  }
}

export function PlayerCardModes({
  label,
  modeLabels,
  sections,
  initialMode = "identity",
  syncUrl = true,
  world = null,
  stage = null,
}: {
  label: string;
  modeLabels: Record<PlayerCardMode, string>;
  sections: Record<PlayerCardMode, ReactNode>;
  initialMode?: PlayerCardMode;
  /** Write the chosen mode to `?card=` (off for the public sample card). */
  syncUrl?: boolean;
  /** The person's world, when the card has one to draw. */
  world?: PlayerCardWorldModel | null;
  /** The identity stage (name, professions, figures) — under the world. */
  stage?: ReactNode;
}) {
  const [mode, setMode] = useState<PlayerCardMode>(initialMode);
  // A new initial mode from the caller (the chat asking again) wins.
  useEffect(() => setMode(initialMode), [initialMode]);

  const choose = useCallback(
    (next: PlayerCardMode) => {
      setMode(next);
      if (!syncUrl || typeof window === "undefined") return;
      const url = new URL(window.location.href);
      if (next === "identity") url.searchParams.delete("card");
      else url.searchParams.set("card", next);
      window.history.replaceState(window.history.state, "", url);
    },
    [syncUrl],
  );

  // Draw the world only where it can be drawn, and only once it is in view.
  const host = useRef<HTMLDivElement>(null);
  const [drawable, setDrawable] = useState(false);
  const [inView, setInView] = useState(false);
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    if (!world) return;
    setDrawable(canDrawWorld());
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setReduced(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, [world]);
  useEffect(() => {
    const el = host.current;
    if (!el || !drawable) return;
    const io = new IntersectionObserver(([e]) => e?.isIntersecting && setInView(true), { rootMargin: "200px" });
    io.observe(el);
    return () => io.disconnect();
  }, [drawable]);

  return (
    <>
      {world && drawable ? (
        <div
          ref={host}
          role="img"
          aria-label={world.words.sceneLabel}
          data-testid="player-card-world"
          data-mode={mode}
          className="relative -mx-5 -mt-5 h-[21rem] overflow-hidden sm:-mx-6 sm:-mt-6 sm:h-[30rem]"
        >
          {inView ? <PlayerCardWorldScene model={world} mode={mode} onChoose={choose} reduced={reduced} /> : null}
        </div>
      ) : null}
      {/* With the world drawn, the person already stands in it: the stage
          keeps its words and figures, not a second monogram tile. */}
      <div className={world && drawable ? "[&_.identity-stage-person]:hidden" : "contents"}>{stage}</div>
      <div
        role="tablist"
        aria-label={label}
        className={cn(
          "-mx-1 flex gap-1 overflow-x-auto px-1 pb-0.5",
          world && drawable && "border-b border-ink-600",
        )}
        data-testid="player-card-modes"
      >
        {PLAYER_CARD_MODES.map((key) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={mode === key}
            onClick={() => choose(key)}
            data-testid={`player-card-mode-${key}`}
            className={cn(
              "inline-flex min-h-11 shrink-0 items-center border-b-2 px-3 font-mono text-meta uppercase tracking-label transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue",
              mode === key
                ? "border-brand-blue text-text-primary"
                : "border-transparent text-text-muted hover:text-text-primary",
            )}
          >
            {modeLabels[key]}
          </button>
        ))}
      </div>
      <div
        key={mode}
        role="tabpanel"
        data-mode={mode}
        data-testid="player-card-mode-panel"
        className="rise-in flex flex-col gap-5"
      >
        {sections[mode]}
      </div>
    </>
  );
}
