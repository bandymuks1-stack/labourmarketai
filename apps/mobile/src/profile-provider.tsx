import React, { createContext, useContext } from "react";

import type { ProfileGetData } from "./capability-shapes";
import { useCapability, type CapabilityState } from "./use-capability";

/**
 * ONE `profile.get` PER SIGNED-IN SESSION.
 *
 * `useCapability` holds no shared cache, so every component that called
 * `profile.get` issued its own HTTP request. Three did — Today, Profile, and
 * the actor-context provider — which on a phone launch meant three round trips
 * for one answer, each of them now costing three database reads since the
 * capability also carries the account's held roles.
 *
 * The comment that shipped with the third caller claimed the holdings "ride a
 * request the client performs anyway". They did not: they added one. This
 * provider is what makes that sentence true, rather than the sentence being
 * quietly dropped.
 *
 * It owns the read and nothing else. Every consumer still renders its OWN
 * loading, failed and empty states from the same `CapabilityState` union, so
 * the honesty rules are unchanged — a failure is still a failure at each
 * surface, never an empty list.
 */
export type ProfileValue = {
  readonly state: CapabilityState<ProfileGetData>;
  readonly reload: () => void;
};

const ProfileContext = createContext<ProfileValue | null>(null);

export function ProfileProvider({ children }: { readonly children: React.ReactNode }) {
  const { state, reload } = useCapability<ProfileGetData>("profile.get");
  return (
    <ProfileContext.Provider value={{ state, reload }}>{children}</ProfileContext.Provider>
  );
}

export function useProfile(): ProfileValue {
  const value = useContext(ProfileContext);
  if (value === null) {
    throw new Error("useProfile must be used inside <ProfileProvider>");
  }
  return value;
}
