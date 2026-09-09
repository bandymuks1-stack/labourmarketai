import { redirect } from "next/navigation";
import { getFormatter, getTranslations, setRequestLocale } from "next-intl/server";
import {
  availabilityDateLabel,
  countryLabel,
  mobilityLabels,
} from "@/lib/people/person-page-labels";
import {
  BadgeCheck,
  CalendarDays,
  Globe2,
  Hammer,
  History,
  Images,
  MapPin,
  NotebookPen,
  UserRound,
} from "lucide-react";

import { createClient } from "@/lib/supabase/server";
import { deriveEvidenceTier } from "@/lib/evidence/evidence-tier";
import { Card } from "@/components/ui/Card";
import { MessageButton } from "@/components/app/message-button";
import { anonymizedWorkerLabel } from "@/lib/visibility/worker-profile-visibility";
import { readRecordedWorkFor } from "@/lib/player-card/work-history";
import { readWorkPhotosFor } from "@/lib/journal/personal-gallery";
import { listActiveOfferingsByProvider } from "@/lib/services/service-offerings";

export const dynamic = "force-dynamic";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Role-aware person detail page (F2 / RC2).
 *
 * Production finding: the company team section showed people but there was NO
 * way to open anyone — no person route existed in the whole app. This page is
 * the single permitted destination for a person row.
 *
 * Permission model — fail-closed at the DATABASE:
 *   `workers` / `worker_skills` select RLS is `can_view_worker(id)` (self,
 *   admin, consented discoverability, or an ACTIVE work relationship —
 *   migration 20260711130000). If the session may not view the person the
 *   query returns nothing and the page renders the honest restricted state.
 *
 * Contact rule: no email / phone / private narrative is ever selected here
 * (owner rule: worker contact stays hidden; contact happens through the
 * permission-gated MessageButton flow).
 */
