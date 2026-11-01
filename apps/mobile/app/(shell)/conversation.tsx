import React from "react";
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams } from "expo-router";

import type { ConversationGetData } from "../../src/capability-shapes";
import { useLocale } from "../../src/i18n/locale-context";
import { CapabilityGate } from "../../src/screens/capability-gate";
import { MessageThread } from "../../src/screens/conversations";
import { MessageComposer } from "../../src/screens/message-composer";
import { Divider, NotAvailable, Title } from "../../src/ui/primitives";
import { theme } from "../../src/ui/theme";
import { useCapability } from "../../src/use-capability";
import { useReloadOnReturn } from "../../src/use-reload-on-return";

/**
 * ONE CONVERSATION — its latest messages (`conversation.get`, oldest first,
 * each marked as mine or not) and a reply box (`message.send_draft` →
 * `message.send_confirm`). A conversation the caller is not part of reads as
 * not found: the server decides, under the caller's RLS.
 */
export default function Screen() {
  const { t } = useLocale();
  const { id } = useLocalSearchParams<{ id?: string }>();

  return (
    <SafeAreaView style={styles.safe} edges={["bottom"]}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
        >
          {typeof id === "string" && id !== "" ? (
            <Thread key={id} conversationId={id} />
          ) : (
            <NotAvailable
              testID="conversation-missing"
              title={t("messages.title")}
              body={t("messages.notFound")}
            />
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const THREAD_LIMIT = 50;

function Thread({ conversationId }: { conversationId: string }) {
  const { t } = useLocale();
  const read = useCapability<ConversationGetData>("conversation.get", {
    conversationId,
    limit: THREAD_LIMIT,
  });
  useReloadOnReturn(read.reload);

  return (
    <View style={styles.stack}>
      <CapabilityGate
        state={read.state}
        reload={read.reload}
        refusalText={(code) => (code === "not_found" ? t("messages.notFound") : null)}
      >
        {(data) => (
          <View style={styles.stack} testID="conversation-loaded">
            {/* A plain, non-input spot: tapping it puts the keyboard away. */}
            <View testID="conversation-title">
              <Title>{data.conversation.subject ?? t("messages.untitled")}</Title>
            </View>
            <MessageThread messages={data.messages} />
          </View>
        )}
      </CapabilityGate>
      <Divider />
      <MessageComposer conversationId={conversationId} onSent={read.reload} />
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.color.background },
  flex: { flex: 1 },
  content: { padding: theme.space.md, gap: theme.space.md },
  stack: { gap: theme.space.md },
});
