import React, { useCallback, useEffect, useRef, useState } from "react";
import { StyleSheet, View } from "react-native";

import { useAuth } from "../auth-context";
import type { JournalReviewDecision, JournalReviewEntry, JournalReviewQueueData } from "../capability-shapes";
import { capability, type DomainFailure } from "../domain";
import { useLocale } from "../i18n/locale-context";
import type { MessageKey } from "../i18n/messages";
import { Body, Button, Divider, Field, NotAvailable } from "../ui/primitives";
import { theme } from "../ui/theme";
import { useCapability } from "../use-capability";
import { useReloadOnReturn } from "../use-reload-on-return";
import { CapabilityFailureNotice } from "./capability-failure";
import { CapabilityGate } from "./capability-gate";

/**
 * WORK REVIEW — a manager decides on the work entries of the people they
 * manage: approve, request changes or reject, with an optional note. The web
 * inbox's own capabilities (owner order 2026-11-16: one shared client):
 *
 *   journal.review_queue.get                → the entries waiting for this person's decision
 *   journal.review_draft / journal.review_confirm → one decision on one entry
 *
 * An entry waiting here is the person's own record: not rejected and not
 * verified until a human decides. Nothing is written until the manager
 * confirms the prepared decision; the platform refuses self-review.
 */
const NO_ARGS = {} as const;

const DECISION_LABEL: Record<JournalReviewDecision, MessageKey> = {
  approved: "review.approve",
  changes_requested: "review.requestChanges",
  rejected: "review.reject",
};
const NOTE_LABEL: Record<JournalReviewDecision, MessageKey> = {
  approved: "review.noteApprove",
  changes_requested: "review.noteChanges",
  rejected: "review.noteReject",
};
const DECISIONS: readonly JournalReviewDecision[] = ["approved", "changes_requested", "rejected"];
const TESTID: Record<JournalReviewDecision, string> = {
  approved: "approve",
  changes_requested: "changes",
  rejected: "reject",
};

type Flow =
  | { readonly kind: "listing" }
  | { readonly kind: "writing"; readonly entry: JournalReviewEntry; readonly decision: JournalReviewDecision }
  | { readonly kind: "preparing"; readonly entry: JournalReviewEntry; readonly decision: JournalReviewDecision }
  | {
      readonly kind: "ready" | "sending";
      readonly entry: JournalReviewEntry;
      readonly decision: JournalReviewDecision;
      readonly token: string;
    }
  | {
      readonly kind: "failed";
      readonly entry: JournalReviewEntry;
      readonly decision: JournalReviewDecision;
      readonly failure: DomainFailure;
    };

