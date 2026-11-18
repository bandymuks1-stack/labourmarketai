import React, { useCallback, useEffect, useRef, useState } from "react";
import { StyleSheet, View } from "react-native";

import { useAuth } from "../auth-context";
import type {
  AgencyClientsData,
  AgencyRosterWorker,
  AgencySharedNeed,
  RespondPrepareData,
} from "../capability-shapes";
import { capability, type DomainFailure } from "../domain";
import { useLocale } from "../i18n/locale-context";
import { Body, Button, Divider, Field, NotAvailable } from "../ui/primitives";
import { theme } from "../ui/theme";
import { useCapability } from "../use-capability";
import { useReloadOnReturn } from "../use-reload-on-return";
import { CapabilityFailureNotice } from "./capability-failure";
import { CapabilityGate } from "./capability-gate";

/**
 * AGENCY — a staffing agency proposes its own people for the needs its clients
 * shared, and follows its proposals. The web chat's own capabilities (owner
 * order 2026-11-16: one shared client, no parallel backend):
 *
 *   agency.clients.get                         → shared needs, the roster, proposals
 *   agency.propose-candidate.prepare / .confirm → one roster worker for one shared need
 *
 * The roster is the agency's OWN people (the same label the web's agency
 * bridge shows). Proposing is the web's IMPORTANT step: nothing is written
 * until the person confirms the preview; the confirm sends the prepare's input.
 */
const NO_ARGS = {} as const;

type Flow =
  | { readonly kind: "listing" }
  | { readonly kind: "choosing"; readonly need: AgencySharedNeed; readonly workerId: string | null }
  | { readonly kind: "preparing"; readonly need: AgencySharedNeed; readonly worker: AgencyRosterWorker }
  | {
      readonly kind: "prepare_failed";
      readonly need: AgencySharedNeed;
      readonly worker: AgencyRosterWorker;
      readonly failure: DomainFailure;
    }
  | {
      readonly kind: "ready" | "sending";
      readonly need: AgencySharedNeed;
      readonly worker: AgencyRosterWorker;
      readonly prepared: RespondPrepareData;
    }
  | {
      readonly kind: "send_failed";
      readonly need: AgencySharedNeed;
      readonly worker: AgencyRosterWorker;
      readonly prepared: RespondPrepareData;
      readonly failure: DomainFailure;
    }
  | { readonly kind: "done" };

