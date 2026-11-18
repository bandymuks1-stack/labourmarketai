import React, { useCallback, useEffect, useRef, useState } from "react";
import { StyleSheet, View } from "react-native";

import { useAuth } from "../auth-context";
import type {
  DemandCreateConfirmData,
  DemandCreateDraftData,
  DemandDraftFields,
  DemandDraftPreview,
  DemandUrgency,
} from "../capability-shapes";
import { capability, type DomainFailure } from "../domain";
import { useLocale } from "../i18n/locale-context";
import { Body, Button, Divider, Field, NotAvailable } from "../ui/primitives";
import { theme } from "../ui/theme";
import { CapabilityFailureNotice } from "./capability-failure";

/**
 * POST A NEED — `demand.create_draft` → `demand.create_confirm` for the
 * organization the person is acting for. The same two-leg shape as the
 * journal composer: the draft writes nothing and returns the server's
 * preview (naming the organization) plus a one-time token; confirming sends
 * the PREVIEW's own fields byte for byte. Editing after a preview drops the
 * token. Outside an employer workspace the refusal says what to switch.
 *
 * The phone offers the fields a person actually has on site: what is needed
 * (required), a role word, a place, how many people, and how urgent. The
 * structured facts (work-type slug, country, accommodation, transport,
 * opportunity type) stay on the web form, which has the catalogues for them.
 */
const MIN_DESCRIPTION = 3;
const URGENCIES: readonly DemandUrgency[] = ["flexible", "this_week", "urgent"];

type FlowState =
  | { readonly kind: "writing"; readonly localError: "need.descriptionRequired" | "need.teamSizeInvalid" | null }
  | { readonly kind: "drafting"; readonly fields: DemandDraftFields }
  | { readonly kind: "draft_failed"; readonly fields: DemandDraftFields; readonly failure: DomainFailure }
  | { readonly kind: "ready"; readonly fields: DemandDraftFields; readonly preview: DemandDraftPreview; readonly token: string }
  | { readonly kind: "sending"; readonly fields: DemandDraftFields; readonly preview: DemandDraftPreview; readonly token: string }
  | {
      readonly kind: "send_failed";
      readonly fields: DemandDraftFields;
      readonly preview: DemandDraftPreview;
      readonly token: string;
      readonly failure: DomainFailure;
    }
  | { readonly kind: "sent"; readonly preview: DemandDraftPreview; readonly result: DemandCreateConfirmData };

