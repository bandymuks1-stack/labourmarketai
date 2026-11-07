"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { mergeSavedRows, pruneSavedRows, type LocalRows } from "@/lib/worker/saved-rows";

/** The server's rows plus what the server just confirmed; see `saved-rows.ts`. */
export function useSavedRows<T extends { readonly id: string }>(server: readonly T[]) {
  const [local, setLocal] = useState<LocalRows<T>>({ saved: [], removed: [] });

  useEffect(() => {
    setLocal((current) => pruneSavedRows(server, current));
  }, [server]);

  const showSaved = useCallback((row: T) => {
    setLocal((c) => ({ ...c, saved: [...c.saved.filter((r) => r.id !== row.id), row] }));
  }, []);
  const hideRemoved = useCallback((id: string) => {
    setLocal((c) => ({ ...c, removed: [...c.removed, id] }));
  }, []);

  const rows = useMemo(() => mergeSavedRows(server, local), [server, local]);
  return { rows, showSaved, hideRemoved };
}
