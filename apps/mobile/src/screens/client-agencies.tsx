import React, { useCallback, useEffect, useRef, useState } from "react";
import { StyleSheet, View } from "react-native";

import { useAuth } from "../auth-context";
import type { ClientAgenciesData, ClientAgencyInvite, ClientAgencyShareable, RespondPrepareData } from "../capability-shapes";
import { capability, type DomainFailure } from "../domain";
import { useLocale } from "../i18n/locale-context";
import type { MessageKey } from "../i18n/messages";
import { Body, Button, Divider, NotAvailable } from "../ui/primitives";
import { theme } from "../ui/theme";
import { useCapability } from "../use-capability";
import { useReloadOnReturn } from "../use-reload-on-return";
import { CapabilityFailureNotice } from "./capability-failure";
import { CapabilityGate } from "./capability-gate";

/**
 * STAFFING AGENCIES (the client's side of the agency bridge) — a company
 * answers an agency's invitation and shares its own needs with a connected
 * agency. The web chat's own capabilities (owner order 2026-11-16: one
 * shared client, no parallel backend):
 *
 *   client.agency_connections.get                → waiting invitations, shareable needs
 *   company.accept-connection / decline-connection → answer one invitation
 *   company.share-request                          → one need to one connected agency
 *
 * The client company is the active workspace's (never sent from here); the
 * server re-checks ownership and that the invitation was addressed to this
 * person's own e-mail. Nothing is written until the person confirms.
 */
const NO_ARGS = {} as const;

type Act =
  | { readonly kind: "accept" | "decline"; readonly invite: ClientAgencyInvite }
  | { readonly kind: "share"; readonly pair: ClientAgencyShareable };

const ACTION: Record<Act["kind"], string> = {
  accept: "company.accept-connection",
  decline: "company.decline-connection",
  share: "company.share-request",
};
const LABEL: Record<Act["kind"], MessageKey> = {
  accept: "clientBridge.accept",
  decline: "clientBridge.decline",
  share: "clientBridge.share",
};
const DONE: Record<Act["kind"], MessageKey> = {
  accept: "clientBridge.accepted",
  decline: "clientBridge.declined",
  share: "clientBridge.shared",
};

function argsOf(act: Act): Record<string, string> {
  return act.kind === "share"
    ? { connectionId: act.pair.connectionId, requestId: act.pair.requestId }
    : { connectionId: act.invite.connectionId };
}

function subjectOf(act: Act): string {
  return act.kind === "share" ? `${act.pair.demandTitle} → ${act.pair.agencyName}` : act.invite.agencyName;
}

type Flow =
  | { readonly kind: "listing" }
  | { readonly kind: "preparing"; readonly act: Act }
  | { readonly kind: "ready" | "sending"; readonly act: Act; readonly prepared: RespondPrepareData }
  | { readonly kind: "failed"; readonly act: Act; readonly failure: DomainFailure; readonly prepared: RespondPrepareData | null }
  | { readonly kind: "done"; readonly act: Act };

export function ClientAgenciesScreen() {
  const { t, locale } = useLocale();
  const { accessToken } = useAuth();
  const bridge = useCapability<ClientAgenciesData>("client.agency_connections.get", NO_ARGS);
  const [flow, setFlow] = useState<Flow>({ kind: "listing" });

  const reload = bridge.reload;
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
      const r = await capability<RespondPrepareData>({
        name: `${ACTION[act.kind]}.prepare`,
        args: argsOf(act),
        accessToken,
        locale,
      });
      if (!live.current) return;
      setFlow(r.ok ? { kind: "ready", act, prepared: r.data } : { kind: "failed", act, failure: r.failure, prepared: null });
    },
    [accessToken, locale],
  );

  const confirm = useCallback(
    async (act: Act, prepared: RespondPrepareData) => {
      setFlow({ kind: "sending", act, prepared });
      const r = await capability<unknown>({
        name: `${ACTION[act.kind]}.confirm`,
        // The PREPARE's own input — the token is bound to it.
        args: { input: prepared.input, confirmationToken: prepared.confirmationToken },
        accessToken,
        locale,
      });
      if (!live.current) return;
      setFlow(r.ok ? { kind: "done", act } : { kind: "failed", act, failure: r.failure, prepared });
    },
    [accessToken, locale],
  );

  const backToList = useCallback(() => {
    setFlow({ kind: "listing" });
    reload();
  }, [reload]);

  if (flow.kind === "done") {
    return (
      <View style={styles.stack} testID="client-agencies-done">
        <Body>{t(DONE[flow.act.kind])}</Body>
        <Button testID="client-agencies-back" label={t("offers.backToList")} onPress={backToList} />
      </View>
    );
  }

  if (flow.kind !== "listing") {
    const { act } = flow;
    return (
      <View style={styles.stack} testID="client-agencies-preview">
        <NotAvailable title={t(LABEL[act.kind])} body={subjectOf(act)}>
          {flow.kind === "failed" ? (
            <CapabilityFailureNotice
              failure={flow.failure}
              title="cv.saveFailedTitle"
              retry={() => {
                const prepared = flow.prepared;
                void (prepared ? confirm(act, prepared) : prepare(act));
              }}
              testID="client-agencies-failure"
            />
          ) : null}
          {flow.kind === "ready" || flow.kind === "sending" ? (
            <Button
              testID="client-agencies-confirm"
              label={t("agency.confirm")}
              busy={flow.kind === "sending"}
              onPress={() => void confirm(act, flow.prepared)}
            />
          ) : null}
        </NotAvailable>
        <Button
          variant="quiet"
          testID="client-agencies-cancel"
          label={t("offers.cancel")}
          disabled={flow.kind === "sending"}
          onPress={() => setFlow({ kind: "listing" })}
        />
      </View>
    );
  }

  return (
    <CapabilityGate state={bridge.state} reload={bridge.reload}>
      {(data) =>
        data.invites.length === 0 && data.shareable.length === 0 ? (
          <View testID="client-agencies-none">
            <Body muted>{t("clientBridge.none")}</Body>
          </View>
        ) : (
          <View style={styles.stack} testID="client-agencies-list">
            {data.invites.length > 0 ? (
              <>
                <Body>{t("clientBridge.invitesIntro")}</Body>
                {data.invites.map((invite) => (
                  <View key={invite.connectionId} style={styles.row} testID={`client-agencies-invite-${invite.connectionId}`}>
                    <Body>{invite.agencyName}</Body>
                    <Button
                      testID={`client-agencies-accept-${invite.connectionId}`}
                      label={t("clientBridge.accept")}
                      onPress={() => void prepare({ kind: "accept", invite })}
                    />
                    <Button
                      variant="quiet"
                      testID={`client-agencies-decline-${invite.connectionId}`}
                      label={t("clientBridge.decline")}
                      onPress={() => void prepare({ kind: "decline", invite })}
                    />
                    <Divider />
                  </View>
                ))}
              </>
            ) : null}
            {data.shareable.length > 0 ? (
              <>
                <Body>{t("clientBridge.shareIntro")}</Body>
                {data.shareable.map((pair, index) => (
                  <View key={`${pair.connectionId}:${pair.requestId}`} style={styles.row} testID={`client-agencies-shareable-${index}`}>
                    <Body>{pair.demandTitle}</Body>
                    <Body muted>{pair.agencyName}</Body>
                    <Button
                      variant="quiet"
                      testID={`client-agencies-share-${index}`}
                      label={t("clientBridge.share")}
                      onPress={() => void prepare({ kind: "share", pair })}
                    />
                    <Divider />
                  </View>
                ))}
              </>
            ) : null}
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
