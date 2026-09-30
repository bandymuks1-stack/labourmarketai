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

  const tabs = (inScene: boolean) => (
    <div
      role="tablist"
      aria-label={label}
      className={cn("-mx-1 flex gap-1 overflow-x-auto px-1 pb-0.5", inScene && "justify-start sm:justify-center")}
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
            mode === key ? "border-brand-blue text-text-primary" : "border-transparent text-text-muted hover:text-text-primary",
          )}
        >
          {modeLabels[key]}
        </button>
      ))}
    </div>
  );

  // ONE IDENTITY (owner visual correction 2026-09-29 §4): with the world
  // drawn, the person, their profession, where they work and their figures
  // live IN the scene — the identity stage is not repeated as a card, and
  // the whole card's facts wait behind one disclosure instead of competing
  // with the person. Without the world, the card is exactly what it was.
  const scene = Boolean(world && drawable);

  return (
    <>
      {scene && world ? (
        <section
          ref={host}
          aria-label={world.words.sceneLabel}
          data-testid="player-card-world"
          data-mode={mode}
          className="relative -mx-5 -mt-5 h-[34rem] overflow-hidden bg-ink-900 sm:-mx-6 sm:-mt-6 sm:h-[38rem] lg:h-[42rem]"
        >
          {inView ? <PlayerCardWorldScene model={world} mode={mode} reduced={reduced} controls={tabs(true)} /> : null}
        </section>
      ) : (
        <>
          {stage}
          {tabs(false)}
        </>
      )}
      {scene && mode === "identity" ? (
        <details className="group rounded-lg border border-ink-600" data-testid="player-card-all-details">
          <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between px-4 font-mono text-meta uppercase tracking-label text-text-secondary hover:text-text-primary">
            {world?.words.allDetails}
            <span aria-hidden className="transition-transform group-open:rotate-180">⌄</span>
          </summary>
          <div role="tabpanel" data-mode={mode} data-testid="player-card-mode-panel" className="flex flex-col gap-5 border-t border-ink-600 p-4">
            {stage}
            {sections[mode]}
          </div>
        </details>
      ) : (
        <div
          key={mode}
          role="tabpanel"
          data-mode={mode}
          data-testid="player-card-mode-panel"
          className="rise-in flex flex-col gap-5"
        >
          {sections[mode]}
        </div>
      )}
    </>
  );
}
