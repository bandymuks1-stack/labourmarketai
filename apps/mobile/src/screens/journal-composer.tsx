import React, { useCallback, useEffect, useRef, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { useAuth } from "../auth-context";
import type {
  JournalConfirmData,
  JournalCreateDraftData,
  JournalDraftPreview,
  JournalEngagementOption,
} from "../capability-shapes";
import { capability, type DomainFailure } from "../domain";
import { useLocale } from "../i18n/locale-context";
import type { MessageKey } from "../i18n/messages";
import { Body, Button, Divider, Field, NotAvailable } from "../ui/primitives";
import { theme } from "../ui/theme";
import { CapabilityFailureNotice } from "./capability-failure";

/**
 * WRITING A WORK JOURNAL ENTRY FROM THE PHONE.
 *
 * The phone is where the work happens, so a client that could read the journal
 * and not add to it inverted the product's own use case (mobile parity audit
 * 2026-09-01, defect D-5). This screen closes it — and closes it through the
 * capabilities that already existed, adding nothing server-side.
 *
 * ## One write path, not a second one
 *
 * `journal.create_draft` → `journal.confirm`, over `/api/mcp`, as the caller,
 * under the caller's own RLS — the exact pair the web chat work-log flow and an
 * MCP client use. `journal.confirm` runs `createJournalEntryCore`, which is the
 * same append-only, hash-chained, pipeline-awaited save the web composer
 * performs. There is no mobile write endpoint, no service role, and no table
 * this app touches directly.
 *
 * ## Two steps, because the server's contract has two
 *
 * The draft leg writes NOTHING. It validates, resolves which work context the
 * entry belongs to from the caller's own active contexts, and returns either a
 * preview plus a one-time confirmation token, or — when more than one context
 * could apply — the labelled options and no token, because the human has to
 * choose. This screen shows the preview before it saves rather than after,
 * which is what makes the resolved context visible instead of silently
 * assigned.
 *
 * ## What this screen refuses to do
 *
 * No local draft store, and no offline queue. If the capability cannot be
 * reached, it says so and the entry stays in the box the person is looking at.
 * A "saved" that never reached the server is the one failure mode a work
 * journal must never have — an entry that a person believes is recorded, and
 * that no manager, no CV and no evidence chain will ever see.
 */

/** The wire contract's own shape rules, checked locally ONLY so that a phone
 *  does not pay a round trip to be told about a typo. The server validates
 *  everything again; nothing here decides meaning. */
const WORK_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const MIN_NOTES = 3;

type ComposerState =
  /** Editing. `localError` is a shape complaint, never a server verdict. */
  | { readonly kind: "writing"; readonly localError: MessageKey | null }
  | { readonly kind: "drafting" }
  | { readonly kind: "draft_failed"; readonly failure: DomainFailure }
  | {
      readonly kind: "choosing";
      readonly options: readonly JournalEngagementOption[];
    }
  | {
      readonly kind: "ready";
      readonly preview: JournalDraftPreview;
      readonly token: string;
    }
  | {
      readonly kind: "saving";
      readonly preview: JournalDraftPreview;
      readonly token: string;
    }
  | {
      readonly kind: "save_failed";
      readonly preview: JournalDraftPreview;
      readonly token: string;
      readonly failure: DomainFailure;
    }
  | {
      readonly kind: "saved";
      readonly preview: JournalDraftPreview;
      readonly result: JournalConfirmData;
    };

/** Today (and yesterday) in the DEVICE's own calendar day, not UTC — a person
 *  logging an evening shift in Vilnius must not be offered tomorrow's date.
 *  It is a default the person SEES in an editable field, never a hidden
 *  assumption: the server records the date that was previewed. */
function deviceDay(daysAgo: number): string {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function JournalComposer({ onDone }: { onDone: () => void }) {
  const { t } = useLocale();
  const { locale } = useLocale();
  const { accessToken } = useAuth();

  const [workDate, setWorkDate] = useState(() => deviceDay(0));
  const [notes, setNotes] = useState("");
  const [siteName, setSiteName] = useState("");
  const [state, setState] = useState<ComposerState>({
    kind: "writing",
    localError: null,
  });

  // A request that lands after the person has navigated away must not set
  // state on an unmounted tree; the entry is unaffected either way.
  const live = useRef(true);
  useEffect(() => {
    live.current = true;
    return () => {
      live.current = false;
    };
  }, []);

  const draft = useCallback(
    async (engagementContextId?: string) => {
      const trimmedNotes = notes.trim();
      const trimmedSite = siteName.trim();
      if (!WORK_DATE_PATTERN.test(workDate.trim())) {
        setState({ kind: "writing", localError: "journal.compose.invalidDate" });
        return;
      }
      if (trimmedNotes.length < MIN_NOTES) {
        setState({ kind: "writing", localError: "journal.compose.notesRequired" });
        return;
      }
      setState({ kind: "drafting" });
      const result = await capability<JournalCreateDraftData>({
        name: "journal.create_draft",
        args: {
          notes: trimmedNotes,
          workDate: workDate.trim(),
          siteName: trimmedSite === "" ? null : trimmedSite,
          // Omitted on the first pass ON PURPOSE: the capability resolves the
          // work context from the caller's own active contexts by the
          // canonical rule hierarchy. It is sent only after the person has
          // picked one from the options the server itself offered — this
          // client never invents a context id.
          ...(engagementContextId === undefined
            ? {}
            : { engagementContextId }),
        },
        accessToken,
        locale,
      });
      if (!live.current) return;
      if (!result.ok) {
        setState({ kind: "draft_failed", failure: result.failure });
        return;
      }
      if ("preview" in result.data) {
        setState({
          kind: "ready",
          preview: result.data.preview,
          token: result.data.confirmationToken,
        });
        return;
      }
      setState({ kind: "choosing", options: result.data.options });
    },
    [accessToken, locale, notes, siteName, workDate],
  );

  const save = useCallback(
    async (preview: JournalDraftPreview, token: string) => {
      setState({ kind: "saving", preview, token });
      const result = await capability<JournalConfirmData>({
        name: "journal.confirm",
        args: {
          // The PREVIEW's own values, byte for byte. The confirmation token is
          // bound to the exact draft the server previewed, so sending anything
          // the person did not see confirmed would be rejected — as it should
          // be.
          engagementContextId: preview.engagementContextId,
          notes: preview.notes,
          workDate: preview.workDate,
          siteName: preview.siteName,
          confirmationToken: token,
        },
        accessToken,
        locale,
      });
      if (!live.current) return;
      if (!result.ok) {
        setState({ kind: "save_failed", preview, token, failure: result.failure });
        return;
      }
      setState({ kind: "saved", preview, result: result.data });
    },
    [accessToken, locale],
  );

  const backToWriting = useCallback(() => {
    // Editing invalidates the draft, so the token is dropped rather than kept
    // around to be sent with words it was not minted for.
    setState({ kind: "writing", localError: null });
  }, []);

  // ── saved ───────────────────────────────────────────────────────────────
  if (state.kind === "saved") {
    return (
      <View style={styles.stack} testID="journal-compose-saved">
        <NotAvailable
          title={t("journal.compose.savedTitle")}
          body={t("journal.compose.savedBody")}
        >
          <PreviewFacts preview={state.preview} />
          <Divider />
          <SkillsOutcome skills={state.result.skills} />
        </NotAvailable>
        <Button
          testID="journal-compose-another"
          label={t("journal.compose.another")}
          onPress={() => {
            setNotes("");
            setSiteName("");
            setState({ kind: "writing", localError: null });
          }}
        />
        <Button
          variant="quiet"
          testID="journal-compose-back"
          label={t("journal.compose.backToJournal")}
          onPress={onDone}
        />
      </View>
    );
  }

  // ── preview / saving / save failure ─────────────────────────────────────
  if (
    state.kind === "ready" ||
    state.kind === "saving" ||
    state.kind === "save_failed"
  ) {
    const busy = state.kind === "saving";
    return (
      <View style={styles.stack} testID="journal-compose-preview">
        <NotAvailable
          title={t("journal.compose.previewTitle")}
          body={t("journal.compose.previewNothingSaved")}
        >
          <PreviewFacts preview={state.preview} />
        </NotAvailable>

        {state.kind === "save_failed" ? (
          state.failure.kind === "unreachable" ? (
            // The ONE failure where "nothing was sent" would be a guess: the
            // request left this device and never came back. Say exactly that,
            // and say why trying again is safe — the confirmation is one-time
            // and bound to the journal's own head, so a retry after a write
            // that did land is refused rather than duplicated.
            <NotAvailable
              tone="warning"
              testID="journal-compose-failure"
              title={t("journal.compose.saveFailedTitle")}
              body={t("journal.compose.unsureSaved")}
            />
          ) : (
            <CapabilityFailureNotice
              tone="warning"
              testID="journal-compose-failure"
              title="journal.compose.saveFailedTitle"
              failure={state.failure}
              refusalText={saveRefusalText(t)}
            />
          )
        ) : null}

        <Button
          testID="journal-compose-save"
          busy={busy}
          label={t("journal.compose.save")}
          onPress={() => void save(state.preview, state.token)}
        />
        <Button
          variant="quiet"
          testID="journal-compose-edit"
          label={t("journal.compose.edit")}
          onPress={backToWriting}
        />
      </View>
    );
  }

  // ── the server asked the human to choose a work context ─────────────────
  if (state.kind === "choosing") {
    return (
      <View style={styles.stack} testID="journal-compose-choose">
        <NotAvailable
          title={t("journal.compose.chooseContext")}
          body={t("journal.compose.chooseContextBody")}
        />
        {state.options.map((option) => (
          <Button
            key={option.id}
            variant="quiet"
            label={option.label}
            onPress={() => void draft(option.id)}
          />
        ))}
        <Button
          variant="quiet"
          testID="journal-compose-edit"
          label={t("journal.compose.edit")}
          onPress={backToWriting}
        />
      </View>
    );
  }

  // ── writing / drafting / draft failure ──────────────────────────────────
  return (
    <View style={styles.stack}>
      <Body muted>{t("journal.compose.intro")}</Body>

      <Field
        testID="journal-compose-date"
        label={t("journal.compose.date")}
        hint={t("journal.compose.dateHint")}
        value={workDate}
        onChangeText={setWorkDate}
        autoCapitalize="none"
        autoCorrect={false}
        inputMode="numeric"
        maxLength={10}
      />
      <View style={styles.row}>
        <View style={styles.rowItem}>
          <Button
            variant="quiet"
            testID="journal-compose-today"
            label={t("journal.compose.today")}
            onPress={() => setWorkDate(deviceDay(0))}
          />
        </View>
        <View style={styles.rowItem}>
          <Button
            variant="quiet"
            testID="journal-compose-yesterday"
            label={t("journal.compose.yesterday")}
            onPress={() => setWorkDate(deviceDay(1))}
          />
        </View>
      </View>

      <Field
        testID="journal-compose-notes"
        label={t("journal.compose.notes")}
        hint={t("journal.compose.notesHint")}
        value={notes}
        onChangeText={setNotes}
        multiline
        numberOfLines={6}
        maxLength={4000}
        style={styles.multiline}
      />

      <Field
        testID="journal-compose-site"
        label={t("journal.compose.site")}
        value={siteName}
        onChangeText={setSiteName}
        maxLength={200}
      />

      {state.kind === "writing" && state.localError !== null ? (
        <NotAvailable
          tone="warning"
          testID="journal-compose-failure"
          title={t("journal.compose.checkThis")}
          body={t(state.localError)}
        />
      ) : null}

      {state.kind === "draft_failed" ? (
        <CapabilityFailureNotice
          tone="warning"
          testID="journal-compose-failure"
          title="journal.compose.draftFailedTitle"
          failure={state.failure}
          refusalText={draftRefusalText(t)}
        />
      ) : null}

      <Button
        testID="journal-compose-review"
        busy={state.kind === "drafting"}
        label={t("journal.compose.review")}
        onPress={() => void draft()}
      />
      <Button
        variant="quiet"
        testID="journal-compose-back"
        label={t("journal.compose.backToJournal")}
        onPress={onDone}
      />
    </View>
  );
}

/** The exact facts the server previewed — and, after a save, the exact facts
 *  it recorded. Nothing derived, nothing re-formatted into a prettier date
 *  than the one the entry actually carries. */
function PreviewFacts({ preview }: { preview: JournalDraftPreview }) {
  const { t } = useLocale();
  return (
    <View style={styles.facts}>
      <Fact label={t("journal.compose.date")} value={preview.workDate} />
      <Fact
        label={t("journal.compose.context")}
        value={preview.engagementLabel ?? t("journal.compose.contextUnnamed")}
      />
      {preview.siteName !== null ? (
        <Fact label={t("journal.compose.site")} value={preview.siteName} />
      ) : null}
      <Fact label={t("journal.compose.notes")} value={preview.notes} />
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

/**
 * WHAT THE LIVING CV PIPELINE ACTUALLY DID — the server's own awaited counts.
 *
 * Written as label/number rows rather than a sentence with a number in it,
 * because this catalogue has no interpolation and a hand-built sentence would
 * be wrong in at least three of the five languages. Only non-zero rows show:
 * a zero is not a finding worth a line, and "nothing was added" is said once,
 * in words, when that is the whole truth.
 */
function SkillsOutcome({
  skills,
}: {
  skills: JournalConfirmData["skills"];
}) {
  const { t } = useLocale();

  if (skills.status === "failed") {
    // The entry IS saved — the pipeline is a separate, awaited step that can
    // fail on its own. Saying "saved" and nothing else would hide that a CV
    // the person expects to have moved did not.
    return <Body muted>{t("journal.compose.skillsFailed")}</Body>;
  }

  const counted: { key: MessageKey; value: number }[] = [
    { key: "journal.compose.skillsAdded", value: skills.added },
    { key: "journal.compose.skillsStrengthened", value: skills.strengthened },
    { key: "journal.compose.skillsClaims", value: skills.claimsSaved },
    { key: "journal.compose.skillsReview", value: skills.reviewNeeded },
  ];
  const rows = counted.filter((row) => row.value > 0);

  return (
    <View style={styles.facts}>
      {skills.status === "partial" ? (
        <Body muted>{t("journal.compose.skillsPartial")}</Body>
      ) : null}
      {rows.length === 0 ? (
        <Body muted>{t("journal.compose.noCvChange")}</Body>
      ) : (
        rows.map((row) => (
          <Fact key={row.key} label={t(row.key)} value={String(row.value)} />
        ))
      )}
      {skills.reviewNeeded > 0 ? (
        <Body muted>{t("journal.compose.reviewOnWeb")}</Body>
      ) : null}
    </View>
  );
}

/** Capability codes the DRAFT leg can return that this screen can say better
 *  than the server's English. Anything else falls through to the server's own
 *  words, shown as they arrived. */
function draftRefusalText(
  t: (key: MessageKey) => string,
): (code: string) => string | null {
  return (code) => {
    if (code === "no_worker_profile") return t("profile.noWorkerProfile");
    if (code === "no_engagement_context") return t("journal.compose.noContext");
    return null;
  };
}

/** The same, for the CONFIRM leg. `confirmation_rejected` is the one a person
 *  will actually meet: the journal moved under the draft (another entry
 *  landed, or the same one was already confirmed), so the preview they are
 *  looking at is no longer the one the token was minted for. */
function saveRefusalText(
  t: (key: MessageKey) => string,
): (code: string) => string | null {
  return (code) => {
    if (code === "confirmation_rejected") return t("journal.compose.staleDraft");
    if (code === "no_worker_profile") return t("profile.noWorkerProfile");
    if (code === "no_engagement_context" || code === "engagement_required") {
      return t("journal.compose.noContext");
    }
    return null;
  };
}

const styles = StyleSheet.create({
  stack: { gap: theme.space.md },
  row: { flexDirection: "row", gap: theme.space.sm },
  rowItem: { flex: 1 },
  multiline: {
    minHeight: 140,
    paddingTop: theme.space.sm,
    paddingBottom: theme.space.sm,
    textAlignVertical: "top",
  },
  facts: { gap: theme.space.sm },
  fact: { gap: 2 },
  factLabel: {
    color: theme.color.textMuted,
    fontSize: theme.font.small,
  },
  factValue: {
    color: theme.color.text,
    fontSize: theme.font.body,
    lineHeight: theme.font.body * 1.5,
  },
});
