"use client";

import { useTranslations } from "next-intl";

import type { PersonalGalleryPhoto } from "@/lib/journal/personal-gallery";

/**
 * THE PHOTO SHOWN BACK IN THE CHAT (issue #1689, defect G).
 *
 * A small strip of the person's own most recent journal photos — the same
 * `journal_entry_photos` rows and the same short-lived signed URLs the
 * personal gallery renders (`/dashboard/gallery`), embedded in the thread so
 * "parodyk įkeltą nuotrauką, ar tikrai išsisaugojo" is answered by SHOWING
 * the stored photo, not by describing a CV.
 *
 * Honest by construction, like the gallery: an `<img>` renders ONLY from a
 * minted signed URL; when no preview could be minted the tile says so
 * instead of rendering a broken image. The strip never claims verification
 * of anything — a stored photo is a stored photo.
 */
export function ChatPhotoStrip({
  photos,
  locale,
  previewsUnavailable,
}: {
  photos: readonly PersonalGalleryPhoto[];
  locale: string;
  previewsUnavailable: boolean;
}) {
  const t = useTranslations("conversation.chat");
  const fmt = new Intl.DateTimeFormat(locale, { dateStyle: "medium" });
  const dateOf = (iso: string): string => {
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? iso.slice(0, 10) : fmt.format(d);
  };

  return (
    <div className="flex max-w-2xl flex-col gap-2" data-testid="chat-photo-strip">
      {previewsUnavailable ? (
        <p
          className="text-meta leading-relaxed text-text-muted"
          data-testid="chat-photo-strip-previews-unavailable"
        >
          {t("photosPreviewUnavailable")}
        </p>
      ) : null}
      <ul className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {photos.map((p) => (
          <li
            key={p.photoId}
            className="card-border flex flex-col gap-2 overflow-hidden"
            data-testid="chat-photo-strip-photo"
          >
            {p.signedUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={p.signedUrl}
                alt={p.entrySnippet ? `${t("photoAlt")}: ${p.entrySnippet}` : t("photoAlt")}
                className="aspect-[4/3] w-full bg-ink-800 object-cover"
                loading="lazy"
              />
            ) : (
              <div
                className="flex aspect-[4/3] w-full items-center justify-center bg-ink-800 px-3 text-center text-meta leading-relaxed text-text-muted"
                data-testid="chat-photo-strip-no-preview"
              >
                {t("photoNoPreview")}
              </div>
            )}
            <div className="flex flex-col gap-1 p-3 pt-0">
              <span className="font-mono text-meta uppercase tracking-label text-text-muted">
                {dateOf(p.entryCreatedAt)}
              </span>
              {p.entrySnippet ? (
                <p className="text-meta leading-relaxed text-text-secondary">{p.entrySnippet}</p>
              ) : null}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
