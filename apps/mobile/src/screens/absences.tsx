import React, { useCallback, useEffect, useRef, useState } from "react";
import { StyleSheet, View } from "react-native";

import { useAuth } from "../auth-context";
import type {
  AbsenceType,
  ContextListData,
  ManagerAbsencesData,
  MyAbsencesData,
  WorkerAbsence,
} from "../capability-shapes";
import { capability, type DomainFailure } from "../domain";
import { useLocale } from "../i18n/locale-context";
import type { MessageKey } from "../i18n/messages";
import { Body, Button, Divider, Field, NotAvailable, Title } from "../ui/primitives";
import { theme } from "../ui/theme";
import { useCapability } from "../use-capability";
import { useReloadOnReturn } from "../use-reload-on-return";
import { CapabilityFailureNotice } from "./capability-failure";
import { CapabilityGate } from "./capability-gate";

/**
 * LEAVE & ABSENCE — the web's absences page on the phone, over the same
 * capabilities (owner order 2026-11-16: one shared client):
 *
 *   absence.mine.list              → my requests, and my worker record
 *   absence.request_draft/_confirm → request time off for my own worker record
 *   absence.cancel_draft/_confirm  → cancel one of my requests
 *   absence.pending_review.list    → (organization workspace) requests to review
 *   absence.review_draft/_confirm  → approve or reject one of them
 *
 * Each write is prepared first; nothing is written until the person confirms,
 * and the confirm sends the SAME input plus the token. The server decides who
 * may review (a manager of the worker's organization); self-review cannot
 * happen.
 */
const NO_ARGS = {} as const;

export const ABSENCE_TYPES: readonly AbsenceType[] = ["annual_leave", "sickness", "unpaid", "training", "other"];
const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

type Act =
  | {
      readonly kind: "request";
      readonly input: {
        readonly workerId: string;
        readonly absenceType: AbsenceType;
        readonly startDate: string;
        readonly endDate: string;
        readonly note?: string;
      };
    }
  | { readonly kind: "cancel"; readonly input: { readonly absenceId: string } }
  | { readonly kind: "review"; readonly input: { readonly absenceId: string; readonly decision: "approved" | "rejected" } };

const CAPABILITY: Record<Act["kind"], string> = {
  request: "absence.request",
  cancel: "absence.cancel",
  review: "absence.review",
};

function doneKey(act: Act): MessageKey {
  if (act.kind === "request") return "absences.outcomeRequested";
  if (act.kind === "cancel") return "absences.outcomeCancelled";
  return act.input.decision === "approved" ? "absences.outcomeApproved" : "absences.outcomeRejected";
}

type Flow =
  | { readonly kind: "idle" }
  | { readonly kind: "preparing"; readonly act: Act }
  | { readonly kind: "ready" | "sending"; readonly act: Act; readonly token: string }
  | { readonly kind: "failed"; readonly act: Act; readonly failure: DomainFailure }
  | { readonly kind: "done"; readonly act: Act };

