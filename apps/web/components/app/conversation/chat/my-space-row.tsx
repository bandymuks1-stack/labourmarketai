"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Plus, X } from "lucide-react";

import { Link } from "@/lib/i18n/navigation";
import { pinAction, reorderPinsAction, unpinAction } from "@/lib/workspace/pins-actions";
import { PIN_CAP } from "@/lib/workspace/pins-model";
import {
  parseRecentPlaces,
  recentPlacesKey,
  resolveRecentPlaces,
} from "@/lib/workspace/recent-places";
import { iconControl } from "./icon-scale";

/**
 * MY SPACE — the pinned row (owner contract 2026-09-04 §4C; pin to home, owner
 * P0 No. 1, 2026-11-12).
 *
 * "A simple personal workspace analogous to a computer desktop": the
 * person's OWN shortcuts, always visible above the conversation, each one a
 * reference the chat already understands (`handleChip` vocabulary). The
 * desktop is never pre-filled: with nothing pinned the row holds only the way
 * to add a shortcut. Tapping a pin runs the same handler its chip runs — no
 * second action system.
 *
 * EDITING IS DIRECT (2026-11-12): add, remove and move earlier / later happen
 * in the row itself, through the same three server actions the chat's pin
 * chips call (`pinAction` · `unpinAction` · `reorderPinsAction`, rows in
 * `workspace_pins`, so the result follows the person to every device).
 * Editing never writes into the conversation, so it never replaces the home
 * the person is looking at. Every control is a real button with a name, at
 * least 44px, reachable by keyboard; the outcome is announced politely.
 *
 * WHAT CAN BE ADDED is handed in by the server (`places`): destinations the
 * person is already admitted to. A pin never grants access — the server also
 * drops any stored pin the person is not admitted to before this row sees it.
 *
 * RECENT is a convenience of this browser (`lib/workspace/recent-places.ts`):
 * the last areas opened, minus what is pinned or already on the home.
 */
export interface MySpacePinView {
  readonly ref: string;
  readonly label: string;
}

export interface MySpacePlace {
  readonly ref: string;
  readonly href: string;
  readonly label: string;
  /** Already offered by the home's goal cards. */
  readonly onHome: boolean;
}

export interface MySpaceEditLabels {
  readonly add: string;
  readonly done: string;
  readonly yours: string;
  readonly addHeading: string;
  readonly addNone: string;
  readonly recent: string;
  /** Carry `{label}`. */
  readonly moveEarlier: string;
  readonly moveLater: string;
  readonly remove: string;
  readonly added: string;
  readonly removed: string;
  readonly moved: string;
  /** Carries `{max}`. */
  readonly cap: string;
  readonly unavailable: string;
}

export interface MySpaceEditor {
  readonly places: readonly MySpacePlace[];
  readonly labels: MySpaceEditLabels;
  /** The workspace the screen was rendered for (stale-screen refusal). */
  readonly expectedWorkspaceId?: string;
  /** The signed-in user, for the per-user recents of this browser. */
  readonly userId: string | null;
  /** The row's pins after a successful change, in order. */
  readonly onChange: (pins: readonly MySpacePinView[]) => void;
}

const CHIP =
  "ua-press min-h-11 shrink-0 rounded-full border border-ink-500 bg-ink-800 px-4 text-support font-medium text-text-primary outline-none hover:border-brand-blue hover:text-brand-blue focus-visible:ring-2 focus-visible:ring-brand-blue";
const QUIET =
  "ua-press min-h-11 shrink-0 rounded-full px-3 text-support text-text-muted outline-none hover:text-text-primary focus-visible:ring-2 focus-visible:ring-brand-blue";
const ICON_BUTTON =
  "ua-press flex size-11 flex-none items-center justify-center rounded-full border border-ink-500 text-text-secondary outline-none hover:border-brand-blue hover:text-text-primary focus-visible:ring-2 focus-visible:ring-brand-blue disabled:cursor-default disabled:opacity-40";

