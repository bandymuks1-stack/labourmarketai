"use client";

import { useState } from "react";
import { useActionState } from "react";

import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";
import { DarkListbox } from "@/components/ui/DarkListbox";
import {
  addExternalProfileAction,
  disconnectExternalProfileAction,
  setExternalProfileVisibilityAction,
  type ExternalProfileActionResult,
} from "@/lib/worker/external-profiles-actions";
import {
  EXTERNAL_PROFILE_PLATFORMS,
  maskedUrlHost,
  validateExternalProfileUrl,
  type ExternalProfileEntry,
  type ExternalProfilePlatform,
} from "@/lib/worker/external-profiles-model";

/**
 * "External profiles" card (Labour Market OS P6) — the ONE canonical place a
 * worker links profiles they hold elsewhere. Backed by DRAFT migration
 * 20260713210000_multi_source_talent_v1 (human-gated, NOT applied yet).
 *
 * Consent-first honesty rules encoded in this component:
 *   - default visibility is PRIVATE; the "employers" choice is a SAVED
 *     PREFERENCE only in v1 (no employer read path exists) and the card says
 *     so in plain words next to the toggle — never a fake reach claim.
 *   - disconnect is a soft disconnect (row preserved as provenance) behind
 *     an inline two-step confirm.
 *   - NO import button: official/automatic import does not exist in v1, so
 *     no control pretends it does. An honest note points to the existing
 *     CV-file upload flow (#profile-edit on this same page).
 *   - When the table is not applied yet the card renders the calm
 *     "not enabled yet" state (same convention as the languages card).
 */

export interface ExternalProfilesLabels {
  title: string;
  hint: string;
  /** "You add and control these links yourself…" consent line. */
  selfManaged: string;
  platform: string;
  url: string;
  urlPlaceholder: string;
  add: string;
  adding: string;
  disconnect: string;
  confirmDisconnect: string;
  cancel: string;
  visibility: string;
  visibilityPrivate: string;
  visibilityEmployers: string;
  /** Honest v1 note: employer viewing is not switched on yet. */
  visibilityNote: string;
  /** Honest note: official import unavailable; upload an exported CV instead. */
  importNote: string;
  importLink: string;
  empty: string;
  notEnabled: string;
  error: string;
  invalid: string;
  platformNames: Record<ExternalProfilePlatform, string>;
}

function actionErrorText(
  state: ExternalProfileActionResult | null,
  labels: ExternalProfilesLabels,
): string | null {
  if (!state || state.ok) return null;
  if (state.code === "needs_migration") return labels.notEnabled;
  if (state.code === "invalid") return labels.invalid;
  return labels.error;
}

/** One connected profile row: platform badge, masked host, visibility, disconnect. */
function ProfileRow({
  entry,
  labels,
}: {
  entry: ExternalProfileEntry;
  labels: ExternalProfilesLabels;
}) {
  const [confirming, setConfirming] = useState(false);
  const [visState, visAction, visPending] = useActionState<
    ExternalProfileActionResult | null,
    FormData
  >(setExternalProfileVisibilityAction, null);
  const [discState, discAction, discPending] = useActionState<
    ExternalProfileActionResult | null,
    FormData
  >(disconnectExternalProfileAction, null);

  const nextVisibility = entry.visibility === "private" ? "employers" : "private";
  const rowError = actionErrorText(visState, labels) ?? actionErrorText(discState, labels);

  return (
    <li
      className="flex flex-col gap-2 rounded-md border border-ink-600 px-3 py-2"
      data-testid={`external-profile-${entry.id}`}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="flex min-w-0 items-baseline gap-2 text-sm text-text-primary">
          <span className="shrink-0 rounded-sm border border-ink-600 px-1.5 py-0.5 font-mono text-meta uppercase tracking-label text-text-secondary">
            {labels.platformNames[entry.platform]}
          </span>
          {/* Host only — the full URL is the worker's own data and does not
              need to be printed prominently on a shared screen. */}
          <span className="truncate font-medium">{maskedUrlHost(entry.url)}</span>
        </span>

        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {/* Visibility toggle — writes the SAVED PREFERENCE via the RPC. */}
          <form action={visAction}>
            <input type="hidden" name="id" value={entry.id} />
            <input type="hidden" name="visibility" value={nextVisibility} />
            <button
              type="submit"
              disabled={visPending}
              className="rounded-md border border-ink-600 px-2 py-1 text-xs text-text-secondary transition-colors hover:text-text-primary disabled:opacity-50"
              data-testid={`external-profile-visibility-${entry.id}`}
            >
              {labels.visibility}:{" "}
              {entry.visibility === "private"
                ? labels.visibilityPrivate
                : labels.visibilityEmployers}
            </button>
          </form>

          {/* Soft disconnect behind an inline two-step confirm. */}
          {confirming ? (
            <span className="flex items-center gap-2">
              <form action={discAction}>
                <input type="hidden" name="id" value={entry.id} />
                <button
                  type="submit"
                  disabled={discPending}
                  className="rounded-md border border-state-danger px-2 py-1 text-xs text-state-danger transition-colors hover:bg-state-danger/10 disabled:opacity-50"
                  data-testid={`external-profile-disconnect-confirm-${entry.id}`}
                >
                  {labels.confirmDisconnect}
                </button>
              </form>
              <button
                type="button"
                onClick={() => setConfirming(false)}
                className="rounded-md border border-ink-600 px-2 py-1 text-xs text-text-secondary transition-colors hover:text-text-primary"
              >
                {labels.cancel}
              </button>
            </span>
          ) : (
            <button
              type="button"
              onClick={() => setConfirming(true)}
              className="rounded-md border border-ink-600 px-2 py-1 text-xs text-text-secondary transition-colors hover:border-state-danger hover:text-state-danger"
              data-testid={`external-profile-disconnect-${entry.id}`}
            >
              {labels.disconnect}
            </button>
          )}
        </div>
      </div>

      {rowError && (
        <span className="text-xs text-state-danger" role="alert">
          {rowError}
        </span>
      )}
    </li>
  );
}