export default async function PersonPage({
  params,
}: {
  params: Promise<{ locale: string; workerId: string }>;
}) {
  const { locale, workerId } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("people");
  const tSkillNames = await getTranslations("skillNames");
  // Countries and dates are FACTS ABOUT A PERSON that an employer reads on
  // the one page where they judge them. Both were rendered raw here — see
  // `countryName` and the availability chip below.
  const tCountries = await getTranslations("labourMarket");
  const format = await getFormatter();

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/${locale}/auth/login`);

  if (!UUID_RE.test(workerId)) {
    return <RestrictedState t={t} />;
  }

  // RLS does the permission work: no relation / no consent → zero rows.
  const { data: worker } = await supabase
    .from("workers")
    .select(
      // `preferred_countries` is the same already-authorised row, and it is
      // already in PROFILE_SAFE_PREVIEW_FIELDS — it was simply never
      // rendered here, so the page could not answer WHERE CAN THEY WORK.
      "id, profile_id, display_name, headline, experience_years, current_location_country, preferred_countries, availability_status, available_from",
    )
    .eq("id", workerId)
    .maybeSingle();

  if (!worker) {
    return <RestrictedState t={t} />;
  }

  // Own row → the canonical self surface, not a duplicate person view.
  if (worker.profile_id === user.id) {
    redirect(`/${locale}/dashboard/profile`);
  }

  // Catalogue slug is the ONLY name source — the legacy name_lt/name_en
  // columns were dropped in 0012 and selecting them 400s the whole read
  // (which silently rendered ZERO skills for every worker here until W4).
  // The error is therefore CHECKED: a failed read is a read failure, not an
  // empty skill set.
  const { data: skillRows, error: skillsError } = await supabase
    .from("worker_skills")
    .select("skill_id, verified, source, skills ( slug )")
    .eq("worker_id", workerId);

  type SkillRow = {
    skill_id: string;
    verified: boolean | null;
    source: string | null;
    skills: { slug: string | null } | null;
  };
  const skills = ((skillRows ?? []) as unknown as SkillRow[]).map((r) => {
    const slug = r.skills?.slug ?? null;
    const label =
      slug && tSkillNames.has(slug) ? tSkillNames(slug) : (slug ?? null);
    // W6 slice 1: chip token derived from the ONE canonical tier.
    const tier = deriveEvidenceTier(r);
    const state: "verified" | "work" | "declared" =
      tier === "manager_confirmed"
        ? "verified"
        : tier === "work_journal"
          ? "work"
          : "declared";
    return { id: r.skill_id, label, state };
  });
  const shown = skills.filter((s) => s.label);

  // WHAT HAVE THEY ACTUALLY DONE — the question this page could not answer.
  // Permission is the database's: `engagement_contexts` select RLS returns
  // only the engagements this viewer is entitled to (their own, or an
  // organization they manage). Nothing is loosened to render it.
  const recordedWork = await readRecordedWorkFor(
    (worker.profile_id as string | null) ?? "",
  );
  /**
   * ── A COUNTRY CODE IS NOT A COUNTRY NAME (owner readiness window, §5B/§24)
   *
   * Read back from production today, this page rendered a real worker's
   * location as "LT" and their mobility as "NL, DK, NO, SE" — the stored
   * ISO-3166 alpha-2 codes, printed straight onto the ONE cross-person page
   * an employer uses to decide about someone. §24 bans raw internal
   * identifiers in the product's surfaces, and for a visitor reading in
   * Russian or Dutch these two-letter tokens are not even a weak label.
   *
   * The catalogue that fixes it already exists and every other surface uses
   * it (`labourMarket.countryNames`, all 17 markets × 5 active locales). The
   * fallback is the CODE, never a blank and never a guess: a worker whose
   * stored country is outside the market set — the column is free text and
   * the location model deliberately spans all of ISO — still shows something
   * true rather than vanishing. UNKNOWN is not EMPTY (SEP-7).
   */
  const countries = {
    has: (key: string) => tCountries.has(key),
    get: (key: string) => tCountries(key),
  };
  const mobility = mobilityLabels(
    worker.preferred_countries as string[] | null,
    countries,
  );

  // REAL WORK and WHAT THEY OFFER. Both already existed and were rendered
  // everywhere except on a person's own page: the photos on the author's own
  // gallery, the offerings on the provider's own list and on the ORGANIZATION
  // public page. Both reads are RLS-scoped and neither is a second store.
  const [workPhotos, offerings] = await Promise.all([
    readWorkPhotosFor((worker.profile_id as string | null) ?? ""),
    listActiveOfferingsByProvider((worker.profile_id as string | null) ?? ""),
  ]);

  const name =
    (worker.display_name as string | null)?.trim() ||
    anonymizedWorkerLabel(worker.id as string);
  const available =
    (worker.availability_status as string | null) === "available";

  const stateChip = (state: "verified" | "work" | "declared") => {
    if (state === "verified")
      return {
        cls: "border-state-success/40 bg-state-success/10 text-state-success",
        label: t("skillVerified"),
      };
    if (state === "work")
      return {
        cls: "border-brand-cyan/40 bg-brand-cyan/10 text-brand-cyan",
        label: t("skillWorkBacked"),
      };
    return {
      cls: "border-ink-500 bg-ink-800 text-text-secondary",
      label: t("skillDeclared"),
    };
  };

  return (
    <div className="mx-auto flex w-full max-w-content flex-col gap-6" data-testid="person-page">
      <header className="flex flex-col gap-3">
        <span className="inline-flex items-center gap-2 font-mono text-meta uppercase tracking-label text-brand-cyan">
          <UserRound className="h-3.5 w-3.5" aria-hidden />
          {t("eyebrow")}
        </span>
        <div className="flex flex-wrap items-center gap-4">
          <span
            aria-hidden
            className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl border border-ink-500 bg-ink-700 font-display text-lg font-bold text-text-primary"
          >
            {name
              .trim()
              .split(/\s+/)
              .slice(0, 2)
              .map((p) => p[0]?.toUpperCase() ?? "")
              .join("") || "•"}
          </span>
          <div className="min-w-0">
            <h1
              className="font-display text-2xl font-bold tracking-tightest text-text-primary"
              data-testid="person-name"
            >
              {name}
            </h1>
            {worker.headline ? (
              <p className="text-sm text-text-secondary">
                {worker.headline as string}
              </p>
            ) : null}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {available ? (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-state-success/40 bg-state-success/10 px-3 py-1 font-mono text-meta uppercase tracking-label text-state-success">
              {t("available")}
            </span>
          ) : null}
          {worker.available_from ? (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-ink-500 bg-ink-800 px-3 py-1 font-mono text-meta uppercase tracking-label text-text-secondary">
              <CalendarDays className="h-3 w-3" aria-hidden />
              {/* A stored `date` column arrives as "2026-07-31" and was
                  interpolated verbatim. Formatted in the reader's locale —
                  and parsed defensively, because a value the formatter
                  cannot read must degrade to the stored string, never to
                  "Invalid Date". */}
              {t("availableFrom", {
                date: availabilityDateLabel(
                  worker.available_from as string,
                  format,
                ),
              })}
            </span>
          ) : null}
          {worker.current_location_country ? (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-ink-500 bg-ink-800 px-3 py-1 font-mono text-meta uppercase tracking-label text-text-secondary">
              <MapPin className="h-3 w-3" aria-hidden />
              {countryLabel(worker.current_location_country as string, countries)}
            </span>
          ) : null}
          {typeof worker.experience_years === "number" &&
          worker.experience_years > 0 ? (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-ink-500 bg-ink-800 px-3 py-1 font-mono text-meta uppercase tracking-label text-text-secondary">
              {t("experienceYears", { n: worker.experience_years })}
            </span>
          ) : null}
          {mobility.length > 0 ? (
            <span
              className="inline-flex items-center gap-1.5 rounded-full border border-ink-500 bg-ink-800 px-3 py-1 font-mono text-meta uppercase tracking-label text-text-secondary"
              data-testid="person-mobility"
            >
              <Globe2 className="h-3 w-3" aria-hidden />
              {t("mobility")}: {mobility.join(", ")}
            </span>
          ) : null}
        </div>
        <div>
          <MessageButton
            profileId={worker.profile_id as string | null}
            labelKey="messageWorker"
          />
        </div>
      </header>

      {/* WHAT THEY CAN DO — the concrete work offered, not a profession label.
          Only ACTIVE offerings: the table's own discovery policy publishes
          those and withholds drafts, so the filter matches the permission
          rather than widening past it. */}
      <section className="flex flex-col gap-3" data-testid="person-services">
        <h2 className="inline-flex items-center gap-2 font-mono text-meta uppercase tracking-label text-text-muted">
          <Hammer className="h-3.5 w-3.5" aria-hidden />
          {t("servicesTitle")}
          {offerings.kind === "ok" && offerings.rows.length > 0
            ? ` · ${offerings.rows.length}`
            : null}
        </h2>
        {offerings.kind === "unavailable" ? (
          <Card variant="error" compact>
            <p className="text-sm text-text-secondary" data-testid="person-services-error">
              {t("servicesUnavailable")}
            </p>
          </Card>
        ) : offerings.rows.length === 0 ? (
          <Card variant="empty" compact>
            <p className="text-sm text-text-secondary">{t("servicesEmpty")}</p>
          </Card>
        ) : (
          <ul className="flex flex-col gap-2">
            {offerings.rows.map((o) => (
              <li key={o.id} data-testid="person-service">
                <Card compact className="flex flex-col gap-1">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <span className="text-sm font-medium text-text-primary">
                      {o.title}
                    </span>
                    {o.remote ? (
                      <span className="rounded-full border border-ink-500 bg-ink-800 px-2 py-0.5 font-mono text-meta uppercase tracking-label text-text-secondary">
                        {t("serviceRemote")}
                      </span>
                    ) : null}
                    {o.locationCountry ? (
                      <span className="inline-flex items-center gap-1 font-mono text-meta text-text-muted">
                        <MapPin className="h-3 w-3" aria-hidden />
                        {o.locationCountry}
                      </span>
                    ) : null}
                    {/* The provider's OWN words for what it costs. Never a
                        computed or inferred figure. */}
                    {o.rateText ? (
                      <span className="font-mono text-meta text-text-secondary">
                        {o.rateText}
                      </span>
                    ) : null}
                  </div>
                  {o.description ? (
                    <p className="text-sm text-text-secondary">{o.description}</p>
                  ) : null}
                </Card>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* REAL WORK — photographs of work actually done, from the SAME journal
          evidence store the author's own gallery reads. No portfolio model, no
          second upload path, and no journal text: this page selects no private
          narrative, and a photo of a finished weld is not the sentence the
          person wrote about their day. */}
      <section className="flex flex-col gap-3" data-testid="person-photos">
        <h2 className="inline-flex items-center gap-2 font-mono text-meta uppercase tracking-label text-text-muted">
          <Images className="h-3.5 w-3.5" aria-hidden />
          {t("photosTitle")}
          {workPhotos.status === "ok" && workPhotos.photos.length > 0
            ? ` · ${workPhotos.photos.length}`
            : null}
        </h2>
        {workPhotos.status === "unavailable" ? (
          <Card variant="error" compact>
            <p className="text-sm text-text-secondary" data-testid="person-photos-error">
              {t("photosUnavailable")}
            </p>
          </Card>
        ) : workPhotos.photos.length === 0 ? (
          <Card variant="empty" compact>
            <p className="text-sm text-text-secondary">{t("photosEmpty")}</p>
          </Card>
        ) : (
          <>
            <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {workPhotos.photos.map((ph) => (
                <li key={ph.photoId} data-testid="person-photo">
                  <Card compact className="overflow-hidden p-0">
                    {ph.signedUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={ph.signedUrl}
                        alt={t("photoAlt")}
                        className="aspect-[4/3] w-full bg-ink-800 object-cover"
                        loading="lazy"
                      />
                    ) : (
                      // A missing preview is said, never drawn as a broken image.
                      <div className="flex aspect-[4/3] w-full items-center justify-center bg-ink-800 px-3 text-center text-meta leading-relaxed text-text-muted">
                        {t("photosPreviewsUnavailable")}
                      </div>
                    )}
                  </Card>
                </li>
              ))}
            </ul>
            {workPhotos.previewsUnavailable ? (
              <p className="text-meta leading-relaxed text-text-muted">
                {t("photosPreviewsUnavailable")}
              </p>
            ) : null}
          </>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="inline-flex items-center gap-2 font-mono text-meta uppercase tracking-label text-text-muted">
          <BadgeCheck className="h-3.5 w-3.5" aria-hidden />
          {t("skillsTitle")} · {shown.length}
        </h2>
        {skillsError ? (
          // A failed read must never masquerade as "no skills" — that lie hid
          // the dropped-column defect on this page for weeks.
          <p
            className="card-border border-state-warning/40 p-4 text-sm text-text-secondary"
            data-testid="person-skills-error"
          >
            {t("skillsReadError")}
          </p>
        ) : shown.length === 0 ? (
          <p className="card-border p-4 text-sm text-text-secondary">
            {t("skillsEmpty")}
          </p>
        ) : (
          <ul className="flex flex-wrap gap-2">
            {shown.map((s) => {
              const chip = stateChip(s.state);
              return (
                <li
                  key={s.id}
                  className="card-border flex items-center gap-2 px-3 py-2"
                  data-testid="person-skill"
                >
                  <span className="text-sm text-text-primary">{s.label}</span>
                  <span
                    className={`rounded-full border px-2 py-0.5 font-mono text-meta uppercase tracking-label ${chip.cls}`}
                  >
                    {chip.label}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
        <p className="inline-flex items-center gap-2 text-meta leading-relaxed text-text-muted">
          <NotebookPen className="h-3.5 w-3.5 shrink-0" aria-hidden />
          {t("skillsLegend")}
        </p>
      </section>

      {/* WHAT THEY HAVE ACTUALLY DONE. Skills are what a person can do; this
          is what they did, and the page carried none of it. The rows come from
          the SAME `engagement_contexts` spine the person's own card, CV and
          profile read — one history, not a fourth variant of it. */}
      <section className="flex flex-col gap-3" data-testid="person-work">
        <h2 className="inline-flex items-center gap-2 font-mono text-meta uppercase tracking-label text-text-muted">
          <History className="h-3.5 w-3.5" aria-hidden />
          {t("workTitle")}
          {recordedWork.status === "ok" && recordedWork.entries.length > 0
            ? ` · ${recordedWork.entries.length}`
            : null}
        </h2>
        {recordedWork.status === "unavailable" ? (
          // UNKNOWN is not ZERO. This section IS the evidence signal here, so
          // a failed read must never render as "this person has done nothing".
          <Card variant="error" compact>
            <p className="text-sm text-text-secondary" data-testid="person-work-error">
              {t("workUnavailable")}
            </p>
          </Card>
        ) : recordedWork.entries.length === 0 ? (
          <Card variant="empty" compact>
            <p className="text-sm text-text-secondary">{t("workEmpty")}</p>
          </Card>
        ) : (
          <ul className="flex flex-col gap-2">
            {recordedWork.entries.map((e) => (
              <li key={e.id} data-testid="person-work-entry">
                <Card compact className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <span className="text-sm font-medium text-text-primary">
                  {e.title ?? e.organizationName ?? "—"}
                </span>
                {e.organizationName && e.title ? (
                  <span className="text-sm text-text-secondary">
                    {e.organizationName}
                  </span>
                ) : null}
                {/* EMPLOYMENT and PRACTICE are not the same claim. A
                    placement is carried as practice, never relabelled a job. */}
                <span className="rounded-full border border-ink-500 bg-ink-800 px-2 py-0.5 font-mono text-meta uppercase tracking-label text-text-secondary">
                  {e.kind === "practice" ? t("kindPractice") : t("kindEmployment")}
                </span>
                {e.startedAt ? (
                  <span className="font-mono text-meta text-text-muted">
                    {e.startedAt}
                    {e.current ? ` — ${t("workCurrent")}` : e.endedAt ? ` — ${e.endedAt}` : ""}
                  </span>
                ) : null}
                {e.countryCode ? (
                  <span className="inline-flex items-center gap-1 font-mono text-meta text-text-muted">
                    <MapPin className="h-3 w-3" aria-hidden />
                    {e.countryCode}
                  </span>
                ) : null}
                </Card>
              </li>
            ))}
          </ul>
        )}
        {/* Said plainly, because it is true: this is the part the viewer is
            entitled to see, which is not the same as a complete history. */}
        <p className="inline-flex items-center gap-2 text-meta leading-relaxed text-text-muted">
          <NotebookPen className="h-3.5 w-3.5 shrink-0" aria-hidden />
          {t("workScopeNote")}
        </p>
      </section>
    </div>
  );
}

async function RestrictedState({
  t,
}: {
  t: Awaited<ReturnType<typeof getTranslations<"people">>>;
}) {
  return (
    <div
      className="mx-auto flex w-full max-w-content flex-col gap-4"
      data-testid="person-restricted"
    >
      <h1 className="font-display text-2xl font-bold tracking-tightest text-text-primary">
        {t("restrictedTitle")}
      </h1>
      <p className="card-border p-4 text-sm leading-relaxed text-text-secondary">
        {t("restrictedBody")}
      </p>
    </div>
  );
}