export function AbsencesScreen() {
  const { t, locale } = useLocale();
  const { accessToken } = useAuth();
  const mine = useCapability<MyAbsencesData>("absence.mine.list", NO_ARGS);
  const pending = useCapability<ManagerAbsencesData>("absence.pending_review.list", NO_ARGS);
  const workspaces = useCapability<ContextListData>("context.list", NO_ARGS);
  const organization =
    workspaces.state.status === "loaded" &&
    workspaces.state.data.workspaces.some((w) => w.active && w.kind !== "personal");

  const [flow, setFlow] = useState<Flow>({ kind: "idle" });
  const [type, setType] = useState<AbsenceType>("annual_leave");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [note, setNote] = useState("");

  const reloadMine = mine.reload;
  const reloadPending = pending.reload;
  const reloadAll = useCallback(() => {
    reloadMine();
    reloadPending();
  }, [reloadMine, reloadPending]);
  useReloadOnReturn(reloadAll, () => flow.kind === "idle");

  const live = useRef(true);
  useEffect(() => {
    live.current = true;
    return () => {
      live.current = false;
    };
  }, []);

  const prepare = useCallback(
    async (act: Act) => {
      setFlow({ kind: "preparing", act });
      const r = await capability<{ confirmationToken: string }>({
        name: `${CAPABILITY[act.kind]}_draft`,
        args: act.input,
        accessToken,
        locale,
      });
      if (!live.current) return;
      setFlow(r.ok ? { kind: "ready", act, token: r.data.confirmationToken } : { kind: "failed", act, failure: r.failure });
    },
    [accessToken, locale],
  );

  const confirm = useCallback(
    async (act: Act, token: string) => {
      setFlow({ kind: "sending", act, token });
      // The same input the prepare step saw, plus its token.
      const r = await capability<unknown>({
        name: `${CAPABILITY[act.kind]}_confirm`,
        args: { ...act.input, confirmationToken: token },
        accessToken,
        locale,
      });
      if (!live.current) return;
      setFlow(r.ok ? { kind: "done", act } : { kind: "failed", act, failure: r.failure });
    },
    [accessToken, locale],
  );

  const backToList = useCallback(() => {
    setFlow({ kind: "idle" });
    setStart("");
    setEnd("");
    setNote("");
    reloadAll();
  }, [reloadAll]);

  if (flow.kind === "done") {
    return (
      <View style={styles.stack} testID="absences-done">
        <Body>{t(doneKey(flow.act))}</Body>
        <Button testID="absences-back" label={t("offers.backToList")} onPress={backToList} />
      </View>
    );
  }

  if (flow.kind !== "idle") {
    const { act } = flow;
    return (
      <View style={styles.stack} testID="absences-preview">
        <NotAvailable title={t(titleKey(act))} body={summaryOf(act, t)}>
          {flow.kind === "failed" ? (
            <CapabilityFailureNotice
              failure={flow.failure}
              title="cv.saveFailedTitle"
              retry={() => void prepare(act)}
              testID="absences-failure"
            />
          ) : null}
          {flow.kind === "ready" || flow.kind === "sending" ? (
            <Button
              testID="absences-confirm"
              label={t("agency.confirm")}
              busy={flow.kind === "sending"}
              onPress={() => void confirm(act, flow.token)}
            />
          ) : null}
        </NotAvailable>
        <Button
          variant="quiet"
          testID="absences-cancel-flow"
          label={t("absences.cancel")}
          disabled={flow.kind === "sending"}
          onPress={() => setFlow({ kind: "idle" })}
        />
      </View>
    );
  }

  const datesValid = ISO_DAY.test(start.trim()) && ISO_DAY.test(end.trim()) && end.trim() >= start.trim();

  return (
    <View style={styles.stack}>
      <CapabilityGate state={mine.state} reload={mine.reload}>
        {(data) =>
          !data.applied || data.workerId === null ? (
            <Body muted>{t("absences.noWorker")}</Body>
          ) : (
            <View style={styles.stack} testID="absences-mine">
              <Title>{t("absences.myTitle")}</Title>
              {data.absences.length === 0 ? (
                <Body muted>{t("absences.myEmpty")}</Body>
              ) : (
                data.absences.map((a) => (
                  <View key={a.id} style={styles.row} testID={`absences-mine-${a.id}`}>
                    <AbsenceLine absence={a} />
                    {a.status === "requested" || a.status === "approved" ? (
                      <Button
                        variant="quiet"
                        testID={`absences-cancel-${a.id}`}
                        label={t("absences.cancel")}
                        onPress={() => void prepare({ kind: "cancel", input: { absenceId: a.id } })}
                      />
                    ) : null}
                  </View>
                ))
              )}
              <Divider />
              <Title>{t("absences.requestHeading")}</Title>
              <Body muted>{t("absences.typeLabel")}</Body>
              {ABSENCE_TYPES.map((value) => (
                <Button
                  key={value}
                  variant={type === value ? "primary" : "quiet"}
                  testID={`absences-type-${value}`}
                  label={t(`absences.type.${value}` as MessageKey)}
                  onPress={() => setType(value)}
                />
              ))}
              <Field
                testID="absences-start"
                label={t("absences.startLabel")}
                placeholder="2027-04-01"
                value={start}
                onChangeText={setStart}
                maxLength={10}
                autoCapitalize="none"
              />
              <Field
                testID="absences-end"
                label={t("absences.endLabel")}
                placeholder="2027-04-02"
                value={end}
                onChangeText={setEnd}
                maxLength={10}
                autoCapitalize="none"
              />
              <Field
                testID="absences-note"
                label={t("absences.noteLabel")}
                placeholder={t("absences.notePlaceholder")}
                value={note}
                onChangeText={setNote}
                maxLength={500}
                multiline
              />
              <Button
                testID="absences-request"
                label={t("absences.requestButton")}
                disabled={!datesValid}
                onPress={() => {
                  const workerId = data.workerId;
                  if (workerId === null) return;
                  const trimmed = note.trim();
                  void prepare({
                    kind: "request",
                    input: {
                      workerId,
                      absenceType: type,
                      startDate: start.trim(),
                      endDate: end.trim(),
                      ...(trimmed === "" ? {} : { note: trimmed }),
                    },
                  });
                }}
              />
            </View>
          )
        }
      </CapabilityGate>

      {organization ? (
        <>
          <Divider />
          <Title>{t("absences.managerTitle")}</Title>
          <CapabilityGate state={pending.state} reload={pending.reload}>
            {(data) =>
              !data.applied || data.pending.length === 0 ? (
                <View testID="absences-review-empty">
                  <Body muted>{t("absences.managerEmpty")}</Body>
                </View>
              ) : (
                <View style={styles.stack} testID="absences-review-list">
                  {data.pending.map((a) => (
                    <View key={a.id} style={styles.row} testID={`absences-review-${a.id}`}>
                      <Body>{a.workerName ?? t("absences.unknownWorker")}</Body>
                      <AbsenceLine absence={a} />
                      <Button
                        testID={`absences-approve-${a.id}`}
                        label={t("absences.approve")}
                        onPress={() => void prepare({ kind: "review", input: { absenceId: a.id, decision: "approved" } })}
                      />
                      <Button
                        variant="quiet"
                        testID={`absences-reject-${a.id}`}
                        label={t("absences.reject")}
                        onPress={() => void prepare({ kind: "review", input: { absenceId: a.id, decision: "rejected" } })}
                      />
                      <Divider />
                    </View>
                  ))}
                </View>
              )
            }
          </CapabilityGate>
        </>
      ) : null}
    </View>
  );
}

