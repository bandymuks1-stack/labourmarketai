import { useCallback, useEffect, useRef } from "react";

import { useAuth } from "./auth-context";
import { clearDraft, readDraft, writeDraft } from "./drafts";

type Fields = Readonly<Record<string, string>>;

/**
 * Keep a screen's unsent fields for the signed-in person: restores once on
 * mount (into fields that are still empty), then writes on every change.
 * Call `clear()` when the server confirmed the send.
 */
export function useKeptDraft(
  surface: string,
  values: Fields,
  restore: (kept: Fields) => void,
): { clear: () => void } {
  const { state } = useAuth();
  const owner = state.status === "signed_in" ? state.session.userId : "";
  const ready = useRef(false);
  const restoreRef = useRef(restore);
  restoreRef.current = restore;

  useEffect(() => {
    ready.current = false;
    if (!owner) return;
    let alive = true;
    void readDraft(surface, owner)
      .catch(() => null)
      .then((kept) => {
        if (!alive) return;
        if (kept) restoreRef.current(kept);
        ready.current = true;
      });
    return () => {
      alive = false;
    };
  }, [surface, owner]);

  const serialized = JSON.stringify(values);
  useEffect(() => {
    if (!owner || !ready.current) return;
    writeDraft(surface, owner, JSON.parse(serialized) as Fields);
  }, [surface, owner, serialized]);

  const clear = useCallback(() => clearDraft(surface), [surface]);
  return { clear };
}
