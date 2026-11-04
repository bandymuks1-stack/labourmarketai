"use client";

import { createContext, useContext, type ReactNode } from "react";

/**
 * OPT-IN for the identity family's no-photo plate on the SHARED portrait.
 *
 * `PersonPortrait` is rendered by the signed-in product AND by the frozen
 * public landing (`work-world/primitives.tsx` → `PersonPresence`, the
 * lifecycle graph on /for-workers and /for-companies). The owner froze the
 * public landing until a separate approval (2026-10-14), so the D2 plate is
 * switched on ONLY where this provider is mounted — the signed-in dashboard
 * layout. Without it the portrait renders exactly main's legacy fallback.
 *
 * Pinned by lib/guards/identity-family-opt-in.test.ts: public routes never
 * mount the provider.
 */
const IdentityFamilyContext = createContext(false);

export function IdentityFamilyProvider({ children }: { readonly children: ReactNode }) {
  return <IdentityFamilyContext.Provider value>{children}</IdentityFamilyContext.Provider>;
}

/** True only beneath `IdentityFamilyProvider` (the signed-in product). */
export function useIdentityFamily(): boolean {
  return useContext(IdentityFamilyContext);
}
