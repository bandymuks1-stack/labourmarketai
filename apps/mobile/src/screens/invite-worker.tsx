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
 * INVITE A WORKER — an organization (employer or staffing agency) invites a
 * person to its roster by e-mail, the web chat's own `company.invite-worker`
 * (prepare → confirm). Nothing is mailed: the person signs in with that
 * address and accepts under Offers, then appears on the roster (for an
 * agency, among the people it may propose). The organization is the active
 * workspace's; the server re-checks who may invite.
 */
type Flow =
  | { readonly kind: "writing" }
  | { readonly kind: "preparing" }
  | { readonly kind: "ready" | "sending"; readonly prepared: RespondPrepareData }
  | { readonly kind: "failed"; readonly failure: DomainFailure }
  | { readonly kind: "done"; readonly invited: boolean };

export function InviteWorkerScreen() {
  const { t, locale } = useLocale();
  const { accessToken } = useAuth();
  const [flow, setFlow] = useState<Flow>({ kind: "writing" });
  const [email, setEmail] = useState("");
  const [note, setNote] = useState("");

  const live = useRef(true);
  useEffect(() => {
    live.current = true;
    return () => {
      live.current = false;
    };
  }, []);

  const prepare = useCallback(async () => {
    setFlow({ kind: "preparing" });
    const trimmed = note.trim();
    const r = await capability<RespondPrepareData>({
      name: "company.invite-worker.prepare",
      args: trimmed === "" ? { email: email.trim() } : { email: email.trim(), note: trimmed },
      accessToken,
      locale,
    });
    if (!live.current) return;
    setFlow(r.ok ? { kind: "ready", prepared: r.data } : { kind: "failed", failure: r.failure });
  }, [accessToken, email, locale, note]);

  const confirm = useCallback(
    async (prepared: RespondPrepareData) => {
      setFlow({ kind: "sending", prepared });
      const r = await capability<{ outcome?: string }>({
        name: "company.invite-worker.confirm",
        // The PREPARE's own input — the token is bound to it.
        args: { input: prepared.input, confirmationToken: prepared.confirmationToken },
        accessToken,
        locale,
      });
      if (!live.current) return;
      setFlow(r.ok ? { kind: "done", invited: r.data.outcome === "invited" } : { kind: "failed", failure: r.failure });
    },
    [accessToken, locale],
  );

  const reset = useCallback(() => {
    setFlow({ kind: "writing" });
    setEmail("");
    setNote("");
  }, []);

  if (flow.kind === "done") {
    return (
      <View style={styles.stack} testID="invite-worker-done">
        <Body>{t(flow.invited ? "inviteWorker.done" : "inviteWorker.exists")}</Body>
        <Button variant="quiet" testID="invite-worker-again" label={t("inviteWorker.title")} onPress={reset} />
      </View>
    );
  }

  if (flow.kind === "ready" || flow.kind === "sending") {
    const prepared = flow.prepared;
    return (
      <View style={styles.stack} testID="invite-worker-preview">
        <NotAvailable title={t("inviteWorker.title")} body={[email.trim(), note.trim()].filter((x) => x !== "").join(" · ")}>
          <Button
            testID="invite-worker-confirm"
            label={t("agency.confirm")}
            busy={flow.kind === "sending"}
            onPress={() => void confirm(prepared)}
          />
        </NotAvailable>
        <Button
          variant="quiet"
          testID="invite-worker-cancel"
          label={t("offers.cancel")}
          disabled={flow.kind === "sending"}
          onPress={() => setFlow({ kind: "writing" })}
        />
      </View>
    );
  }

  return (
    <View style={styles.stack} testID="invite-worker-form">
      <Field
        testID="invite-worker-email"
        label={t("inviteWorker.email")}
        placeholder={t("inviteWorker.emailPlaceholder")}
        value={email}
        onChangeText={setEmail}
        maxLength={254}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="email-address"
        editable={flow.kind !== "preparing"}
      />
      <Field
        testID="invite-worker-note"
        label={t("inviteWorker.note")}
        placeholder={t("inviteWorker.notePlaceholder")}
        value={note}
        onChangeText={setNote}
        maxLength={500}
        multiline
        editable={flow.kind !== "preparing"}
      />
      {flow.kind === "failed" ? (
        <CapabilityFailureNotice
          failure={flow.failure}
          title="cv.saveFailedTitle"
          retry={() => void prepare()}
          testID="invite-worker-failure"
        />
      ) : null}
      <Button
        testID="invite-worker-review"
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
