import React, { useCallback, useEffect, useRef, useState } from "react";
import { StyleSheet, View } from "react-native";

import { useAuth } from "../auth-context";
import type {
  EducationCohort,
  EducationProgramme,
  EducationWorkspaceData,
  RespondPrepareData,
} from "../capability-shapes";
import { capability, type DomainFailure } from "../domain";
import { useLocale } from "../i18n/locale-context";
import type { MessageKey } from "../i18n/messages";
import { Body, Button, Divider, Field, NotAvailable } from "../ui/primitives";
import { theme } from "../ui/theme";
import { useCapability } from "../use-capability";
import { useReloadOnReturn } from "../use-reload-on-return";
import { CapabilityFailureNotice } from "./capability-failure";
import { CapabilityGate } from "./capability-gate";

/**
 * EDUCATION — an education organization's programmes, cohorts and learners,
 * through the web chat's own capabilities (owner order 2026-11-16: one shared
 * client, no parallel backend):
 *
 *   education.workspace.get                        → programmes, cohorts, assignable learners
 *   company.create-programme.prepare / .confirm    → a new programme
 *   company.create-cohort.prepare / .confirm       → a new cohort in a programme
 *   company.assign-learner.prepare / .confirm      → an accepted learner into a cohort
 *   company.invite-learner.prepare / .confirm      → an invitation e-mail to a learner
 *
 * Every write is the web's IMPORTANT step: nothing is written until the
 * person confirms the preview, and the confirm sends the prepare's own input.
 */
const NO_ARGS = {} as const;

type Write = {
  readonly capability:
    | "company.create-programme"
    | "company.create-cohort"
    | "company.assign-learner"
    | "company.invite-learner";
  readonly args: Record<string, unknown>;
  readonly title: MessageKey;
  readonly done: MessageKey;
};

type Flow =
  | { readonly kind: "listing" }
  | { readonly kind: "form"; readonly form: Form }
  | { readonly kind: "preparing"; readonly write: Write }
  | { readonly kind: "prepare_failed"; readonly write: Write; readonly failure: DomainFailure }
  | { readonly kind: "ready"; readonly write: Write; readonly prepared: RespondPrepareData }
  | { readonly kind: "sending"; readonly write: Write; readonly prepared: RespondPrepareData }
  | {
      readonly kind: "send_failed";
      readonly write: Write;
      readonly prepared: RespondPrepareData;
      readonly failure: DomainFailure;
    }
  | { readonly kind: "done"; readonly write: Write };

type Form =
  | { readonly kind: "programme" }
  | { readonly kind: "cohort"; readonly programme: EducationProgramme }
  | { readonly kind: "assign"; readonly cohort: EducationCohort; readonly assignable: EducationWorkspaceOk["assignable"] }
  | { readonly kind: "invite" };

/** "" → null; a real YYYY-MM-DD → itself; anything else → undefined (invalid). */
function optionalDay(text: string): string | null | undefined {
  const v = text.trim();
  if (v === "") return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return undefined;
  const d = new Date(`${v}T00:00:00Z`);
  return Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== v ? undefined : v;
}

