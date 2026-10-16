import React, { useCallback, useEffect, useRef, useState } from "react";
import { StyleSheet, View } from "react-native";

import { useAuth } from "../auth-context";
import type {
  InterestConfirmData,
  InterestDraftData,
  InterestDraftPreview,
  InterestOption,
} from "../capability-shapes";
import { capability, type DomainFailure } from "../domain";
import { useLocale } from "../i18n/locale-context";
import { Body, Button, Divider, Field, NotAvailable } from "../ui/primitives";
import { theme } from "../ui/theme";
import { useCapability } from "../use-capability";
import { CapabilityFailureNotice } from "./capability-failure";
import { CapabilityGate } from "./capability-gate";

/**
 * OPPORTUNITIES — the needs this person can SEE, and expressing interest in
 * one. Two existing capabilities, nothing new on the server:
 *
 *   interest.express_draft  (no requestId) → the visible needs as options
 *   interest.express_draft  (requestId, note) → preview + one-time token
 *   interest.express_confirm (same draft + token) → the canonical write
 *
 * The list IS the draft's "choose" answer: the server decides what is
 * visible under the person's own RLS and returns its own labels. The device
 * composes nothing, filters nothing, and never invents a request id. A
 * refusal with a name (`no_visible_demand`, `no_worker_profile`) is a
 * finding rendered in the person's language, not an empty list (#1314).
 *
 * The note is part of the draft (the token is bound to it), so it is typed
 * BEFORE drafting; editing after a preview drops the token (same rule as the
 * journal composer).
 */
const NO_ARGS = {} as const;
const NOTE_MAX = 500;

type FlowState =
  | { readonly kind: "listing" }
  | { readonly kind: "writing"; readonly option: InterestOption }
  | { readonly kind: "drafting"; readonly option: InterestOption }
  | {
      readonly kind: "draft_failed";
      readonly option: InterestOption;
      readonly failure: DomainFailure;
    }
  | {
      readonly kind: "ready";
      readonly option: InterestOption;
      readonly preview: InterestDraftPreview;
      readonly token: string;
    }
  | {
      readonly kind: "sending";
      readonly option: InterestOption;
      readonly preview: InterestDraftPreview;
      readonly token: string;
    }
  | {
      readonly kind: "send_failed";
      readonly option: InterestOption;
      readonly preview: InterestDraftPreview;
      readonly token: string;
      readonly failure: DomainFailure;
    }
  | {
      readonly kind: "sent";
      readonly preview: InterestDraftPreview;
      readonly result: InterestConfirmData;
    };

