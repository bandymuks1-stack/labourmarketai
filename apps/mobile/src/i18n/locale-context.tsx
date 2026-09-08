import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { getLocales } from "expo-localization";

import {
  DEFAULT_LOCALE,
  isActiveLocale,
  isPreviewTranslation,
  resolveDeviceLocale,
  type ActiveLocale,
} from "@labourmarket/client-core";

import { preferenceStore } from "../preference-store";
import { MESSAGES, type MessageKey } from "./messages";

/**
 * LANGUAGE — the device's, until the person says otherwise.
 *
 * Which languages exist, which may be offered, and which must be labelled as
 * unverified are all decided in `@labourmarket/client-core/locales`, mirrored
 * from the web app's canonical list and pinned by a guard in the required
 * merge gate. This file chooses and remembers; it does not get an opinion
 * about the set.
 *
 * A worker who has set their phone to Russian should not have to find a
 * language menu before they can read the first screen. So the device's own
 * ordered preference list decides, and the menu exists for the case where the
 * phone and the person disagree.
 */

const LOCALE_PREFERENCE_KEY = "labourmarket.locale.v1";

export type LocaleContextValue = {
  readonly locale: ActiveLocale;
  /** True while this language is an unreviewed translation (doctrine §7.4). */
  readonly isPreview: boolean;
  t(key: MessageKey): string;
  setLocale(next: ActiveLocale): Promise<void>;
};

const LocaleContext = createContext<LocaleContextValue | null>(null);

function deviceLocale(): ActiveLocale {
  try {
    const tags = getLocales()
      .map((l) => l.languageTag)
      .filter((tag): tag is string => typeof tag === "string");
    return resolveDeviceLocale(tags);
  } catch {
    // A device that will not report its locale is not a reason to fail.
    return DEFAULT_LOCALE;
  }
}

export function LocaleProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = useState<ActiveLocale>(deviceLocale);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const stored = await preferenceStore.get(LOCALE_PREFERENCE_KEY);
      // A stored value that is no longer active — because the language was
      // withdrawn — falls back to the device rather than to a blank screen.
      if (!cancelled && stored !== null && isActiveLocale(stored)) {
        setLocaleState(stored);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const setLocale = useCallback(async (next: ActiveLocale) => {
    // The UI changes first. Remembering the choice is a convenience, and a
    // storage failure must not make the language control look broken.
    setLocaleState(next);
    await preferenceStore.set(LOCALE_PREFERENCE_KEY, next);
  }, []);

  const value = useMemo<LocaleContextValue>(() => {
    const catalogue = MESSAGES[locale];
    return {
      locale,
      isPreview: isPreviewTranslation(locale),
      // Every catalogue is typed `Record<MessageKey, string>`, so a missing
      // translation is a typecheck failure rather than a key rendered raw on
      // somebody's phone. There is no runtime fallback because there is
      // nothing for it to fall back from.
      t: (key) => catalogue[key],
      setLocale,
    };
  }, [locale, setLocale]);

  return (
    <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>
  );
}

export function useLocale(): LocaleContextValue {
  const value = useContext(LocaleContext);
  if (value === null) {
    throw new Error("useLocale must be used inside <LocaleProvider>");
  }
  return value;
}
