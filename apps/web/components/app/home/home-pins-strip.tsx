"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { ChevronLeft, ChevronRight, Pin, PinOff, Plus } from "lucide-react";

import { Link } from "@/lib/i18n/navigation";
import { WORK_AREA_ICONS } from "@/components/app/work-area-icons";
import type { WorkAreaIconKey } from "@/lib/navigation/work-areas";
import {
  MAX_HOME_PINS,
  movePin,
  pinArea,
  touchRecent,
  unpinArea,
  validateHomePins,
  type HomePinContext,
  type HomePins,
} from "@/lib/home/home-pins";
import { saveHomePinsAction } from "@/lib/home/home-pins-actions";
import { cn } from "@/lib/utils";

export type HomePinArea = {
  readonly id: string;
  readonly href: string;
  readonly label: string;
  readonly iconKey: WorkAreaIconKey;
};

export type HomePinQuickLink = {
  readonly id: string;
  readonly href: string;
  readonly label: string;
  /** e.g. "3 unread" — only when a real count was read and is above zero. */
  readonly note?: string;
};

export type HomePinLabels = {
  readonly title: string;
  readonly edit: string;
  readonly done: string;
  readonly empty: string;
  readonly more: string;
  readonly recent: string;
  readonly quick: string;
  /** Each carries a `{name}` placeholder. */
  readonly pin: string;
  readonly unpin: string;
  readonly moveEarlier: string;
  readonly moveLater: string;
  readonly limit: string;
  readonly deviceOnly: string;
  readonly saveFailed: string;
};

const named = (template: string, name: string) => template.replace("{name}", name);

/** Device fallback key — used ONLY while the profile store is not applied. */
const deviceKey = (context: HomePinContext) => `lm.homePins.v1.${context}`;

/**
 * THE PINNED STRIP on the signed-in home (owner P0 2026-11-12).
 *
 * Pin, unpin and reorder the areas this home already offers; the areas opened
 * most recently; and quick links to what is active. Every control is a real
 * button with a name that includes the area ("Unpin Journal"), 44px, reachable
 * by Tab; reordering is two buttons (earlier / later), so it needs no drag and
 * works with a keyboard and a screen reader. Changes are announced politely.
 *
 * `storage="profile"`: saved to the person's profile and the same on every
 * device. `storage="device"`: the profile store is not switched on yet, so the
 * choice stays in this browser — and the strip says so in plain words.
 *
 * Nothing here can pin an area the home does not already offer: the server
 * hands in only reachable areas, and the save action refuses any other id.
 */
