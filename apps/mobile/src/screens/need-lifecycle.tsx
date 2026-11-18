import React, { useEffect, useRef, useState } from "react";
import { StyleSheet, View } from "react-native";

import { useAuth } from "../auth-context";
import { capability, type DomainFailure } from "../domain";
import { useLocale } from "../i18n/locale-context";
import { Button, NotAvailable } from "../ui/primitives";
import { theme } from "../ui/theme";
import { CapabilityFailureNotice } from "./capability-failure";

type Flow =
  | { readonly kind: "idle" }
  | { readonly kind: "drafting" }
  | { readonly kind: "ready"; readonly token: string }
  | { readonly kind: "confirming"; readonly token: string }
  | { readonly kind: "failed"; readonly failure: DomainFailure };

/**
 * CLOSE / REOPEN A NEED — `demand.close_*` and `demand.reopen_*`, the web's
 * own two steps. The draft writes nothing and returns a one-time token; the
 * confirm sends the same `requestId` with it. Closing keeps the need's
 * candidates and shortlist as history; reopening is subject to the same plan
 * ceiling as creating a need (the server says so when it refuses).
 */
export function NeedLifecycle({
  needId,
  closed,
  onChanged,
}: {
  needId: string;
  closed: boolean;
  onChanged: () => void;
}) {
  const { t, locale } = useLocale();
  const { accessToken } = useAuth();
  const op = closed ? "reopen" : "close";
  const [flow, setFlow] = useState<Flow>({ kind: "idle" });
  const live = useRef(true);
  useEffect(() => {
    live.current = true;
    return () => {
      live.current = false;
    };
  }, []);

  const draft = async () => {
    setFlow({ kind: "drafting" });
    const r = await capability<{ confirmationToken: string }>({
      name: `demand.${op}_draft`,
      args: { requestId: needId },
      accessToken,
      locale,
    });
    if (!live.current) return;
    setFlow(r.ok ? { kind: "ready", token: r.data.confirmationToken } : { kind: "failed", failure: r.failure });
  };
  const confirm = async (token: string) => {
    setFlow({ kind: "confirming", token });
    const r = await capability<unknown>({
      name: `demand.${op}_confirm`,
      args: { requestId: needId, confirmationToken: token },
      accessToken,
      locale,
    });
    if (!live.current) return;
    if (!r.ok) {
      setFlow({ kind: "failed", failure: r.failure });
      return;
    }
    setFlow({ kind: "idle" });
    onChanged();
  };

  return (
    <View style={styles.stack}>
      {flow.kind === "ready" || flow.kind === "confirming" ? (
        <NotAvailable
          title={t(closed ? "needs.reopenTitle" : "needs.closeTitle")}
          body={t(closed ? "needs.reopenBody" : "needs.closeBody")}
        >
          <Button
            testID={`need-${op}-confirm-${needId}`}
            label={t(closed ? "needs.reopen" : "needs.close")}
            busy={flow.kind === "confirming"}
            onPress={() => void confirm(flow.token)}
          />
          <Button
            variant="quiet"
            label={t("cv.cancel")}
            disabled={flow.kind === "confirming"}
            onPress={() => setFlow({ kind: "idle" })}
          />
        </NotAvailable>
      ) : (
        <Button
          variant="quiet"
          testID={`need-${op}-${needId}`}
          label={t(closed ? "needs.reopen" : "needs.close")}
          busy={flow.kind === "drafting"}
          onPress={() => void draft()}
        />
      )}
      {flow.kind === "failed" ? (
        <CapabilityFailureNotice
          failure={flow.failure}
          title="cv.saveFailedTitle"
          retry={() => void draft()}
          testID="need-lifecycle-failure"
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { gap: theme.space.sm },
});