export function JournalReviewScreen() {
  const { t, locale } = useLocale();
  const { accessToken } = useAuth();
  const queue = useCapability<JournalReviewQueueData>("journal.review_queue.get", NO_ARGS);
  const [flow, setFlow] = useState<Flow>({ kind: "listing" });
  const [note, setNote] = useState("");

  const reload = queue.reload;
  useReloadOnReturn(reload, () => flow.kind === "listing");

  const live = useRef(true);
  useEffect(() => {
    live.current = true;
    return () => {
      live.current = false;
    };
  }, []);

  const args = useCallback(
    (entry: JournalReviewEntry, decision: JournalReviewDecision) => {
      const trimmed = note.trim();
      return trimmed === "" ? { entryId: entry.entryId, decision } : { entryId: entry.entryId, decision, note: trimmed };
    },
    [note],
  );

  const prepare = useCallback(
    async (entry: JournalReviewEntry, decision: JournalReviewDecision) => {
      setFlow({ kind: "preparing", entry, decision });
      const r = await capability<{ confirmationToken: string }>({
        name: "journal.review_draft",
        args: args(entry, decision),
        accessToken,
        locale,
      });
      if (!live.current) return;
      setFlow(
        r.ok
          ? { kind: "ready", entry, decision, token: r.data.confirmationToken }
          : { kind: "failed", entry, decision, failure: r.failure },
      );
    },
    [accessToken, args, locale],
  );

  const confirm = useCallback(
    async (entry: JournalReviewEntry, decision: JournalReviewDecision, token: string) => {
      setFlow({ kind: "sending", entry, decision, token });
      // The same input the prepare step saw, plus its token.
      const r = await capability<unknown>({
        name: "journal.review_confirm",
        args: { ...args(entry, decision), confirmationToken: token },
        accessToken,
        locale,
      });
      if (!live.current) return;
      if (!r.ok) {
        setFlow({ kind: "failed", entry, decision, failure: r.failure });
        return;
      }
      setFlow({ kind: "listing" });
      setNote("");
      reload();
    },
    [accessToken, args, locale, reload],
  );

  const backToList = useCallback(() => {
    setFlow({ kind: "listing" });
    setNote("");
  }, []);

  if (flow.kind !== "listing") {
    const { entry, decision } = flow;
    const writing = flow.kind === "writing" || flow.kind === "preparing";
    return (
      <View style={styles.stack} testID={`review-form-${entry.entryId}`}>
        <EntrySummary entry={entry} />
        {writing ? (
          <>
            <Field
              testID="review-note"
              label={t(NOTE_LABEL[decision])}
              value={note}
              onChangeText={setNote}
              maxLength={2000}
              multiline
              editable={flow.kind === "writing"}
            />
            <Button
              testID={`review-prepare-${entry.entryId}`}
              label={t(DECISION_LABEL[decision])}
              busy={flow.kind === "preparing"}
              onPress={() => void prepare(entry, decision)}
            />
          </>
        ) : (
          <NotAvailable title={t(DECISION_LABEL[decision])} body={note.trim()}>
            {flow.kind === "failed" ? (
              <CapabilityFailureNotice
                failure={flow.failure}
                title="cv.saveFailedTitle"
                retry={() => void prepare(entry, decision)}
                testID="review-failure"
              />
            ) : (
              <Button
                testID={`review-confirm-${entry.entryId}`}
                label={t("review.confirm")}
                busy={flow.kind === "sending"}
                onPress={() => void confirm(entry, decision, flow.token)}
              />
            )}
          </NotAvailable>
        )}
        <Button
          variant="quiet"
          testID="review-cancel"
          label={t("review.cancel")}
          disabled={flow.kind === "sending"}
          onPress={backToList}
        />
      </View>
    );
  }

  return (
    <CapabilityGate state={queue.state} reload={queue.reload}>
      {(data) =>
        data.pending.length === 0 ? (
          <View testID="review-empty">
            <Body muted>{t("review.empty")}</Body>
          </View>
        ) : (
          <View style={styles.stack} testID="review-list">
            {data.pending.map((entry) => (
              <View key={entry.entryId} style={styles.row} testID={`review-entry-${entry.entryId}`}>
                <EntrySummary entry={entry} />
                <View style={styles.actions}>
                  {DECISIONS.map((decision) => (
                    <Button
                      key={decision}
                      variant={decision === "approved" ? "primary" : "quiet"}
                      testID={`review-${TESTID[decision]}-${entry.entryId}`}
                      label={t(DECISION_LABEL[decision])}
                      onPress={() => {
                        setNote("");
                        setFlow({ kind: "writing", entry, decision });
                      }}
                    />
                  ))}
                </View>
                <Divider />
              </View>
            ))}
          </View>
        )
      }
    </CapabilityGate>
  );
}

function EntrySummary({ entry }: { entry: JournalReviewEntry }) {
  const { locale } = useLocale();
  const when = (() => {
    const d = new Date(entry.writtenAt);
    return Number.isNaN(d.getTime()) ? null : d.toLocaleDateString(locale);
  })();
  return (
    <View style={styles.row}>
      {entry.person.name !== null ? <Body>{entry.person.name}</Body> : null}
      {when !== null ? <Body muted>{when}</Body> : null}
      {entry.text !== null ? <Body>{entry.text}</Body> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { gap: theme.space.md },
  row: { gap: theme.space.xs },
  actions: { gap: theme.space.xs },
});
