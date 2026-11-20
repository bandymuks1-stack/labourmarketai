import React, { useCallback, useEffect, useRef, useState } from "react";
import { StyleSheet, View } from "react-native";

import { useAuth } from "../auth-context";
import type { RespondPrepareData } from "../capability-shapes";
import { capability, type DomainFailure } from "../domain";
import { useLocale } from "../i18n/locale-context";
import { Body, Button, Field, NotAvailable } from "../ui/primitives";
import { theme } from "../ui/theme";
import { CapabilityFailureNotice } from "./capability-failure";

/**
 * INVITE A CLIENT — a staffing agency invites a company by e-mail, the web
 * chat's own `agency.invite-client` (prepare → confirm). The connection stays
 * PENDING until the client accepts; the agency is the active workspace's
 * company (never sent from here), and the server re-checks it is an agency.
 */
type Flow =
  | { readonly kind: "writing" }
  | { readonly kind: "preparing" }
  | { readonly kind: "ready" | "sending"; readonly prepared: RespondPrepareData }
  | { readonly kind: "failed"; readonly failure: DomainFailure }
  | { readonly kind: "done" };

export function AgencyInviteClient() {
  const { t, locale } = useLocale();
  const { accessToken } = useAuth();
  const [flow, setFlow] = useState<Flow>({ kind: "writing" });
  const [email, setEmail] = useState("");

  const live = useRef(true);
  useEffect(() => {
    live.current = true;
    return () => {
      live.current = false;
    };
  }, []);

  const prepare = useCallback(async () => {
    setFlow({ kind: "preparing" });
    const r = await capability<RespondPrepareData>({
      name: "agency.invite-client.prepare",
      args: { email: email.trim() },
      accessToken,
      locale,
    });
    if (!live.current) return;
    setFlow(r.ok ? { kind: "ready", prepared: r.data } : { kind: "failed", failure: r.failure });
  }, [accessToken, email, locale]);

  const confirm = useCallback(
    async (prepared: RespondPrepareData) => {
      setFlow({ kind: "sending", prepared });
      const r = await capability<unknown>({
        name: "agency.invite-client.confirm",
        // The PREPARE's own input — the token is bound to it.
        args: { input: prepared.input, confirmationToken: prepared.confirmationToken },
        accessToken,
        locale,
      });
      if (!live.current) return;
      setFlow(r.ok ? { kind: "done" } : { kind: "failed", failure: r.failure });
    },
    [accessToken, locale],
  );

  const reset = useCallback(() => {
    setFlow({ kind: "writing" });
    setEmail("");
  }, []);

  if (flow.kind === "done") {
    return (
      <View style={styles.stack} testID="agency-invite-done">
        <Body>{t("agencyInvite.done")}</Body>
        <Button variant="quiet" testID="agency-invite-again" label={t("agencyInvite.title")} onPress={reset} />
      </View>
    );
  }

  if (flow.kind === "ready" || flow.kind === "sending") {
    const prepared = flow.prepared;
    return (
      <View style={styles.stack} testID="agency-invite-preview">
        <NotAvailable title={t("agencyInvite.title")} body={email.trim()}>
          <Button
            testID="agency-invite-confirm"
            label={t("agency.confirm")}
            busy={flow.kind === "sending"}
            onPress={() => void confirm(prepared)}
          />
        </NotAvailable>
        <Button
          variant="quiet"
          testID="agency-invite-cancel"
          label={t("offers.cancel")}
          disabled={flow.kind === "sending"}
          onPress={() => setFlow({ kind: "writing" })}
        />
      </View>
    );
  }

  return (
    <View style={styles.stack} testID="agency-invite-form">
      <Body>{t("agencyInvite.title")}</Body>
      <Field
        testID="agency-invite-email"
        label={t("agencyInvite.email")}
        placeholder={t("agencyInvite.emailPlaceholder")}
        value={email}
        onChangeText={setEmail}
        maxLength={254}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="email-address"
        editable={flow.kind !== "preparing"}
      />
      {flow.kind === "failed" ? (
        <CapabilityFailureNotice
          failure={flow.failure}
          title="cv.saveFailedTitle"
          retry={() => void prepare()}
          testID="agency-invite-failure"
        />
      ) : null}
      <Button
        testID="agency-invite-review"
        label={t("booking.review")}
        busy={flow.kind === "preparing"}
        disabled={email.trim() === ""}
        onPress={() => void prepare()}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { gap: theme.space.md },
});
