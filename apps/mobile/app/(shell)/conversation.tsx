import React, { useCallback, useEffect, useRef } from "react";
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
  // A thread opens at its newest message, where the reply box is — as any
  // chat does; with a long thread the box would otherwise sit far below.
  // ONLY when the thread is shown or gains a message: not on every size
  // change, or the screen jumps under the person's finger while the reply
  // box grows with their typing.
  const scroll = useRef<ScrollView>(null);
  const toEnd = useRef(false);
  const scrollToEnd = useCallback(() => {
    toEnd.current = true;
  }, []);

  return (
    <SafeAreaView style={styles.safe} edges={["bottom"]}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          ref={scroll}
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          onContentSizeChange={() => {
            if (!toEnd.current) return;
            toEnd.current = false;
            scroll.current?.scrollToEnd({ animated: false });
          }}
        >
          {typeof id === "string" && id !== "" ? (
            <Thread key={id} conversationId={id} scrollToEnd={scrollToEnd} />
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

function Thread({
  conversationId,
  scrollToEnd,
}: {
  conversationId: string;
  /** Ask the screen to show the end once the new layout is measured. */
  scrollToEnd: () => void;
}) {
  const { t } = useLocale();
  const read = useCapability<ConversationGetData>("conversation.get", {
    conversationId,
    limit: THREAD_LIMIT,
  });
  useReloadOnReturn(read.reload);
  const shownLastMessageId =
    read.state.status === "loaded" ? (read.state.data.messages.at(-1)?.id ?? "none") : null;
  useEffect(() => {
    if (shownLastMessageId !== null) scrollToEnd();
  }, [shownLastMessageId, scrollToEnd]);

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
      <MessageComposer
        conversationId={conversationId}
        shownLastMessageId={shownLastMessageId}
        reloadThread={read.reload}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.color.background },
  flex: { flex: 1 },
  content: { padding: theme.space.md, gap: theme.space.md },
  stack: { gap: theme.space.md },
});
