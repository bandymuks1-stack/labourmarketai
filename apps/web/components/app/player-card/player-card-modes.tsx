"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";

import { cn } from "@/lib/utils";
import { PLAYER_CARD_MODES, type PlayerCardMode } from "@/lib/player-card/card-modes";

/**
 * THE SAME PERSON, SEEN AS … — the Professional Player Card's modes
 * (owner command 2026-09-29 §9: IDENTITY → WORK → SKILLS → EVIDENCE →
 * HISTORY → NEXT).
 *
 * The identity stage (the `stage` slot) stays put — the person is the constant — and
 * only this body transforms. IDENTITY is the card CLOSED (owner direction
 * 2026-09-30: one central object, information opening on demand): the
 * person alone, no section competing with them. Every other mode opens the
 * sections that answer its question, with one short entrance (covered by
 * the reduced-motion block via `rise-in`).
 *
 * The mode is shareable state: it can arrive as `initialMode` (a page
 * reading `?card=`, the chat asking to "show my skills") and a choice is
 * written back to `?card=` without a navigation.
 */
export function PlayerCardModes({
  label,
  modeLabels,
  sections,
  initialMode = "identity",
  syncUrl = true,
  stage = null,
}: {
  label: string;
  modeLabels: Record<PlayerCardMode, string>;
  sections: Record<PlayerCardMode, ReactNode>;
  initialMode?: PlayerCardMode;
  /** Write the chosen mode to `?card=` (off for the public sample card). */
  syncUrl?: boolean;
  /** The identity stage (name, professions, figures). */
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

  const tabs = () => (
    <div
      role="tablist"
      aria-label={label}
      className={cn("-mx-1 flex gap-1 overflow-x-auto px-1 pb-0.5",)}
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

  return (
    <>
      {stage}
      {tabs()}
      {/* IDENTITY is the card closed: its section slot is empty by design, so
          this renders for every other mode (and never doubles the disclosure). */}
      {sections[mode] ? (
        <div
          key={mode}
          role="tabpanel"
          data-mode={mode}
          data-testid="player-card-mode-panel"
          className="rise-in flex flex-col gap-5"
        >
          {sections[mode]}
        </div>
      ) : null}
    </>
  );
}
