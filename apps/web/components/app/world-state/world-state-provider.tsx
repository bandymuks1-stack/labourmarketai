"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useReducer,
  type ReactNode,
} from "react";

import {
  INITIAL_WORLD_STATE,
  worldStateReducer,
  type EntityRef,
  type WorldState,
  type WorldStateAction,
} from "@/lib/world-state/world-state";

/**
 * WORLD STATE, mounted (W3).
 *
 * The three parts of the workspace — conversation, panel and (from W6) map —
 * share ONE state. This provider is where that state lives while a person is
 * using the product.
 *
 * It holds the reducer and nothing else: no fetching, no routing, no storage.
 * The reducer is pure and lives in `lib/world-state/world-state.ts`, so "the AI
 * may never change the page" is enforced by the alphabet of actions rather than
 * by review — there is no action that could navigate.
 */

type WorldStateContextValue = {
  readonly state: WorldState;
  readonly dispatch: (action: WorldStateAction) => void;
  /** Convenience: the two transitions every caller needs. */
  readonly openEntity: (ref: EntityRef) => void;
  readonly closeEntity: () => void;
};

const WorldStateContext = createContext<WorldStateContextValue | null>(null);

export function WorldStateProvider({
  children,
  avatarId = null,
}: {
  children: ReactNode;
  /** Whose world this is, when the auth context already knows. */
  avatarId?: string | null;
}) {
  const [state, dispatch] = useReducer(worldStateReducer, {
    ...INITIAL_WORLD_STATE,
    activeAvatarId: avatarId,
  });

  const openEntity = useCallback(
    (ref: EntityRef) => dispatch({ kind: "open_object", ref }),
    [],
  );
  const closeEntity = useCallback(() => dispatch({ kind: "close_object" }), []);

  const value = useMemo(
    () => ({ state, dispatch, openEntity, closeEntity }),
    [state, openEntity, closeEntity],
  );

  return <WorldStateContext.Provider value={value}>{children}</WorldStateContext.Provider>;
}

/**
 * The world, or `null` outside the workspace.
 *
 * Optional on purpose: a component that renders both inside the workspace and
 * in an isolated preview must degrade to "no selection possible" rather than
 * crash. A missing provider is never treated as an empty world.
 */
export function useWorldStateOptional(): WorldStateContextValue | null {
  return useContext(WorldStateContext);
}

export function useWorldState(): WorldStateContextValue {
  const ctx = useContext(WorldStateContext);
  if (!ctx) {
    throw new Error("useWorldState must be used inside <WorldStateProvider>");
  }
  return ctx;
}
