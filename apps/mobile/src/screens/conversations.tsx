import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import type {
  ConversationListData,
  ConversationMessage,
} from "../capability-shapes";
import { useLocale } from "../i18n/locale-context";
import { Body } from "../ui/primitives";
import { theme } from "../ui/theme";

/**
 * In-app conversations and their messages, rendered as the server sent them.
 *
 * Nothing is re-ordered, merged or summarised here: `conversation.list` is
 * newest activity first and `conversation.get` is oldest message first, both
 * decided on the server. Times are shown in the device's own clock, because a
 * UTC stamp on a message someone sent "this morning" reads as a wrong time.
 */

/** A server timestamp in the device's local calendar and clock. */
export function localStamp(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(
    d.getHours(),
  )}:${pad(d.getMinutes())}`;
}

export function ConversationList({
  conversations,
  onOpen,
}: {
  conversations: ConversationListData["conversations"];
  onOpen: (conversationId: string) => void;
}) {
  const { t } = useLocale();
  if (conversations.length === 0) {
    // A LOADED, genuinely empty answer.
    return <Body muted>{t("messages.none")}</Body>;
  }
  return (
    <View style={styles.list}>
      {conversations.map((c, index) => (
        <Pressable
          key={c.conversationId}
          testID={`messages-open-${index}`}
          accessibilityRole="button"
          onPress={() => onOpen(c.conversationId)}
          style={({ pressed }) => [styles.row, pressed && styles.pressed]}
        >
          <Text style={styles.meta}>{localStamp(c.lastActivityAt)}</Text>
          <Text style={styles.title}>
            {c.withName ?? c.subject ?? t("messages.untitled")}
          </Text>
          {c.withName !== null && c.subject !== null ? (
            <Text style={styles.meta}>{c.subject}</Text>
          ) : null}
        </Pressable>
      ))}
    </View>
  );
}

export function MessageThread({
  messages,
}: {
  messages: readonly ConversationMessage[];
}) {
  const { t } = useLocale();
  if (messages.length === 0) {
    return <Body muted>{t("messages.threadEmpty")}</Body>;
  }
  return (
    <View style={styles.list} testID="conversation-messages">
      {messages.map((m) => (
        <View
          key={m.id}
          style={[styles.message, m.fromMe ? styles.mine : styles.theirs]}
          accessible
        >
          <Text style={styles.meta}>
            {m.fromMe ? t("messages.fromMe") : t("messages.fromThem")} ·{" "}
            {localStamp(m.at)}
          </Text>
          <Text style={styles.body}>{m.body}</Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  list: { gap: theme.space.sm },
  row: {
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.color.border,
    backgroundColor: theme.color.surface,
    padding: theme.space.md,
    gap: theme.space.xs,
    minHeight: theme.minTouchTarget,
  },
  pressed: { opacity: 0.7 },
  title: {
    color: theme.color.text,
    fontSize: theme.font.body,
    fontWeight: "600",
  },
  meta: { color: theme.color.textMuted, fontSize: theme.font.small },
  message: {
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.color.border,
    padding: theme.space.md,
    gap: theme.space.xs,
    maxWidth: "88%",
  },
  mine: { alignSelf: "flex-end", backgroundColor: theme.color.surface },
  theirs: { alignSelf: "flex-start", backgroundColor: theme.color.background },
  body: {
    color: theme.color.text,
    fontSize: theme.font.body,
    lineHeight: theme.font.body * 1.5,
  },
});
