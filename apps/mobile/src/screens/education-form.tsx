import React, { useCallback, useEffect, useRef, useState } from "react";
import { StyleSheet, View } from "react-native";

import { useAuth } from "../auth-context";
import type { WorkerActionData } from "../capability-shapes";
import { capability, type DomainFailure } from "../domain";
import { EDUCATION_TYPE_SLUGS, type EducationTypeSlug } from "../education-types";
import { useLocale } from "../i18n/locale-context";
import type { MessageKey } from "../i18n/messages";
import { Body, Button, Field } from "../ui/primitives";
import { theme } from "../ui/theme";
import { CapabilityFailureNotice } from "./capability-failure";

const MIN_INSTITUTION = 2;
const MIN_YEAR = 1900;

type Flow =
  | { readonly kind: "writing"; readonly localError: MessageKey | null }
  | { readonly kind: "saving" }
  | { readonly kind: "failed"; readonly failure: DomainFailure };

/** "" → null (not given); a four-digit year in range → the year; else NaN. */
function optionalYear(text: string, max: number): number | null {
  const v = text.trim();
  if (v === "") return null;
  if (!/^\d{4}$/.test(v)) return Number.NaN;
  const n = Number(v);
  return n >= MIN_YEAR && n <= max ? n : Number.NaN;
}

/**
 * ADD EDUCATION — `worker.add-education`, the one-step action the web chat
 * runs. The type is required and comes from the web's closed set; the years
 * are optional, as on the web. It is the person's own statement: nothing here
 * makes it look confirmed.
 */
export function EducationForm({ onDone }: { onDone: () => void }) {
  const { t, locale } = useLocale();
  const { accessToken } = useAuth();
  const [institution, setInstitution] = useState("");
  const [program, setProgram] = useState("");
  const [type, setType] = useState<EducationTypeSlug | null>(null);
  const [startYear, setStartYear] = useState("");
  const [endYear, setEndYear] = useState("");
  const [ongoing, setOngoing] = useState(false);
  const [flow, setFlow] = useState<Flow>({ kind: "writing", localError: null });

  const live = useRef(true);
  useEffect(() => {
    live.current = true;
    return () => {
      live.current = false;
    };
  }, []);

  const save = useCallback(async () => {
    const maxYear = new Date().getFullYear() + 10;
    const name = institution.trim();
    if (name.length < MIN_INSTITUTION) {
      setFlow({ kind: "writing", localError: "cv.education.institutionRequired" });
      return;
    }
    if (type === null) {
      setFlow({ kind: "writing", localError: "cv.education.typeRequired" });
      return;
    }
    const from = optionalYear(startYear, maxYear);
    const to = ongoing ? null : optionalYear(endYear, maxYear);
    if (Number.isNaN(from) || Number.isNaN(to) || (from !== null && to !== null && to < from)) {
      setFlow({ kind: "writing", localError: "cv.education.yearsInvalid" });
      return;
    }
    setFlow({ kind: "saving" });
    const result = await capability<WorkerActionData>({
      name: "worker.add-education",
      args: {
        institution: name,
        program: program.trim() === "" ? null : program.trim(),
        educationTypeSlug: type,
        startYear: from,
        endYear: to,
        isCurrent: ongoing,
      },
      accessToken,
      locale,
    });
    if (!live.current) return;
    if (!result.ok) {
      setFlow({ kind: "failed", failure: result.failure });
      return;
    }
    onDone();
  }, [accessToken, endYear, institution, locale, ongoing, onDone, program, startYear, type]);

  const busy = flow.kind === "saving";
  return (
    <View style={styles.stack} testID="cv-education-form">
      <Field
        testID="cv-education-institution"
        label={t("cv.education.institutionLabel")}
        value={institution}
        onChangeText={setInstitution}
        maxLength={200}
        editable={!busy}
      />
      <Field
        testID="cv-education-program"
        label={t("cv.education.programLabel")}
        value={program}
        onChangeText={setProgram}
        maxLength={200}
        editable={!busy}
      />
      <Body muted>{t("cv.education.typeLabel")}</Body>
      <View style={styles.choices}>
        {EDUCATION_TYPE_SLUGS.map((slug) => (
          <Button
            key={slug}
            variant={type === slug ? "primary" : "quiet"}
            testID={`cv-education-type-${slug}`}
            label={t(`cv.educationType.${slug}`)}
            disabled={busy}
            onPress={() => setType(slug)}
          />
        ))}
      </View>
      <Field
        testID="cv-education-start"
        label={t("cv.work.startLabel")}
        value={startYear}
        onChangeText={setStartYear}
        keyboardType="number-pad"
        maxLength={4}
        editable={!busy}
      />
      <View style={styles.choices}>
        <Button
          variant={ongoing ? "primary" : "quiet"}
          testID="cv-education-ongoing"
          label={t("cv.education.ongoing")}
          onPress={() => setOngoing(!ongoing)}
          disabled={busy}
        />
      </View>
      {ongoing ? null : (
        <Field
          testID="cv-education-end"
          label={t("cv.work.endLabel")}
          value={endYear}
          onChangeText={setEndYear}
          keyboardType="number-pad"
          maxLength={4}
          editable={!busy}
        />
      )}
      {flow.kind === "writing" && flow.localError ? (
        <View testID="cv-education-local-error">
          <Body>{t(flow.localError)}</Body>
        </View>
      ) : null}
      {flow.kind === "failed" ? (
        <CapabilityFailureNotice
          failure={flow.failure}
          title="cv.saveFailedTitle"
          retry={() => void save()}
          testID="cv-education-failure"
        />
      ) : null}
      <Button testID="cv-education-save" label={t("cv.save")} busy={busy} onPress={() => void save()} />
      <Button variant="quiet" testID="cv-education-cancel" label={t("cv.cancel")} disabled={busy} onPress={onDone} />
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { gap: theme.space.md },
  choices: { gap: theme.space.sm },
});
