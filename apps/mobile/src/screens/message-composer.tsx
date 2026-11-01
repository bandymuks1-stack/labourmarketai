import React, { useCallback, useEffect, useRef, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { useAuth } from "../auth-context";
import type {
  MessageSendConfirmData,
  MessageSendDraftData,
} from "../capability-shapes";
import { capability, type DomainFailure } from "../domain";
import { useLocale } from "../i18n/locale-context";
import type { MessageKey } from "../i18n/messages";
import { traceTestId, useRequestTrace } from "../request-trace";
import { Button, Field, NotAvailable } from "../ui/primitives";
import { theme } from "../ui/theme";
import { CapabilityFailureNotice } from "./capability-failure";

/**
 * REPLYING IN ONE OF MY CONVERSATIONS — `message.send_draft` →
 * `message.send_confirm`, the pair an MCP client uses, which sends through the
 * same core the web composer uses (same limits, same permission check).
 *
 * The draft sends NOTHING; it shows the exact text and which relationship
 * allows the contact, and mints a one-time token bound to that text and to the
 * conversation's current last message. A message that arrives in between
 * voids the token — so a person never answers a thread they have not seen.
 * In-app only: no email, no SMS, no push.
 */

type ComposerState =
  | { readonly kind: "writing"; readonly localError: MessageKey | null }
  | { readonly kind: "drafting" }
  | { readonly kind: "draft_failed"; readonly failure: DomainFailure }
  | { readonly kind: "ready" | "sending"; readonly draft: MessageSendDraftData }
  | {
      readonly kind: "send_failed";
      readonly draft: MessageSendDraftData;
      readonly failure: DomainFailure;
    }
  | { readonly kind: "sent"; readonly result: MessageSendConfirmData };

export function MessageComposer({
  conversationId,
  reloadThread,
}: {
  conversationId: string;
  /**
   * Re-read the thread: after a send, so the message shows where it now
   * lives; after a stale-token refusal, so the message that arrived in
   * between is on screen BEFORE the person drafts again (a new draft binds
   * to the server's latest message, seen or not).
   */
  reloadThread: () => void;
}) {
  const { t, locale } = useLocale();
  const { accessToken } = useAuth();
  const trace = useRequestTrace();
  const [body, setBody] = useState("");
  const [state, setState] = useState<ComposerState>({
    kind: "writing",
    localError: null,
  });

  const live = useRef(true);
  useEffect(() => {
    live.current = true;
    return () => {
      live.current = false;
    };
  }, []);

  const draft = useCallback(async () => {
    const text = body.trim();
    if (text.length === 0) {
      setState({ kind: "writing", localError: "messages.emptyBody" });
      return;
    }
    setState({ kind: "drafting" });
    const result = await capability<MessageSendDraftData>({
      name: "message.send_draft",
      args: { conversationId, body: text },
      accessToken,
      locale,
    });
    if (!live.current) return;
    setState(
      result.ok
        ? { kind: "ready", draft: result.data }
        : { kind: "draft_failed", failure: result.failure },
    );
  }, [accessToken, body, conversationId, locale]);

  const send = useCallback(
    async (drafted: MessageSendDraftData) => {
      setState({ kind: "sending", draft: drafted });
      const result = await capability<MessageSendConfirmData>({
        name: "message.send_confirm",
        // The previewed text, byte for byte: the token is bound to it.
        args: {
          conversationId,
          body: drafted.preview.body,
          confirmationToken: drafted.confirmationToken,
        },
        accessToken,
        locale,
      });
      if (!live.current) return;
      if (!result.ok) {
        setState({ kind: "send_failed", draft: drafted, failure: result.failure });
        if (
          result.failure.kind === "capability_refused" &&
          result.failure.code === "confirmation_rejected"
        ) {
          reloadThread();
        }
        return;
      }
      setBody("");
      setState({ kind: "sent", result: result.data });
      reloadThread();
    },
    [accessToken, conversationId, locale, reloadThread],
  );

  if (state.kind === "sent") {
    return (
      <View style={styles.stack} testID="message-sent">
        <NotAvailable
          title={t("messages.sentTitle")}
          body={
            state.result.readBack?.bodyMatches === true
              ? t("messages.sentBody")
              : t("messages.sentUnverified")
          }
        />
        <Button
          variant="quiet"
          testID="message-write-another"
          label={t("messages.writeAnother")}
          onPress={() => setState({ kind: "writing", localError: null })}
        />
      </View>
    );
  }

  if (state.kind === "ready" || state.kind === "sending" || state.kind === "send_failed") {
    return (
      <View style={styles.stack} testID="message-preview">
        <View testID={traceTestId(trace, "message.send_confirm")}>
          <NotAvailable
            title={t("messages.previewTitle")}
            body={t("messages.previewNothingSent")}
          >
            <Text style={styles.previewBody}>{state.draft.preview.body}</Text>
          </NotAvailable>
        </View>
        {state.kind === "send_failed" ? (
          state.failure.kind === "unreachable" ? (
            <NotAvailable
              tone="warning"
              testID="message-failure"
              title={t("messages.sendFailedTitle")}
              body={t("messages.unsureSent")}
            />
          ) : (
            <CapabilityFailureNotice
              tone="warning"
              testID="message-failure"
              title="messages.sendFailedTitle"
              failure={state.failure}
              refusalText={refusalText(t)}
            />
          )
        ) : null}
        <Button
          testID="message-send"
          busy={state.kind === "sending"}
          label={t("messages.send")}
          onPress={() => void send(state.draft)}
        />
        <Button
          variant="quiet"
          testID="message-edit"
          // While the send is in flight its result would overwrite a new edit.
          disabled={state.kind === "sending"}
          label={t("journal.compose.edit")}
          onPress={() => setState({ kind: "writing", localError: null })}
        />
      </View>
    );
  }

  return (
    <View
      style={styles.stack}
      testID={`message-form-${state.kind}${
        state.kind === "draft_failed" ? `-${state.failure.kind}` : ""
      }`}
    >
      <View testID={traceTestId(trace, "message.send_draft")}>
        <Field
          testID="message-body"
          label={t("messages.replyLabel")}
          value={body}
          onChangeText={setBody}
          multiline
          numberOfLines={4}
          maxLength={4000}
          style={styles.multiline}
        />
      </View>
      {state.kind === "writing" && state.localError !== null ? (
        <NotAvailable
          tone="warning"
          testID="message-failure"
          title={t("journal.compose.checkThis")}
          body={t(state.localError)}
        />
      ) : null}
      {state.kind === "draft_failed" ? (
        <CapabilityFailureNotice
          tone="warning"
          testID="message-failure"
          title="messages.draftFailedTitle"
          failure={state.failure}
          refusalText={refusalText(t)}
        />
      ) : null}
      <Button
        testID="message-review"
        busy={state.kind === "drafting"}
        label={t("messages.review")}
        onPress={() => void draft()}
      />
    </View>
  );
}

function refusalText(t: (key: MessageKey) => string): (code: string) => string | null {
  return (code) => {
    switch (code) {
      case "confirmation_rejected":
        return t("messages.staleDraft");
      case "not_found":
        return t("messages.notFound");
      case "no_permission":
        return t("messages.noPermission");
      default:
        return null;
    }
  };
}

const styles = StyleSheet.create({
  stack: { gap: theme.space.md },
  multiline: {
    minHeight: 110,
    paddingTop: theme.space.sm,
    paddingBottom: theme.space.sm,
    textAlignVertical: "top",
  },
  previewBody: {
    color: theme.color.text,
    fontSize: theme.font.body,
    lineHeight: theme.font.body * 1.5,
  },
});
