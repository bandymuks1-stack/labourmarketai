import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { setRequestLocale, getTranslations } from "next-intl/server";
import { Link } from "@/lib/i18n/navigation";
import { buttonLinkClassName } from "@/components/ui/Button";
import { resolveActiveLocale } from "@/lib/seo/metadata";
import type { ActiveLocale } from "@/lib/i18n/config";
import { getPublicVacancyPreview } from "@/lib/vacancy-store/public-vacancy-preview";
import { getPublicVacancyById } from "@/lib/vacancy-store/vacancy-read";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { isPublicVacancySaved } from "@/lib/opportunities/saved-opportunities";
import { SaveVacancyButton } from "@/components/marketing/save-vacancy-button";
import { formatUtcDate } from "@/lib/time/display";

/**
 * ONE PUBLIC JOB PAGE — the indexable unit of the acquisition funnel, and the
 * place it used to dead-end.
 *
 * ── THE DEFECT THIS CLOSES ─────────────────────────────────────────────────
 * This page was AUTH-BLIND. It always rendered the anonymous projection and
 * always ended with "These details are available to members. Creating an
 * account is free." So the funnel ran:
 *
 *   anonymous → locked card → "Create a free account" → signup → ?next= back
 *   here → THE IDENTICAL LOCKED CARD, telling a person who had just registered
 *   to register.
 *
 * The `?next=` round trip was never broken — `getSafeReturnPath` preserves
 * `/{locale}/jobs/{id}` correctly. What was missing is that arriving back here
 * changed nothing. There is also no per-vacancy member route and no deep link
 * on the opportunities board, so a registered worker had NO path to the ad they
 * came for. Owner directive: public vacancy → registration/login → the EXACT
 * SAME vacancy → authenticated safe unlock → useful next action.
 *
 * ── TWO PROJECTIONS, CHOSEN BY WHO IS ASKING ───────────────────────────────
 * anonymous  → `get_public_vacancy_preview_v1` (SECURITY DEFINER, safe columns
 *              enumerated in SQL; employer, location, description and apply URL
 *              are never selected, so they cannot leak)
 * member     → `getPublicVacancyById` through the caller's OWN client, so the
 *              row arrives via RLS policy `public_vacancies_read_active`
 *
 * The unlock is therefore enforced by the DATABASE, not by this component. If
 * this file had a bug and called the member reader for an anonymous visitor,
 * the anonymous client has no policy and no grant on `public_vacancies` and
 * would receive nothing.
 *
 * ── CACHE ISOLATION (mandatory, and the reason `revalidate` is gone) ────────
 * This page previously carried `export const revalidate = 3600`. A page whose
 * CONTENT depends on the caller's session must never be stored in a shared
 * cache: one member's full ad — employer, location, apply URL — could be
 * replayed to an anonymous visitor, which is precisely the leak the whole
 * projection design exists to prevent. `force-dynamic` renders per request, so
 * no cross-visitor cache entry exists at any layer.
 *
 * The cost is real and accepted: the anonymous render is no longer cached for
 * an hour. Crawlers still receive byte-identical anonymous output — no
 * cloaking — and the sitemap and board are unaffected.
 */
export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}): Promise<Metadata> {
  const { locale, id } = await params;
  const active = resolveActiveLocale(locale);
  // METADATA IS ALWAYS THE ANONYMOUS PROJECTION, for every caller. A title or
  // OpenGraph description built from member-only fields would publish the
  // employer into a <head> that is shared, scraped and previewed.
  const preview = await getPublicVacancyPreview(id);

  if (preview === "not_provisioned" || preview === null) {
    return { title: "—", robots: { index: false, follow: false } };
  }

  const title = preview.occupation
    ? `${preview.title} — ${preview.occupation}`
    : preview.title;

  return {
    title,
    description: DESCRIPTION[active],
    alternates: { canonical: `/${active}/jobs/${id}` },
    openGraph: { title, description: DESCRIPTION[active] },
  };
}

type L = Record<ActiveLocale, string>;

const DESCRIPTION: L = {
  en: "Open vacancy on LabourMarket.ai. Sign in to see the employer, the location and how to apply.",
  lt: "Laisva darbo vieta LabourMarket.ai. Prisijunk, kad matytum darbdavį, vietovę ir kaip kandidatuoti.",
  ru: "Открытая вакансия на LabourMarket.ai. Войдите, чтобы увидеть работодателя, местоположение и способ подачи заявки.",
  nl: "Openstaande vacature op LabourMarket.ai. Log in om de werkgever, de locatie en de sollicitatiewijze te zien.",
  de: "Offene Stelle auf LabourMarket.ai. Melden Sie sich an, um Arbeitgeber, Ort und Bewerbungsweg zu sehen.",
};