export function MySpaceRow({
  pins,
  title,
  manageLabel,
  onPin,
  editor,
}: {
  pins: readonly MySpacePinView[];
  title: string;
  manageLabel: string;
  onPin: (ref: string) => void;
  /** `null` when the pin store cannot be read: no row to edit, no ask. */
  editor: MySpaceEditor | null;
}) {
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [recent, setRecent] = useState<readonly MySpacePlace[]>([]);
  const toggleRef = useRef<HTMLButtonElement>(null);

  const pinnedRefs = useMemo(() => new Set(pins.map((p) => p.ref)), [pins]);
  const places = editor?.places;
  const userId = editor?.userId ?? null;

  // Recents are read after mount (they live in this browser only), so the
  // server and the first client render agree.
  useEffect(() => {
    if (!places || !userId) return;
    try {
      const stored = parseRecentPlaces(localStorage.getItem(recentPlacesKey(userId)));
      const skip = new Set(places.filter((p) => p.onHome || pinnedRefs.has(p.ref)).map((p) => p.href));
      setRecent(resolveRecentPlaces(stored, places, skip));
    } catch {
      setRecent([]);
    }
  }, [places, userId, pinnedRefs]);

  // Nothing pinned, nothing recent and no way to add: the row is absent.
  if (pins.length === 0 && recent.length === 0 && !editor) return null;

  const labels = editor?.labels;
  const addable = (places ?? []).filter((p) => !pinnedRefs.has(p.ref));

  const run = async (
    work: () => Promise<{ ok: boolean; code?: string }>,
    next: readonly MySpacePinView[],
    done: string,
  ) => {
    if (!editor || !labels || busy) return;
    setBusy(true);
    setStatus("");
    try {
      const result = await work();
      if (result.ok) {
        editor.onChange(next);
        setStatus(done);
      } else {
        setStatus(result.code === "cap" ? labels.cap.replace("{max}", String(PIN_CAP)) : labels.unavailable);
      }
    } catch {
      setStatus(labels.unavailable);
    } finally {
      setBusy(false);
    }
  };

  const add = (place: MySpacePlace) =>
    run(
      () => pinAction({ ref: place.ref, label: place.label, expectedWorkspaceId: editor?.expectedWorkspaceId }),
      [...pins, { ref: place.ref, label: place.label }],
      labels?.added ?? "",
    );
  const remove = (ref: string) =>
    run(
      () => unpinAction({ ref, expectedWorkspaceId: editor?.expectedWorkspaceId }),
      pins.filter((p) => p.ref !== ref),
      labels?.removed ?? "",
    );
  const move = (index: number, delta: -1 | 1) => {
    const to = index + delta;
    if (to < 0 || to >= pins.length) return;
    const next = [...pins];
    [next[index], next[to]] = [next[to], next[index]];
    void run(
      () => reorderPinsAction({ refs: next.map((p) => p.ref), expectedWorkspaceId: editor?.expectedWorkspaceId }),
      next,
      labels?.moved ?? "",
    );
  };

  return (
    <div className="border-b border-border-subtle" data-testid="my-space">
      <div
        className="flex flex-wrap items-center gap-2 px-3 py-2"
        data-testid="my-space-row"
        role="toolbar"
        aria-label={title}
      >
        {(pins.length > 0 || recent.length > 0) && (
          <span className="shrink-0 font-mono text-meta uppercase tracking-label text-text-muted">{title}</span>
        )}
        {pins.map((p) => (
          <button
            key={p.ref}
            type="button"
            onClick={() => onPin(p.ref)}
            className={CHIP}
            data-testid="my-space-pin"
            data-ref={p.ref}
          >
            {p.label}
          </button>
        ))}
        {recent.length > 0 && labels && (
          <>
            <span className="shrink-0 pl-1 text-meta text-text-muted">{labels.recent}</span>
            {recent.map((place) => (
              <Link
                key={place.ref}
                href={place.href as "/dashboard"}
                className={`${CHIP} inline-flex items-center border-dashed`}
                data-testid="my-space-recent"
                data-ref={place.ref}
              >
                {place.label}
              </Link>
            ))}
          </>
        )}
        {editor && labels && (
          <button
            ref={toggleRef}
            type="button"
            aria-expanded={editing}
            aria-controls="my-space-editor"
            onClick={() => {
              setEditing((v) => !v);
              setStatus("");
            }}
            className={`${QUIET} inline-flex items-center gap-1.5`}
            data-testid="my-space-manage"
          >
            {pins.length === 0 && !editing ? <Plus {...iconControl()} aria-hidden /> : null}
            {editing ? labels.done : pins.length === 0 ? labels.add : manageLabel}
          </button>
        )}
      </div>

      {editor && labels && editing && (
        <div
          id="my-space-editor"
          data-testid="my-space-editor"
          aria-busy={busy}
          className="flex flex-col gap-3 border-t border-border-subtle px-3 py-3"
          onKeyDown={(e) => {
            if (e.key !== "Escape") return;
            setEditing(false);
            toggleRef.current?.focus();
          }}
        >
          {pins.length > 0 && (
            <section aria-label={labels.yours} className="flex flex-col gap-1.5">
              <h3 className="text-meta font-medium text-text-muted">{labels.yours}</h3>
              <ul className="flex flex-col gap-1.5">
                {pins.map((p, i) => (
                  <li
                    key={p.ref}
                    data-testid="my-space-edit-item"
                    data-ref={p.ref}
                    className="flex items-center gap-1.5"
                  >
                    <span className="min-w-0 flex-1 truncate text-support text-text-primary">{p.label}</span>
                    <button
                      type="button"
                      disabled={busy || i === 0}
                      onClick={() => move(i, -1)}
                      aria-label={labels.moveEarlier.replace("{label}", p.label)}
                      title={labels.moveEarlier.replace("{label}", p.label)}
                      className={ICON_BUTTON}
                      data-testid="my-space-move-earlier"
                    >
                      <ArrowLeft {...iconControl()} aria-hidden />
                    </button>
                    <button
                      type="button"
                      disabled={busy || i === pins.length - 1}
                      onClick={() => move(i, 1)}
                      aria-label={labels.moveLater.replace("{label}", p.label)}
                      title={labels.moveLater.replace("{label}", p.label)}
                      className={ICON_BUTTON}
                      data-testid="my-space-move-later"
                    >
                      <ArrowRight {...iconControl()} aria-hidden />
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void remove(p.ref)}
                      aria-label={labels.remove.replace("{label}", p.label)}
                      title={labels.remove.replace("{label}", p.label)}
                      className={ICON_BUTTON}
                      data-testid="my-space-remove"
                    >
                      <X {...iconControl()} aria-hidden />
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {(places?.length ?? 0) > 0 && (
            <section aria-label={labels.addHeading} className="flex flex-col gap-1.5">
              <h3 className="text-meta font-medium text-text-muted">{labels.addHeading}</h3>
              {addable.length === 0 ? (
                <p className="text-support text-text-secondary">{labels.addNone}</p>
              ) : (
                <ul className="flex flex-wrap gap-2">
                  {addable.map((place) => (
                    <li key={place.ref}>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void add(place)}
                        className={`${CHIP} inline-flex items-center gap-1.5 disabled:opacity-60`}
                        data-testid="my-space-add"
                        data-ref={place.ref}
                      >
                        <Plus {...iconControl()} aria-hidden />
                        {place.label}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}

          {/* Always one line tall (a non-breaking space when silent), so an
              outcome arriving never moves the buttons under the finger. */}
          <p role="status" aria-live="polite" data-testid="my-space-status" className="text-support text-text-secondary">
            {status || "\u00a0"}
          </p>
        </div>
      )}
    </div>
  );
}
