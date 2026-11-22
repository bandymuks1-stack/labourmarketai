import React, { useCallback, useEffect, useRef, useState } from "react";
import { StyleSheet, View } from "react-native";

import { useAuth } from "../auth-context";
import type { BookingListData, BookingOffer } from "../capability-shapes";
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
 * PROPOSALS YOU SENT — the company's side of a booking, the web bookings
 * page's "Proposals you sent" over the same capabilities (owner order
 * 2026-11-16: one shared client, no parallel backend):
 *
 *   booking.list                       → outgoing proposals and their answers
 *   booking.reschedule_draft/_confirm  → new dates (an accepted booking
 *                                        reopens: the worker decides again)
 *   booking.withdraw_draft/_confirm    → withdraw an open proposal, with an
 *                                        optional reason
 *
 * Each write is prepared first; nothing is written until the person
 * confirms, and the confirm sends the SAME input plus the token. The server
 * re-checks that the caller proposed the booking and which status allows what.
 */
const NO_ARGS = {} as const;

export const WITHDRAW_REASONS = ["position_filled", "need_changed", "dates_changed", "other"] as const;
type WithdrawReason = (typeof WITHDRAW_REASONS)[number];
const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

type Act =
  | {
      readonly kind: "reschedule";
      readonly booking: BookingOffer;
      readonly input: {
        readonly bookingId: string;
        readonly startDate: string;
        readonly endDate?: string;
        readonly note?: string;
      };
    }
  | {
      readonly kind: "withdraw";
      readonly booking: BookingOffer;
      readonly input: {
        readonly bookingId: string;
        readonly reasonKind?: WithdrawReason;
        readonly reasonNote?: string;
      };
    };

type Outcome = { readonly status?: string; readonly reopened?: boolean; readonly unchanged?: boolean; readonly reasonStored?: boolean };

type Flow =
  | { readonly kind: "listing" }
  | { readonly kind: "editing"; readonly what: "reschedule" | "withdraw"; readonly booking: BookingOffer }
  | { readonly kind: "preparing"; readonly act: Act }
  | { readonly kind: "ready" | "sending"; readonly act: Act; readonly token: string }
  | { readonly kind: "failed"; readonly act: Act; readonly failure: DomainFailure }
  | { readonly kind: "done"; readonly act: Act; readonly outcome: Outcome };

function doneKey(act: Act, outcome: Outcome): MessageKey {
  if (act.kind === "withdraw") return outcome.reasonStored === false ? "sentProposals.reasonNotStored" : "sentProposals.withdrawn";
  if (outcome.unchanged) return "sentProposals.sameDates";
  return outcome.reopened ? "sentProposals.reopened" : "sentProposals.saved";
}

function datesOf(b: BookingOffer, t: (k: MessageKey) => string): string {
  if (b.startDate === null) return t("sentProposals.noDate");
  return b.expectedEndDate ? `${b.startDate} – ${b.expectedEndDate}` : b.startDate;
}

