"use client";

import { useEffect, type MutableRefObject } from "react";

import { useWorldState } from "./world-state-provider";
import type { EntityRef } from "@/lib/world-state/world-state";

/**
 * The AI's hand on World State (W4).
 *
 * The conversation's send handler has to be able to say "open this entity" —
 * that is the whole point of the AI-first workspace: the assistant changes
 * World State instead of navigating. But the handler is defined in the chat
 * component, which renders the World State provider as part of its own tree, so
 * it sits ABOVE the context and cannot call the hook.
 *
 * This is the adapter for exactly that: it mounts INSIDE the provider, reads
 * the context the normal way, and publishes the two transitions the AI is
 * allowed to make into a ref the handler already holds. It renders nothing.
 *
 * DELIBERATELY NARROW. It exposes `openEntity` and `closeEntity` and nothing
 * else — not `dispatch`, not the state. The AI can open and close objects, and
 * that is the entire surface it gets: `AI_MAY_NEVER_CHANGE` is easier to keep
 * when the page and the route were never reachable from here in the first
 * place.
 */
export type AiWorldStateHandle = {
  readonly openEntity: (ref: EntityRef) => void;
  readonly closeEntity: () => void;
};

export function AiWorkspaceBridge({
  bind,
}: {
  bind: MutableRefObject<AiWorldStateHandle | null>;
}) {
  const { openEntity, closeEntity } = useWorldState();

  useEffect(() => {
    bind.current = { openEntity, closeEntity };
    return () => {
      bind.current = null;
    };
  }, [bind, openEntity, closeEntity]);

  return null;
}
