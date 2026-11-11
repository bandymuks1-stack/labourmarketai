import React, { useCallback, useEffect, useRef, useState } from "react";
import { StyleSheet, View } from "react-native";

import { useAuth } from "../auth-context";
import type {
  BookingListData,
  BookingOffer,
  InvitationOffer,
  InvitationsListData,
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
 * OFFERS — what other people have proposed to this person, and their answer.
 * Existing capabilities only, nothing new on the server:
 *
 *   booking.list                        → job proposals (incoming, still `proposed`)
 *   invitations.list                    → invitations addressed to me
 *   worker.respond-booking.prepare      → token for accept / decline
 *   worker.respond-invitation.prepare   → token for accept
 *   … .confirm (the prepare's own input + token) → the canonical write
 *
 * Both answers are STRONG steps (accepting creates a real relationship), so
 * nothing is written until the person confirms the preview. An invitation
 * has no in-app decline anywhere on the platform, so none is offered here.
 * The device never builds an answer key: the invitation's `ref` is the
 * server's own.
 */
const NO_ARGS = {} as const;

type Answer =
  | { readonly kind: "booking"; readonly offer: BookingOffer; readonly decision: "accepted" | "declined" }
  | { readonly kind: "invitation"; readonly offer: InvitationOffer };

type FlowState =
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
  answer.kind === "booking" ? "worker.respond-booking" : "worker.respond-invitation";

function previewTitle(answer: Answer): MessageKey {
  if (answer.kind === "invitation") return "offers.previewAcceptInvitation";
  return answer.decision === "accepted" ? "offers.previewAcceptBooking" : "offers.previewDeclineBooking";
}

function datesOf(offer: BookingOffer): string | null {
  if (offer.startDate === null && offer.expectedEndDate === null) return null;
  return `${offer.startDate ?? "…"} – ${offer.expectedEndDate ?? "…"}`;
}

export function OffersScreen() {
  const { t, locale } = useLocale();
  const { accessToken } = useAuth();
  const bookings = useCapability<BookingListData>("booking.list", NO_ARGS);
  const invitations = useCapability<InvitationsListData>("invitations.list", NO_ARGS);
  const [flow, setFlow] = useState<FlowState>({ kind: "listing" });

  // Depend on the two stable `reload` callbacks, never on the hook results:
  // those are new objects every render, and `useReloadOnReturn` re-runs its
  // focus effect whenever this callback changes — a reload loop.
  const reloadBookings = bookings.reload;
  const reloadInvitations = invitations.reload;
  const reloadBoth = useCallback(() => {
    reloadBookings();
    reloadInvitations();
  }, [reloadBookings, reloadInvitations]);
  useReloadOnReturn(reloadBoth, () => flow.kind === "listing");

  const live = useRef(true);
  useEffect(() => {
    live.current = true;
    return () => {
      live.current = false;
    };
  }, []);

  const refusalText = useCallback(
    (code: string) =>
      code === "no_worker_profile"
        ? t("profile.noWorkerProfile")
        : /clash|overlap/.test(code)
          ? t("offers.clash")
          : /stale|already|expired|not_found|not_pending/.test(code)
            ? t("offers.changed")
            : null,
    [t],
  );

  const prepare = useCallback(
    async (answer: Answer) => {
      setFlow({ kind: "preparing", answer });
      const args =
        answer.kind === "booking"
          ? { bookingId: answer.offer.id, decision: answer.decision }
          : // A union input travels wrapped as { input } (MCP needs an object).
            { input: { ...answer.offer.ref, decision: "accepted" } };
      const result = await capability<RespondPrepareData>({
        name: `${capabilityOf(answer)}.prepare`,
        args,
        accessToken,
        locale,
      });
      if (!live.current) return;
      if (!result.ok) {
        setFlow({ kind: "prepare_failed", answer, failure: result.failure });
        return;
      }
      setFlow({ kind: "ready", answer, prepared: result.data });
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
      if (!result.ok) {
        setFlow({ kind: "send_failed", answer, prepared, failure: result.failure });
        return;
      }
      setFlow({ kind: "done", answer });
    },
    [accessToken, locale],
  );

  const backToList = useCallback(() => {
    setFlow({ kind: "listing" });
    reloadBoth();
  }, [reloadBoth]);

  const describe = (answer: Answer) =>
    answer.kind === "booking" ? (
      <BookingSummary offer={answer.offer} />
    ) : (
      <InvitationSummary offer={answer.offer} />
    );

  // ── done ────────────────────────────────────────────────────────────────
  if (flow.kind === "done") {
    return (
      <View style={styles.stack} testID="offers-done">
        <NotAvailable title={t("offers.doneTitle")} body={t("offers.doneBody")}>
          {describe(flow.answer)}
        </NotAvailable>
        <Button testID="offers-back-to-list" label={t("offers.backToList")} onPress={backToList} />
      </View>
    );
  }

  // ── prepare / preview / confirm ─────────────────────────────────────────
  if (flow.kind !== "listing") {
    const preparing = flow.kind === "preparing" || flow.kind === "prepare_failed";
    const busy = flow.kind === "preparing" || flow.kind === "sending";
    return (
      <View style={styles.stack} testID="offers-preview">
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
            testID="offers-failure"
          />
        ) : null}
        {!preparing ? (
          <Button
            testID="offers-confirm"
            label={t("offers.confirm")}
            busy={busy}
            onPress={() => {
              if (flow.kind === "ready" || flow.kind === "send_failed") {
                void confirm(flow.answer, flow.prepared);
              }
            }}
          />
        ) : null}
        <Button
          variant="quiet"
          testID="offers-cancel"
          label={t("offers.cancel")}
          busy={busy}
          onPress={() => setFlow({ kind: "listing" })}
        />
      </View>
    );
  }

  // ── the lists: the server's own rows ────────────────────────────────────
  return (
    <View style={styles.stack} testID="offers-list">
      <Body muted>{t("offers.intro")}</Body>

      <Body>{t("offers.bookingsHeading")}</Body>
      <CapabilityGate state={bookings.state} reload={bookings.reload} refusalText={refusalText}>
        {(data) => {
          const open = data.incoming.filter((b) => b.status === "proposed");
          if (open.length === 0) return <Body muted>{t("offers.noBookings")}</Body>;
          return (
            <View style={styles.stack}>
              {open.map((offer, index) => (
                <View key={offer.id} style={styles.row} testID={`offers-booking-${index}`}>
                  <BookingSummary offer={offer} />
                  <Button
                    testID={`offers-booking-accept-${index}`}
                    label={t("offers.accept")}
                    onPress={() => void prepare({ kind: "booking", offer, decision: "accepted" })}
                  />
                  <Button
                    variant="quiet"
                    testID={`offers-booking-decline-${index}`}
                    label={t("offers.decline")}
                    onPress={() => void prepare({ kind: "booking", offer, decision: "declined" })}
                  />
                  <Divider />
                </View>
              ))}
            </View>
          );
        }}
      </CapabilityGate>

      <Body>{t("offers.invitationsHeading")}</Body>
      <CapabilityGate state={invitations.state} reload={invitations.reload} refusalText={refusalText}>
        {(data) =>
          data.kind === "empty" || data.items.length === 0 ? (
            <Body muted>{t("offers.noInvitations")}</Body>
          ) : (
            <View style={styles.stack}>
              {data.items.map((offer, index) => (
                <View key={index} style={styles.row} testID={`offers-invitation-${index}`}>
                  <InvitationSummary offer={offer} />
                  <Button
                    testID={`offers-invitation-accept-${index}`}
                    label={t("offers.accept")}
                    onPress={() => void prepare({ kind: "invitation", offer })}
                  />
                  <Divider />
                </View>
              ))}
            </View>
          )
        }
      </CapabilityGate>
    </View>
  );
}

