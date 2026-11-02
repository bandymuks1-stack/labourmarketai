import React from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";

import type { ConversationListData } from "../../src/capability-shapes";
import { useLocale } from "../../src/i18n/locale-context";
import { traceTestId, useRequestTrace } from "../../src/request-trace";
import { CapabilityGate } from "../../src/screens/capability-gate";
import { ConversationList } from "../../src/screens/conversations";
import { Body, Title } from "../../src/ui/primitives";
import { theme } from "../../src/ui/theme";
import { useCapability } from "../../src/use-capability";
import { useReloadOnReturn } from "../../src/use-reload-on-return";

const PAGE = { limit: 30 } as const;

/**
 * MESSAGES — the caller's own in-app conversations, read through
 * `conversation.list` (the participants the server knows, under the caller's
 * RLS), newest activity first. A station reached from Today, not a tab.
 *
 * Push is OFF (owner decision: no vendor), so this list is read when the
 * person opens it and again whenever they come back to it.
 */
export default function Screen() {
  const { t } = useLocale();
  const router = useRouter();
  const read = useCapability<ConversationListData>("conversation.list", PAGE);
  useReloadOnReturn(read.reload);
  const trace = useRequestTrace();
  const readState =
    read.state.status === "failed" ? `failed-${read.state.failure.kind}` : read.state.status;

  return (
    <SafeAreaView style={styles.safe} edges={["bottom"]}>
      <ScrollView contentContainerStyle={styles.content}>
        <View testID={`messages-read-${readState}`}>
          <View testID={traceTestId(trace, "conversation.list")}>
            <Title>{t("messages.title")}</Title>
          </View>
        </View>
        <Body muted>{t("messages.intro")}</Body>
        <CapabilityGate state={read.state} reload={read.reload}>
          {(data) => (
            <View testID="messages-loaded">
              <ConversationList
                conversations={data.conversations}
                onOpen={(id) =>
                  router.push({ pathname: "/(shell)/conversation", params: { id } })
                }
              />
            </View>
          )}
        </CapabilityGate>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.color.background },
  content: { padding: theme.space.md, gap: theme.space.md },
});
