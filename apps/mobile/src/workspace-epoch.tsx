import React, { createContext, useCallback, useContext, useMemo, useState } from "react";

/**
 * Which workspace generation the reads belong to.
 *
 * The tab stations stay mounted, so a read made while acting for one
 * workspace would keep showing after `context.switch` moved the person to
 * another: a personal-workspace refusal on Who is free, or the previous
 * organization's roster. Every `useCapability` read depends on this number,
 * and Settings bumps it after a switch the server confirmed, so each mounted
 * station reads again for the workspace the person now acts for.
 */
type WorkspaceEpoch = { readonly epoch: number; readonly bump: () => void };

const WorkspaceEpochContext = createContext<WorkspaceEpoch>({ epoch: 0, bump: () => undefined });

export function WorkspaceEpochProvider({ children }: { children: React.ReactNode }) {
  const [epoch, setEpoch] = useState(0);
  const bump = useCallback(() => setEpoch((n) => n + 1), []);
  const value = useMemo(() => ({ epoch, bump }), [epoch, bump]);
  return <WorkspaceEpochContext.Provider value={value}>{children}</WorkspaceEpochContext.Provider>;
}

export function useWorkspaceEpoch(): WorkspaceEpoch {
  return useContext(WorkspaceEpochContext);
}
