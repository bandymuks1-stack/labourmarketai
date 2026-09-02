import React, {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";

import {
  contextKey,
  initialSelection,
  selectContext,
  type ActorContext,
  type ContextHoldings,
  type ContextSelection,
} from "@labourmarket/client-core";

import { preferenceStore } from "./preference-store";
import { TRANSPORT_STATUS } from "./domain";

/**
 * WHICH CONTEXT THE PERSON IS ACTING IN — one person, many contexts (I-1).
 *
 * The selection rules (restore what they used last, do not guess between
 * several, refuse a context they do not hold) are in
 * `@labourmarket/client-core/actor-context` and unit-tested there. This is the
 * React wiring plus one honest fact.
 *
 * ## The honest fact
 *
 * Holdings are read from the backend under RLS — `profile_roles`,
 * `company_workers`, `organization_capabilities` and the relationship tables
 * decide them, and no client may cache them as a claim about authority. The
 * canonical transport is open now (`/api/mcp`, bearer seam #1331), but this
 * client has not yet wired the holdings read — so holdings are `unknown`, and
 * the UI says it cannot list contexts yet. Wiring it (via `context.switch`'s
 * choice flow or a dedicated read) is its own slice.
 *
 * It would have been easy to seed `["worker"]` and move on. That would tell a
 * manager of three companies that they are only a worker — a fabricated claim
 * about a real person's account, on the strength of nothing.
 */

export type ContextValue = ContextSelection & {
  switchTo(next: ActorContext): void;
};

const ActorContextContext = createContext<ContextValue | null>(null);

const CONTEXT_PREFERENCE_KEY = "labourmarket.context.v1";

function currentHoldings(): ContextHoldings {
  if (!TRANSPORT_STATUS.open) {
    return { status: "unavailable", because: TRANSPORT_STATUS.because };
  }
  // The transport is open, but this provider does not perform the holdings
  // read yet — that is the next slice, and it brings a real loading state
  // with it. `unknown` keeps the UI honest in the meantime: it renders
  // "we cannot list your contexts yet", never an invented single context.
  return { status: "unknown" };
}

export function ActorContextProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [selection, setSelection] = useState<ContextSelection>(() =>
    initialSelection(currentHoldings(), null),
  );

  const switchTo = useCallback((next: ActorContext) => {
    setSelection((current) => {
      const updated = selectContext(current, next);
      if (updated.active !== null) {
        void preferenceStore.set(CONTEXT_PREFERENCE_KEY, contextKey(updated.active));
      }
      return updated;
    });
  }, []);

  const value = useMemo<ContextValue>(
    () => ({ ...selection, switchTo }),
    [selection, switchTo],
  );

  return (
    <ActorContextContext.Provider value={value}>
      {children}
    </ActorContextContext.Provider>
  );
}

export function useActorContext(): ContextValue {
  const value = useContext(ActorContextContext);
  if (value === null) {
    throw new Error("useActorContext must be used inside <ActorContextProvider>");
  }
  return value;
}
