import { redirect } from "next/navigation";
import Link from "next/link";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Images, NotebookPen } from "lucide-react";

import { createClient } from "@/lib/supabase/server";
import { getPersonalGallery } from "@/lib/journal/personal-gallery";

export const dynamic = "force-dynamic";

/**
 * Personal gallery (F13). The user's OWN photo evidence across all their
 * journal entries — the same rows the journal already owns (owner-scoped
 * RLS), presented as one findable place. Photos are added through journal
 * entries (the honest, evidence-anchored path), so the empty state points
 * there instead of offering a second upload system.
 */
export default async function PersonalGalleryPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("personalGallery");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/${locale}/auth/login`);

  const { photos, previewsUnavailable } = await getPersonalGallery();

  return (
    <div
      className="mx-auto flex w-full max-w-content flex-col gap-5"
      data-testid="personal-gallery"
    >
      <header className="flex flex-col gap-1">
        <span className="inline-flex items-center gap-2 font-mono text-[10px] uppercase tracking-label text-brand-cyan">
          <Images className="h-3.5 w-3.5" aria-hidden />
          {t("eyebrow")}
        </span>
        <h1 className="font-display text-3xl font-bold tracking-tightest text-text-primary">
          {t("title")}
          {photos.length > 0 ? (
            <span className="ml-2 align-middle font-mono text-sm font-normal text-text-secondary">
              · {photos.length}
            </span>
          ) : null}
        </h1>
      </header>

      {photos.length === 0 ? (
        <div
          className="card-border flex flex-col items-start gap-3 p-6"
          data-testid="personal-gallery-empty"
        >
          <p className="text-sm leading-relaxed text-text-secondary">
            {t("empty")}
          </p>
          <Link
            href={`/${locale}/dashboard/journal`}
            data-testid="personal-gallery-journal-cta"
            className="inline-flex min-h-11 items-center gap-2 rounded-md bg-gradient-to-r from-brand-blue to-brand-cyan px-5 py-3 text-sm font-semibold text-ink-900 transition-transform duration-fast ease-out hover:-translate-y-0.5"
          >
            <NotebookPen className="h-4 w-4" aria-hidden />
            {t("emptyCta")}
          </Link>
        </div>
      ) : (
        <>
          {previewsUnavailable ? (
            <p className="rounded-md border border-state-warning/30 bg-state-warning/5 px-3 py-2 text-[11px] leading-relaxed text-text-secondary">
              {t("previewsUnavailable")}
            </p>
          ) : null}
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {photos.map((p) => (
              <li
                key={p.photoId}
                className="card-border flex flex-col gap-2 overflow-hidden"
                data-testid="personal-gallery-photo"
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
                  <div className="flex aspect-[4/3] w-full items-center justify-center bg-ink-800 px-3 text-center text-[11px] leading-relaxed text-text-muted">
                    {t("previewUnavailable")}
                  </div>
                )}
                <div className="flex flex-col gap-1 p-3 pt-0">
                  {p.entrySnippet ? (
                    <p className="text-xs leading-relaxed text-text-secondary">
                      {p.entrySnippet}
                    </p>
                  ) : null}
                  <span className="font-mono text-[10px] uppercase tracking-label text-text-muted">
                    {p.entryCreatedAt.slice(0, 10)}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
