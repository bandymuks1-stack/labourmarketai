"use client";

import { useActionState, useState } from "react";

import { Button } from "@/components/ui/Button";
import { Label } from "@/components/ui/Label";
import { DarkListbox } from "@/components/ui/DarkListbox";
import {
  removeWorkerLanguageAction,
  saveWorkerLanguageAction,
  type WorkerLanguageActionResult,
} from "@/lib/worker/worker-languages-actions";
import {
  WORKER_LANGUAGE_LEVELS,
  WORKER_LANGUAGE_NATIVE_NAMES,
  WORKER_LANGUAGES,
  type WorkerLanguageEntry,
  type WorkerLanguageLevel,
} from "@/lib/worker/worker-languages-model";

/**
 * "Languages" card (P2-PR3) — the worker-facing list + add/remove UI for the
 * worker_languages table from DRAFT migration 20260711250000 (PR #720 —
 * human-gated, NOT applied yet).
 *
 * Honest gating: when the read path reported the table absent, the section
 * still renders — with its calm explanation state (same copy convention as
 * the v1 preferences card) instead of a form that would fail on save or a
 * fake empty list. Writes go ONLY through the two owner-scoped RPCs.
 *
 * Language names render in their own language (the standard picker
 * convention, same as the demand form). Levels are CEFR codes + "native".
 * A visible line states these are the worker's own statements — the platform
 * does not check them; nothing here may ever look verified.
 */

export interface WorkerLanguagesLabels {
  title: string;
  hint: string;
  /** "Stated by you — the platform does not check these." */
  selfStated: string;
  language: string;
  level: string;
  /** Label for the "native" level option (A1..C2 render as-is). */
  levelNative: string;
  add: string;
  adding: string;
  remove: string;
  empty: string;
  /** Calm not-enabled copy — same convention as the v1 prefs card. */
  notEnabled: string;
  error: string;
  invalid: string;
}

function levelLabel(level: WorkerLanguageLevel, nativeLabel: string): string {
  return level === "native" ? nativeLabel : level;
}

/** One saved language row with its remove action (each row is its own form so
 *  a failed remove reports on that row, and FormData carries the lang). */
function LanguageRow({
  entry,
  labels,
}: {
  entry: WorkerLanguageEntry;
  labels: WorkerLanguagesLabels;
}) {
  const [state, action, pending] = useActionState<
    WorkerLanguageActionResult | null,
    FormData
  >(removeWorkerLanguageAction, null);

  return (
    <li
      className="flex items-center justify-between gap-3 rounded-md border border-ink-600 px-3 py-2"
      data-testid={`worker-language-${entry.lang}`}
    >
      <span className="flex min-w-0 items-baseline gap-2 text-sm text-text-primary">
        <span className="truncate font-medium">
          {WORKER_LANGUAGE_NATIVE_NAMES[entry.lang]}
        </span>
        <span className="shrink-0 font-mono text-meta uppercase tracking-label text-text-secondary">
          {levelLabel(entry.level, labels.levelNative)}
        </span>
      </span>
      <form action={action} className="flex shrink-0 items-center gap-2">
        <input type="hidden" name="lang" value={entry.lang} />
        {state && !state.ok && (
          <span className="text-xs text-state-danger" role="alert">
            {state.code === "needs_migration" ? labels.notEnabled : labels.error}
          </span>
        )}
        <button
          type="submit"
          disabled={pending}
          className="inline-flex min-h-11 items-center rounded-md border border-ink-600 px-2 py-1 text-xs text-text-secondary transition-colors hover:border-state-danger hover:text-state-danger disabled:opacity-50"
          data-testid={`worker-language-remove-${entry.lang}`}
        >
          {labels.remove}
        </button>
      </form>
    </li>
  );
}

export function WorkerLanguagesSection({
  initial,
  labels,
  needsMigration = false,
}: {
  initial: WorkerLanguageEntry[];
  labels: WorkerLanguagesLabels;
  /** True when the read path reported the table is not applied — the card
   *  shows the honest not-enabled notice instead of a form that would fail
   *  on save (and never a fake empty list). */
  needsMigration?: boolean;
}) {
  const [lang, setLang] = useState<string>("");
  const [level, setLevel] = useState<string>("");

  const [addState, addAction, addPending] = useActionState<
    WorkerLanguageActionResult | null,
    FormData
  >(saveWorkerLanguageAction, null);

  const langOptions = WORKER_LANGUAGES.map((code) => ({
    value: code,
    label: WORKER_LANGUAGE_NATIVE_NAMES[code],
  }));
  const levelOptions = WORKER_LANGUAGE_LEVELS.map((lv) => ({
    value: lv,
    label: levelLabel(lv, labels.levelNative),
  }));

  return (
    <section
      className="card-border flex flex-col gap-3 p-5"
      data-testid="worker-languages"
    >
      <header className="flex flex-col gap-0.5">
        <h2 className="font-display text-lg font-semibold text-text-primary">
          {labels.title}
        </h2>
        <p className="text-xs leading-relaxed text-text-secondary">{labels.hint}</p>
      </header>

      {needsMigration ? (
        <p
          className="rounded-md border border-ink-600 bg-ink-800/40 p-3 text-sm text-text-secondary"
          role="status"
          data-testid="worker-languages-needs-migration"
        >
          {labels.notEnabled}
        </p>
      ) : (
        <>
          {initial.length > 0 ? (
            <ul className="flex flex-col gap-2" data-testid="worker-languages-list">
              {initial.map((entry) => (
                <LanguageRow key={entry.lang} entry={entry} labels={labels} />
              ))}
            </ul>
          ) : (
            <p
              className="text-sm text-text-secondary"
              data-testid="worker-languages-empty"
            >
              {labels.empty}
            </p>
          )}

          <form
            action={addAction}
            className="flex flex-col gap-3"
            data-testid="worker-languages-add-form"
          >
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <Label>{labels.language}</Label>
                <DarkListbox
                  value={lang}
                  onChange={setLang}
                  options={langOptions}
                  name="lang"
                  placeholder="—"
                  ariaLabel={labels.language}
                  testId="worker-languages-lang"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>{labels.level}</Label>
                <DarkListbox
                  value={level}
                  onChange={setLevel}
                  options={levelOptions}
                  name="level"
                  placeholder="—"
                  ariaLabel={labels.level}
                  testId="worker-languages-level"
                />
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <Button
                type="submit"
                size="sm"
                className="min-h-11"
                loading={addPending}
                disabled={addPending || lang === "" || level === ""}
                data-testid="worker-languages-add"
              >
                {addPending ? labels.adding : labels.add}
              </Button>
              {addState && !addState.ok && (
                <span
                  className="text-xs text-state-danger"
                  role="alert"
                  data-testid="worker-languages-error"
                >
                  {addState.code === "needs_migration"
                    ? labels.notEnabled
                    : addState.code === "invalid"
                      ? labels.invalid
                      : labels.error}
                </span>
              )}
            </div>
          </form>
        </>
      )}

      {/* Always visible — including in the not-enabled state — so language
          facts are never mistaken for platform-checked claims. */}
      <p className="text-xs leading-relaxed text-text-muted" data-testid="worker-languages-self-stated">
        {labels.selfStated}
      </p>
    </section>
  );
}
