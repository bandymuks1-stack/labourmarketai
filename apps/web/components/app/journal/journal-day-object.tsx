import { getTranslations } from "next-intl/server";

import { JournalPhotoViewer } from "@/components/app/journal/journal-photo-viewer";
import { EvidenceState } from "@/components/app/work-world/primitives";
import { Link } from "@/lib/i18n/navigation";
import { formatDuration } from "@/lib/journal/format-duration";
import type { DayObject } from "@/lib/journal/day-object";
import type { DayPhotoPreviews } from "@/lib/journal/day-photo-previews";
import { formatUtcDate } from "@/lib/time/display";

const ROLES = ["manager", "owner", "external_manager"] as const;

/**
 * THE DAY AS ONE OBJECT — the selected day of the Work Journal, opened.
 *
 * where I worked → what I did → how long → what proves it → who confirmed it
 * → what it added to my professional history. The words and the figures are
 * the entries' own (through `buildDayObject`); the photos are the person's
 * own uploads. Nothing on this surface is generated, and an absent fact is
 * said as absent, never filled in.
 *
 * Colour rule (work-world): cyan = the person's own evidence, trust green =
 * someone else's confirmation only, amber = contested. A self-confirmation is
 * never green.
 */
export async function JournalDayObject({
  day,
  iso,
  locale,
  photos,
}: {
  day: DayObject;
  iso: string;
  locale: string;
  photos: DayPhotoPreviews;
}) {
  const t = await getTranslations("journal.dayObject");
  const tEntry = await getTranslations("journal");
  const lang = locale === "en" ? "en" : "lt";
  const dur = (m: number) => formatDuration(m, "minutes", lang);

  const photoTotal = photos.status === "ok" ? photos.total : day.photoCount;
  const shownPhotos = photos.status === "ok" ? photos.photos : [];
  const hiddenPhotos = Math.max(0, photoTotal - shownPhotos.length);

  const stepLabel =
    "flex items-center gap-2 font-mono text-meta font-semibold uppercase tracking-label text-text-muted before:inline-block before:h-[7px] before:w-[7px] before:shrink-0 before:rotate-45 before:rounded-[2px] before:bg-brand-cyan/70";

  return (
    <section
      className="relative isolate overflow-hidden rounded-2xl border border-ink-600 bg-surface-1/60 p-4 sm:p-6"
      data-testid="journal-day-object"
      data-day={iso}
      aria-label={t("title")}
    >
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(80%_60%_at_8%_0%,rgb(var(--c-brand-cyan)/0.10),transparent_62%)]"
      />

      <header className="flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
        <div className="flex min-w-0 flex-col gap-1">
          <p className="font-mono text-meta font-semibold uppercase tracking-label text-text-muted">{t("title")}</p>
          <h2 className="font-display text-2xl font-bold leading-tight tracking-tightest text-text-primary sm:text-3xl">
            {formatUtcDate(iso, locale)}
          </h2>
          <p className="text-sm text-text-secondary">
            {t("records", { count: day.entryCount })}
          </p>
        </div>
        <p
          className="font-display text-4xl font-bold leading-none tracking-tightest text-brand-cyan tabular-nums sm:text-5xl"
          data-testid="journal-day-object-time"
        >
          {day.totalMinutes > 0 ? dur(day.totalMinutes) : "—"}
        </p>
      </header>

      <ol className="mt-5 grid list-none gap-3 border-t border-ink-600/70 pt-5 sm:grid-cols-2 lg:grid-cols-3">
        {/* 1 · WHERE */}
        <li className="flex flex-col gap-2 rounded-xl border border-ink-600/70 bg-ink-900/40 p-3.5" data-testid="journal-day-object-where">
          <p className={stepLabel}>{t("where")}</p>
          {day.places.length > 0 ? (
            <p className="break-words text-base font-medium text-text-primary">
              {day.places.join(" · ")}
            </p>
          ) : (
            <p className="text-sm text-text-muted">{t("whereNone")}</p>
          )}
        </li>

        {/* 2 · WHAT */}
        <li className="flex flex-col gap-2 rounded-xl border border-ink-600/70 bg-ink-900/40 p-3.5" data-testid="journal-day-object-what">
          <p className={stepLabel}>{t("what")}</p>
          {day.activities.length > 0 ? (
            <p className="break-words text-base text-text-primary">
              {day.activities.join(" · ")}
            </p>
          ) : (
            <p className="text-sm text-text-muted">{t("whatNone")}</p>
          )}
        </li>

        {/* 3 · HOW LONG */}
        <li className="flex flex-col gap-2 rounded-xl border border-ink-600/70 bg-ink-900/40 p-3.5" data-testid="journal-day-object-time-step">
          <p className={stepLabel}>{t("howLong")}</p>
          <p className="text-base text-text-primary">
            {day.totalMinutes > 0 ? dur(day.totalMinutes) : t("timeNone")}
          </p>
          {day.untimedCount > 0 && day.totalMinutes > 0 ? (
            <p className="text-meta text-text-muted">
              {t("untimed", { count: day.untimedCount })}
            </p>
          ) : null}
        </li>

        {/* 4 · WHAT PROVES IT — the person's own photos, nothing generated */}
        <li className="flex flex-col gap-2 rounded-xl border border-ink-600/70 bg-ink-900/40 p-3.5" data-testid="journal-day-object-evidence">
          <p className={stepLabel}>{t("evidence")}</p>
          {photos.status === "unavailable" && day.photoCount === 0 ? (
            <p className="text-sm text-text-muted">{t("photosUnavailable")}</p>
          ) : photoTotal === 0 ? (
            <p className="text-sm text-text-muted">{t("photosNone")}</p>
          ) : (
            <>
              <p className="text-sm text-text-secondary">
                {t("photoCount", { count: photoTotal })}
              </p>
              {shownPhotos.length > 0 ? (
                <JournalPhotoViewer
                  photos={shownPhotos.map((p) => ({ photoId: p.photoId, signedUrl: p.signedUrl }))}
                  labels={{
                    photoAlt: t("photoAlt"),
                    previewUnavailable: t("previewUnavailable"),
                    open: t("photoOpen"),
                    close: t("photoClose"),
                    prev: t("photoPrev"),
                    next: t("photoNext"),
                    counterTemplate: t.raw("photoCounter") as string,
                  }}
                />
              ) : (
                <p className="text-meta text-text-muted">{t("previewUnavailable")}</p>
              )}
              {hiddenPhotos > 0 ? (
                <Link
                  href="/dashboard/gallery"
                  className="text-meta text-text-secondary underline underline-offset-2 hover:text-text-primary"
                >
                  {t("photosMore", { count: hiddenPhotos })}
                </Link>
              ) : null}
            </>
          )}
        </li>

        {/* 5 · WHO CONFIRMED IT */}
        <li className="flex flex-col gap-2 rounded-xl border border-ink-600/70 bg-ink-900/40 p-3.5" data-testid="journal-day-object-confirmation">
          <p className={stepLabel}>{t("confirmed")}</p>
          <div className="flex flex-wrap gap-2">
            {day.confirmedCount > 0 ? (
              <EvidenceState
                state="ORGANIZATION_ATTESTED"
                label={t("confirmedByOther", { count: day.confirmedCount })}
              />
            ) : null}
            {day.selfConfirmedCount > 0 ? (
              <EvidenceState
                state="SELF_ATTESTED"
                label={t("selfConfirmed", { count: day.selfConfirmedCount })}
              />
            ) : null}
            {day.waitingCount > 0 ? (
              <EvidenceState
                state="SELF_REPORTED"
                label={t("waiting", { count: day.waitingCount })}
              />
            ) : null}
            {day.recordedOnlyCount > 0 ? (
              <EvidenceState
                state="SELF_REPORTED"
                label={t("recordedOnly", { count: day.recordedOnlyCount })}
              />
            ) : null}
            {day.contestedCount > 0 ? (
              <EvidenceState
                state="DISPUTED"
                label={t("contested", { count: day.contestedCount })}
              />
            ) : null}
          </div>
          {day.confirmations.length > 0 ? (
            <ul className="flex list-none flex-col gap-0.5 text-meta text-text-secondary">
              {day.confirmations.map((c, i) => {
                const role =
                  c.role && (ROLES as readonly string[]).includes(c.role)
                    ? tEntry(`entry.confirmerRole.${c.role}`)
                    : null;
                const when = c.at ? formatUtcDate(c.at.slice(0, 10), locale) : null;
                return (
                  <li key={`${c.at ?? "na"}-${i}`}>
                    {[role, when, c.automatic ? t("automatic") : null]
                      .filter(Boolean)
                      .join(" · ")}
                  </li>
                );
              })}
            </ul>
          ) : day.confirmedCount === 0 && day.selfConfirmedCount === 0 ? (
            day.waitingCount > 0 ? (
              <p className="text-sm text-text-muted">{t("confirmedNone")}</p>
            ) : day.recordedOnlyCount > 0 ? (
              <p className="text-sm text-text-muted" data-testid="journal-day-confirmation-not-enabled">
                {t("confirmationNotEnabled")}
              </p>
            ) : null
          ) : null}
        </li>

        {/* 6 · WHAT IT ADDED TO MY PROFESSIONAL HISTORY */}
        <li className="flex flex-col gap-2 rounded-xl border border-ink-600/70 bg-ink-900/40 p-3.5" data-testid="journal-day-object-added">
          <p className={stepLabel}>{t("added")}</p>
          {day.skills.length > 0 ? (
            <ul className="flex list-none flex-wrap gap-2" data-testid="journal-day-object-skills">
              {day.skills.map((s) => (
                <li
                  key={s.id}
                  className={`rounded-md border px-2 py-0.5 text-sm ${
                    s.confirmed
                      ? "border-trust-accent/40 text-trust-accent"
                      : "border-brand-cyan/40 text-brand-cyan"
                  }`}
                  data-confirmed={s.confirmed ? "true" : "false"}
                >
                  {s.name}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-text-muted">{t("addedNoSkills")}</p>
          )}
          <p className="text-sm text-text-secondary" data-testid="journal-day-object-proof">
            {day.confirmedMinutes > 0
              ? t("addedProof", { time: dur(day.confirmedMinutes) })
              : t("addedNoProof")}
          </p>
          <Link
            href="/dashboard/journal#mano-cv-identity"
            className="w-fit text-meta text-text-secondary underline underline-offset-2 hover:text-text-primary"
          >
            {t("openHistory")} →
          </Link>
        </li>
      </ol>
    </section>
  );
}