export function SentProposalsScreen() {
  const { t, locale } = useLocale();
  const { accessToken } = useAuth();
  const bookings = useCapability<BookingListData>("booking.list", NO_ARGS);
  const [flow, setFlow] = useState<Flow>({ kind: "listing" });
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [note, setNote] = useState("");
  const [reason, setReason] = useState<WithdrawReason | null>(null);

  const reload = bookings.reload;
  useReloadOnReturn(reload, () => flow.kind === "listing");

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
        name: `booking.${act.kind}_draft`,
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
      const r = await capability<Outcome>({
        name: `booking.${act.kind}_confirm`,
        args: { ...act.input, confirmationToken: token },
        accessToken,
        locale,
      });
      if (!live.current) return;
      setFlow(r.ok ? { kind: "done", act, outcome: r.data ?? {} } : { kind: "failed", act, failure: r.failure });
    },
    [accessToken, locale],
  );

  const edit = useCallback((what: "reschedule" | "withdraw", booking: BookingOffer) => {
    setStart(what === "reschedule" ? booking.startDate ?? "" : "");
    setEnd(what === "reschedule" ? booking.expectedEndDate ?? "" : "");
    setNote("");
    setReason(null);
    setFlow({ kind: "editing", what, booking });
  }, []);

  const backToList = useCallback(() => {
    setFlow({ kind: "listing" });
    reload();
  }, [reload]);

  if (flow.kind === "done") {
    return (
      <View style={styles.stack} testID="sent-proposals-done">
        <Body>{t(doneKey(flow.act, flow.outcome))}</Body>
        <Button testID="sent-proposals-back" label={t("sentProposals.title")} onPress={backToList} />
      </View>
    );
  }

  if (flow.kind === "editing") {
    const { booking, what } = flow;
    const startOk = ISO_DAY.test(start.trim());
    const endOk = end.trim() === "" || (ISO_DAY.test(end.trim()) && end.trim() >= start.trim());
    return (
      <View style={styles.stack} testID={`sent-proposals-${what}-form`}>
        <Title>{booking.roleText ?? t("sentProposals.noRole")}</Title>
        <Body muted>{datesOf(booking, t)}</Body>
        {what === "reschedule" ? (
          <>
            {booking.status === "accepted" ? <Body muted>{t("sentProposals.reopenHint")}</Body> : null}
            <Field
              testID="sent-proposals-start"
              label={t("sentProposals.startDate")}
              placeholder="2027-05-03"
              value={start}
              onChangeText={setStart}
              maxLength={10}
              autoCapitalize="none"
            />
            <Field
              testID="sent-proposals-end"
              label={t("sentProposals.endDate")}
              placeholder="2027-05-31"
              value={end}
              onChangeText={setEnd}
              maxLength={10}
              autoCapitalize="none"
            />
          </>
        ) : (
          <>
            <Body muted>{t("sentProposals.reasonTitle")}</Body>
            {WITHDRAW_REASONS.map((value) => (
              <Button
                key={value}
                variant={reason === value ? "primary" : "quiet"}
                testID={`sent-proposals-reason-${value}`}
                label={t(`sentProposals.reason.${value}` as MessageKey)}
                onPress={() => setReason(reason === value ? null : value)}
              />
            ))}
          </>
        )}
        <Field
          testID="sent-proposals-note"
          label={t("sentProposals.noteLabel")}
          value={note}
          onChangeText={setNote}
          maxLength={500}
          multiline
        />
        <Button
          testID="sent-proposals-review"
          label={t("booking.review")}
          disabled={what === "reschedule" && !(startOk && endOk)}
          onPress={() => {
            const trimmed = note.trim();
            if (what === "reschedule") {
              void prepare({
                kind: "reschedule",
                booking,
                input: {
                  bookingId: booking.id,
                  startDate: start.trim(),
                  ...(end.trim() === "" ? {} : { endDate: end.trim() }),
                  ...(trimmed === "" ? {} : { note: trimmed }),
                },
              });
            } else {
              void prepare({
                kind: "withdraw",
                booking,
                input: {
                  bookingId: booking.id,
                  // A note rides along only with a reason (the server's own rule).
                  ...(reason === null ? {} : { reasonKind: reason, ...(trimmed === "" ? {} : { reasonNote: trimmed }) }),
                },
              });
            }
          }}
        />
        <Button variant="quiet" testID="sent-proposals-cancel" label={t("offers.cancel")} onPress={() => setFlow({ kind: "listing" })} />
      </View>
    );
  }

  if (flow.kind !== "listing") {
    const { act } = flow;
    const summary =
      act.kind === "reschedule"
        ? [act.input.endDate ? `${act.input.startDate} – ${act.input.endDate}` : act.input.startDate, act.input.note ?? ""]
        : [act.input.reasonKind ? t(`sentProposals.reason.${act.input.reasonKind}` as MessageKey) : "", act.input.reasonNote ?? ""];
    return (
      <View style={styles.stack} testID="sent-proposals-preview">
        <NotAvailable
          title={t(act.kind === "reschedule" ? "sentProposals.save" : "sentProposals.confirmWithdraw")}
          body={[act.booking.roleText ?? t("sentProposals.noRole"), ...summary].filter((x) => x !== "").join(" · ")}
        >
          {flow.kind === "failed" ? (
            <CapabilityFailureNotice
              failure={flow.failure}
              title="cv.saveFailedTitle"
              retry={() => void prepare(act)}
              testID="sent-proposals-failure"
            />
          ) : null}
          {flow.kind === "ready" || flow.kind === "sending" ? (
            <Button
              testID="sent-proposals-confirm"
              label={t("agency.confirm")}
              busy={flow.kind === "sending"}
              onPress={() => void confirm(act, flow.token)}
            />
          ) : null}
        </NotAvailable>
        <Button
          variant="quiet"
          testID="sent-proposals-cancel"
          label={t("offers.cancel")}
          disabled={flow.kind === "sending"}
          onPress={() => setFlow({ kind: "listing" })}
        />
      </View>
    );
  }

  return (
    <CapabilityGate state={bookings.state} reload={bookings.reload}>
      {(data) =>
        data.outgoing.length === 0 ? (
          <View testID="sent-proposals-empty">
            <Body muted>{t("sentProposals.empty")}</Body>
          </View>
        ) : (
          <View style={styles.stack} testID="sent-proposals-list">
            {data.outgoing.map((b, index) => (
              <View key={b.id} style={styles.row} testID={`sent-proposals-row-${index}`}>
                <Body>{b.roleText ?? t("sentProposals.noRole")}</Body>
                <Body muted>{datesOf(b, t)}</Body>
                <View testID={`sent-proposals-status-${index}`}>
                  <Body muted>{t(`sentProposals.status.${b.status}` as MessageKey)}</Body>
                </View>
                {b.status === "proposed" || b.status === "accepted" ? (
                  <Button
                    variant="quiet"
                    testID={`sent-proposals-reschedule-${index}`}
                    label={t(b.status === "accepted" ? "sentProposals.rescheduleAccepted" : "sentProposals.reschedule")}
                    onPress={() => edit("reschedule", b)}
                  />
                ) : null}
                {b.status === "proposed" ? (
                  <Button
                    variant="quiet"
                    testID={`sent-proposals-withdraw-${index}`}
                    label={t("sentProposals.withdraw")}
                    onPress={() => edit("withdraw", b)}
                  />
                ) : null}
                <Divider />
              </View>
            ))}
          </View>
        )
      }
    </CapabilityGate>
  );
}

const styles = StyleSheet.create({
  stack: { gap: theme.space.md },
  row: { gap: theme.space.xs },
});
