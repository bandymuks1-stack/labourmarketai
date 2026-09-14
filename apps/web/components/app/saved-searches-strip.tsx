"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";

import {
  deleteSearchAction,
  markSearchSeenAction,
  saveSearchAction,
} from "@/lib/opportunities/saved-search-actions";
import {
  SAVED_SEARCH_LABEL_MAX,
  SAVED_SEARCH_LIMIT,
  savedSearchHref,
  type SavedSearchReading,
} from "@/lib/opportunities/saved-search-model";
import type { DiscoveryFilterState } from "@/lib/opportunities/discovery-filters";

/**
 * SAVED SEARCHES — the standing question, on the board that answers it
 * (DEM-8).
 *
 * The register's gap in its own words: "Bookmarks exist; a recurring query
 * that notifies does not." A worker could save an opportunity they had
 * already found; they could not save the QUESTION, so they re-asked it by
 * hand and learned about new work only by happening to look on the right day.
 *
 * HONEST INVISIBILITY. While the owner-gated migration is unapplied the whole
 * strip does not render — no dead button, no control that fails when pressed.
 *
 * WHAT THE COUNTS MEAN. `matchCount` is what this question matches among the
 * cards the worker's own read returned, recomputed on every render — a saved
 * search stores no demand facts, so it can never show a stale title or a
 * closed vacancy. The "new" mark appears only when the number of unseen
 * matches is KNOWN; when the cards carry no dates it is null and nothing is
 * claimed either way, because "nothing new since you looked" is a statement
 * and the product would be making it on no evidence.
 *
 * OPENING A SEARCH IS WHAT CLEARS IT. Marking seen happens on the click that
 * navigates, never in a background pass — the only thing that means a worker
 * has looked is a worker looking.
 */
export function SavedSearchesStrip({
  readings,
  currentFilters,
  canSaveCurrent,
  boardPath,
}: {
  readings: readonly SavedSearchReading[];
  currentFilters: DiscoveryFilterState;
  /** False when no filter is active — an empty question matches everything
   *  and would notify on everything. */
  canSaveCurrent: boolean;
  boardPath: string;
}) {
  const t = useTranslations("opportunities.savedSearches");
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [label, setLabel] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const atLimit = readings.length >= SAVED_SEARCH_LIMIT;

  function save() {
    const name = label.trim();
    if (!name) return;
    startTransition(async () => {
      const res = await saveSearchAction({
        label: name,
        criteria: currentFilters,
        notify: true,
      });
      setMsg(res.ok ? t("outcome.saved") : t(`outcome.${res.code}`));
      if (res.ok) {
        setLabel("");
        router.refresh();
      }
    });
  }

  function open(reading: SavedSearchReading) {
    startTransition(async () => {
      // Mark seen FIRST, then navigate: if the mark fails the worker still
      // gets their results, and the search simply still shows as unseen —
      // which is true, since we could not record that they looked.
      await markSearchSeenAction(reading.id);
      router.push(savedSearchHref(boardPath, reading.criteria));
    });
  }

  function remove(id: string) {
    startTransition(async () => {
      const res = await deleteSearchAction(id);
      setMsg(res.ok ? t("outcome.deleted") : t(`outcome.${res.code}`));
      router.refresh();
    });
  }

  return (
    <section
      className="flex flex-col gap-2 rounded-md border border-ink-600 bg-ink-800/30 p-4"
      data-testid="saved-searches"
    >
      <div className="flex flex-wrap items-baseline gap-2">
        <h2 className="font-display text-base font-semibold text-text-primary">
          {t("title")}
        </h2>
        <p className="text-meta text-text-muted">{t("intro")}</p>
      </div>

      {readings.length === 0 ? (
        <p className="text-sm text-text-secondary" data-testid="saved-searches-empty">
          {t("empty")}
        </p>
      ) : (
        <ul className="flex flex-col gap-1" data-testid="saved-searches-list">
          {readings.map((reading) => (
            <li
              key={reading.id}
              className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md border border-ink-600 bg-ink-800/40 px-3 py-2"
              data-testid={`saved-search-${reading.id}`}
            >
              <button
                type="button"
                disabled={pending}
                onClick={() => open(reading)}
                className="text-sm font-semibold text-brand-blue hover:underline"
                data-testid="saved-search-open"
              >
                {reading.label}
              </button>
              <span className="font-mono text-meta uppercase tracking-label text-text-muted">
                {t("matches", { count: reading.matchCount })}
              </span>
              {reading.newSinceSeen !== null && reading.newSinceSeen > 0 ? (
                <span
                  className="inline-flex items-center rounded-full border border-brand-blue/40 px-2 py-0.5 font-mono text-meta uppercase tracking-label text-brand-blue"
                  data-testid="saved-search-new"
                >
                  {t("new", { count: reading.newSinceSeen })}
                </span>
              ) : null}
              <button
                type="button"
                disabled={pending}
                onClick={() => remove(reading.id)}
                className="ml-auto text-meta text-text-muted hover:text-state-danger"
                data-testid="saved-search-delete"
              >
                {t("delete")}
              </button>
            </li>
          ))}
        </ul>
      )}

      {canSaveCurrent && !atLimit ? (
        <div className="flex flex-wrap items-center gap-2 border-t border-ink-600 pt-2">
          <input
            aria-label={t("labelField")}
            value={label}
            maxLength={SAVED_SEARCH_LABEL_MAX}
            onChange={(e) => setLabel(e.target.value)}
            placeholder={t("labelPlaceholder")}
            className="min-w-40 flex-1 rounded-md border border-ink-500 bg-ink-900 px-2 py-1 text-sm text-text-primary"
            data-testid="saved-search-label"
          />
          <button
            type="button"
            disabled={pending || !label.trim()}
            onClick={save}
            className="rounded-md border border-brand-blue/50 px-3 py-1 text-meta text-brand-blue hover:border-brand-blue disabled:opacity-50"
            data-testid="saved-search-save"
          >
            {t("saveCurrent")}
          </button>
        </div>
      ) : null}
      {atLimit ? (
        <p className="text-meta text-text-muted" data-testid="saved-searches-limit">
          {t("limitReached", { limit: SAVED_SEARCH_LIMIT })}
        </p>
      ) : null}
      {msg ? (
        <p className="text-meta text-text-secondary" role="status">
          {msg}
        </p>
      ) : null}
    </section>
  );
}