const LOCKED_TITLE: L = {
  en: "Employer, location and how to apply",
  lt: "Darbdavys, vietovė ir kaip kandidatuoti",
  ru: "Работодатель, местоположение и как откликнуться",
  nl: "Werkgever, locatie en hoe te solliciteren",
  de: "Arbeitgeber, Ort und Bewerbungsweg",
};

const LOCKED_BODY: L = {
  en: "These details are available to members. Creating an account is free.",
  lt: "Šie duomenys prieinami nariams. Paskyros sukūrimas nemokamas.",
  ru: "Эти данные доступны участникам. Регистрация бесплатна.",
  nl: "Deze gegevens zijn beschikbaar voor leden. Een account aanmaken is gratis.",
  de: "Diese Angaben sind für Mitglieder verfügbar. Ein Konto ist kostenlos.",
};

const CTA_SIGNUP: L = {
  en: "Create a free account",
  lt: "Sukurti nemokamą paskyrą",
  ru: "Создать бесплатный аккаунт",
  nl: "Gratis account aanmaken",
  de: "Kostenloses Konto erstellen",
};

const CTA_LOGIN: L = {
  en: "I already have an account",
  lt: "Jau turiu paskyrą",
  ru: "У меня уже есть аккаунт",
  nl: "Ik heb al een account",
  de: "Ich habe bereits ein Konto",
};

const BACK: L = {
  en: "← All jobs",
  lt: "← Visos darbo vietos",
  ru: "← Все вакансии",
  nl: "← Alle vacatures",
  de: "← Alle Stellen",
};

const PUBLISHED: L = {
  en: "Published",
  lt: "Paskelbta",
  ru: "Опубликовано",
  nl: "Geplaatst",
  de: "Veröffentlicht",
};

// ── Member-only labels ─────────────────────────────────────────────────────

const EMPLOYER: L = {
  en: "Employer",
  lt: "Darbdavys",
  ru: "Работодатель",
  nl: "Werkgever",
  de: "Arbeitgeber",
};

const LOCATION: L = {
  en: "Location",
  lt: "Vietovė",
  ru: "Местоположение",
  nl: "Locatie",
  de: "Ort",
};

const DESCRIPTION_HEADING: L = {
  en: "Job description",
  lt: "Darbo aprašymas",
  ru: "Описание вакансии",
  nl: "Functieomschrijving",
  de: "Stellenbeschreibung",
};

const APPLY: L = {
  en: "Apply on the source site",
  lt: "Kandidatuoti šaltinio svetainėje",
  ru: "Откликнуться на сайте источника",
  nl: "Solliciteer op de bronsite",
  de: "Auf der Quellseite bewerben",
};

/** Honest: we hand the worker onward, we do not apply for them. */
const APPLY_NOTE: L = {
  en: "Applications are handled by the publisher, not by LabourMarket.ai.",
  lt: "Kandidatavimą tvarko skelbėjas, ne LabourMarket.ai.",
  ru: "Отклики обрабатывает источник объявления, а не LabourMarket.ai.",
  nl: "Sollicitaties worden afgehandeld door de aanbieder, niet door LabourMarket.ai.",
  de: "Bewerbungen bearbeitet die ausschreibende Stelle, nicht LabourMarket.ai.",
};

/* ── SAVE (private bookmark) ────────────────────────────────────────────────
   Owner decision 2026-08-19: a save is NOT an application, NOT a shortlist,
   NOT employer interest and NOT candidate disclosure. SAVE_NOTE is the line
   that carries that to the worker, so it is not optional decoration — a
   "Save" mistaken for "Apply" would repeat the #1193 defect with a new
   label. Every locale states it explicitly. */
const SAVE: L = {
  en: "Save this job",
  lt: "Išsaugoti šį skelbimą",
  ru: "Сохранить вакансию",
  nl: "Vacature bewaren",
  de: "Stelle merken",
};

const SAVED: L = {
  en: "Saved",
  lt: "Išsaugota",
  ru: "Сохранено",
  nl: "Bewaard",
  de: "Gemerkt",
};

const UNSAVE: L = {
  en: "Remove from saved",
  lt: "Pašalinti iš išsaugotų",
  ru: "Убрать из сохранённых",
  nl: "Uit bewaard verwijderen",
  de: "Aus Gemerkt entfernen",
};

const SAVE_NOTE: L = {
  en: "Only you can see your saved jobs. Saving is not an application — the employer is not notified.",
  lt: "Išsaugotus skelbimus matai tik tu. Išsaugojimas nėra kandidatavimas — darbdavys apie tai neinformuojamas.",
  ru: "Сохранённые вакансии видите только вы. Сохранение — это не отклик: работодатель не получает уведомления.",
  nl: "Alleen jij ziet je bewaarde vacatures. Bewaren is geen sollicitatie — de werkgever krijgt geen melding.",
  de: "Nur du siehst deine gemerkten Stellen. Merken ist keine Bewerbung — der Arbeitgeber wird nicht benachrichtigt.",
};