export function EducationScreen() {
  const { t, locale } = useLocale();
  const { accessToken } = useAuth();
  const workspace = useCapability<EducationWorkspaceData>("education.workspace.get", NO_ARGS);
  const [flow, setFlow] = useState<Flow>({ kind: "listing" });

  const reload = workspace.reload;
  useReloadOnReturn(reload, () => flow.kind === "listing");

  const live = useRef(true);
  useEffect(() => {
    live.current = true;
    return () => {
      live.current = false;
    };
  }, []);

  const prepare = useCallback(
    async (write: Write) => {
      setFlow({ kind: "preparing", write });
      const result = await capability<RespondPrepareData>({
        name: `${write.capability}.prepare`,
        args: write.args,
        accessToken,
        locale,
      });
      if (!live.current) return;
      setFlow(
        result.ok
          ? { kind: "ready", write, prepared: result.data }
          : { kind: "prepare_failed", write, failure: result.failure },
      );
    },
    [accessToken, locale],
  );

  const confirm = useCallback(
    async (write: Write, prepared: RespondPrepareData) => {
      setFlow({ kind: "sending", write, prepared });
      const result = await capability<unknown>({
        name: `${write.capability}.confirm`,
        // The PREPARE's own input — the token is bound to it.
        args: { input: prepared.input, confirmationToken: prepared.confirmationToken },
        accessToken,
        locale,
      });
      if (!live.current) return;
      setFlow(
        result.ok ? { kind: "done", write } : { kind: "send_failed", write, prepared, failure: result.failure },
      );
    },
    [accessToken, locale],
  );

  const backToList = useCallback(() => {
    setFlow({ kind: "listing" });
    reload();
  }, [reload]);

  if (flow.kind === "done") {
    return (
      <View style={styles.stack} testID="education-done">
        <Body>{t(flow.write.done)}</Body>
        <Button testID="education-back" label={t("offers.cancel")} onPress={backToList} />
      </View>
    );
  }

  if (flow.kind === "form") {
    return (
      <EducationForm
        form={flow.form}
        onReview={(write) => void prepare(write)}
        onCancel={() => setFlow({ kind: "listing" })}
      />
    );
  }

  if (flow.kind !== "listing") {
    const preparing = flow.kind === "preparing" || flow.kind === "prepare_failed";
    const busy = flow.kind === "preparing" || flow.kind === "sending";
    return (
      <View style={styles.stack} testID="education-preview">
        <NotAvailable title={t(flow.write.title)} body={t("offers.previewBody")} />
        {flow.kind === "prepare_failed" || flow.kind === "send_failed" ? (
          <CapabilityFailureNotice
            failure={flow.failure}
            title="cv.saveFailedTitle"
            retry={
              flow.kind === "prepare_failed"
                ? () => void prepare(flow.write)
                : () => void confirm(flow.write, flow.prepared)
            }
            testID="education-failure"
          />
        ) : null}
        {!preparing ? (
          <Button
            testID="education-confirm"
            label={t("education.confirm")}
            busy={busy}
            onPress={() => {
              if (flow.kind === "ready" || flow.kind === "send_failed") void confirm(flow.write, flow.prepared);
            }}
          />
        ) : null}
        <Button
          variant="quiet"
          testID="education-cancel"
          label={t("offers.cancel")}
          disabled={flow.kind === "sending"}
          onPress={() => setFlow({ kind: "listing" })}
        />
      </View>
    );
  }

  return (
    <CapabilityGate state={workspace.state} reload={workspace.reload}>
      {(data) => {
        if (data.kind !== "ok") {
          return (
            <View testID="education-not-institution">
              <Body muted>{t("education.notInstitution")}</Body>
            </View>
          );
        }
        return (
          <View style={styles.stack} testID="education-list">
            {data.programmes.length === 0 ? (
              <Body muted>{t("education.none")}</Body>
            ) : (
              data.programmes.map((programme) => (
                <View key={programme.id} style={styles.row} testID={`education-programme-${programme.id}`}>
                  <Body>{programme.name}</Body>
                  {programme.cohorts.map((cohort) => (
                    <View key={cohort.id} style={styles.cohort}>
                      <Body muted>
                        {cohort.memberCount === null ? cohort.name : `${cohort.name} · ${cohort.memberCount}`}
                      </Body>
                      {data.membersVisible ? (
                        <Button
                          variant="quiet"
                          testID={`education-assign-${cohort.id}`}
                          label={t("education.assignLearner")}
                          onPress={() =>
                            setFlow({ kind: "form", form: { kind: "assign", cohort, assignable: data.assignable } })
                          }
                        />
                      ) : null}
                    </View>
                  ))}
                  <Button
                    variant="quiet"
                    testID={`education-add-cohort-${programme.id}`}
                    label={t("education.createCohort")}
                    onPress={() => setFlow({ kind: "form", form: { kind: "cohort", programme } })}
                  />
                  <Divider />
                </View>
              ))
            )}
            {!data.membersVisible ? <Body muted>{t("education.membersNotForRole")}</Body> : null}
            <Button
              testID="education-add-programme"
              label={t("education.createProgramme")}
              onPress={() => setFlow({ kind: "form", form: { kind: "programme" } })}
            />
            <Button
              variant="quiet"
              testID="education-invite"
              label={t("education.inviteLearner")}
              onPress={() => setFlow({ kind: "form", form: { kind: "invite" } })}
            />
          </View>
        );
      }}
    </CapabilityGate>
  );
}

