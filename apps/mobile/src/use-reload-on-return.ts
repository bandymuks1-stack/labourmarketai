import { useCallback, useRef } from "react";
import { useFocusEffect } from "expo-router";

/**
 * Read a station again when the person comes BACK to it.
 *
 * Stations stay mounted in the Tabs navigator, so a read made on the first
 * visit would otherwise stand for good: a worker assigned on the website
 * since would still show as free, a board that was empty would stay empty.
 * The first focus is skipped (the mount already read), and `when` lets a
 * station keep a draft in progress untouched.
 *
 * Screens only: it needs the navigator, so providers outside it must not use it.
 */
export function useReloadOnReturn(reload: () => void, when: () => boolean = () => true): void {
  const focusedBefore = useRef(false);
  const whenRef = useRef(when);
  whenRef.current = when;
  useFocusEffect(
    useCallback(() => {
      if (focusedBefore.current && whenRef.current()) reload();
      focusedBefore.current = true;
    }, [reload]),
  );
}
