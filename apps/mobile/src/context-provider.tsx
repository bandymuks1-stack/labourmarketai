import React, { createContext, useCallback, useContext, useMemo } from "react";

import {
  holdingsFromHeldRoles,
  initialSelection,
  type ContextHoldings,
  type ContextSelection,
  type ParticipationMode,
} from "@labourmarket/client-core";

import { TRANSPORT_STATUS } from "./domain";
import { useProfile } from "./profile-provider";
import { useLocale } from "./i18n/locale-context";

/**
 * WHICH CONTEXT THE PERSON IS ACTING IN — one person, many contexts (I-1).
 *
 * The selection rules live in `@labourmarket/client-core/actor-context` and
 * are unit-tested there. This file uses only the part that applies today —
 * `initialSelection`, which opens on a person's single context and chooses
 * NOTHING when they hold several. The rest of that module (restoring a
 * remembered choice, `selectContext`) waits for a selection that actually
 * reaches a request; see the note below on why there is no switcher.
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
 *
 * ## It REPORTS. It does not switch, and that is deliberate.
 *
 * The first version of this shipped a pressable list that marked a mode
 * active and remembered the choice. Nothing came of it: `useActorContext` is
 * read by the Settings screen alone, Today / Journal / Profile issue the same
 * requests whatever is selected, and the selection was never written to
 * `profiles.active_role` either. So the control told a person they were acting
 * as a company and changed nothing, anywhere — a claim about their account
 * that the product did not honour, which is worse than an absent feature.
 *
 * Caught in review on #1737. The read stays, because seeing which roles an
 * account holds was genuinely impossible on a phone before it; the affordance
 * is gone until a selection actually reaches a request. Restoring it means
 * writing the active role server-side AND making the other surfaces read it —
 * at which point the selection rules in `client-core/actor-context`
 * (`selectContext`, the remembered choice) are waiting and already tested.
 */

export type ContextValue = ContextSelection;

const ActorContextContext = createContext<ContextValue | null>(null);

export function ActorContextProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const { t } = useLocale();
  // THE SHARED read — `ProfileProvider` owns the one `profile.get` this
  // session makes. Calling `useCapability` here would add a second request per
  // launch, which is exactly what an earlier version of this file did while
  // claiming otherwise.
  const profile = useProfile();

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

  // NO REMEMBERED SELECTION, and no switching — see the note above. With
  // nothing to remember there is also nothing to leak: the preference key was
  // global (`labourmarket.context.v1`), and sign-out clears only the session
  // store, so on a shared phone user A's remembered context would have been
  // restored for user B. Removing the control removed that too.
  const selection = useMemo<ContextSelection>(
    () => initialSelection(holdings, null),
    [holdings],
  );

  const value = useMemo<ContextValue>(() => selection, [selection]);

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