function EducationForm({
  form,
  onReview,
  onCancel,
}: {
  form: Form;
  onReview: (write: Write) => void;
  onCancel: () => void;
}) {
  const { t } = useLocale();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [starts, setStarts] = useState("");
  const [ends, setEnds] = useState("");
  const [invalid, setInvalid] = useState(false);

  if (form.kind === "assign") {
    return (
      <View style={styles.stack} testID="education-assign-form">
        <Body>{form.cohort.name}</Body>
        {form.assignable.length === 0 ? (
          <Body muted>{t("education.noLearners")}</Body>
        ) : (
          form.assignable.map((learner) => (
            <Button
              key={learner.profileId}
              variant="quiet"
              testID={`education-learner-${learner.profileId}`}
              label={learner.label}
              onPress={() =>
                onReview({
                  capability: "company.assign-learner",
                  args: { cohortId: form.cohort.id, profileId: learner.profileId },
                  title: "education.assignLearner",
                  done: "education.assignDone",
                })
              }
            />
          ))
        )}
        <Button variant="quiet" label={t("offers.cancel")} onPress={onCancel} />
      </View>
    );
  }

  const review = () => {
    if (form.kind === "programme") {
      if (name.trim().length < 2) return setInvalid(true);
      onReview({
        capability: "company.create-programme",
        args: { name: name.trim() },
        title: "education.createProgramme",
        done: "education.programmeCreated",
      });
    } else if (form.kind === "cohort") {
      const startsOn = optionalDay(starts);
      const endsOn = optionalDay(ends);
      if (
        name.trim().length < 1 ||
        startsOn === undefined ||
        endsOn === undefined ||
        (startsOn !== null && endsOn !== null && endsOn < startsOn)
      ) {
        return setInvalid(true);
      }
      onReview({
        capability: "company.create-cohort",
        args: { programId: form.programme.id, name: name.trim(), startsOn, endsOn },
        title: "education.createCohort",
        done: "education.cohortCreated",
      });
    } else {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return setInvalid(true);
      onReview({
        capability: "company.invite-learner",
        args: { email: email.trim(), name: name.trim() === "" ? null : name.trim() },
        title: "education.inviteLearner",
        done: "education.inviteDone",
      });
    }
  };

  return (
    <View style={styles.stack} testID={`education-form-${form.kind}`}>
      {form.kind === "cohort" ? <Body>{form.programme.name}</Body> : null}
      {form.kind === "invite" ? (
        <Field
          testID="education-email"
          label={t("education.learnerEmail")}
          placeholder={t("education.learnerEmailPlaceholder")}
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          keyboardType="email-address"
          maxLength={254}
        />
      ) : null}
      <Field
        testID="education-name"
        label={
          form.kind === "programme"
            ? t("education.programmeName")
            : form.kind === "cohort"
              ? t("education.cohortName")
              : t("education.learnerName")
        }
        placeholder={
          form.kind === "programme"
            ? t("education.programmeNamePlaceholder")
            : form.kind === "cohort"
              ? t("education.cohortNamePlaceholder")
              : undefined
        }
        value={name}
        onChangeText={setName}
        maxLength={form.kind === "programme" ? 160 : 120}
      />
      {form.kind === "cohort" ? (
        <>
          <Field
            testID="education-starts"
            label={t("education.cohortStarts")}
            placeholder="2026-09-01"
            value={starts}
            onChangeText={setStarts}
            maxLength={10}
          />
          <Field
            testID="education-ends"
            label={t("education.cohortEnds")}
            placeholder="2027-06-30"
            value={ends}
            onChangeText={setEnds}
            maxLength={10}
          />
        </>
      ) : null}
      {invalid ? <Body>{t("education.invalid")}</Body> : null}
      <Button testID="education-review" label={t("education.review")} onPress={review} />
      <Button variant="quiet" label={t("offers.cancel")} onPress={onCancel} />
    </View>
  );
}

type EducationWorkspaceOk = Extract<EducationWorkspaceData, { kind: "ok" }>;

const styles = StyleSheet.create({
  stack: { gap: theme.space.md },
  row: { gap: theme.space.xs },
  cohort: { gap: theme.space.xs, paddingLeft: theme.space.md },
});
