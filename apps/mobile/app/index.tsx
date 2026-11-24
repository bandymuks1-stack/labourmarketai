import React from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Redirect } from "expo-router";

import { useAuth } from "../src/auth-context";
import { useLocale } from "../src/i18n/locale-context";
import { Body, Button, NotAvailable, Screen } from "../src/ui/primitives";
import { theme } from "../src/ui/theme";

/**
 * The entry gate — four auth states, four different destinations.
 *
 * The one that matters is `unavailable`. A client that treated "we could not
 * read the keychain" as "you are signed out" would drop a signed-in person on
 * a login screen because their phone briefly refused to open its secure
 * storage. They would type their password, it would work, and they would learn
 * that this app randomly logs them out. It does not: it says it could not
 * check, and offers to check again.
 */
export default function Index() {
  const { state, retry } = useAuth();
  const { t } = useLocale();

  switch (state.status) {
    case "unknown":
      return (
        <View style={styles.centre}>
          <ActivityIndicator color={theme.color.accent} />
          <Body muted>{t("auth.checking")}</Body>
        </View>
      );
    case "signed_in":
      return <Redirect href="/(shell)/today" />;
    case "signed_out":
      return <Redirect href="/sign-in" />;
    case "unavailable":
      return (
        <SafeAreaView style={styles.safe}>
          <Screen>
            <NotAvailable
              tone="warning"
              title={t("session.unavailable.title")}
              body={t("session.unavailable.body")}
            />
            <Button
              testID="session-retry"
              label={t("session.unavailable.retry")}
              onPress={() => void retry()}
            />
          </Screen>
        </SafeAreaView>
      );
  }
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.color.background },
  centre: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: theme.space.md,
    backgroundColor: theme.color.background,
  },
});
