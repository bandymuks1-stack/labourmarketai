import React, { useCallback, useEffect, useRef, useState } from "react";
import { StyleSheet, View } from "react-native";

import { useAuth } from "../auth-context";
import type {
  CandidateRow,
  CandidateSearchData,
  DemandListData,
  ShortlistDraftData,
} from "../capability-shapes";
import { capability, type DomainFailure } from "../domain";
import { useLocale } from "../i18n/locale-context";
import { Body, Button, Divider, NotAvailable, Title } from "../ui/primitives";
import { theme } from "../ui/theme";
import { useCapability } from "../use-capability";
import { useReloadOnReturn } from "../use-reload-on-return";
import { CapabilityFailureNotice } from "./capability-failure";
import { CapabilityGate } from "./capability-gate";
import { NeedLifecycle } from "./need-lifecycle";
import { ProposeBooking } from "./propose-booking";

const LIMIT = { limit: 20 } as const;
/** Closed needs too, so a closed one can be reopened here. */
const WITH_CLOSED = { includeClosed: true } as const;

/** The same refusals the need form names, for the same employer gate. */
function useEmployerRefusal() {
  const { t } = useLocale();
  return useCallback(
    (code: string) =>
      code === "personal_workspace"
        ? t("availability.personalWorkspace")
        : code === "no_organization"
          ? t("availability.noOrganization")
          : code === "no_company_context"
            ? t("availability.noCompanyContext")
            : code === "not_structured"
              ? t("candidates.notStructured")
              : null,
    [t],
  );
}

/**
 * FIND CANDIDATES — the web scouting page's own search on the phone.
 *
 * First the organization's open needs (`demand.list`); then, for the chosen
 * need, the anonymized candidates `candidate.search` ranks for it — no name,
 * no contact, a match status and the evidence behind it, by tier. Shortlisting
 * is the same two steps as on the web: `shortlist.add_draft` writes nothing and
 * returns a one-time token, `shortlist.add_confirm` records the decision.
 */
export function CandidatesScreen({
  needId,
  onPickNeed,
}: {
  needId: string | null;
  onPickNeed: (id: string | null) => void;
}) {
  return needId === null ? <NeedPicker onPick={onPickNeed} /> : <CandidateList needId={needId} onBack={() => onPickNeed(null)} />;
}

function NeedPicker({ onPick }: { onPick: (id: string) => void }) {
  const { t } = useLocale();
  const needs = useCapability<DemandListData>("demand.list", WITH_CLOSED);
  const refusal = useEmployerRefusal();
  useReloadOnReturn(needs.reload);
  return (
    <CapabilityGate state={needs.state} reload={needs.reload} refusalText={refusal}>
      {(data) => (
        <View style={styles.stack} testID="candidates-needs">
          <Body muted>{data.actingFor}</Body>
          {data.needs.length === 0 ? (
            <Body muted>{t("candidates.noNeeds")}</Body>
          ) : (
            data.needs.map((need) => (
              <View key={need.id} style={styles.card}>
                <Body>{need.title ?? need.role ?? t("candidates.untitledNeed")}</Body>
                {need.location !== null ? <Body muted>{need.location}</Body> : null}
                <Body muted>
                  {t("candidates.interested")}: {need.interestedPeople ?? "—"} · {t("candidates.shortlisted")}:{" "}
                  {need.shortlisted ?? "—"}
                </Body>
                {need.status === "closed" ? (
                  <Body muted>{t("needs.closedLabel")}</Body>
                ) : (
                  <Button
                    variant="quiet"
                    testID={`candidates-need-${need.id}`}
                    label={t("candidates.open")}
                    onPress={() => onPick(need.id)}
                  />
                )}
                <NeedLifecycle needId={need.id} closed={need.status === "closed"} onChanged={needs.reload} />
              </View>
            ))
          )}
        </View>
      )}
    </CapabilityGate>
  );
}

