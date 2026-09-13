import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  contextKey,
  holdingsFromHeldRoles,
  initialSelection,
  selectContext,
  type ActorContext,
  type ContextHoldings,
  type ContextSelection,
  type ParticipationMode,
} from "@labourmarket/client-core";

import type { ProfileGetData } from "./capability-shapes";
import { preferenceStore } from "./preference-store";
import { TRANSPORT_STATUS } from "./domain";
import { useCapability } from "./use-capability";
import { useLocale } from "./i18n/locale-context";

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
 * Holdings are read from the backend under RLS — no client may cache them as
 * a claim about authority. That read is WIRED now: `profile.get` carries the
 * account's held roles beside the single `activeRole`, and
 * `holdingsFromHeldRoles` (client-core, unit-tested without a phone) maps them
 * to the contexts this client can actually open.
 *
 * It would have been easy to seed `["worker"]` and move on. That would tell a
 * manager of three companies that they are only a worker — a fabricated claim
 * about a real person's account, on the strength of nothing. It is equally
 * easy to render a FAILED read as an empty set, which says the same false
 * thing more quietly; that one was live on the web shell on 2026-08-28. Both
 * are refused here: `unavailable` survives as `unavailable`, and an empty
 * KNOWN set is an answer rather than a failure.
 *
 * WHAT THIS AXIS IS NOT. A held mode says WHAT a person may do. WHICH
 * organization they do it for is the workspace axis — `context.list`, shown
 * separately in Settings. `organizationId` is null on every context built
 * here, because a role row does not name an organization and inventing one
 * would be the SEP-5 collapse this client already refuses elsewhere.
 */

export type ContextValue = ContextSelection & {
  switchTo(next: ActorContext): void;
};

const ActorContextContext = createContext<ContextValue | null>(null);

const CONTEXT_PREFERENCE_KEY = "labourmarket.context.v1";

export function ActorContextProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const { t } = useLocale();
  // `profile.get` is already the first read every signed-in session makes, so
  // the holdings ride a request the client performs anyway rather than adding
  // one to every launch.
  const profile = useCapability<ProfileGetData>("profile.get");

  const modeLabel = useCallback(
    (mode: ParticipationMode) => t(`context.mode.${mode}` as never),
    [t],
  );

  const holdings = useMemo<ContextHoldings>(() => {
    // Narrowed in place: `TransportStatus` carries `because` only on the
    // closed arm, and that reason is the honest one to show.
    if (!TRANSPORT_STATUS.open) {
      return { status: "unavailable", because: TRANSPORT_STATUS.because };
    }
    // LOADING IS `unknown`, NOT an empty set. A screen must not render "you
    // hold nothing" for the moment before the answer arrives.
    if (profile.state.status === "loading") return { status: "unknown" };
    if (profile.state.status === "failed") {
      return { status: "unavailable", because: "the profile read did not answer" };
    }
    return holdingsFromHeldRoles(profile.state.data.heldRoles, modeLabel);
  }, [profile.state, modeLabel]);

  const [selection, setSelection] = useState<ContextSelection>(() =>
    initialSelection(holdings, null),
  );

  // The holdings arrive after the first render, so the selection is rebuilt
  // when they do — restoring the person's remembered context if they hold it,
  // and choosing NOTHING when they hold several (guessing would put someone
  // into an employer view when they opened the app to log their own hours).
  useEffect(() => {
    let live = true;
    void (async () => {
      const remembered = await preferenceStore.get(CONTEXT_PREFERENCE_KEY);
      if (!live) return;
      setSelection(initialSelection(holdings, remembered ?? null));
    })();
    return () => {
      live = false;
    };
  }, [holdings]);

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
