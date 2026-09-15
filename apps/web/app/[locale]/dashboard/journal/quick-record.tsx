"use client";

import { useId, useState } from "react";
import { useTranslations } from "next-intl";

import {
  WorkerWorkLogFlow,
  type WorkLogLabels,
} from "@/components/app/conversation/worker-worklog-flow";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { extractWorkLog, type WorkLogParse } from "@/lib/conversation/worklog-extract";
import { personCalendarDay } from "@/lib/time/person-calendar-day";

/**
 * MANO DARBAS — the default recording path on the journal page (target
 * worker IA 2026-09-13 §2: "extremely simple: what · where · how long ·
 * photo → readback → confirm").
 *
 * ONE input in the person's own words, ONE button. The sentence is then
 * handed to the SAME deterministic reader the conversation uses
 * (`extractWorkLog`) and the SAME readback + confirm surface
 * (`WorkerWorkLogFlow`): the work day, the timed phrases the record will
 * carry with their hours, the place, the work context named by the one
 * label composer, an optional photo — then one confirmation, saved through
 * the one dispatcher into the canonical `createJournalEntry`. No second
 * parser, no second write path, no second ledger.
 *
 * The full composer stays reachable behind the explicit "detaliau" link
 * (`?compose=full`) and remains the EDIT surface for an existing entry
 * (§1.5: nothing removed, nothing made unreachable). The conversation and
 * the voice door stay as secondary text links.
 */
export function JournalQuickRecord({
  locale,
  labels,
  otherDoors,
}: {
  locale: string;
  labels: WorkLogLabels;
  /** The other ways to record (conversation, voice, the full form) — text
   *  links the page composes, rendered under the recorder so every existing
   *  door stays one tap away without competing with the one primary action. */
  otherDoors?: React.ReactNode;
}) {
  const t = useTranslations("journal.record");
  const tJournal = useTranslations("journal");
  const id = useId();
  const [text, setText] = useState("");
  const [draft, setDraft] = useState<WorkLogParse | null>(null);
  const canUnderstand = text.trim().length >= 3;

  return (
    <Card compact className="flex flex-col gap-3" data-testid="journal-quick-record">
      <div className="flex flex-col gap-0.5">
        <h2
          id={`${id}-title`}
          className="font-display text-card-title font-semibold text-text-primary"
        >
          {tJournal("whatDidYouDo")}
        </h2>
        <p className="text-support leading-relaxed text-text-secondary">{t("hint")}</p>
      </div>

      {draft === null ? (
        <>
          <label className="sr-only" htmlFor={`${id}-text`}>
            {tJournal("whatDidYouDo")}
          </label>
          <textarea
            id={`${id}-text`}
            rows={3}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={t("placeholder")}
            data-testid="journal-quick-record-text"
            className="w-full rounded-md border border-ink-500 bg-ink-700 px-4 py-3 text-body text-text-primary outline-none transition-colors placeholder:text-text-muted focus:border-brand-blue"
          />
          <div className="flex flex-wrap items-center gap-3">
            <Button
              type="button"
              variant="primary"
              disabled={!canUnderstand}
              data-testid="journal-quick-record-understand"
              onClick={() => setDraft(extractWorkLog(text, personCalendarDay()))}
            >
              {t("understand")}
            </Button>
          </div>
        </>
      ) : (
        <div className="flex flex-col gap-2" data-testid="journal-quick-record-readback">
          <WorkerWorkLogFlow
            key={draft.notes}
            draft={draft}
            locale={locale}
            labels={labels}
            onClose={() => setDraft(null)}
          />
          <button
            type="button"
            onClick={() => setDraft(null)}
            className="inline-flex min-h-11 items-center self-start text-support font-medium text-text-secondary underline-offset-2 hover:text-text-primary hover:underline"
            data-testid="journal-quick-record-restart"
          >
            {t("startOver")}
          </button>
        </div>
      )}

      {/* the other doors — every existing way to record stays reachable,
          as text links, not competing buttons (one primary action per
          screen) */}
      {otherDoors}
    </Card>
  );
}
