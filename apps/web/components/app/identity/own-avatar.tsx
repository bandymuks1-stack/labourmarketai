"use client";

import { useEffect, useSyncExternalStore } from "react";

/**
 * THE SIGNED-IN PERSON'S OWN PHOTO, for the shell.
 *
 * The shell's account control needs the person's real avatar, but the photo
 * lives in a private bucket and is signed server-side. `OwnAvatarStream`
 * (server) reads it AFTER first paint — the same pattern as the notification
 * spine, so the shell's TTFB never waits on storage — and `OwnAvatarHydrator`
 * pushes the URL into this tiny store. Until it arrives, and whenever there is
 * no photo, the shell shows the person's plate and initials; never a stand-in
 * face. Only the viewer's OWN photo travels this way (ported from PR #2110).
 */
let current: string | null = null;
const listeners = new Set<() => void>();

function set(next: string | null) {
  if (next === current) return;
  current = next;
  listeners.forEach((l) => l());
}

export function OwnAvatarHydrator({ url }: { readonly url: string | null }) {
  useEffect(() => {
    set(url);
  }, [url]);
  return null;
}

export function useOwnAvatarUrl(): string | null {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => {
        listeners.delete(cb);
      };
    },
    () => current,
    () => null,
  );
}
