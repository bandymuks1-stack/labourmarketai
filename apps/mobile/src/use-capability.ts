import { useCallback, useEffect, useMemo, useState } from "react";

import type { DomainFailure } from "@labourmarket/client-core";

import { useAuth } from "./auth-context";
import { capability } from "./domain";
import { useLocale } from "./i18n/locale-context";

/**
 * One capability read, as React state — presentation wiring only.
 *
 * Three states and not a fourth: a screen is asking, has an answer, or has a
 * failure it must show. There is no "empty" state here because emptiness is a
 * property of the DATA (`entries.length === 0`), never of the read — the
 * #1314 rule. A failed read renders as a failure, and only a successful read
 * containing a genuinely empty list may say "nothing recorded yet".
 */
export type CapabilityState<T> =
  | { readonly status: "loading" }
  | { readonly status: "loaded"; readonly data: T }
  | { readonly status: "failed"; readonly failure: DomainFailure };

export function useCapability<T>(
  name: string,
  args?: Record<string, unknown>,
): { state: CapabilityState<T>; reload: () => void } {
  const { accessToken } = useAuth();
  const { locale } = useLocale();
  const [state, setState] = useState<CapabilityState<T>>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);

  // Serialized so a caller passing a fresh object literal each render does not
  // refetch forever.
  const argsKey = useMemo(() => JSON.stringify(args ?? {}), [args]);

  useEffect(() => {
    let cancelled = false;
    setState({ status: "loading" });
    void (async () => {
      const result = await capability<T>({
        name,
        args: JSON.parse(argsKey) as Record<string, unknown>,
        accessToken,
        locale,
      });
      if (cancelled) return;
      setState(
        result.ok
          ? { status: "loaded", data: result.data }
          : { status: "failed", failure: result.failure },
      );
    })();
    return () => {
      cancelled = true;
    };
  }, [name, argsKey, accessToken, locale, attempt]);

  const reload = useCallback(() => setAttempt((n) => n + 1), []);
  return { state, reload };
}
