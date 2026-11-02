import React, { useCallback, useState } from "react";
import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";

import { useAuth } from "../../src/auth-context";
import type { NotificationItem, NotificationListData } from "../../src/capability-shapes";
import { CONFIG } from "../../src/config";
import { capability, type DomainFailure } from "../../src/domain";
import { useLocale } from "../../src/i18n/locale-context";
import { MESSAGES, type MessageKey } from "../../src/i18n/messages";
import { notificationDestination } from "../../src/notification-destination";
import { traceTestId, useRequestTrace } from "../../src/request-trace";
import { CapabilityFailureNotice } from "../../src/screens/capability-failure";
import { CapabilityGate } from "../../src/screens/capability-gate";
import { localStamp } from "../../src/screens/conversations";
import { Body, Button, Title } from "../../src/ui/primitives";
import { theme } from "../../src/ui/theme";
import { useCapability } from "../../src/use-capability";
import { useReloadOnReturn } from "../../src/use-reload-on-return";

const PAGE = { limit: 50 } as const;

/**
 * NOTIFICATIONS — the caller's in-app notifications (`notification.list`,
 * the same durable rows the web bell reads), newest first, with read state.
 *
 * Push is OFF by owner decision (no vendor): nothing arrives on the lock
 * screen. This screen is read when opened and again on every return.
 *
 * Opening a row marks it read (`notification.mark_read`, the web bell's own
 * action) and goes where the event is about: a screen this app has, or the
 * website as the person. "Mark all read" is the bell's mark-all. Both are
 * reversible, one-step changes of the person's own read state — the web
 * makes them in one tap too, so no draft/confirm is invented here.
 */
export default function Screen() {
  const { t, locale } = useLocale();
  const { accessToken } = useAuth();
  const router = useRouter();
  const trace = useRequestTrace();
  const read = useCapability<NotificationListData>("notification.list", PAGE);
  useReloadOnReturn(read.reload);
  const [markFailure, setMarkFailure] = useState<DomainFailure | null>(null);
  const [busy, setBusy] = useState(false);
  const [linkError, setLinkError] = useState(false);

  const webOrigin = CONFIG === null ? "https://labourmarket.ai" : CONFIG.apiBaseUrl;

  const open = useCallback(
    async (item: NotificationItem) => {
      setMarkFailure(null);
      setLinkError(false);
      if (item.read_at === null) {
        const marked = await capability({
          name: "notification.mark_read",
          args: { notificationId: item.id },
          accessToken,
          locale,
        });
        // A failed mark is said, and the person still goes where the
        // notification leads: reading it is never held hostage to the flag.
        if (!marked.ok) setMarkFailure(marked.failure);
        else read.reload();
      }
      const to = notificationDestination(item.href, item.type);
      if (to.kind === "native") {
        router.push(to.params ? { pathname: to.pathname, params: to.params } : to.pathname);
      } else if (to.kind === "web") {
        Linking.openURL(`${webOrigin}/${locale}${to.path}`).catch(() => setLinkError(true));
      }
    },
    [accessToken, locale, read, router, webOrigin],
  );

  const markAll = useCallback(async () => {
    setMarkFailure(null);
    setBusy(true);
    const marked = await capability({
      name: "notification.mark_all_read",
      args: {},
      accessToken,
      locale,
    });
    setBusy(false);
    if (!marked.ok) setMarkFailure(marked.failure);
    else read.reload();
  }, [accessToken, locale, read]);

  const readState =
    read.state.status === "failed" ? `failed-${read.state.failure.kind}` : read.state.status;

  return (
    <SafeAreaView style={styles.safe} edges={["bottom"]}>
      <ScrollView contentContainerStyle={styles.content}>
        <View testID={`notifications-read-${readState}`}>
          <View testID={traceTestId(trace, "notification.list")}>
            <Title>{t("notifications.title")}</Title>
          </View>
        </View>
        <Body muted>{t("notifications.intro")}</Body>
        {markFailure !== null ? (
          <CapabilityFailureNotice
            tone="warning"
            testID="notifications-mark-failure"
            title="notifications.markFailedTitle"
            failure={markFailure}
          />
        ) : null}
        {linkError ? (
          <Body muted>{t("account.openFailed")}</Body>
        ) : null}
        <CapabilityGate state={read.state} reload={read.reload}>
          {(data) => {
            const unread = data.items.filter((n) => n.read_at === null).length;
            return (
              <View style={styles.list} testID="notifications-loaded">
                {data.items.length === 0 ? (
                  // A LOADED, genuinely empty answer.
                  <Body muted>{t("notifications.none")}</Body>
                ) : null}
                {unread > 0 ? (
                  <View testID={traceTestId(trace, "notification.mark_all_read")}>
                    <Button
                      variant="quiet"
                      testID="notifications-mark-all"
                      busy={busy}
                      label={t("notifications.markAll")}
                      onPress={() => void markAll()}
                    />
                  </View>
                ) : null}
                {data.items.map((item, index) => (
                  <Pressable
                    key={item.id}
                    testID={`notification-${index}-${item.read_at === null ? "unread" : "read"}`}
                    accessibilityRole="button"
                    onPress={() => void open(item)}
                    style={({ pressed }) => [
                      styles.row,
                      item.read_at === null && styles.unread,
                      pressed && styles.pressed,
                    ]}
                  >
                    <Text style={styles.meta}>
                      {item.read_at === null ? `${t("notifications.unread")} · ` : ""}
                      {localStamp(item.created_at)}
                    </Text>
                    <Text style={styles.label}>{t(typeKey(item.type))}</Text>
                  </Pressable>
                ))}
              </View>
            );
          }}
        </CapabilityGate>
      </ScrollView>
    </SafeAreaView>
  );
}

/** The catalogue key for the server's rendered type; a type this build does
 *  not know yet gets a neutral label, never a raw key on someone's phone. */
function typeKey(type: string): MessageKey {
  const key = `notifications.type.${type}`;
  return Object.prototype.hasOwnProperty.call(MESSAGES.en, key)
    ? (key as MessageKey)
    : "notifications.type.unknown";
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.color.background },
  content: { padding: theme.space.md, gap: theme.space.md },
  list: { gap: theme.space.sm },
  row: {
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.color.border,
    backgroundColor: theme.color.background,
    padding: theme.space.md,
    gap: theme.space.xs,
    minHeight: theme.minTouchTarget,
  },
  unread: { backgroundColor: theme.color.surface, borderColor: theme.color.accent },
  pressed: { opacity: 0.7 },
  meta: { color: theme.color.textMuted, fontSize: theme.font.small },
  label: { color: theme.color.text, fontSize: theme.font.body },
});