export function OpportunitiesScreen() {
  const { t, locale } = useLocale();
  const { accessToken } = useAuth();
  const board = useCapability<InterestDraftData>("interest.express_draft", NO_ARGS);
  const [flow, setFlow] = useState<FlowState>({ kind: "listing" });
  const [note, setNote] = useState("");

  const live = useRef(true);
  useEffect(() => {
    live.current = true;
    return () => {
      live.current = false;
    };
  }, []);

  const refusalText = useCallback(
    (code: string) =>
      code === "no_visible_demand"
        ? t("opportunities.noneVisible")
        : code === "no_worker_profile"
          ? t("profile.noWorkerProfile")
          : code === "not_visible"
            ? t("opportunities.notVisible")
            : null,
    [t],
  );

  const draft = useCallback(
    async (option: InterestOption) => {
      const trimmed = note.trim();
      setFlow({ kind: "drafting", option });
      const result = await capability<InterestDraftData>({
        name: "interest.express_draft",
        args: {
          requestId: option.id,
          ...(trimmed === "" ? {} : { note: trimmed }),
        },
        accessToken,
        locale,
      });
      if (!live.current) return;
      if (!result.ok) {
        setFlow({ kind: "draft_failed", option, failure: result.failure });
        return;
      }
      if (!("preview" in result.data)) {
        // The server did not recognise the id as one of this account's
        // visible needs any more: back to its fresh list, never a guess.
        setFlow({ kind: "listing" });
        board.reload();
        return;
      }
      setFlow({
        kind: "ready",
        option,
        preview: result.data.preview,
        token: result.data.confirmationToken,
      });
    },
    [accessToken, board, locale, note],
  );

  const send = useCallback(
    async (option: InterestOption, preview: InterestDraftPreview, token: string) => {
      setFlow({ kind: "sending", option, preview, token });
      const result = await capability<InterestConfirmData>({
        name: "interest.express_confirm",
        args: {
          // The PREVIEW's own values — the token is bound to them.
          requestId: preview.requestId,
          ...(preview.note === null ? {} : { note: preview.note }),
          confirmationToken: token,
        },
        accessToken,
        locale,
      });
      if (!live.current) return;
      if (!result.ok) {
        setFlow({ kind: "send_failed", option, preview, token, failure: result.failure });
        return;
      }
      setFlow({ kind: "sent", preview, result: result.data });
    },
    [accessToken, locale],
  );

  const backToList = useCallback(() => {
    setNote("");
    setFlow({ kind: "listing" });
    board.reload();
  }, [board]);

  // ── sent ────────────────────────────────────────────────────────────────
  if (flow.kind === "sent") {
    return (
      <View style={styles.stack} testID="opportunities-sent">
        <NotAvailable title={t("opportunities.sentTitle")} body={t("opportunities.sentBody")}>
          <Body>{flow.preview.demandLabel}</Body>
          <Body muted>
            {t("opportunities.sentStatus")}: {flow.result.status}
          </Body>
        </NotAvailable>
        <Button
          testID="opportunities-another"
          label={t("opportunities.another")}
          onPress={backToList}
        />
      </View>
    );
  }

  // ── preview / sending / send failure ────────────────────────────────────
  if (flow.kind === "ready" || flow.kind === "sending" || flow.kind === "send_failed") {
    const busy = flow.kind === "sending";
    return (
      <View style={styles.stack} testID="opportunities-preview">
        <NotAvailable
          title={t("opportunities.previewTitle")}
          body={t("opportunities.previewBody")}
        >
          <Body>{flow.preview.demandLabel}</Body>
          {flow.preview.note !== null ? <Body muted>{flow.preview.note}</Body> : null}
          {flow.preview.alreadyExpressed ? (
            <Body muted>{t("opportunities.alreadyExpressed")}</Body>
          ) : null}
        </NotAvailable>
        {flow.kind === "send_failed" ? (
          <CapabilityFailureNotice
            failure={flow.failure}
            title="opportunities.sendFailedTitle"
            refusalText={refusalText}
            retry={() => void send(flow.option, flow.preview, flow.token)}
            testID="opportunities-failure"
          />
        ) : null}
        <Button
          testID="opportunities-confirm"
          label={t("opportunities.confirm")}
          busy={busy}
          onPress={() => void send(flow.option, flow.preview, flow.token)}
        />
        <Button
          variant="quiet"
          testID="opportunities-back"
          label={t("opportunities.cancel")}
          busy={busy}
          onPress={() => setFlow({ kind: "writing", option: flow.option })}
        />
      </View>
    );
  }

  // ── note + draft for one chosen need ────────────────────────────────────
  if (flow.kind === "writing" || flow.kind === "drafting" || flow.kind === "draft_failed") {
    const busy = flow.kind === "drafting";
    return (
      <View style={styles.stack} testID="opportunities-write">
        <Body>{flow.option.label}</Body>
        <Field
          testID="opportunities-note"
          label={t("opportunities.noteLabel")}
          hint={t("opportunities.noteHint")}
          value={note}
          onChangeText={setNote}
          maxLength={NOTE_MAX}
          multiline
          editable={!busy}
          style={styles.note}
        />
        {flow.kind === "draft_failed" ? (
          <CapabilityFailureNotice
            failure={flow.failure}
            title="opportunities.draftFailedTitle"
            refusalText={refusalText}
            retry={() => void draft(flow.option)}
            testID="opportunities-failure"
          />
        ) : null}
        <Button
          testID="opportunities-draft"
          label={t("opportunities.draft")}
          busy={busy}
          onPress={() => void draft(flow.option)}
        />
        <Button
          variant="quiet"
          testID="opportunities-back"
          label={t("opportunities.cancel")}
          busy={busy}
          onPress={() => setFlow({ kind: "listing" })}
        />
      </View>
    );
  }

  // ── the list: the server's own options ──────────────────────────────────
  return (
    <View style={styles.stack} testID="opportunities-list">
      <Body muted>{t("opportunities.intro")}</Body>
      <CapabilityGate state={board.state} reload={board.reload} refusalText={refusalText}>
        {(data) =>
          "preview" in data ? (
            // Unreachable without a requestId; rendered honestly if it ever
            // happens rather than as an empty board.
            <Body muted>{data.note}</Body>
          ) : (
            <View style={styles.stack}>
              {data.options.map((option, index) => (
                <View key={option.id} style={styles.row}>
                  <Body>{option.label}</Body>
                  <Button
                    variant="quiet"
                    testID={`opportunities-express-${index}`}
                    label={t("opportunities.express")}
                    onPress={() => {
                      setNote("");
                      setFlow({ kind: "writing", option });
                    }}
                  />
                  <Divider />
                </View>
              ))}
            </View>
          )
        }
      </CapabilityGate>
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { gap: theme.space.md },
  row: { gap: theme.space.xs },
  note: { minHeight: 96, textAlignVertical: "top" },
});