export function HomePinsStrip({
  context,
  areas,
  initial,
  storage,
  quickLinks,
  labels,
}: {
  context: HomePinContext;
  areas: readonly HomePinArea[];
  initial: HomePins;
  storage: "profile" | "device";
  quickLinks: readonly HomePinQuickLink[];
  labels: HomePinLabels;
}) {
  const [state, setState] = useState<HomePins>(initial);
  const [editing, setEditing] = useState(false);
  const [mode, setMode] = useState<"profile" | "device">(storage);
  const [failed, setFailed] = useState(false);
  const [, startTransition] = useTransition();
  const liveRef = useRef<HTMLParagraphElement>(null);
  const byId = new Map(areas.map((a) => [a.id, a]));

  // Device fallback: read the browser's copy after hydration (first paint is
  // the server's, so markup always agrees).
  useEffect(() => {
    if (storage !== "device") return;
    try {
      const raw = window.localStorage.getItem(deviceKey(context));
      const stored = raw ? validateHomePins(JSON.parse(raw), context) : null;
      if (stored) setState(stored);
    } catch {
      /* unreadable storage: keep the defaults */
    }
  }, [context, storage]);

  const persist = (next: HomePins, announce?: string) => {
    setState(next);
    setFailed(false);
    if (announce && liveRef.current) liveRef.current.textContent = announce;
    const keepOnDevice = () => {
      try {
        window.localStorage.setItem(deviceKey(context), JSON.stringify(next));
      } catch {
        /* storage blocked: the change holds for this screen only */
      }
    };
    if (mode === "device") {
      keepOnDevice();
      return;
    }
    startTransition(async () => {
      const result = await saveHomePinsAction(context, next);
      if (result === "device") {
        setMode("device");
        keepOnDevice();
      } else if (result === "failed") {
        setFailed(true);
      }
    });
  };

  const pinned = state.pins.map((id) => byId.get(id)).filter((a): a is HomePinArea => !!a);
  const unpinned = areas.filter((a) => !state.pins.includes(a.id));
  const recent = state.recent
    .map((id) => byId.get(id))
    .filter((a): a is HomePinArea => !!a && !state.pins.includes(a.id));
  const full = state.pins.length >= MAX_HOME_PINS;

  const iconButton =
    "inline-flex size-11 shrink-0 items-center justify-center rounded-full border border-ink-500 text-text-secondary transition-colors hover:border-brand-blue hover:text-text-primary disabled:cursor-default disabled:opacity-40 motion-reduce:transition-none";
  const chip =
    "inline-flex min-h-11 items-center gap-2 rounded-full border border-ink-600 bg-ink-800/70 px-4 text-sm font-medium text-text-primary transition-colors hover:border-brand-blue motion-reduce:transition-none";

  return (
    <section
      aria-label={labels.title}
      data-testid="home-pins"
      data-storage={mode}
      className="flex min-w-0 flex-col gap-3"
    >
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-support font-medium text-text-muted">{labels.title}</h2>
        <button
          type="button"
          aria-pressed={editing}
          onClick={() => setEditing((v) => !v)}
          data-testid="home-pins-edit"
          className="inline-flex min-h-11 items-center rounded-full px-3 text-sm font-medium text-text-secondary transition-colors hover:text-text-primary"
        >
          {editing ? labels.done : labels.edit}
        </button>
      </div>

      {pinned.length === 0 ? (
        <p className="text-sm text-text-muted">{labels.empty}</p>
      ) : (
        <ul data-testid="home-pins-list" className="flex flex-wrap gap-2">
          {pinned.map((area, index) => {
            const Icon = WORK_AREA_ICONS[area.iconKey];
            return (
              <li key={area.id} className="flex items-center gap-1">
                <Link
                  href={area.href as "/dashboard"}
                  data-testid={`home-pin-${area.id}`}
                  onClick={() => persist(touchRecent(state, area.id))}
                  className={chip}
                >
                  <Icon aria-hidden className="size-4 text-brand-blue" />
                  {area.label}
                </Link>
                {editing && (
                  <>
                    <button
                      type="button"
                      disabled={index === 0}
                      aria-label={named(labels.moveEarlier, area.label)}
                      data-testid={`home-pin-earlier-${area.id}`}
                      onClick={() =>
                        persist(movePin(state, area.id, -1), named(labels.moveEarlier, area.label))
                      }
                      className={iconButton}
                    >
                      <ChevronLeft aria-hidden className="size-4" />
                    </button>
                    <button
                      type="button"
                      disabled={index === pinned.length - 1}
                      aria-label={named(labels.moveLater, area.label)}
                      data-testid={`home-pin-later-${area.id}`}
                      onClick={() =>
                        persist(movePin(state, area.id, 1), named(labels.moveLater, area.label))
                      }
                      className={iconButton}
                    >
                      <ChevronRight aria-hidden className="size-4" />
                    </button>
                    <button
                      type="button"
                      aria-label={named(labels.unpin, area.label)}
                      data-testid={`home-unpin-${area.id}`}
                      onClick={() =>
                        persist(unpinArea(state, area.id), named(labels.unpin, area.label))
                      }
                      className={iconButton}
                    >
                      <PinOff aria-hidden className="size-4" />
                    </button>
                  </>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {editing && unpinned.length > 0 && (
        <div className="flex flex-col gap-2">
          <h3 className="text-meta font-medium uppercase tracking-wide text-text-muted">
            {labels.more}
          </h3>
          <ul data-testid="home-pins-more" className="flex flex-wrap gap-2">
            {unpinned.map((area) => (
              <li key={area.id}>
                <button
                  type="button"
                  disabled={full}
                  aria-label={named(labels.pin, area.label)}
                  data-testid={`home-pin-add-${area.id}`}
                  onClick={() => persist(pinArea(state, area.id), named(labels.pin, area.label))}
                  className={cn(chip, "border-dashed text-text-secondary disabled:cursor-default disabled:opacity-40")}
                >
                  <Plus aria-hidden className="size-4" />
                  {area.label}
                </button>
              </li>
            ))}
          </ul>
          {full && <p className="text-xs text-text-muted">{labels.limit}</p>}
        </div>
      )}

      {!editing && recent.length > 0 && (
        <div className="flex flex-wrap items-center gap-2" data-testid="home-pins-recent">
          <span className="text-meta font-medium uppercase tracking-wide text-text-muted">
            {labels.recent}
          </span>
          {recent.map((area) => (
            <Link
              key={area.id}
              href={area.href as "/dashboard"}
              onClick={() => persist(touchRecent(state, area.id))}
              className="inline-flex min-h-11 items-center rounded-full px-3 text-sm text-text-secondary underline-offset-4 hover:text-text-primary hover:underline"
            >
              {area.label}
            </Link>
          ))}
        </div>
      )}

      {!editing && quickLinks.length > 0 && (
        <div className="flex flex-wrap items-center gap-2" data-testid="home-pins-quick">
          <span className="text-meta font-medium uppercase tracking-wide text-text-muted">
            {labels.quick}
          </span>
          {quickLinks.map((q) => (
            <Link
              key={q.id}
              href={q.href as "/dashboard"}
              data-testid={`home-quick-${q.id}`}
              className="inline-flex min-h-11 items-center gap-1.5 rounded-full px-3 text-sm text-text-secondary underline-offset-4 hover:text-text-primary hover:underline"
            >
              {q.label}
              {q.note && <span className="text-xs font-semibold text-brand-blue">{q.note}</span>}
            </Link>
          ))}
        </div>
      )}

      {mode === "device" && (
        <p data-testid="home-pins-device-note" className="flex items-center gap-1.5 text-xs text-text-muted">
          <Pin aria-hidden className="size-3.5" />
          {labels.deviceOnly}
        </p>
      )}
      {failed && (
        <p role="alert" className="text-xs text-text-secondary">
          {labels.saveFailed}
        </p>
      )}
      <p ref={liveRef} aria-live="polite" className="sr-only" />
    </section>
  );
}
