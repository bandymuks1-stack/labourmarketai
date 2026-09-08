import React from "react";
import { StyleSheet } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";

import { useLocale } from "../src/i18n/locale-context";
import { Button, NotAvailable, Screen, Title } from "../src/ui/primitives";
import { theme } from "../src/ui/theme";

/**
 * WHERE AN UNKNOWN DEEP LINK LANDS.
 *
 * `app.json` registers the `labourmarketai://` scheme, so anything can hand
 * this app a URL: a notification, a shared link, an old email, a typo. Most of
 * the platform's links are WEB links for routes this client does not have —
 * there are four screens here and roughly forty on the web dashboard — so an
 * unmatched route is not an edge case, it is the normal outcome of a link that
 * was written for the website.
 *
 * Without this file expo-router renders its own built-in unmatched screen:
 * English regardless of the person's language, off-theme, and worded for a
 * developer looking at a route table. A worker who tapped a link would be told
 * "Unmatched Route" and left there.
 *
 * So: the app's own words, in the app's own language, saying which of the two
 * true things happened (the link is for the website, or it is out of date) —
 * and a way back that goes through the auth gate at `app/index.tsx` rather
 * than guessing a destination. It states that nothing was sent, because a
 * person following a link they did not expect deserves to know their tap did
 * not do anything.
 */
export default function NotFound() {
  const { t } = useLocale();
  const router = useRouter();

  return (
    <SafeAreaView style={styles.safe}>
      <Screen>
        <Title>{t("route.notFound.title")}</Title>
        <NotAvailable
          testID="route-not-found"
          title={t("app.name")}
          body={t("route.notFound.body")}
        />
        <Button
          testID="not-found-home"
          label={t("route.notFound.action")}
          // The entry gate, not a tab: it re-reads the auth state and sends a
          // signed-out person to sign-in and a signed-in one to Today. A
          // button that pushed a tab directly would drop somebody signed out
          // onto a screen that can only refuse them.
          onPress={() => router.replace("/")}
        />
      </Screen>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.color.background },
});