export function ExternalProfilesSection({
  initial,
  labels,
  needsMigration = false,
}: {
  initial: ExternalProfileEntry[];
  labels: ExternalProfilesLabels;
  /** True when the read path reported the table is not applied — the card
   *  shows the honest not-enabled notice instead of a form that would fail
   *  on save (and never a fake empty list). */
  needsMigration?: boolean;
}) {
  const [platform, setPlatform] = useState<string>("");
  const [url, setUrl] = useState<string>("");

  const [addState, addAction, addPending] = useActionState<
    ExternalProfileActionResult | null,
    FormData
  >(addExternalProfileAction, null);

  const platformOptions = EXTERNAL_PROFILE_PLATFORMS.map((p) => ({
    value: p,
    label: labels.platformNames[p],
  }));

  const urlLooksValid = url.trim() === "" || validateExternalProfileUrl(url).ok;

  return (
    <section
      className="card-border flex flex-col gap-3 p-5"
      data-testid="external-profiles"
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
          data-testid="external-profiles-needs-migration"
        >
          {labels.notEnabled}
        </p>
      ) : (
        <>
          {initial.length > 0 ? (
            <ul className="flex flex-col gap-2" data-testid="external-profiles-list">
              {initial.map((entry) => (
                <ProfileRow key={entry.id} entry={entry} labels={labels} />
              ))}
            </ul>
          ) : (
            <p
              className="text-sm text-text-secondary"
              data-testid="external-profiles-empty"
            >
              {labels.empty}
            </p>
          )}

          {/* Honest v1 visibility note: the "employers" preference is saved,
              but no employer can see these links yet. Always visible so the
              toggle can never read as a live reach claim. */}
          <p
            className="text-xs leading-relaxed text-text-muted"
            data-testid="external-profiles-visibility-note"
          >
            {labels.visibilityNote}
          </p>

          <form
            action={addAction}
            className="flex flex-col gap-3"
            data-testid="external-profiles-add-form"
          >
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <Label>{labels.platform}</Label>
                <DarkListbox
                  value={platform}
                  onChange={setPlatform}
                  options={platformOptions}
                  name="platform"
                  placeholder="—"
                  ariaLabel={labels.platform}
                  testId="external-profiles-platform"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>{labels.url}</Label>
                <Input
                  id="external-profile-url"
                  name="url"
                  type="url"
                  inputMode="url"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder={labels.urlPlaceholder}
                  maxLength={500}
                  className="px-3 py-2"
                  data-testid="external-profiles-url"
                />
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <Button
                type="submit"
                size="sm"
                loading={addPending}
                disabled={
                  addPending ||
                  platform === "" ||
                  url.trim() === "" ||
                  !urlLooksValid
                }
                data-testid="external-profiles-add"
              >
                {addPending ? labels.adding : labels.add}
              </Button>
              {!urlLooksValid && (
                <span className="text-xs text-state-danger" role="alert">
                  {labels.invalid}
                </span>
              )}
              {addState && !addState.ok && (
                <span
                  className="text-xs text-state-danger"
                  role="alert"
                  data-testid="external-profiles-error"
                >
                  {actionErrorText(addState, labels)}
                </span>
              )}
            </div>
          </form>

          {/* Honest import note: NO official/automatic import exists in v1 —
              the platform never fetches an external site. The worker can
              upload an exported CV file in the existing composer instead. */}
          <p
            className="text-xs leading-relaxed text-text-muted"
            data-testid="external-profiles-import-note"
          >
            {labels.importNote}{" "}
            <a
              href="#profile-edit"
              className="font-mono text-meta uppercase tracking-label text-brand-blue hover:underline"
              data-testid="external-profiles-import-link"
            >
              {labels.importLink} →
            </a>
          </p>
        </>
      )}

      {/* Always visible — including in the not-enabled state — so these links
          are never mistaken for platform-checked or platform-fetched data. */}
      <p
        className="text-xs leading-relaxed text-text-muted"
        data-testid="external-profiles-self-managed"
      >
        {labels.selfManaged}
      </p>
    </section>
  );
}