export function AgencyScreen() {
  const { t, locale } = useLocale();
  const { accessToken } = useAuth();
  const clients = useCapability<AgencyClientsData>("agency.clients.get", NO_ARGS);
  const [flow, setFlow] = useState<Flow>({ kind: "listing" });
  const [note, setNote] = useState("");

  const reload = clients.reload;
  useReloadOnReturn(reload, () => flow.kind === "listing");

  const live = useRef(true);
  useEffect(() => {
    live.current = true;
    return () => {
      live.current = false;
    };
  }, []);

  const prepare = useCallback(
    async (need: AgencySharedNeed, worker: AgencyRosterWorker) => {
      setFlow({ kind: "preparing", need, worker });
      const result = await capability<RespondPrepareData>({
        name: "agency.propose-candidate.prepare",
        args: { shareId: need.shareId, workerId: worker.workerId, note: note.trim() === "" ? null : note.trim() },
        accessToken,
        locale,
      });
      if (!live.current) return;
      setFlow(
        result.ok
          ? { kind: "ready", need, worker, prepared: result.data }
          : { kind: "prepare_failed", need, worker, failure: result.failure },
      );
    },
    [accessToken, locale, note],
  );

  const confirm = useCallback(
    async (need: AgencySharedNeed, worker: AgencyRosterWorker, prepared: RespondPrepareData) => {
      setFlow({ kind: "sending", need, worker, prepared });
      const result = await capability<unknown>({
        name: "agency.propose-candidate.confirm",
        // The PREPARE's own input — the token is bound to it.
        args: { input: prepared.input, confirmationToken: prepared.confirmationToken },
        accessToken,
        locale,
      });
      if (!live.current) return;
      setFlow(
        result.ok
          ? { kind: "done" }
          : { kind: "send_failed", need, worker, prepared, failure: result.failure },
      );
    },
    [accessToken, locale],
  );

  const backToList = useCallback(() => {
    setFlow({ kind: "listing" });
    setNote("");
    reload();
  }, [reload]);

  if (flow.kind === "done") {
    return (
      <View style={styles.stack} testID="agency-done">
        <Body>{t("agency.proposeDone")}</Body>
        <Button testID="agency-back" label={t("offers.cancel")} onPress={backToList} />
      </View>
    );
  }

  if (flow.kind === "choosing") {
    const roster = clients.state.status === "loaded" && clients.state.data.kind === "ok" ? clients.state.data.roster : [];
    const chosen = roster.find((w) => w.workerId === flow.workerId) ?? null;
    return (
      <View style={styles.stack} testID="agency-propose-form">
        <Body>{flow.need.title}</Body>
        <Body muted>{t("agency.rosterWorker")}</Body>
        {roster.length === 0 ? (
          <Body muted>{t("agency.rosterEmpty")}</Body>
        ) : (
          roster.map((w) => (
            <Button
              key={w.workerId}
              variant={flow.workerId === w.workerId ? "primary" : "quiet"}
              testID={`agency-worker-${w.workerId}`}
              label={w.label}
              onPress={() => setFlow({ kind: "choosing", need: flow.need, workerId: w.workerId })}
            />
          ))
        )}
        <Field
          testID="agency-note"
          label={t("agency.noteLabel")}
          placeholder={t("agency.notePlaceholder")}
          value={note}
          onChangeText={setNote}
          maxLength={1000}
          multiline
        />
        <Button
          testID="agency-review"
          label={t("booking.review")}
          disabled={chosen === null}
          onPress={() => {
            if (chosen !== null) void prepare(flow.need, chosen);
          }}
        />
        <Button variant="quiet" label={t("offers.cancel")} onPress={backToList} />
      </View>
    );
  }

  if (flow.kind !== "listing") {
    const preparing = flow.kind === "preparing" || flow.kind === "prepare_failed";
    const busy = flow.kind === "preparing" || flow.kind === "sending";
    return (
      <View style={styles.stack} testID="agency-preview">
        <NotAvailable title={t("agency.proposeTitle")} body={t("offers.previewBody")}>
          <Body>{flow.need.title}</Body>
          <Body muted>{flow.worker.label}</Body>
          {note.trim() !== "" ? <Body muted>{note.trim()}</Body> : null}
        </NotAvailable>
        {flow.kind === "prepare_failed" || flow.kind === "send_failed" ? (
          <CapabilityFailureNotice
            failure={flow.failure}
            title="cv.saveFailedTitle"
            retry={
              flow.kind === "prepare_failed"
                ? () => void prepare(flow.need, flow.worker)
                : () => void confirm(flow.need, flow.worker, flow.prepared)
            }
            testID="agency-failure"
          />
        ) : null}
        {!preparing ? (
          <Button
            testID="agency-confirm"
            label={t("agency.confirm")}
            busy={busy}
            onPress={() => {
              if (flow.kind === "ready" || flow.kind === "send_failed") void confirm(flow.need, flow.worker, flow.prepared);
            }}
          />
        ) : null}
        <Button
          variant="quiet"
          testID="agency-cancel"
          label={t("offers.cancel")}
          disabled={flow.kind === "sending"}
          onPress={backToList}
        />
      </View>
    );
  }

  return (
    <CapabilityGate state={clients.state} reload={clients.reload}>
      {(data) => {
        if (data.kind !== "ok") {
          return (
            <View testID="agency-not-agency">
              <Body muted>{t("agency.notAgency")}</Body>
            </View>
          );
        }
        return (
          <View style={styles.stack} testID="agency-list">
            {data.shared.length === 0 ? (
              <Body muted>{t("agency.sharedNone")}</Body>
            ) : (
              <>
                <Body>{t("agency.sharedIntro")}</Body>
                {data.shared.map((need) => (
                  <View key={need.shareId} style={styles.row} testID={`agency-need-${need.shareId}`}>
                    <Body>{need.title}</Body>
                    <Button
                      variant="quiet"
                      testID={`agency-propose-${need.shareId}`}
                      label={t("agency.proposeFor")}
                      onPress={() => setFlow({ kind: "choosing", need, workerId: null })}
                    />
                    <Divider />
                  </View>
                ))}
              </>
            )}
            {data.progress.length === 0 ? (
              <Body muted>{t("agency.proposalsNone")}</Body>
            ) : (
              <>
                <Body>{t("agency.proposalsIntro")}</Body>
                {data.progress.map((p) => (
                  <View key={p.offerId} style={styles.row} testID={`agency-proposal-${p.offerId}`}>
                    <Body>{p.title}</Body>
                    <Body muted>
                      {p.workerLabel} · {p.decisionLabel ?? p.stageLabel}
                    </Body>
                  </View>
                ))}
              </>
            )}
          </View>
        );
      }}
    </CapabilityGate>
  );
}

const styles = StyleSheet.create({
  stack: { gap: theme.space.md },
  row: { gap: theme.space.xs },
});
