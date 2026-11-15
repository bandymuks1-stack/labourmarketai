"use client";

import dynamic from "next/dynamic";

/**
 * The animated landing pieces, loaded as THEIR OWN chunk.
 *
 * Every client component of a page shares one list of chunks, and nothing on
 * the page responds until the whole list has arrived. The animation library
 * is the largest file on that list and serves only content below the first
 * screen — so it was making the goal cards and the sentence field wait for it
 * (measured 2026-11-13: the header answered about 0.4 s before the goal
 * cards on a slow phone connection).
 *
 * Loaded this way the server still renders the same finished markup, the
 * first screen no longer waits for the library, and the animated pieces come
 * alive when their chunk lands. Nothing is hidden meanwhile: both render
 * their final visible state first.
 */
export const Reveal = dynamic(() => import("./reveal").then((m) => m.Reveal));

export const TwoSidesLifecycle = dynamic(() =>
  import("./two-sides-lifecycle").then((m) => m.TwoSidesLifecycle),
);
