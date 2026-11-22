import React, { useCallback, useEffect, useRef, useState } from "react";
import { StyleSheet, View } from "react-native";

import { useAuth } from "../auth-context";
import type { WorkerActionData } from "../capability-shapes";
import { capability, type DomainFailure } from "../domain";
import { useLocale } from "../i18n/locale-context";
import type { MessageKey } from "../i18n/messages";
import { Body, Button, Field } from "../ui/primitives";
import { theme } from "../ui/theme";
import { CapabilityFailureNotice } from "./capability-failure";

const MIN_TITLE = 3;
const MIN_YEAR = 1900;

type Flow =
  | { readonly kind: "writing"; readonly localError: MessageKey | null }
  | { readonly kind: "saving" }
  | { readonly kind: "failed"; readonly failure: DomainFailure };

/** A four-digit year within the server's bounds, or null. */
function parseYear(text: string, max: number): number | null {
  if (!/^\d{4}$/.test(text.trim())) return null;
  const n = Number(text.trim());
  return n >= MIN_YEAR && n <= max ? n : null;
}

/**
 * ADD WORK HISTORY — `worker.add-work-history`, the one-step action the web
 * chat runs (same validation, same role gate). It records the person's own
 * statement of a past or current job on their Living CV; nothing here makes it
 * look confirmed. The phone asks for what a person knows by heart: what the
 * work was, and the years.
 */
export function WorkHistoryForm({ onDone }: { onDone: () => void }) {
  const { t, locale } = useLocale();
  const { accessToken } = useAuth();
  const [title, setTitle] = useState("");
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
    const maxYear = new Date().getFullYear() + 1;
    const name = title.trim();
    if (name.length < MIN_TITLE) {
      setFlow({ kind: "writing", localError: "cv.work.titleRequired" });
      return;
    }
    const from = parseYear(startYear, maxYear);
    if (from === null) {
      setFlow({ kind: "writing", localError: "cv.work.yearInvalid" });
      return;
    }
    const to = ongoing ? null : parseYear(endYear, maxYear);
    if (!ongoing && (to === null || to < from)) {
      setFlow({ kind: "writing", localError: "cv.work.endInvalid" });
      return;
    }
    setFlow({ kind: "saving" });
    const result = await capability<WorkerActionData>({
      name: "worker.add-work-history",
      args: { title: name, startYear: from, endYear: to, isCurrent: ongoing },
      accessToken,
      locale,
    });
    if (!live.current) return;
    if (!result.ok) {
      setFlow({ kind: "failed", failure: result.failure });
      return;
    }
    onDone();
  }, [accessToken, endYear, locale, ongoing, onDone, startYear, title]);

  const busy = flow.kind === "saving";
  return (
    <View style={styles.stack} testID="cv-work-form">
      <Field
        testID="cv-work-title"
        label={t("cv.work.titleLabel")}
        value={title}
        onChangeText={setTitle}
        maxLength={200}
        editable={!busy}
      />
      <Field
        testID="cv-work-start"
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
          testID="cv-work-ongoing"
          label={t("cv.work.ongoing")}
          onPress={() => setOngoing(!ongoing)}
          disabled={busy}
        />
      </View>
      {ongoing ? null : (
        <Field
          testID="cv-work-end"
          label={t("cv.work.endLabel")}
          value={endYear}
          onChangeText={setEndYear}
          keyboardType="number-pad"
          maxLength={4}
          editable={!busy}
        />
      )}
      {flow.kind === "writing" && flow.localError ? (
        <View testID="cv-work-local-error">
          <Body>{t(flow.localError)}</Body>
        </View>
      ) : null}
      {flow.kind === "failed" ? (
        <CapabilityFailureNotice
          failure={flow.failure}
          title="cv.saveFailedTitle"
          retry={() => void save()}
          testID="cv-work-failure"
        />
      ) : null}
      <Button testID="cv-work-save" label={t("cv.save")} busy={busy} onPress={() => void save()} />
      <Button variant="quiet" testID="cv-work-cancel" label={t("cv.cancel")} disabled={busy} onPress={onDone} />
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { gap: theme.space.md },
  choices: { gap: theme.space.sm },
});
