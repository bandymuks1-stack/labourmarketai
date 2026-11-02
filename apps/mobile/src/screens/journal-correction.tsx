import React, { useCallback, useEffect, useRef, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { useAuth } from "../auth-context";
import type {
  JournalCorrectConfirmData,
  JournalCorrectDraftData,
  JournalCorrectionChange,
  JournalCorrectionSide,
  JournalEntry,
} from "../capability-shapes";
import { capability, type DomainFailure } from "../domain";
import { useLocale } from "../i18n/locale-context";
import type { MessageKey } from "../i18n/messages";
import { traceTestId, useRequestTrace } from "../request-trace";
import { Body, Button, Divider, Field, NotAvailable } from "../ui/primitives";
import { theme } from "../ui/theme";
import { CapabilityFailureNotice } from "./capability-failure";
import { siteNameOf, workDateOf } from "./journal-entries";

/**
 * CORRECTING ONE OF MY OWN WORK JOURNAL ENTRIES FROM THE PHONE.
 *
 * The web journal's edit, through the capability pair that already performs
 * it for MCP clients: `journal.correct_draft` → `journal.correct_confirm`.
 * The confirm calls the web's own `supersedeJournalEntry` as the caller, so
 * this is the SAME atomic supersede — the previous version stays in the
 * history, a confirmed entry keeps its confirmation and the correction
 * becomes a new unconfirmed version, and every total counts the chain once.
 * No mobile write path, no table touched from the device.
 *
 * Only what the person CHANGED is sent. The server re-sends everything else
 * the entry carries as stored (durations with their provenance, output,
 * direction, modules) — a phone that resent its own reading of those would
 * be a second, lossy editor.
 *
 * The draft shows BEFORE and AFTER, hours included, by the server's one
 * work-time rule: a reworded entry can change its hours, and a person must
 * see that before it lands in a total a manager reads.
 */

const WORK_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const MIN_NOTES = 3;

type CorrectionState =
  | { readonly kind: "writing"; readonly localError: MessageKey | null }
  | { readonly kind: "drafting" }
  | { readonly kind: "draft_failed"; readonly failure: DomainFailure }
  | {
      readonly kind: "ready" | "saving";
      readonly change: JournalCorrectionChange;
      readonly draft: JournalCorrectDraftData;
    }
  | {
      readonly kind: "save_failed";
      readonly change: JournalCorrectionChange;
      readonly draft: JournalCorrectDraftData;
      readonly failure: DomainFailure;
    }
  | {
      readonly kind: "saved";
      readonly draft: JournalCorrectDraftData;
      readonly result: JournalCorrectConfirmData;
    };

/** The device's own calendar day (same rule as the composer). */
function deviceToday(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function JournalCorrection({
  entry,
  onDone,
}: {
  entry: JournalEntry;
  onDone: () => void;
}) {
  const { t, locale } = useLocale();
  const { accessToken } = useAuth();
  const trace = useRequestTrace();

  // What the form starts from — and what "changed" is measured against.
  const initial = useRef({
    notes: entry.text,
    workDate: workDateOf(entry),
    siteName: siteNameOf(entry) ?? "",
  }).current;

  const [notes, setNotes] = useState(initial.notes);
  const [workDate, setWorkDate] = useState(initial.workDate);
  const [siteName, setSiteName] = useState(initial.siteName);
  const [state, setState] = useState<CorrectionState>({
    kind: "writing",
    localError: null,
  });

  const live = useRef(true);
  useEffect(() => {
    live.current = true;
    return () => {
      live.current = false;
    };
  }, []);

  const draft = useCallback(async () => {
    const n = notes.trim();
    const d = workDate.trim();
    const s = siteName.trim();
    if (!WORK_DATE_PATTERN.test(d)) {
      setState({ kind: "writing", localError: "journal.compose.invalidDate" });
      return;
    }
    if (d > deviceToday()) {
      setState({ kind: "writing", localError: "journal.compose.futureDate" });
      return;
    }
    if (n.length < MIN_NOTES) {
      setState({ kind: "writing", localError: "journal.compose.notesRequired" });
      return;
    }
    const change: JournalCorrectionChange = {
      entryId: entry.entryId,
      ...(n !== initial.notes.trim() ? { notes: n } : {}),
      ...(d !== initial.workDate ? { workDate: d } : {}),
      ...(s !== initial.siteName.trim() ? { siteName: s === "" ? null : s } : {}),
    };
    if (Object.keys(change).length === 1) {
      setState({ kind: "writing", localError: "journal.correct.nothingChanged" });
      return;
    }
    setState({ kind: "drafting" });
    const result = await capability<JournalCorrectDraftData>({
      name: "journal.correct_draft",
      args: change,
      accessToken,
      locale,
    });
    if (!live.current) return;
    if (!result.ok) {
      setState({ kind: "draft_failed", failure: result.failure });
      return;
    }
    setState({ kind: "ready", change, draft: result.data });
  }, [accessToken, entry.entryId, initial, locale, notes, siteName, workDate]);

  const save = useCallback(
    async (change: JournalCorrectionChange, drafted: JournalCorrectDraftData) => {
      setState({ kind: "saving", change, draft: drafted });
      const result = await capability<JournalCorrectConfirmData>({
        name: "journal.correct_confirm",
        // The SAME change the token was minted for, and nothing else.
        args: { ...change, confirmationToken: drafted.confirmationToken },
        accessToken,
        locale,
      });
      if (!live.current) return;
      if (!result.ok) {
        setState({ kind: "save_failed", change, draft: drafted, failure: result.failure });
        return;
      }
      setState({ kind: "saved", draft: drafted, result: result.data });
    },
    [accessToken, locale],
  );

  const backToWriting = useCallback(() => {
    // Editing voids the draft; its token is dropped, never resent.
    setState({ kind: "writing", localError: null });
  }, []);

  // ── saved ───────────────────────────────────────────────────────────────
  if (state.kind === "saved") {
    return (
      <View style={styles.stack} testID="journal-correct-saved">
        <NotAvailable
          title={t("journal.correct.savedTitle")}
          body={
            state.result.wasConfirmed
              ? t("journal.correct.savedConfirmedBody")
              : t("journal.correct.savedBody")
          }
        >
          <Side title={t("journal.correct.after")} side={state.draft.preview.after} />
        </NotAvailable>
        <Button
          testID="journal-correct-back"
          label={t("journal.compose.backToJournal")}
          onPress={onDone}
        />
      </View>
    );
  }

  // ── preview / saving / save failure ─────────────────────────────────────
  if (state.kind === "ready" || state.kind === "saving" || state.kind === "save_failed") {
    const { preview } = state.draft;
    return (
      <View style={styles.stack} testID="journal-correct-preview">
        <View testID={traceTestId(trace, "journal.correct_confirm")}>
          <NotAvailable
            title={t("journal.correct.previewTitle")}
            body={t("journal.compose.previewNothingSaved")}
          >
            <Side title={t("journal.correct.before")} side={preview.before} />
            <Divider />
            <Side title={t("journal.correct.after")} side={preview.after} />
          </NotAvailable>
        </View>
        {preview.wasConfirmed ? (
          <Body muted>{t("journal.correct.wasConfirmed")}</Body>
        ) : null}

        {state.kind === "save_failed" ? (
          state.failure.kind === "unreachable" ? (
            // Sent, and no answer: whether it landed is unknown. A retry is
            // safe — the token is one-time and bound to the journal's head,
            // so a correction that did land refuses the retry.
            <NotAvailable
              tone="warning"
              testID="journal-correct-failure"
              title={t("journal.correct.saveFailedTitle")}
              body={t("journal.correct.unsureSaved")}
            />
          ) : (
            <CapabilityFailureNotice
              tone="warning"
              testID="journal-correct-failure"
              title="journal.correct.saveFailedTitle"
              failure={state.failure}
              refusalText={refusalText(t)}
            />
          )
        ) : null}

        <Button
          testID="journal-correct-save"
          busy={state.kind === "saving"}
          label={t("journal.correct.save")}
          onPress={() => void save(state.change, state.draft)}
        />
        <Button
          variant="quiet"
          testID="journal-correct-edit"
          label={t("journal.compose.edit")}
          onPress={backToWriting}
        />
      </View>
    );
  }

  // ── writing / drafting / draft failure ──────────────────────────────────
  return (
    <View
      style={styles.stack}
      testID={`journal-correct-form-${state.kind}${
        state.kind === "draft_failed" ? `-${state.failure.kind}` : ""
      }`}
    >
      <View testID={traceTestId(trace, "journal.correct_draft")}>
        <Body muted>{t("journal.correct.intro")}</Body>
      </View>
      <Field
        testID="journal-correct-date"
        label={t("journal.compose.date")}
        hint={t("journal.compose.dateHint")}
        value={workDate}
        onChangeText={setWorkDate}
        autoCapitalize="none"
        autoCorrect={false}
        inputMode="numeric"
        maxLength={10}
      />
      <Field
        testID="journal-correct-notes"
        label={t("journal.compose.notes")}
        value={notes}
        onChangeText={setNotes}
        multiline
        numberOfLines={6}
        maxLength={4000}
        style={styles.multiline}
      />
      <Field
        testID="journal-correct-site"
        label={t("journal.compose.site")}
        value={siteName}
        onChangeText={setSiteName}
        maxLength={200}
        returnKeyType="done"
        submitBehavior="blurAndSubmit"
      />

      {state.kind === "writing" && state.localError !== null ? (
        <NotAvailable
          tone="warning"
          testID="journal-correct-failure"
          title={t("journal.compose.checkThis")}
          body={t(state.localError)}
        />
      ) : null}
      {state.kind === "draft_failed" ? (
        <CapabilityFailureNotice
          tone="warning"
          testID="journal-correct-failure"
          title="journal.correct.draftFailedTitle"
          failure={state.failure}
          refusalText={refusalText(t)}
        />
      ) : null}

      <Button
        testID="journal-correct-review"
        busy={state.kind === "drafting"}
        label={t("journal.compose.review")}
        onPress={() => void draft()}
      />
      <Button
        variant="quiet"
        testID="journal-correct-back"
        label={t("journal.compose.backToJournal")}
        onPress={onDone}
      />
    </View>
  );
}

/** One side of the correction, exactly as the server previewed it. */
function Side({ title, side }: { title: string; side: JournalCorrectionSide }) {
  const { t } = useLocale();
  return (
    <View style={styles.facts}>
      <Text style={styles.sideTitle}>{title}</Text>
      {side.workDate !== null ? (
        <Fact label={t("journal.compose.date")} value={side.workDate} />
      ) : null}
      {side.siteName !== null ? (
        <Fact label={t("journal.compose.site")} value={side.siteName} />
      ) : null}
      <Fact label={t("journal.correct.hours")} value={formatHours(side.hours)} />
      {side.output !== null ? (
        <Fact
          label={t("journal.correct.output")}
          value={`${side.output.value} ${side.output.unitSlug}`}
        />
      ) : null}
      <Fact label={t("journal.compose.notes")} value={side.notes} />
    </View>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.fact} accessible>
      <Text style={styles.factLabel}>{label}</Text>
      <Text style={styles.factValue}>{value}</Text>
    </View>
  );
}

/** The server's number, rounded for reading only (two decimals at most). */
function formatHours(hours: number): string {
  return String(Math.round(hours * 100) / 100);
}

/** Capability codes this screen can say better than the server's English. */
function refusalText(t: (key: MessageKey) => string): (code: string) => string | null {
  return (code) => {
    switch (code) {
      case "confirmation_rejected":
        return t("journal.correct.staleDraft");
      case "entry_superseded":
        return t("journal.correct.superseded");
      case "entry_not_found":
        return t("journal.correct.notFound");
      case "output_and_time_conflict":
        return t("journal.correct.conflict");
      case "no_worker_profile":
        return t("profile.noWorkerProfile");
      default:
        return null;
    }
  };
}

const styles = StyleSheet.create({
  stack: { gap: theme.space.md },
  multiline: {
    minHeight: 140,
    paddingTop: theme.space.sm,
    paddingBottom: theme.space.sm,
    textAlignVertical: "top",
  },
  facts: { gap: theme.space.sm },
  sideTitle: {
    color: theme.color.text,
    fontSize: theme.font.body,
    fontWeight: "600",
  },
  fact: { gap: 2 },
  factLabel: { color: theme.color.textMuted, fontSize: theme.font.small },
  factValue: {
    color: theme.color.text,
    fontSize: theme.font.body,
    lineHeight: theme.font.body * 1.5,
  },
});
