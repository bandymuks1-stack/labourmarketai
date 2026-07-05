import { getTranslations } from "next-intl/server";
import { Images } from "lucide-react";

import { getProjectGallery } from "@/lib/journal/project-gallery";

/**
 * Project work gallery (CR train WAGON 8, areas 15/16) — a read-only view of
 * the photo evidence workers attached to their journal entries on this
 * project. Renders on the manager-only project stadium page; the rows shown
 * are exactly what the session's RLS lets it read (see
 * lib/journal/project-gallery.ts). Honest states only: an empty gallery says
 * photos appear when workers add them; a photo without a mintable preview
 * URL says the preview is unavailable — never a broken image, never a stock
 * placeholder photo.
 */
export async function ProjectWorkGallery({
  projectId,
  workerNames,
}: {
  projectId: string;
  /** workerId → display name, from the already-authorized operations view. */
  workerNames: ReadonlyMap<string, string>;
}) {
  const t = await getTranslations("projectOps.stadium.gallery");
  const { photos, previewsUnavailable } = await getProjectGallery(projectId);

  return (
    <section
      className="flex flex-col gap-3"
      data-testid="project-work-gallery"
    >
      <h2 className="inline-flex items-center gap-2 font-mono text-[10px] uppercase tracking-label text-text-muted">
        <Images className="h-3.5 w-3.5" aria-hidden />
        {t("title")}
        {photos.length > 0 ? (
          <span className="text-text-secondary">
            · {t("countLabel", { n: photos.length })}
          </span>
        ) : null}
      </h2>
      <p className="text-xs leading-relaxed text-text-secondary">
        {t("context")}
      </p>
      {photos.length === 0 ? (
        <p
          className="rounded-md border border-dashed border-ink-500 px-3 py-3 text-xs leading-relaxed text-text-muted"
          data-testid="project-gallery-empty"
        >
          {t("empty")}
        </p>
      ) : (
        <>
          {previewsUnavailable ? (
            <p
              className="rounded-md border border-state-warning/30 bg-state-warning/5 px-3 py-2 text-[11px] leading-relaxed text-text-secondary"
              data-testid="project-gallery-previews-unavailable"
            >
              {t("previewsUnavailable")}
            </p>
          ) : null}
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {photos.map((p) => (
              <li
                key={p.photoId}
                className="card-border flex flex-col gap-2 overflow-hidden"
                data-testid="project-gallery-photo"
              >
                {p.signedUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={p.signedUrl}
                    alt={t("photoAlt")}
                    className="aspect-[4/3] w-full bg-ink-800 object-cover"
                    loading="lazy"
                  />
                ) : (
                  <div
                    className="flex aspect-[4/3] w-full items-center justify-center bg-ink-800 px-3 text-center text-[11px] leading-relaxed text-text-muted"
                    data-testid="project-gallery-photo-no-preview"
                  >
                    {t("previewUnavailableOne")}
                  </div>
                )}
                <div className="flex flex-col gap-1 p-3 pt-1">
                  <p className="font-mono text-[10px] uppercase tracking-label text-text-muted">
                    {(workerNames.get(p.workerId) ?? t("unknownWorker")) +
                      " · " +
                      p.entryCreatedAt.slice(0, 10)}
                  </p>
                  {p.entrySnippet ? (
                    <p className="text-xs leading-relaxed text-text-secondary">
                      {p.entrySnippet}
                    </p>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
      <p className="text-[11px] leading-relaxed text-text-muted">
        {t("sourceNote")}
      </p>
    </section>
  );
}
