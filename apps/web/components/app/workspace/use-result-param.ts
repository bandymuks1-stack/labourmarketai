"use client";

import { useCallback, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { isResultKind, type ResultKind } from "@/lib/conversation/result-registry";

/**
 * The `?result=` deep link — the workspace's result state, in the URL.
 *
 * WHY THE URL AND NOT WORLD STATE. `AI_OPERATOR_ACTIONS` in
 * `lib/product-gate/world-state.ts` is an OWNER LOCK with exactly six verbs
 * (`change_world_state`, `update_map`, `open_object`, `close_object`,
 * `show_information`, `return_to_conversation`). Adding an `open_result` verb
 * would edit that lock, which is an owner decision, not an implementation
 * detail — so this work does not touch it. See the delivery notes: promoting
 * results into the operator alphabet is listed as an open owner decision.
 *
 * The URL is the honest alternative and it buys something the lock would not:
 * a result survives reload and can be shared, which is what the blueprint's
 * deep-link requirement actually asked for.
 *
 * NOT NAVIGATION. `replace` with `scroll: false` on the SAME route only edits
 * the query string — no page transition, no remount of the conversation. The
 * Context Panel itself stays completely free of routing (its guard forbids
 * `useRouter` / `<Link>`), which is why this hook lives out here in the
 * workspace layer and reaches the panel as plain props.
 */
export function useResultParam(): {
  /** The valid result kind in the URL, or null. An unknown value is ignored. */
  result: ResultKind | null;
  /** Show a result — replaces the query, never pushes a new page. */
  openResult: (kind: ResultKind) => void;
  /** Drop the result — the conversation keeps its summary card. */
  closeResult: () => void;
} {
  const router = useRouter();
  const params = useSearchParams();

  // An invented or stale `?result=` value must never render. Validating here
  // means every consumer receives either a real kind or null.
  const raw = params?.get("result") ?? null;
  const result = useMemo<ResultKind | null>(
    () => (isResultKind(raw) ? raw : null),
    [raw],
  );

  const write = useCallback(
    (next: string | null) => {
      const q = new URLSearchParams(params?.toString() ?? "");
      if (next === null) q.delete("result");
      else q.set("result", next);
      const qs = q.toString();
      router.replace(qs ? `?${qs}` : "?", { scroll: false });
    },
    [params, router],
  );

  const openResult = useCallback((kind: ResultKind) => write(kind), [write]);
  const closeResult = useCallback(() => write(null), [write]);

  return { result, openResult, closeResult };
}
