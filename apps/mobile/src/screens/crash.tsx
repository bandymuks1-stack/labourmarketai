import React from "react";
import { StyleSheet } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { getLocales } from "expo-localization";

import { DEFAULT_LOCALE, resolveDeviceLocale } from "@labourmarket/client-core";

import { MESSAGES } from "../i18n/messages";
import { Button, NotAvailable, Screen, Title } from "../ui/primitives";
import { theme } from "../ui/theme";

/**
 * THE LAST HONEST SCREEN — what a person sees when the app itself breaks.
 *
 * A React render error with no boundary above it unmounts the whole tree. On a
 * release build that is a blank screen with no explanation and no way out; the
 * person is left deciding whether their work was saved. This says the three
 * things they actually need: it is the app's fault, nothing was sent, and here
 * is how to get moving again.
 *
 * ## Why it reads the language itself
 *
 * This renders ABOVE `LocaleProvider` — it has to, because a fault inside the
 * provider tree is exactly the case it exists for, and a boundary that needed
 * its own children to be working would never render. So it resolves the
 * DEVICE's language through the same shared function the provider uses, rather
 * than the language a person may have chosen in Settings. For someone whose
 * phone and preference disagree this is the wrong one of their two languages —
 * which is a great deal better than English for everybody, and better than a
 * white screen for anybody.
 *
 * It shows no error text. `misconfigured.tsx` states the rule this follows:
 * an error screen is a screenshot waiting to happen, and a JavaScript error
 * message is not a string this app has read, sanitised, or can promise carries
 * nobody's data.
 */
export function CrashScreen({ retry }: { retry: () => void }) {
  const catalogue = MESSAGES[deviceLocale()];

  return (
    <SafeAreaView style={styles.safe}>
      <Screen>
        <Title>{catalogue["crash.title"]}</Title>
        <NotAvailable
          tone="warning"
          testID="app-crash"
          title={catalogue["app.name"]}
          body={catalogue["crash.body"]}
        />
        <Button
          testID="crash-retry"
          label={catalogue["domain.retry"]}
          onPress={retry}
        />
      </Screen>
    </SafeAreaView>
  );
}

function deviceLocale() {
  try {
    return resolveDeviceLocale(
      getLocales()
        .map((l) => l.languageTag)
        .filter((tag): tag is string => typeof tag === "string"),
    );
  } catch {
    // Whatever just broke may well be why the locale module is unhappy too.
    // A default language is not a reason to fail a second time.
    return DEFAULT_LOCALE;
  }
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.color.background },
});
