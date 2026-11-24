"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { useDialogFocus } from "@/lib/hooks/use-dialog-focus";

export interface JournalPhotoViewerPhoto {
  readonly photoId: string;
  /** Short-lived signed URL from the private bucket, or null when unsigned. */
  readonly signedUrl: string | null;
}

export interface JournalPhotoViewerLabels {
  readonly photoAlt: string;
  readonly previewUnavailable: string;
  /** Accessible name of a thumbnail button. */
  readonly open: string;
  readonly close: string;
  readonly prev: string;
  readonly next: string;
  /** Template with {index} and {total}, e.g. "{index} / {total}" (a string,
   *  not a function: labels cross the server → client boundary). */
  readonly counterTemplate: string;
}

/**
 * The day's photo thumbnails, each opening a larger view.
 *
 * Presentation only. The URLs are the ones `readDayPhotoPreviews` already
 * signed for one hour from the private bucket — nothing is fetched, signed or
 * stored here, so the bucket's access rules are untouched. A photo without a
 * signed URL is shown as the honest "preview unavailable" tile and is not
 * openable. Several photos → previous / next inside the viewer.
 *
 * Modal contract: `useDialogFocus` (focus in, Tab trapped, Escape closes,
 * focus returns to the opener), backdrop click and an explicit ✕ close.
 */
export function JournalPhotoViewer({
  photos,
  labels,
}: {
  photos: readonly JournalPhotoViewerPhoto[];
  labels: JournalPhotoViewerLabels;
}) {
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const [mounted, setMounted] = useState(false);
  const panelRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => setMounted(true), []);

  const openable = photos
    .map((p, i) => ({ p, i }))
    .filter((x) => x.p.signedUrl !== null)
    .map((x) => x.i);
  const open = openIndex !== null;
  const close = useCallback(() => setOpenIndex(null), []);

  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  useDialogFocus(open, close, panelRef);

  const step = useCallback(
    (dir: 1 | -1) => {
      setOpenIndex((cur) => {
        if (cur === null || openable.length === 0) return cur;
        const pos = openable.indexOf(cur);
        const next = (pos + dir + openable.length) % openable.length;
        return openable[next];
      });
    },
    [openable],
  );

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") step(1);
      if (e.key === "ArrowLeft") step(-1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, step]);

  const current = openIndex !== null ? photos[openIndex] : null;
  const position = openIndex !== null ? openable.indexOf(openIndex) + 1 : 0;

  return (
    <>
      <ul
        className="grid list-none grid-cols-3 gap-2 sm:grid-cols-4"
        data-testid="journal-day-object-photos"
      >
        {photos.map((p, i) => (
          <li
            key={p.photoId}
            className="overflow-hidden rounded-lg border border-ink-600 bg-ink-800"
          >
            {p.signedUrl ? (
              <button
                type="button"
                onClick={() => setOpenIndex(i)}
                aria-label={labels.open}
                data-testid="journal-day-object-photo-open"
                className="block w-full cursor-zoom-in focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-cyan"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={p.signedUrl}
                  alt={labels.photoAlt}
                  className="aspect-square w-full object-cover"
                  loading="lazy"
                />
              </button>
            ) : (
              <div className="flex aspect-square w-full items-center justify-center p-2 text-center text-meta text-text-muted">
                {labels.previewUnavailable}
              </div>
            )}
          </li>
        ))}
      </ul>

      {mounted && open && current?.signedUrl
        ? createPortal(
            <div
              role="dialog"
              aria-modal="true"
              aria-label={labels.photoAlt}
              data-testid="journal-photo-viewer"
              className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6"
            >
              <button
                type="button"
                aria-label={labels.close}
                onClick={close}
                tabIndex={-1}
                className="absolute inset-0 bg-ink-900/90 backdrop-blur-sm"
              />
              <div
                ref={panelRef}
                tabIndex={-1}
                className="relative flex max-h-full max-w-full flex-col items-center gap-3 outline-none"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={current.signedUrl}
                  alt={labels.photoAlt}
                  data-testid="journal-photo-viewer-image"
                  className="max-h-[78dvh] max-w-full rounded-lg object-contain"
                />
                <div className="flex items-center gap-2">
                  {openable.length > 1 ? (
                    <button
                      type="button"
                      onClick={() => step(-1)}
                      aria-label={labels.prev}
                      className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-md border border-ink-500 bg-ink-800 text-text-primary"
                    >
                      ←
                    </button>
                  ) : null}
                  {openable.length > 1 ? (
                    <span className="px-2 font-mono text-meta text-text-secondary tabular-nums">
                      {labels.counterTemplate
                        .replace("{index}", String(position))
                        .replace("{total}", String(openable.length))}
                    </span>
                  ) : null}
                  {openable.length > 1 ? (
                    <button
                      type="button"
                      onClick={() => step(1)}
                      aria-label={labels.next}
                      className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-md border border-ink-500 bg-ink-800 text-text-primary"
                    >
                      →
                    </button>
                  ) : null}
                  <button
                    type="button"
                    onClick={close}
                    aria-label={labels.close}
                    data-testid="journal-photo-viewer-close"
                    className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-md border border-ink-500 bg-ink-800 text-text-primary"
                  >
                    ✕
                  </button>
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
