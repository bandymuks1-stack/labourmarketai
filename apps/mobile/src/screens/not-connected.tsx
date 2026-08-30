import React from "react";
import { Linking, ScrollView, StyleSheet } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { CONFIG } from "../config";
import { TRANSPORT_STATUS } from "../domain";
import { useLocale } from "../i18n/locale-context";
import { Body, Button, NotAvailable, Title } from "../ui/primitives";
import { theme } from "../ui/theme";

/**
 * WHAT A SCREEN SHOWS WHEN IT CANNOT ASK.
 *
 * Today, Work journal and Profile all need the canonical domain, and the
 * canonical domain is not reachable from a phone yet — one owner-gated seam,
 * measured and recorded in `docs/APP_READINESS_MAP.md` §2.
 *
 * Three things this deliberately does NOT do:
 *
 *   - It does not render an empty list. An empty list means "you have nothing
 *     recorded", and the truth is "we could not ask".
 *   - It does not show sample content. Doctrine §18: nothing unmarked may look
 *     like platform data, and a placeholder that has to be labelled is worth
 *     less than a sentence that is simply true.
 *   - It does not spin forever. A spinner with nothing behind it is a lie told
 *     slowly.
 *
 * It offers the website instead, because the website works today and the
 * person came here to get something done.
 */
export function NotConnectedScreen({ heading }: { heading: string }) {
  const { t } = useLocale();
  const website = CONFIG?.apiBaseUrl ?? null;

  return (
    <SafeAreaView style={styles.safe} edges={["bottom"]}>
      <ScrollView contentContainerStyle={styles.content}>
        <Title>{heading}</Title>
        <NotAvailable
          title={t("notConnected.title")}
          body={t("notConnected.body")}
        />
        {/* The exact reason, from the shared package, so this screen and the
            architecture document can never disagree about why. */}
        {!TRANSPORT_STATUS.open ? (
          <Body muted>{TRANSPORT_STATUS.because}</Body>
        ) : null}
        {website !== null ? (
          <Button
            variant="quiet"
            testID="open-website"
            label={t("notConnected.useWeb")}
            onPress={() => {
              void Linking.openURL(website);
            }}
          />
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.color.background },
  content: { padding: theme.space.md, gap: theme.space.md },
});