const SAVE_FAILED: L = {
  en: "That did not save. Please try again.",
  lt: "Nepavyko išsaugoti. Bandyk dar kartą.",
  ru: "Не удалось сохранить. Попробуйте ещё раз.",
  nl: "Bewaren is niet gelukt. Probeer het opnieuw.",
  de: "Das Merken hat nicht geklappt. Bitte versuche es erneut.",
};

const SAVE_CLOSED: L = {
  en: "This job is no longer open, so it cannot be saved.",
  lt: "Šis skelbimas nebegalioja, todėl jo išsaugoti negalima.",
  ru: "Эта вакансия больше не активна, сохранить её нельзя.",
  nl: "Deze vacature is niet meer open en kan niet worden bewaard.",
  de: "Diese Stelle ist nicht mehr offen und kann nicht gemerkt werden.",
};

const NEXT_HEADING: L = {
  en: "Get matched to work like this",
  lt: "Gauk pasiūlymų, panašių į šį",
  ru: "Получайте подходящие предложения",
  nl: "Word gematcht met werk zoals dit",
  de: "Passende Stellen erhalten",
};

const NEXT_BODY: L = {
  en: "Your profile and skills decide which opportunities reach you. The more complete they are, the better the match.",
  lt: "Tavo profilis ir įgūdžiai lemia, kokios galimybės tave pasieks. Kuo jie išsamesni, tuo tikslesnis atitikimas.",
  ru: "Ваш профиль и навыки определяют, какие возможности до вас доходят. Чем они полнее, тем точнее подбор.",
  nl: "Je profiel en vaardigheden bepalen welke kansen je bereiken. Hoe vollediger, hoe beter de match.",
  de: "Ihr Profil und Ihre Fähigkeiten bestimmen, welche Angebote Sie erreichen. Je vollständiger, desto besser die Übereinstimmung.",
};

const NEXT_OPPORTUNITIES: L = {
  en: "See your opportunities",
  lt: "Žiūrėti savo galimybes",
  ru: "Смотреть возможности",
  nl: "Bekijk je kansen",
  de: "Ihre Angebote ansehen",
};

const NEXT_PROFILE: L = {
  en: "Complete your profile",
  lt: "Užpildyti profilį",
  ru: "Заполнить профиль",
  nl: "Profiel aanvullen",
  de: "Profil vervollständigen",
};

/**
 * Does this request carry a Supabase session cookie at all?
 *
 * `supabase.auth.getUser()` VALIDATES the token against the auth server, which
 * is a network round trip. This page is the indexable unit of a 39,241-page
 * public surface, so calling it unconditionally would put one Supabase auth
 * request behind every crawler hit and every anonymous visit — for a caller who
 * provably has no session.
 *
 * `middleware.ts` already refuses to do that (`hasSupabaseAuthCookie`, "so
 * anonymous public/marketing traffic stays fast and never hits Supabase"); this
 * is the same rule applied on the server-component side, matching the cookie
 * shape `@supabase/ssr` writes (`sb-<ref>-auth-token`, possibly chunked).
 *
 * It is a FAST PATH, never an authorisation decision: a forged cookie buys
 * nothing, because the unlock is decided by `getUser()` and then by RLS.
 */
async function hasSessionCookie(): Promise<boolean> {
  const store = await cookies();
  return store
    .getAll()
    .some((c) => c.name.startsWith("sb-") && c.name.includes("auth-token"));
}

function joinLocation(
  city: string | null,
  region: string | null,
  country: string | null,
): string | null {
  const parts = [city, region, country].filter(
    (p): p is string => typeof p === "string" && p.trim().length > 0,
  );
  return parts.length > 0 ? parts.join(", ") : null;
}

