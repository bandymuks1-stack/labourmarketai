import React, { useCallback, useEffect, useRef, useState } from "react";
import { StyleSheet, View } from "react-native";

import { useAuth } from "../auth-context";
import type {
  ClientAgencyOffer,
  ClientOffersData,
  ClientTeamOffer,
  RespondPrepareData,
} from "../capability-shapes";
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
 * AGENCY OFFERS — the employer's answer to the candidates agencies offered and
 * the brigades / companies that offered themselves for its open needs. The web
 * chat's own capabilities, nothing new on the server:
 *
 *   client.agency_offers.get              → the same rows the scouting page renders
 *   company.respond-offer.prepare         → token for accept / decline (agency candidate)
 *   company.respond-team-offer.prepare    → token for agree / decline (brigade or company)
 *   … .confirm (the prepare's own input + token) → the canonical write
 *
 * No worker name reaches the phone: the read never returns one.
 */
const NO_ARGS = {} as const;

type Decision = "accepted" | "declined";
type Answer =
  | { readonly kind: "agency"; readonly offer: ClientAgencyOffer; readonly decision: Decision }
  | { readonly kind: "team"; readonly offer: ClientTeamOffer; readonly decision: Decision };

type Flow =
  | { readonly kind: "listing" }
  | { readonly kind: "preparing"; readonly answer: Answer }
  | { readonly kind: "prepare_failed"; readonly answer: Answer; readonly failure: DomainFailure }
  | { readonly kind: "ready"; readonly answer: Answer; readonly prepared: RespondPrepareData }
  | { readonly kind: "sending"; readonly answer: Answer; readonly prepared: RespondPrepareData }
  | {
      readonly kind: "send_failed";
      readonly answer: Answer;
      readonly prepared: RespondPrepareData;
      readonly failure: DomainFailure;
    }
  | { readonly kind: "done"; readonly answer: Answer };

const capabilityOf = (answer: Answer) =>
  answer.kind === "agency" ? "company.respond-offer" : "company.respond-team-offer";

function doneText(answer: Answer): MessageKey {
  if (answer.kind === "agency") {
    return answer.decision === "accepted" ? "agencyOffers.accepted" : "agencyOffers.declined";
  }
  return answer.decision === "accepted" ? "agencyOffers.teamAgreed" : "agencyOffers.teamDeclined";
}

function previewTitle(answer: Answer): MessageKey {
  if (answer.decision === "declined") return "agencyOffers.decline";
  return answer.kind === "agency" ? "agencyOffers.accept" : "agencyOffers.agree";
}

export function AgencyOffersScreen() {
  const { t, locale } = useLocale();
  const { accessToken } = useAuth();
  const offers = useCapability<ClientOffersData>("client.agency_offers.get", NO_ARGS);
  const [flow, setFlow] = useState<Flow>({ kind: "listing" });

  const reload = offers.reload;
  useReloadOnReturn(reload, () => flow.kind === "listing");

  const live = useRef(true);
  useEffect(() => {
    live.current = true;
    return () => {
      live.current = false;
    };
  }, []);

  const refusalText = useCallback(
    (code: string) => (/stale|already|expired|not_found|not_open|closed/.test(code) ? t("agencyOffers.failed") : null),
    [t],
  );

  const prepare = useCallback(
    async (answer: Answer) => {
      setFlow({ kind: "preparing", answer });
      const result = await capability<RespondPrepareData>({
        name: `${capabilityOf(answer)}.prepare`,
        args: { offerId: answer.offer.offerId, decision: answer.decision },
        accessToken,
        locale,
      });
      if (!live.current) return;
      setFlow(
        result.ok
          ? { kind: "ready", answer, prepared: result.data }
          : { kind: "prepare_failed", answer, failure: result.failure },
      );
    },
    [accessToken, locale],
  );

  const confirm = useCallback(
    async (answer: Answer, prepared: RespondPrepareData) => {
      setFlow({ kind: "sending", answer, prepared });
      const result = await capability<unknown>({
        name: `${capabilityOf(answer)}.confirm`,
        // The PREPARE's own input — the token is bound to it.
        args: { input: prepared.input, confirmationToken: prepared.confirmationToken },
        accessToken,
        locale,
      });
      if (!live.current) return;
      setFlow(
        result.ok
          ? { kind: "done", answer }
          : { kind: "send_failed", answer, prepared, failure: result.failure },
      );
    },
    [accessToken, locale],
  );

  const backToList = useCallback(() => {
    setFlow({ kind: "listing" });
    reload();
  }, [reload]);

  const describe = (answer: Answer) =>
    answer.kind === "agency" ? <AgencyOfferSummary offer={answer.offer} /> : <TeamOfferSummary offer={answer.offer} />;

  if (flow.kind === "done") {
    return (
      <View style={styles.stack} testID="agency-offers-done">
        {describe(flow.answer)}
        <Body>{t(doneText(flow.answer))}</Body>
        <Button testID="agency-offers-back" label={t("offers.backToList")} onPress={backToList} />
      </View>
    );
  }

  if (flow.kind !== "listing") {
    const preparing = flow.kind === "preparing" || flow.kind === "prepare_failed";
    const busy = flow.kind === "preparing" || flow.kind === "sending";
    return (
      <View style={styles.stack} testID="agency-offers-preview">
        <NotAvailable title={t(previewTitle(flow.answer))} body={t("offers.previewBody")}>
          {describe(flow.answer)}
        </NotAvailable>
        {flow.kind === "prepare_failed" || flow.kind === "send_failed" ? (
          <CapabilityFailureNotice
            failure={flow.failure}
            title={flow.kind === "prepare_failed" ? "offers.prepareFailedTitle" : "offers.confirmFailedTitle"}
            refusalText={refusalText}
            retry={
              flow.kind === "prepare_failed"
                ? () => void prepare(flow.answer)
                : () => void confirm(flow.answer, flow.prepared)
            }
            testID="agency-offers-failure"
          />
        ) : null}
        {!preparing ? (
          <Button
            testID="agency-offers-confirm"
            label={t("offers.confirm")}
            busy={busy}
            onPress={() => {
              if (flow.kind === "ready" || flow.kind === "send_failed") void confirm(flow.answer, flow.prepared);
            }}
          />
        ) : null}
        <Button
          variant="quiet"
          testID="agency-offers-cancel"
          label={t("offers.cancel")}
          disabled={flow.kind === "sending"}
          onPress={() => setFlow({ kind: "listing" })}
        />
      </View>
    );
  }

  return (
    <CapabilityGate state={offers.state} reload={offers.reload} refusalText={refusalText}>
      {(data) => {
        if (data.offers.length === 0 && data.teamOffers.length === 0) {
          return (
            <View testID="agency-offers-none">
              <Body muted>{t("agencyOffers.none")}</Body>
            </View>
          );
        }
        return (
          <View style={styles.stack} testID="agency-offers-list">
            {data.offers.length > 0 ? <Body>{t("agencyOffers.candidatesIntro")}</Body> : null}
            {data.offers.map((offer) => (
              <View key={offer.offerId} style={styles.row} testID={`agency-offer-${offer.offerId}`}>
                <AgencyOfferSummary offer={offer} />
                <Button
                  testID={`agency-offer-accept-${offer.offerId}`}
                  label={t("agencyOffers.accept")}
                  onPress={() => void prepare({ kind: "agency", offer, decision: "accepted" })}
                />
                <Button
                  variant="quiet"
                  testID={`agency-offer-decline-${offer.offerId}`}
                  label={t("agencyOffers.decline")}
                  onPress={() => void prepare({ kind: "agency", offer, decision: "declined" })}
                />
                <Divider />
              </View>
            ))}
            {data.teamOffers.length > 0 ? <Body>{t("agencyOffers.teamsIntro")}</Body> : null}
            {data.teamOffers.map((offer) => (
              <View key={offer.offerId} style={styles.row} testID={`team-offer-${offer.offerId}`}>
                <TeamOfferSummary offer={offer} />
                {offer.status === "offered" ? (
                  <>
                    <Button
                      testID={`team-offer-agree-${offer.offerId}`}
                      label={t("agencyOffers.agree")}
                      onPress={() => void prepare({ kind: "team", offer, decision: "accepted" })}
                    />
                    <Button
                      variant="quiet"
                      testID={`team-offer-decline-${offer.offerId}`}
                      label={t("agencyOffers.decline")}
                      onPress={() => void prepare({ kind: "team", offer, decision: "declined" })}
                    />
                  </>
                ) : (
                  <Body muted>{t("agencyOffers.teamStatusAgreed")}</Body>
                )}
                <Divider />
              </View>
            ))}
          </View>
        );
      }}
    </CapabilityGate>
  );
}

function AgencyOfferSummary({ offer }: { offer: ClientAgencyOffer }) {
  return (
    <View style={styles.row}>
      <Body>{offer.demandTitle}</Body>
      <Body muted>{offer.agencyName}</Body>
      {offer.note !== null ? <Body muted>{offer.note}</Body> : null}
    </View>
  );
}

function TeamOfferSummary({ offer }: { offer: ClientTeamOffer }) {
  return (
    <View style={styles.row}>
      <Body>{offer.demandTitle}</Body>
      <Body muted>
        {offer.teamName} · {offer.memberCount}
      </Body>
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { gap: theme.space.md },
  row: { gap: theme.space.xs },
});