function AbsenceLine({ absence }: { absence: WorkerAbsence }) {
  const { t } = useLocale();
  return (
    <>
      <Body>
        {t(`absences.type.${absence.absenceType}` as MessageKey)} · {absence.startDate}
        {absence.endDate !== absence.startDate ? ` – ${absence.endDate}` : ""}
      </Body>
      <Body muted>{t(`absences.status.${absence.status}` as MessageKey)}</Body>
      {absence.note ? <Body muted>{absence.note}</Body> : null}
    </>
  );
}

function titleKey(act: Act): MessageKey {
  if (act.kind === "request") return "absences.requestHeading";
  if (act.kind === "cancel") return "absences.cancel";
  return act.input.decision === "approved" ? "absences.approve" : "absences.reject";
}

function summaryOf(act: Act, t: (k: MessageKey) => string): string {
  if (act.kind !== "request") return "";
  const { absenceType, startDate, endDate, note } = act.input;
  const dates = endDate === startDate ? startDate : `${startDate} – ${endDate}`;
  return [t(`absences.type.${absenceType}` as MessageKey), dates, note ?? ""].filter((x) => x !== "").join(" · ");
}

const styles = StyleSheet.create({
  stack: { gap: theme.space.md },
  row: { gap: theme.space.xs },
});