export function NeedIntakeScreen({ onDone }: { onDone: () => void }) {
  const { t, locale } = useLocale();
  const { accessToken } = useAuth();
  const [description, setDescription] = useState("");
  const [role, setRole] = useState("");
  const [location, setLocation] = useState("");
  const [teamSize, setTeamSize] = useState("");
  const [urgency, setUrgency] = useState<DemandUrgency | null>(null);
  const [flow, setFlow] = useState<FlowState>({ kind: "writing", localError: null });

  const live = useRef(true);
  useEffect(() => {
    live.current = true;
    return () => {
      live.current = false;
    };
  }, []);

  const refusalText = useCallback(
    (code: string) =>
      code === "personal_workspace"
        ? t("availability.personalWorkspace")
        : code === "no_organization"
          ? t("availability.noOrganization")
          : code === "no_company_context"
            ? t("availability.noCompanyContext")
            : code === "over_open_need_limit"
              ? t("need.overLimit")
              : null,
    [t],
  );

  const draft = useCallback(async () => {
    const d = description.trim();
    if (d.length < MIN_DESCRIPTION) {
      setFlow({ kind: "writing", localError: "need.descriptionRequired" });
      return;
    }
    const sizeText = teamSize.trim();
    let size: number | undefined;
    if (sizeText !== "") {
      const n = Number(sizeText);
      if (!Number.isInteger(n) || n < 1 || n > 100000) {
        setFlow({ kind: "writing", localError: "need.teamSizeInvalid" });
        return;
      }
      size = n;
    }
    const fields: DemandDraftFields = {
      description: d,
      ...(role.trim() === "" ? {} : { role: role.trim() }),
      ...(location.trim() === "" ? {} : { location: location.trim() }),
      ...(urgency === null ? {} : { urgency }),
      ...(size === undefined ? {} : { teamSize: size }),
    };
    setFlow({ kind: "drafting", fields });
    const result = await capability<DemandCreateDraftData>({
      name: "demand.create_draft",
      args: { ...fields },
      accessToken,
      locale,
    });
    if (!live.current) return;
    if (!result.ok) {
      setFlow({ kind: "draft_failed", fields, failure: result.failure });
      return;
    }
    setFlow({ kind: "ready", fields, preview: result.data.preview, token: result.data.confirmationToken });
  }, [accessToken, description, locale, location, role, teamSize, urgency]);

  const send = useCallback(
    async (fields: DemandDraftFields, preview: DemandDraftPreview, token: string) => {
      setFlow({ kind: "sending", fields, preview, token });
      const result = await capability<DemandCreateConfirmData>({
        name: "demand.create_confirm",
        // The DRAFT's own fields, byte for byte — the token is bound to them.
        args: { ...fields, confirmationToken: token },
        accessToken,
        locale,
      });
      if (!live.current) return;
      if (!result.ok) {
        setFlow({ kind: "send_failed", fields, preview, token, failure: result.failure });
        return;
      }
      setFlow({ kind: "sent", preview, result: result.data });
    },
    [accessToken, locale],
  );

  if (flow.kind === "sent") {
    return (
      <View style={styles.stack} testID="need-sent">
        <NotAvailable title={t("need.sentTitle")} body={t("need.sentBody")}>
          <Body>{flow.preview.actingFor}</Body>
          <Body muted>{flow.preview.description}</Body>
        </NotAvailable>
        <Button testID="need-done" label={t("need.done")} onPress={onDone} />
      </View>
    );
  }

  if (flow.kind === "ready" || flow.kind === "sending" || flow.kind === "send_failed") {
    const busy = flow.kind === "sending";
    return (
      <View style={styles.stack} testID="need-preview">
        <NotAvailable title={t("need.previewTitle")} body={t("need.previewBody")}>
          <Body>
            {t("need.actingFor")}: {flow.preview.actingFor}
          </Body>
          <Body>{flow.preview.description}</Body>
          {flow.preview.role ? <Body muted>{t("need.roleLabel")}: {flow.preview.role}</Body> : null}
          {flow.fields.location ? <Body muted>{t("need.locationLabel")}: {flow.fields.location}</Body> : null}
          {flow.preview.teamSize !== null ? (
            <Body muted>
              {t("need.teamSizeLabel")}: {flow.preview.teamSize}
            </Body>
          ) : null}
          {flow.preview.urgency ? <Body muted>{t(`need.urgency.${flow.preview.urgency as DemandUrgency}`)}</Body> : null}
        </NotAvailable>
        {flow.kind === "send_failed" ? (
          <CapabilityFailureNotice
            failure={flow.failure}
            title="need.sendFailedTitle"
            refusalText={refusalText}
            retry={() => void send(flow.fields, flow.preview, flow.token)}
            testID="need-failure"
          />
        ) : null}
        <Button
          testID="need-confirm"
          label={t("need.confirm")}
          busy={busy}
          onPress={() => void send(flow.fields, flow.preview, flow.token)}
        />
        <Button
          variant="quiet"
          testID="need-edit"
          label={t("need.edit")}
          busy={busy}
          onPress={() => setFlow({ kind: "writing", localError: null })}
        />
      </View>
    );
  }

  const busy = flow.kind === "drafting";
  return (
    <View style={styles.stack} testID="need-write">
      <Body muted>{t("need.intro")}</Body>
      <Field
        testID="need-description"
        label={t("need.descriptionLabel")}
        hint={t("need.descriptionHint")}
        value={description}
        onChangeText={setDescription}
        maxLength={4000}
        multiline
        editable={!busy}
        style={styles.multiline}
      />
      <Field
        testID="need-role"
        label={t("need.roleLabel")}
        value={role}
        onChangeText={setRole}
        maxLength={120}
        editable={!busy}
      />
      <Field
        testID="need-location"
        label={t("need.locationLabel")}
        value={location}
        onChangeText={setLocation}
        maxLength={120}
        editable={!busy}
      />
      <Field
        testID="need-team-size"
        label={t("need.teamSizeLabel")}
        hint={t("need.teamSizeHint")}
        value={teamSize}
        onChangeText={setTeamSize}
        keyboardType="number-pad"
        maxLength={6}
        editable={!busy}
      />
      <Body muted>{t("need.urgencyLabel")}</Body>
      <View style={styles.choices}>
        {URGENCIES.map((u) => (
          <Button
            key={u}
            variant={urgency === u ? "primary" : "quiet"}
            testID={`need-urgency-${u}`}
            label={t(`need.urgency.${u}`)}
            onPress={() => setUrgency(urgency === u ? null : u)}
          />
        ))}
      </View>
      {/* need-local-error: a refusal checked on the phone, before any request (the
          Maestro journey asserts it; need-failure is the server's refusal). */}
      {flow.kind === "writing" && flow.localError ? (
        <View testID="need-local-error">
          <Body>{t(flow.localError)}</Body>
        </View>
      ) : null}
      {flow.kind === "draft_failed" ? (
        <CapabilityFailureNotice
          failure={flow.failure}
          title="need.draftFailedTitle"
          refusalText={refusalText}
          retry={() => void draft()}
          testID="need-failure"
        />
      ) : null}
      <Divider />
      <Button testID="need-review" label={t("need.review")} busy={busy} onPress={() => void draft()} />
      <Button variant="quiet" testID="need-cancel" label={t("need.cancel")} busy={busy} onPress={onDone} />
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { gap: theme.space.md },
  choices: { gap: theme.space.sm },
  multiline: { minHeight: 96, textAlignVertical: "top" },
});