export default async function JobDetailPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  const active = resolveActiveLocale(locale);

  const supabase = await createClient();
  // No session cookie → provably anonymous, so skip the auth round trip.
  const user = (await hasSessionCookie())
    ? (await supabase.auth.getUser()).data.user
    : null;

  // The anonymous projection is fetched for EVERY caller: it is what the
  // heading, the publication date and the licence attribution render from, and
  // it is the only thing an anonymous visitor ever receives.
  const preview = await getPublicVacancyPreview(id);
  if (preview === null || preview === "not_provisioned") notFound();

  // The member projection is fetched ONLY when a session exists, through the
  // caller's own client so RLS is what authorises it. `null` here means the
  // reader declined — an expired ad, a missing table, or no policy match — and
  // the page then renders exactly the anonymous half rather than a broken one.
  const member = user
    ? await getPublicVacancyById(supabase, id).then((r) =>
        r.status === "ok" ? r.vacancy : null,
      )
    : null;

  // Saved state for the signed-in worker, read through the CALLER's own client
  // so RLS decides visibility. `available:false` (table/RPC missing, or any
  // read error) renders no control at all — honest invisibility, never a dead
  // button. Anonymous visitors never reach this.
  const savedState = member
    ? await isPublicVacancySaved(supabase, id)
    : { saved: false, available: false };

  const next = encodeURIComponent(`/${active}/jobs/${id}`);
  const published = formatUtcDate(preview.publishedAt, active);

  const t = await getTranslations({ locale: active });
  let attribution: string | null = null;
  if (preview.attributionCode) {
    try {
      attribution = t(preview.attributionCode);
    } catch {
      attribution = null;
    }
  }

  const locationLabel = member
    ? joinLocation(
        member.location.city,
        member.location.region,
        member.location.country,
      )
    : null;

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-10 sm:px-6 sm:py-14">
      <Link href="/jobs" className="text-sm text-muted-foreground hover:underline">
        {BACK[active]}
      </Link>

      <h1 className="mt-4 text-2xl font-semibold tracking-tight sm:text-3xl">
        {preview.title}
      </h1>

      {preview.occupation && (
        <p className="mt-2 text-base text-muted-foreground">{preview.occupation}</p>
      )}

      {published && (
        <p className="mt-4 text-sm text-muted-foreground">
          {PUBLISHED[active]}: {published}
        </p>
      )}

      {member ? (
        <>
          <section className="mt-8 space-y-4 rounded-lg border p-5">
            {member.employer.name && (
              <div>
                <h2 className="text-sm font-medium text-muted-foreground">
                  {EMPLOYER[active]}
                </h2>
                <p className="mt-1 text-base">{member.employer.name}</p>
              </div>
            )}

            {locationLabel && (
              <div>
                <h2 className="text-sm font-medium text-muted-foreground">
                  {LOCATION[active]}
                </h2>
                <p className="mt-1 text-base">{locationLabel}</p>
              </div>
            )}
          </section>

          {member.descriptionRaw.trim().length > 0 && (
            <section className="mt-8">
              <h2 className="text-base font-medium">
                {DESCRIPTION_HEADING[active]}
              </h2>
              {/* The publisher's own words, rendered as TEXT. `whitespace-pre-line`
                  keeps their paragraph breaks without interpreting anything in
                  the string as markup — this is third-party content. */}
              <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-muted-foreground">
                {member.descriptionRaw}
              </p>
            </section>
          )}

          {member.applicationUrl && (
            <section className="mt-8">
              <a
                href={member.applicationUrl}
                // Third-party destination: no referrer, no window.opener handle.
                target="_blank"
                rel="noopener noreferrer nofollow"
                className={buttonLinkClassName("primary")}
              >
                {APPLY[active]}
              </a>
              <p className="mt-2 text-xs text-muted-foreground">
                {APPLY_NOTE[active]}
              </p>
            </section>
          )}

          {/* PRIVATE BOOKMARK. Rendered only for a signed-in worker whose read
              succeeded — see `savedState.available`. */}
          {savedState.available && (
            <SaveVacancyButton
              vacancyId={id}
              initiallySaved={savedState.saved}
              copy={{
                save: SAVE[active],
                saved: SAVED[active],
                unsave: UNSAVE[active],
                note: SAVE_NOTE[active],
                failed: SAVE_FAILED[active],
                closed: SAVE_CLOSED[active],
              }}
            />
          )}

          {/* The useful next action the directive asks for: the funnel does not
              end at one ad, it ends inside the matching loop. Both destinations
              are surfaces that already exist. */}
          <section className="mt-10 rounded-lg border border-dashed p-5">
            <h2 className="text-base font-medium">{NEXT_HEADING[active]}</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {NEXT_BODY[active]}
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <Link
                href="/dashboard/opportunities"
                className={buttonLinkClassName("primary")}
              >
                {NEXT_OPPORTUNITIES[active]}
              </Link>
              <Link
                href="/dashboard/profile"
                className={buttonLinkClassName("secondary")}
              >
                {NEXT_PROFILE[active]}
              </Link>
            </div>
          </section>
        </>
      ) : (
        <section className="mt-8 rounded-lg border border-dashed p-5">
          <h2 className="text-base font-medium">{LOCKED_TITLE[active]}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{LOCKED_BODY[active]}</p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Link
              href={`/auth/signup?next=${next}`}
              className={buttonLinkClassName("primary")}
            >
              {CTA_SIGNUP[active]}
            </Link>
            <Link
              href={`/auth/login?next=${next}`}
              className={buttonLinkClassName("secondary")}
            >
              {CTA_LOGIN[active]}
            </Link>
          </div>
        </section>
      )}

      {attribution && (
        <p className="mt-8 text-xs text-muted-foreground">{attribution}</p>
      )}
    </main>
  );
}