function BookingSummary({ offer }: { offer: BookingOffer }) {
  const { t } = useLocale();
  const dates = datesOf(offer);
  return (
    <View style={styles.row}>
      <Body>{offer.roleText ?? t("offers.untitledBooking")}</Body>
      {offer.proposerName !== null ? (
        <Body muted>
          {t("offers.from")}: {offer.proposerName}
        </Body>
      ) : null}
      {dates !== null ? (
        <Body muted>
          {t("offers.dates")}: {dates}
        </Body>
      ) : null}
      {offer.responseDeadlineDate !== null ? (
        <Body muted>
          {t("offers.answerBy")}: {offer.responseDeadlineDate}
        </Body>
      ) : null}
      {offer.note !== null ? <Body muted>{offer.note}</Body> : null}
    </View>
  );
}

function InvitationSummary({ offer }: { offer: InvitationOffer }) {
  const { t } = useLocale();
  return (
    <View style={styles.row}>
      <Body>{offer.organizationName ?? offer.inviterName ?? t("offers.untitledInvitation")}</Body>
      {offer.projectTitle !== null ? <Body muted>{offer.projectTitle}</Body> : null}
      {offer.inviterName !== null && offer.organizationName !== null ? (
        <Body muted>
          {t("offers.from")}: {offer.inviterName}
        </Body>
      ) : null}
      {offer.personalMessage !== null ? <Body muted>{offer.personalMessage}</Body> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { gap: theme.space.md },
  row: { gap: theme.space.xs },
});
