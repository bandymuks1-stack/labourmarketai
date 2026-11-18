import React, { useState } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams } from "expo-router";

import { useLocale } from "../../src/i18n/locale-context";
import { CandidatesScreen } from "../../src/screens/candidates";
import { Title } from "../../src/ui/primitives";
import { theme } from "../../src/ui/theme";

/** A need id as the route carries it, or null. */
function needParam(value: string | string[] | undefined): string | null {
  const v = Array.isArray(value) ? value[0] : value;
  return typeof v === "string" && /^[0-9a-f-]{36}$/i.test(v) ? v : null;
}

/**
 * FIND CANDIDATES — reached from Today (employer workspace); hidden from the
 * tab bar and inside the shell's auth gate. `?need=<id>` opens one need's
 * candidates directly (a link from a notification or the web).
 */
export default function Screen() {
  const { t } = useLocale();
  const params = useLocalSearchParams<{ need?: string }>();
  const [needId, setNeedId] = useState<string | null>(needParam(params.need));
  return (
    <SafeAreaView style={styles.safe} edges={["bottom"]}>
      <ScrollView contentContainerStyle={styles.content}>
        <View testID="candidates-title">
          <Title>{t("candidates.title")}</Title>
        </View>
        <CandidatesScreen needId={needId} onPickNeed={setNeedId} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.color.background },
  content: { padding: theme.space.md, gap: theme.space.md },
});
