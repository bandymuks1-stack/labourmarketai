import React, { useCallback, useEffect, useRef, useState } from "react";
import { StyleSheet, View } from "react-native";

import { useAuth } from "../auth-context";
import type { RespondPrepareData } from "../capability-shapes";
import { capability, type DomainFailure } from "../domain";
import { useLocale } from "../i18n/locale-context";
import { Body, Button, Field, NotAvailable } from "../ui/primitives";
import { theme } from "../ui/theme";
import { CapabilityFailureNotice } from "./capability-failure";

type Flow =
  | { readonly kind: "writing"; readonly dateInvalid: boolean }
  | { readonly kind: "preparing" }
  | { readonly kind: "ready"; readonly prepared: RespondPrepareData }
  | { readonly kind: "confirming"; readonly prepared: RespondPrepareData }
  | { readonly kind: "failed"; readonly failure: DomainFailure; readonly prepared: RespondPrepareData | null }
  | { readonly kind: "sent" };

/** "" → null; a real YYYY-MM-DD → itself; anything else → undefined (invalid). */
function optionalDate(text: string): string | null | undefined {
  const v = text.trim();
  if (v === "") return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return undefined;
  const d = new Date(`${v}T00:00:00Z`);
  return Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== v ? undefined : v;
}

/**
 * PROPOSE A BOOKING — `company.propose-booking`, the web's own STRONG step for
 * a need and one candidate. `.prepare` checks the role, the need and the person
 * and writes nothing; `.confirm` sends the prepare's own `input` with its token,
 * and the person then sees the proposal in their offers. Dates and a note are
 * optional, as on the web.
 */
export function ProposeBooking({
  needId,
  workerId,
  onClose,
}: {
  needId: string;
  workerId: string;
  onClose: () => void;
}) {
  const { t, locale } = useLocale();
  const { accessToken } = useAuth();
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [note, setNote] = useState("");
  const [flow, setFlow] = useState<Flow>({ kind: "writing", dateInvalid: false });
  const live = useRef(true);
  useEffect(() => {
    live.current = true;
    return () => {
      live.current = false;
    };
  }, []);

  const prepare = useCallback(async () => {
    const startDate = optionalDate(start);
    const expectedEndDate = optionalDate(end);
    if (
      startDate === undefined ||
      expectedEndDate === undefined ||
      (startDate !== null && expectedEndDate !== null && expectedEndDate < startDate)
    ) {
      setFlow({ kind: "writing", dateInvalid: true });
      return;
    }
    setFlow({ kind: "preparing" });
    const r = await capability<RespondPrepareData>({
      name: "company.propose-booking.prepare",
      args: {
        requestId: needId,
        workerId,
        startDate,
        expectedEndDate,
        note: note.trim() === "" ? null : note.trim(),
      },
      accessToken,
      locale,
    });
    if (!live.current) return;
    setFlow(r.ok ? { kind: "ready", prepared: r.data } : { kind: "failed", failure: r.failure, prepared: null });
  }, [accessToken, end, locale, needId, note, start, workerId]);

  const confirm = useCallback(
    async (prepared: RespondPrepareData) => {
      setFlow({ kind: "confirming", prepared });
      const r = await capability<unknown>({
        name: "company.propose-booking.confirm",
        // The prepare's own input, byte for byte — the token is bound to it.
        args: { input: prepared.input, confirmationToken: prepared.confirmationToken },
        accessToken,
        locale,
      });
      if (!live.current) return;
      setFlow(r.ok ? { kind: "sent" } : { kind: "failed", failure: r.failure, prepared });
    },
    [accessToken, locale],
  );

  if (flow.kind === "sent") {
    return (
      <View style={styles.stack} testID="booking-sent">
        <Body>{t("booking.sent")}</Body>
        <Button variant="quiet" label={t("cv.cancel")} onPress={onClose} />
      </View>
    );
  }

  if (flow.kind === "ready" || flow.kind === "confirming") {
    const prepared = flow.prepared;
    return (
      <NotAvailable title={t("booking.confirmTitle")} body={t("booking.confirmBody")}>
        <Button
          testID={`booking-confirm-${workerId}`}
          label={t("booking.confirm")}
          busy={flow.kind === "confirming"}
          onPress={() => void confirm(prepared)}
        />
        <Button
          variant="quiet"
          label={t("cv.cancel")}
          disabled={flow.kind === "confirming"}
          onPress={() => setFlow({ kind: "writing", dateInvalid: false })}
        />
      </NotAvailable>
    );
  }

  const busy = flow.kind === "preparing";
  return (
    <View style={styles.stack} testID={`booking-form-${workerId}`}>
      <Field
        testID="booking-start"
        label={t("booking.startLabel")}
        placeholder="2026-12-01"
        value={start}
        onChangeText={setStart}
        maxLength={10}
        editable={!busy}
      />
      <Field
        testID="booking-end"
        label={t("booking.endLabel")}
        placeholder="2027-03-31"
        value={end}
        onChangeText={setEnd}
        maxLength={10}
        editable={!busy}
      />
      <Field
        testID="booking-note"
        label={t("booking.noteLabel")}
        value={note}
        onChangeText={setNote}
        maxLength={1000}
        multiline
        editable={!busy}
      />
      {flow.kind === "writing" && flow.dateInvalid ? <Body>{t("booking.dateInvalid")}</Body> : null}
      {flow.kind === "failed" ? (
        <CapabilityFailureNotice
          failure={flow.failure}
          title="booking.failedTitle"
          retry={() => void (flow.prepared ? confirm(flow.prepared) : prepare())}
          testID="booking-failure"
        />
      ) : null}
      <Button testID={`booking-review-${workerId}`} label={t("booking.review")} busy={busy} onPress={() => void prepare()} />
      <Button variant="quiet" label={t("cv.cancel")} disabled={busy} onPress={onClose} />
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { gap: theme.space.md },
});