function CandidateList({ needId, onBack }: { needId: string; onBack: () => void }) {
  const { t } = useLocale();
  const args = React.useMemo(() => ({ requestId: needId, ...LIMIT }), [needId]);
  const search = useCapability<CandidateSearchData>("candidate.search", args);
  const refusal = useEmployerRefusal();
  return (
    <View style={styles.stack}>
      <Button variant="quiet" testID="candidates-back" label={t("candidates.allNeeds")} onPress={onBack} />
      <CapabilityGate state={search.state} reload={search.reload} refusalText={refusal}>
        {(data) => (
          <View style={styles.stack} testID="candidates-list">
            <Title>{data.need.title ?? t("candidates.untitledNeed")}</Title>
            <Body muted>
              {t("candidates.found")}: {data.totalCandidates}
            </Body>
            {data.candidates.length === 0 ? (
              <Body muted>{t("candidates.none")}</Body>
            ) : (
              data.candidates.map((c) => (
                <CandidateCard key={c.workerId} candidate={c} needId={data.need.id} onShortlisted={search.reload} />
              ))
            )}
          </View>
        )}
      </CapabilityGate>
    </View>
  );
}

type RowFlow =
  | { readonly kind: "idle" }
  | { readonly kind: "drafting" }
  | { readonly kind: "ready"; readonly token: string }
  | { readonly kind: "confirming"; readonly token: string }
  | { readonly kind: "failed"; readonly failure: DomainFailure };

function CandidateCard({
  candidate,
  needId,
  onShortlisted,
}: {
  candidate: CandidateRow;
  needId: string;
  onShortlisted: () => void;
}) {
  const { t, locale } = useLocale();
  const { accessToken } = useAuth();
  const [flow, setFlow] = useState<RowFlow>({ kind: "idle" });
  const [booking, setBooking] = useState(false);
  const live = useRef(true);
  useEffect(() => {
    live.current = true;
    return () => {
      live.current = false;
    };
  }, []);

  const fields = { requestId: needId, workerId: candidate.workerId };
  const draft = async () => {
    setFlow({ kind: "drafting" });
    const r = await capability<ShortlistDraftData>({ name: "shortlist.add_draft", args: fields, accessToken, locale });
    if (!live.current) return;
    setFlow(r.ok ? { kind: "ready", token: r.data.confirmationToken } : { kind: "failed", failure: r.failure });
  };
  const confirm = async (token: string) => {
    setFlow({ kind: "confirming", token });
    // The DRAFT's own fields, byte for byte — the token is bound to them.
    const r = await capability<unknown>({
      name: "shortlist.add_confirm",
      args: { ...fields, confirmationToken: token },
      accessToken,
      locale,
    });
    if (!live.current) return;
    if (!r.ok) {
      setFlow({ kind: "failed", failure: r.failure });
      return;
    }
    setFlow({ kind: "idle" });
    onShortlisted();
  };

  const onList = candidate.shortlistStatus === "saved" || candidate.shortlistStatus === "interested";
  const e = candidate.match.evidence;
  return (
    <View style={styles.card} testID="candidate-card">
      <Divider />
      <Body>{candidate.preview.anonymizedLabel}</Body>
      <Body muted>{t(`candidates.match.${candidate.match.status}`)}</Body>
      <Body muted>
        {t("profile.groupManagerConfirmed")}: {e.matchedManagerConfirmed} · {t("profile.groupJournalBacked")}:{" "}
        {e.matchedJournalSupported} · {t("profile.groupDeclared")}: {e.matchedSelfDeclared}
      </Body>
      {onList ? (
        <Body muted>{t("candidates.onShortlist")}</Body>
      ) : flow.kind === "ready" || flow.kind === "confirming" ? (
        <NotAvailable title={t("candidates.confirmTitle")} body={t("candidates.confirmBody")}>
          <Button
            testID={`candidate-confirm-${candidate.workerId}`}
            label={t("candidates.confirm")}
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
          testID={`candidate-shortlist-${candidate.workerId}`}
          label={t("candidates.shortlist")}
          busy={flow.kind === "drafting"}
          onPress={() => void draft()}
        />
      )}
      {flow.kind === "failed" ? (
        <CapabilityFailureNotice
          failure={flow.failure}
          title="cv.saveFailedTitle"
          retry={() => void draft()}
          testID="candidate-shortlist-failure"
        />
      ) : null}
      {!candidate.canContact ? (
        <Body muted>{t("booking.cannotContact")}</Body>
      ) : booking ? (
        <ProposeBooking needId={needId} workerId={candidate.workerId} onClose={() => setBooking(false)} />
      ) : (
        <Button
          variant="quiet"
          testID={`candidate-book-${candidate.workerId}`}
          label={t("booking.propose")}
          onPress={() => setBooking(true)}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { gap: theme.space.md },
  card: { gap: theme.space.xs },
});
