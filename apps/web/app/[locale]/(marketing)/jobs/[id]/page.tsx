import type { Metadata } from "next";
import { PlacePrecision } from "@/components/app/work-world/primitives";
import { notFound } from "next/navigation";
import { setRequestLocale, getTranslations } from "next-intl/server";
import { Link } from "@/lib/i18n/navigation";
import { buttonLinkClassName } from "@/components/ui/Button";
import { resolveActiveLocale } from "@/lib/seo/metadata";
import type { ActiveLocale } from "@/lib/i18n/config";
import { getPublicVacancyPreview } from "@/lib/vacancy-store/public-vacancy-preview";
import { getPublicVacancyById } from "@/lib/vacancy-store/vacancy-read";
import { hasSessionCookie } from "@/lib/supabase/session-cookie";
import { createClient } from "@/lib/supabase/server";
import {
  isPublicVacancySaved,
  resolveOwnWorkerId,
} from "@/lib/opportunities/saved-opportunities";
import { SaveVacancyButton } from "@/components/marketing/save-vacancy-button";
import { formatUtcDate } from "@/lib/time/display";
import { TelemetryView } from "@/components/app/telemetry-view";
import { TrackedCta } from "@/components/app/tracked-cta";
import { FUNNEL_EVENTS } from "@/lib/telemetry/funnel-events";
import { FitBandChip } from "@/components/app/opportunities/fit-band-chip";
import { MatchTierExplanation } from "@/components/app/match-tier-explanation";
import { VacancyInterestButton } from "@/components/app/vacancy-interest-button";
import {
  VacancyTranslateControl,
  displayLanguageName,
} from "@/components/app/vacancy-translate-control";
import type { FitBand } from "@/lib/opportunities/fit-band";
import {
  readPublicJobForMember,
  type PublicJobReading,
} from "@/lib/opportunities/public-job-reading";
import type { StoredPublicVacancyV1 } from "@/lib/vacancy-store/vacancy-read";

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

  // Owner directive 2026-08-24: the raw title is member-only (it embeds
  // employer and location wording), so shared metadata is built from the
  // occupation label — the same anonymous projection every caller receives.
  const title = preview.occupation ?? GENERIC_TITLE[active];

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
  pl: "Otwarta oferta pracy na LabourMarket.ai. Zaloguj się, aby zobaczyć pracodawcę, lokalizację i sposób aplikowania.",
};

/** Metadata/heading fallback when even the occupation label is missing. */
const GENERIC_TITLE: L = {
  en: "Open vacancy",
  lt: "Laisva darbo vieta",
  ru: "Открытая вакансия",
  nl: "Openstaande vacature",
  de: "Offene Stelle",
  pl: "Otwarta oferta pracy",
};

/** Anonymous source line. Deliberately generic: naming the source employment
 *  service identifies the country (owner directive 2026-08-24). Members see
 *  the full named licence attribution below instead. */
const ANONYMOUS_SOURCE: L = {
  en: "Source: an official public employment service. The ad's content belongs to the employer who published it.",
  lt: "Šaltinis: oficialus viešas užimtumo šaltinis. Skelbimo turinys priklauso jį paskelbusiam darbdaviui.",
  ru: "Источник: официальная публичная служба занятости. Содержание объявления принадлежит опубликовавшему его работодателю.",
  nl: "Bron: een officiële openbare arbeidsbemiddelingsdienst. De inhoud van de advertentie is van de werkgever die haar publiceerde.",
  de: "Quelle: eine offizielle öffentliche Arbeitsvermittlung. Der Inhalt der Anzeige gehört dem veröffentlichenden Arbeitgeber.",
  pl: "Źródło: oficjalna publiczna służba zatrudnienia. Treść ogłoszenia należy do pracodawcy, który je opublikował.",
};

const LOCKED_TITLE: L = {
  en: "Employer, location and how to apply",
  lt: "Darbdavys, vietovė ir kaip kandidatuoti",
  ru: "Работодатель, местоположение и как откликнуться",
  nl: "Werkgever, locatie en hoe te solliciteren",
  de: "Arbeitgeber, Ort und Bewerbungsweg",
  pl: "Pracodawca, lokalizacja i sposób aplikowania",
};

const LOCKED_BODY: L = {
  en: "These details are available to members. Creating an account is free.",
  lt: "Šie duomenys prieinami nariams. Paskyros sukūrimas nemokamas.",
  ru: "Эти данные доступны участникам. Регистрация бесплатна.",
  nl: "Deze gegevens zijn beschikbaar voor leden. Een account aanmaken is gratis.",
  de: "Diese Angaben sind für Mitglieder verfügbar. Ein Konto ist kostenlos.",
  pl: "Te dane są dostępne dla członków. Założenie konta jest bezpłatne.",
};

const CTA_SIGNUP: L = {
  en: "Create a free account",
  lt: "Sukurti nemokamą paskyrą",
  ru: "Создать бесплатный аккаунт",
  nl: "Gratis account aanmaken",
  de: "Kostenloses Konto erstellen",
  pl: "Załóż darmowe konto",
};

const CTA_LOGIN: L = {
  en: "I already have an account",
  lt: "Jau turiu paskyrą",
  ru: "У меня уже есть аккаунт",
  nl: "Ik heb al een account",
  de: "Ich habe bereits ein Konto",
  pl: "Mam już konto",
};

const BACK: L = {
  en: "← All jobs",
  lt: "← Visos darbo vietos",
  ru: "← Все вакансии",
  nl: "← Alle vacatures",
  de: "← Alle Stellen",
  pl: "← Wszystkie oferty pracy",
};

const PUBLISHED: L = {
  en: "Published",
  lt: "Paskelbta",
  ru: "Опубликовано",
  nl: "Geplaatst",
  de: "Veröffentlicht",
  pl: "Opublikowano",
};

// ── Member-only labels ─────────────────────────────────────────────────────

const EMPLOYER: L = {
  en: "Employer",
  lt: "Darbdavys",
  ru: "Работодатель",
  nl: "Werkgever",
  de: "Arbeitgeber",
  pl: "Pracodawca",
};

const LOCATION: L = {
  en: "Location",
  lt: "Vietovė",
  ru: "Местоположение",
  nl: "Locatie",
  de: "Ort",
  pl: "Lokalizacja",
};

const DESCRIPTION_HEADING: L = {
  en: "Job description",
  lt: "Darbo aprašymas",
  ru: "Описание вакансии",
  nl: "Functieomschrijving",
  de: "Stellenbeschreibung",
  pl: "Opis stanowiska",
};

const APPLY: L = {
  en: "Apply on the source site",
  lt: "Kandidatuoti šaltinio svetainėje",
  ru: "Откликнуться на сайте источника",
  nl: "Solliciteer op de bronsite",
  de: "Auf der Quellseite bewerben",
  pl: "Aplikuj na stronie źródłowej",
};

/** Honest: we hand the worker onward, we do not apply for them. */
const APPLY_NOTE: L = {
  en: "Applications are handled by the publisher, not by LabourMarket.ai.",
  lt: "Kandidatavimą tvarko skelbėjas, ne LabourMarket.ai.",
  ru: "Отклики обрабатывает источник объявления, а не LabourMarket.ai.",
  nl: "Sollicitaties worden afgehandeld door de aanbieder, niet door LabourMarket.ai.",
  de: "Bewerbungen bearbeitet die ausschreibende Stelle, nicht LabourMarket.ai.",
  pl: "Aplikacje obsługuje wydawca ogłoszenia, nie LabourMarket.ai.",
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
  pl: "Zapisz tę ofertę pracy",
};

const SAVED: L = {
  en: "Saved",
  lt: "Išsaugota",
  ru: "Сохранено",
  nl: "Bewaard",
  de: "Gemerkt",
  pl: "Zapisano",
};

const UNSAVE: L = {
  en: "Remove from saved",
  lt: "Pašalinti iš išsaugotų",
  ru: "Убрать из сохранённых",
  nl: "Uit bewaard verwijderen",
  de: "Aus Gemerkt entfernen",
  pl: "Usuń z zapisanych",
};

const SAVE_NOTE: L = {
  en: "Only you can see your saved jobs. Saving is not an application — the employer is not notified.",
  lt: "Išsaugotus skelbimus matai tik tu. Išsaugojimas nėra kandidatavimas — darbdavys apie tai neinformuojamas.",
  ru: "Сохранённые вакансии видите только вы. Сохранение — это не отклик: работодатель не получает уведомления.",
  nl: "Alleen jij ziet je bewaarde vacatures. Bewaren is geen sollicitatie — de werkgever krijgt geen melding.",
  de: "Nur du siehst deine gemerkten Stellen. Merken ist keine Bewerbung — der Arbeitgeber wird nicht benachrichtigt.",
  pl: "Tylko Ty widzisz swoje zapisane oferty pracy. Zapisanie nie jest aplikacją — pracodawca nie dostaje powiadomienia.",
};

const SAVE_FAILED: L = {
  en: "That did not save. Please try again.",
  lt: "Nepavyko išsaugoti. Bandyk dar kartą.",
  ru: "Не удалось сохранить. Попробуйте ещё раз.",
  nl: "Bewaren is niet gelukt. Probeer het opnieuw.",
  de: "Das Merken hat nicht geklappt. Bitte versuche es erneut.",
  pl: "Nie udało się zapisać. Spróbuj ponownie.",
};

const SAVE_CLOSED: L = {
  en: "This job is no longer open, so it cannot be saved.",
  lt: "Šis skelbimas nebegalioja, todėl jo išsaugoti negalima.",
  ru: "Эта вакансия больше не активна, сохранить её нельзя.",
  nl: "Deze vacature is niet meer open en kan niet worden bewaard.",
  de: "Diese Stelle ist nicht mehr offen und kann nicht gemerkt werden.",
  pl: "Ta oferta pracy nie jest już otwarta, więc nie można jej zapisać.",
};

const NEXT_HEADING: L = {
  en: "Get matched to work like this",
  lt: "Gauk pasiūlymų, panašių į šį",
  ru: "Получайте подходящие предложения",
  nl: "Word gematcht met werk zoals dit",
  de: "Passende Stellen erhalten",
  pl: "Otrzymuj dopasowania do takiej pracy",
};

const NEXT_BODY: L = {
  en: "Your profile and skills decide which opportunities reach you. The more complete they are, the better the match.",
  lt: "Tavo profilis ir įgūdžiai lemia, kokios galimybės tave pasieks. Kuo jie išsamesni, tuo tikslesnis atitikimas.",
  ru: "Ваш профиль и навыки определяют, какие возможности до вас доходят. Чем они полнее, тем точнее подбор.",
  nl: "Je profiel en vaardigheden bepalen welke kansen je bereiken. Hoe vollediger, hoe beter de match.",
  de: "Ihr Profil und Ihre Fähigkeiten bestimmen, welche Angebote Sie erreichen. Je vollständiger, desto besser die Übereinstimmung.",
  pl: "To Twój profil i umiejętności decydują, które możliwości do Ciebie trafiają. Im są pełniejsze, tym lepsze dopasowanie.",
};

const NEXT_OPPORTUNITIES: L = {
  en: "See your opportunities",
  lt: "Žiūrėti savo galimybes",
  ru: "Смотреть возможности",
  nl: "Bekijk je kansen",
  de: "Ihre Angebote ansehen",
  pl: "Zobacz swoje możliwości",
};

const NEXT_PROFILE: L = {
  en: "Complete your profile",
  lt: "Užpildyti profilį",
  ru: "Заполнить профиль",
  nl: "Profiel aanvullen",
  de: "Profil vervollständigen",
  pl: "Uzupełnij swój profil",
};

// ── Acquisition loop P0 (2026-09-20): the member half no longer stops at the
//    unlocked advertisement. It reads THIS job against THIS person with the
//    one matching engine and says, requirement by requirement, what is
//    evidenced, what conflicts and what is not yet known — then offers the
//    existing interest control and, beside a non-fit, other current ads of
//    the same profession. Copy follows the page's own 5-locale pattern.

const RETURNED_NOTE: L = {
  en: "You are back on the job you opened before signing in.",
  lt: "Grįžai prie skelbimo, kurį atsidarei prieš prisijungdamas.",
  ru: "Вы вернулись к вакансии, которую открыли до входа.",
  nl: "Je bent terug bij de vacature die je opende voordat je inlogde.",
  de: "Du bist zurück bei der Stelle, die du vor der Anmeldung geöffnet hast.",
  pl: "Jesteś z powrotem przy ofercie pracy otwartej przed zalogowaniem.",
};

const COMPARE_TITLE: L = {
  en: "How this job compares with your profile",
  lt: "Kaip šis darbas atitinka tavo profilį",
  ru: "Как эта вакансия соотносится с вашим профилем",
  nl: "Hoe deze vacature zich verhoudt tot je profiel",
  de: "Wie diese Stelle zu deinem Profil passt",
  pl: "Jak ta oferta pracy wypada w porównaniu z Twoim profilem",
};

/** One honest sentence per band. None of them dismisses the person: a
 *  missing fact is named as missing, a conflict names the conflicting
 *  requirement, and "not assessed" says why nothing could be judged. */
const BAND_SENTENCE: Record<FitBand, L> = {
  strong: {
    en: "The information in your profile covers the requirements this advertisement states. Where the advertisement is silent, nothing is assumed.",
    lt: "Tavo profilio informacija atitinka skelbime nurodytus reikalavimus. Kur skelbimas nieko nenurodo, niekas nespėjama.",
    ru: "Информация в вашем профиле покрывает требования, указанные в объявлении. Там, где объявление молчит, ничего не предполагается.",
    nl: "De informatie in je profiel dekt de eisen die deze advertentie noemt. Waar de advertentie zwijgt, wordt niets aangenomen.",
    de: "Die Angaben in deinem Profil decken die in dieser Anzeige genannten Anforderungen ab. Wo die Anzeige schweigt, wird nichts angenommen.",
    pl: "Informacje w Twoim profilu pokrywają wymagania podane w tym ogłoszeniu. Tam, gdzie ogłoszenie milczy, nic nie jest zakładane.",
  },
  possible: {
    en: "Your profile covers part of the stated requirements. The items below are what is still missing or not yet known.",
    lt: "Tavo profilis atitinka dalį nurodytų reikalavimų. Žemiau — ko dar trūksta arba kas dar nežinoma.",
    ru: "Ваш профиль покрывает часть указанных требований. Ниже — чего пока не хватает или что ещё неизвестно.",
    nl: "Je profiel dekt een deel van de gestelde eisen. Hieronder staat wat nog ontbreekt of nog niet bekend is.",
    de: "Dein Profil deckt einen Teil der genannten Anforderungen ab. Unten steht, was noch fehlt oder noch nicht bekannt ist.",
    pl: "Twój profil pokrywa część podanych wymagań. Poniżej jest to, czego jeszcze brakuje lub co nie jest znane.",
  },
  missing_requirement: {
    en: "This advertisement states requirements that your profile does not yet show. Missing information is not a failed requirement — if you have it, add it to your profile.",
    lt: "Šiame skelbime nurodyti reikalavimai, kurių tavo profilis dar nerodo. Trūkstama informacija nėra neatitikimas — jei ją turi, papildyk profilį.",
    ru: "В объявлении указаны требования, которых пока нет в вашем профиле. Отсутствие информации — это не несоответствие: если она у вас есть, добавьте её в профиль.",
    nl: "Deze advertentie noemt eisen die je profiel nog niet toont. Ontbrekende informatie is geen afwijzing — heb je het, voeg het dan toe aan je profiel.",
    de: "Diese Anzeige nennt Anforderungen, die dein Profil noch nicht zeigt. Fehlende Angaben sind keine Ablehnung — wenn du sie hast, ergänze dein Profil.",
    pl: "To ogłoszenie podaje wymagania, których Twój profil jeszcze nie pokazuje. Brak informacji nie oznacza niespełnionego wymagania — jeśli je masz, dodaj je do profilu.",
  },
  conflict: {
    en: "One of the stated hard requirements does not match the information in your profile. The conflicting requirement is named below; everything else is shown as it is.",
    lt: "Vienas iš nurodytų privalomų reikalavimų neatitinka tavo profilio informacijos. Neatitinkantis reikalavimas įvardytas žemiau; visa kita rodoma kaip yra.",
    ru: "Одно из обязательных требований не совпадает с информацией в вашем профиле. Оно названо ниже; всё остальное показано как есть.",
    nl: "Een van de gestelde harde eisen komt niet overeen met de informatie in je profiel. De strijdige eis staat hieronder; al het andere wordt getoond zoals het is.",
    de: "Eine der genannten harten Anforderungen passt nicht zu den Angaben in deinem Profil. Sie ist unten benannt; alles andere wird so gezeigt, wie es ist.",
    pl: "Jedno z podanych twardych wymagań nie zgadza się z informacjami w Twoim profilu. Sprzeczne wymaganie jest wymienione poniżej; reszta jest pokazana bez zmian.",
  },
  not_assessed: {
    en: "This advertisement could not be assessed against your profile: it states no readable requirements, or your profile does not yet say what work you do. Nothing here is a verdict.",
    lt: "Šio skelbimo nepavyko įvertinti pagal tavo profilį: jame nėra nuskaitomų reikalavimų arba tavo profilis dar nenurodo, kokį darbą dirbi. Tai nėra išvada.",
    ru: "Это объявление нельзя было сопоставить с вашим профилем: в нём нет распознаваемых требований или ваш профиль ещё не говорит, какую работу вы выполняете. Это не вывод.",
    nl: "Deze advertentie kon niet tegen je profiel worden beoordeeld: ze noemt geen leesbare eisen, of je profiel zegt nog niet welk werk je doet. Dit is geen oordeel.",
    de: "Diese Anzeige konnte nicht mit deinem Profil abgeglichen werden: Sie nennt keine lesbaren Anforderungen, oder dein Profil sagt noch nicht, welche Arbeit du machst. Das ist kein Urteil.",
    pl: "Tego ogłoszenia nie dało się porównać z Twoim profilem: nie podaje czytelnych wymagań albo Twój profil nie mówi jeszcze, jaką pracę wykonujesz. Nic tutaj nie jest werdyktem.",
  },
};

const NOT_MATCHABLE: L = {
  en: "To compare this job with your profile, first say what work you do and which skills you have — a sentence is enough.",
  lt: "Kad galėtume palyginti šį darbą su tavo profiliu, pirmiausia pasakyk, kokį darbą dirbi ir kokius įgūdžius turi — užtenka vieno sakinio.",
  ru: "Чтобы сопоставить эту вакансию с вашим профилем, сначала скажите, какую работу вы выполняете и какие у вас навыки — достаточно одного предложения.",
  nl: "Om deze vacature met je profiel te vergelijken, zeg eerst welk werk je doet en welke vaardigheden je hebt — één zin is genoeg.",
  de: "Um diese Stelle mit deinem Profil zu vergleichen, sag zuerst, welche Arbeit du machst und welche Fähigkeiten du hast — ein Satz genügt.",
  pl: "Aby porównać tę ofertę pracy z Twoim profilem, najpierw napisz, jaką pracę wykonujesz i jakie masz umiejętności — wystarczy jedno zdanie.",
};

const NO_WORKER: L = {
  en: "This account has no worker profile yet, so there is nothing to compare this job against.",
  lt: "Ši paskyra dar neturi darbuotojo profilio, todėl nėra su kuo palyginti šio darbo.",
  ru: "У этого аккаунта пока нет профиля работника, поэтому сравнивать вакансию не с чем.",
  nl: "Dit account heeft nog geen werknemersprofiel, dus er is niets om deze vacature mee te vergelijken.",
  de: "Dieses Konto hat noch kein Arbeitnehmerprofil, daher gibt es nichts, womit diese Stelle verglichen werden könnte.",
  pl: "To konto nie ma jeszcze profilu pracownika, więc nie ma z czym porównać tej oferty pracy.",
};

const INTEREST_TITLE: L = {
  en: "Interested in this job?",
  lt: "Domina šis darbas?",
  ru: "Интересует эта вакансия?",
  nl: "Interesse in deze vacature?",
  de: "Interesse an dieser Stelle?",
  pl: "Interesuje Cię ta oferta pracy?",
};

const ALT_TITLE: L = {
  en: "Other current advertisements in this profession",
  lt: "Kiti šiuo metu galiojantys šios profesijos skelbimai",
  ru: "Другие текущие объявления по этой профессии",
  nl: "Andere actuele advertenties in dit beroep",
  de: "Weitere aktuelle Anzeigen in diesem Beruf",
  pl: "Inne aktualne ogłoszenia w tym zawodzie",
};

const ALT_NOTE: L = {
  en: "Judged by the same requirement comparison as the job above. \"Closer\" means the known requirements are covered better — it is not a ranking of you.",
  lt: "Įvertinti pagal tą patį reikalavimų palyginimą kaip ir darbas aukščiau. „Artimesnis“ reiškia, kad žinomi reikalavimai padengti geriau — tai ne tavo reitingas.",
  ru: "Оценены тем же сравнением требований, что и вакансия выше. «Ближе» означает, что известные требования покрыты лучше — это не ваш рейтинг.",
  nl: "Beoordeeld met dezelfde eisenvergelijking als de vacature hierboven. \"Dichterbij\" betekent dat de bekende eisen beter gedekt zijn — het is geen rangschikking van jou.",
  de: "Beurteilt mit demselben Anforderungsabgleich wie die Stelle oben. „Näher“ heißt, die bekannten Anforderungen sind besser abgedeckt — es ist keine Bewertung deiner Person.",
  pl: "Oceniane tym samym porównaniem wymagań co oferta pracy powyżej. „Bliżej” znaczy, że znane wymagania są lepiej pokryte — to nie jest ranking Twojej osoby.",
};

const ALT_CLOSER: L = {
  en: "Closer on known requirements",
  lt: "Artimesnis pagal žinomus reikalavimus",
  ru: "Ближе по известным требованиям",
  nl: "Dichterbij op bekende eisen",
  de: "Näher bei den bekannten Anforderungen",
  pl: "Bliżej pod względem znanych wymagań",
};

const CLOSED_TITLE: L = {
  en: "This advertisement is no longer open",
  lt: "Šis skelbimas nebegalioja",
  ru: "Это объявление больше не открыто",
  nl: "Deze advertentie is niet meer open",
  de: "Diese Anzeige ist nicht mehr offen",
  pl: "To ogłoszenie nie jest już otwarte",
};

const CLOSED_BODY: L = {
  en: "The publisher withdrew it or its validity period ended. Your account is fine — the job is what changed.",
  lt: "Skelbėjas jį atšaukė arba baigėsi jo galiojimo laikas. Su tavo paskyra viskas gerai — pasikeitė skelbimas.",
  ru: "Источник снял его или истёк срок действия. С вашим аккаунтом всё в порядке — изменилась вакансия.",
  nl: "De aanbieder heeft ze ingetrokken of de geldigheid is verlopen. Met je account is niets mis — de vacature is veranderd.",
  de: "Die ausschreibende Stelle hat sie zurückgezogen oder die Gültigkeit ist abgelaufen. Mit deinem Konto ist alles in Ordnung — die Stelle hat sich geändert.",
  pl: "Wydawca je wycofał albo skończył się okres jego ważności. Z Twoim kontem wszystko w porządku — zmieniła się oferta pracy.",
};

/** A plausible BCP-47 subtag or undefined ("we do not know" ≠ "the page's
 *  language") — the same rule the page applies to its own publisher text. */
function langTag(value: string | null | undefined): string | undefined {
  return /^[a-z]{2,3}(-[A-Za-z0-9]{2,8})*$/.test(value ?? "") ? (value as string) : undefined;
}

/** WHERE-precision of the member's location (work-world grammar): a stated
 *  city is "city", a country alone is "country" — never inferred upward. */
function locationPrecision(
  city: string | null,
  country: string | null,
): "city" | "country" | null {
  if (city && city.trim().length > 0) return "city";
  if (country && country.trim().length > 0) return "country";
  return null;
}

const PLACE_PRECISION: Record<"city" | "country", L> = {
  city: { en: "City", lt: "Miestas", ru: "Город", nl: "Stad", de: "Stadt", pl: "Miasto" },
  country: { en: "Country only", lt: "Tik šalis", ru: "Только страна", nl: "Alleen land", de: "Nur Land", pl: "Tylko kraj" },
};

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
  searchParams,
}: {
  params: Promise<{ locale: string; id: string }>;
  searchParams?: Promise<{ via?: string | string[] }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  const active = resolveActiveLocale(locale);
  // `?via=auth` is put on the page's OWN signup/login `next` below, so the
  // render that follows the auth round trip can be told apart from a plain
  // member visit — the RETURNED_TO_ORIGINAL_JOB step of the funnel. It is a
  // bounded marker, never an id or a secret, and the sanitiser keeps it
  // (it is not on the credential denylist).
  const sp = (await searchParams) ?? {};
  const viaAuth = sp.via === "auth";

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
    ? await getPublicVacancyById(supabase, id)
        .then((r): StoredPublicVacancyV1 | null => (r.status === "ok" ? r.vacancy : null))
        // An unexpected read error is the anonymous half, as the comment
        // above promises — not the route's error boundary. The reader
        // throws on codes other than "no table" / "bad uuid".
        .catch(() => null)
    : null;

  // The member's reading of THIS job: engine verdict, requirement tiers, the
  // existing interest state and same-profession alternatives. `null` for an
  // anonymous visitor and for a member whose ad is no longer live.
  const reading: PublicJobReading | null =
    user && member
      ? await readPublicJobForMember(supabase, user.id, member).catch(
          () => null,
        )
      : null;

  // Saved state for the signed-in worker, read through the CALLER's own client
  // AND filtered to their own worker row. RLS alone is not enough here: the
  // select policy also admits `is_admin()`, so a vacancy-only lookup would show
  // an admin another worker's private bookmark. `available:false` (no worker
  // profile, table/RPC missing, or any read error) renders no control at all —
  // honest invisibility, never a dead button. Anonymous visitors never reach it.
  const workerId = user ? await resolveOwnWorkerId(supabase, user.id) : null;
  const savedState =
    member && workerId
      ? await isPublicVacancySaved(supabase, id, workerId)
      : { saved: false, available: false };

  // JOB A → REGISTER → JOB A. The return path is this exact page; `via=auth`
  // marks the render that closes the loop (see `viaAuth` above).
  const next = encodeURIComponent(`/${active}/jobs/${id}?via=auth`);
  const published = formatUtcDate(preview.publishedAt, active);

  const t = await getTranslations({ locale: active });
  // The comparison speaks the board's OWN vocabulary — criterion names, tier
  // titles, band chips, the ad-side gap words and the interest control's
  // copy all come from the `opportunities` namespace the destination already
  // renders, so the two surfaces can never disagree about a word.
  const to = await getTranslations({ locale: active, namespace: "opportunities" });
  const criterionLabel = (c: string) =>
    to.has(`discovery.criterion.${c}`) ? (to(`discovery.criterion.${c}` as never) as string) : c;
  const tierLabels = {
    blockingTitle: to("discovery.tiers.blocking"),
    strengthsTitle: to("discovery.tiers.strengths"),
    negotiablesTitle: to("discovery.tiers.negotiables"),
    missingTitle: to("discovery.tiers.missing"),
    criterionLabel,
    missingLabel: (side: "worker" | "demand", label: string) =>
      side === "worker"
        ? to("discovery.missing.worker", { criterion: label })
        : to("discovery.missing.demand", { criterion: label }),
  };
  const bandChip = (band: FitBand) => to(`world.chip.${band}` as never) as string;
  const gapLabel = (gap: string) =>
    to.has(`external.gap.${gap}`) ? (to(`external.gap.${gap}` as never) as string) : gap;
  const whyText = (code: string): string | null =>
    to.has(`fitWhy.${code}`)
      ? (to(`fitWhy.${code}` as never) as string)
      : to.has(`gap.${code}`)
        ? (to(`gap.${code}` as never) as string)
        : null;
  const interestLabels = {
    express: to("vacancyInterest.express"),
    sent: to("vacancyInterest.sent"),
    withdraw: to("vacancyInterest.withdraw"),
    consentLabel: to("vacancyInterest.consentLabel"),
    consentHint: to("vacancyInterest.consentHint"),
    handoffQueued: to("vacancyInterest.handoffQueued"),
    handoffQueuedConsentWithheld: to("vacancyInterest.handoffQueuedConsentWithheld"),
    handoffDelivered: to("vacancyInterest.handoffDelivered"),
    handoffClosed: to("vacancyInterest.handoffClosed"),
    handoffTooNew: to("vacancyInterest.handoffTooNew"),
    // A serializable map (client-component prop), one entry per stable code —
    // the same construction the board uses.
    handoffIneligible: Object.fromEntries(
      [
        "worker_not_matchable",
        "not_public_vacancy",
        "vacancy_not_live",
        "interest_not_active",
        "employer_not_identifiable",
        "publication_date_unusable",
      ].map((code) => [
        code,
        to.has(`vacancyInterest.ineligible.${code}`)
          ? (to(`vacancyInterest.ineligible.${code}` as never) as string)
          : to("vacancyInterest.sent"),
      ]),
    ) as Record<string, string>,
    handoffPending: to("vacancyInterest.handoffPending"),
    scopeNote: to("vacancyInterest.scopeNote"),
    error: to("vacancyInterest.error"),
  };
  const ready = reading?.kind === "ready" ? reading : null;
  const whyLine = ready
    ? ready.whyCodes.map(whyText).filter((s): s is string => s !== null).join(" · ")
    : "";
  // Named licence attribution is a MEMBER line: the name identifies the source
  // country, and the licensed content (title, description, employer, apply
  // URL) is only displayed to members anyway. Anonymous visitors get the
  // generic source line.
  let attribution: string | null = ANONYMOUS_SOURCE[active];
  if (member?.attributionCode) {
    try {
      attribution = t(member.attributionCode);
    } catch {
      attribution = ANONYMOUS_SOURCE[active];
    }
  }

  const locationLabel = member
    ? joinLocation(
        member.location.city,
        member.location.region,
        member.location.country,
      )
    : null;

  // LANGUAGE OF PARTS (WCAG 3.1.2). Everything below that came from the
  // PUBLISHER — the title, the occupation label and the full description — is
  // Swedish today, inside a page whose document language is the reader's. Left
  // unmarked, a screen reader reads it with the reader's phonetics, which is
  // not an accent but unintelligible speech; the description is the worst case
  // because it is the longest run of it. Only a plausible subtag is emitted:
  // `undefined` honestly means "we do not know", which is different from
  // "it is the page's language".
  const sourceLang = /^[a-z]{2,3}(-[A-Za-z0-9]{2,8})*$/.test(
    preview.sourceLanguage ?? "",
  )
    ? (preview.sourceLanguage as string)
    : undefined;

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-10 sm:px-6 sm:py-14">
      {/* FUNNEL (acquisition loop P0): one `job_opened` per page view — the
          job it was (opaque store id) and who was looking (anonymous or
          member). `once={false}` because the beacon's tab-session dedupe is
          keyed per event+surface, which would swallow the second job a
          visitor opens; a page view IS the unit here. */}
      <TelemetryView
        event={FUNNEL_EVENTS.jobOpened}
        once={false}
        metadata={{
          surface: user ? "member" : "anonymous",
          ref_type: "public_vacancy",
          ref_id: id,
          success: member !== null || user === null,
        }}
      />
      {user && viaAuth ? (
        <TelemetryView
          event={FUNNEL_EVENTS.jobReturnedAfterAuth}
          once={false}
          metadata={{ surface: "public_job", ref_type: "public_vacancy", ref_id: id }}
        />
      ) : null}
      {ready ? (
        <TelemetryView
          event={FUNNEL_EVENTS.jobCompared}
          once={false}
          metadata={{
            surface: "public_job",
            ref_type: "public_vacancy",
            ref_id: id,
            result_kind: ready.band,
            success: ready.matchable,
          }}
        />
      ) : null}
      {ready && ready.match.missingFacts.length > 0 ? (
        <TelemetryView
          event={FUNNEL_EVENTS.jobMissingInfoShown}
          once={false}
          metadata={{
            surface: "public_job",
            ref_type: "public_vacancy",
            ref_id: id,
            unresolved_unknown_count: ready.match.missingFacts.filter(
              (m) => m.side === "worker",
            ).length,
          }}
        />
      ) : null}
      {ready && ready.alternatives.length > 0 ? (
        <TelemetryView
          event={FUNNEL_EVENTS.jobAlternativesShown}
          once={false}
          metadata={{
            surface: "public_job",
            ref_type: "public_vacancy",
            ref_id: id,
            candidate_count: ready.alternatives.length,
          }}
        />
      ) : null}
      <Link href="/jobs" className="text-sm text-text-muted hover:underline">
        {BACK[active]}
      </Link>
      {user && viaAuth && member ? (
        <p
          className="mt-3 rounded-md border border-state-success/30 bg-state-success/10 px-3 py-2 text-sm"
          data-testid="public-job-returned"
        >
          {RETURNED_NOTE[active]}
        </p>
      ) : null}

      {/* Members see the publisher's own title; anonymous visitors see the
          occupation label — the raw title embeds employer and location wording
          (owner directive 2026-08-24). */}
      <h1
        lang={sourceLang}
        className="mt-4 text-2xl font-semibold tracking-tight sm:text-3xl"
      >
        {member?.titleRaw ?? preview.occupation ?? GENERIC_TITLE[active]}
      </h1>

      {member?.titleRaw && preview.occupation && (
        <p lang={sourceLang} className="mt-2 text-base text-text-muted">
          {preview.occupation}
        </p>
      )}

      {published && (
        <p className="mt-4 text-sm text-text-muted">
          {PUBLISHED[active]}: {published}
        </p>
      )}

      {member ? (
        <>
          <section className="mt-8 space-y-4 rounded-lg border p-5">
            {member.employer.name && (
              <div>
                <h2 className="text-sm font-medium text-text-muted">
                  {EMPLOYER[active]}
                </h2>
                <p className="mt-1 text-base">{member.employer.name}</p>
              </div>
            )}

            {locationLabel && (
              <div>
                <h2 className="text-sm font-medium text-text-muted">
                  {LOCATION[active]}
                </h2>
                <p className="mt-1 flex flex-wrap items-center gap-2 text-base">
                  <span>{locationLabel}</span>
                  {/* The same place-precision chip the map wears: a stated
                      city is cyan fact, a country alone is a dashed
                      approximation. Members only — the anonymous projection
                      carries no location at all. */}
                  {(() => {
                    const kind = locationPrecision(member.location.city, member.location.country);
                    return kind ? (
                      <PlacePrecision kind={kind} label={PLACE_PRECISION[kind][active]} />
                    ) : null;
                  })()}
                </p>
              </div>
            )}
          </section>

          {/* THE ADVERTISEMENT'S LANGUAGE, AND THE READER'S CHOICE
              (owner decision 2026-09-22). A foreign-language ad names its
              language and offers ONE explicit act: render it into the
              reader's language. Nothing is translated on the way here — the
              words below are the publisher's own until a person asks
              otherwise, and they stay on the page afterwards either way. */}
          {sourceLang && sourceLang.slice(0, 2) !== active ? (
            <section className="mt-8" data-testid="vacancy-language">
              <p className="text-sm text-text-muted" data-testid="vacancy-source-language">
                {t("vacancySources.language.originalIn", {
                  language: displayLanguageName(sourceLang, active),
                })}
              </p>
              <VacancyTranslateControl
                vacancyId={id}
                descriptionHeading={DESCRIPTION_HEADING[active]}
                labels={{
                  translate: t("vacancySources.language.translate", {
                    language: displayLanguageName(active, active),
                  }),
                  translating: t("vacancySources.language.translating"),
                  machineNote: t("vacancySources.language.machineNote"),
                  remaining: (count, limit) =>
                    t("vacancySources.language.allowanceRemaining", { count, limit }),
                  exhausted: (limit) =>
                    t("vacancySources.language.allowanceExhausted", { limit }),
                  unavailable: t("vacancySources.language.unavailable"),
                  signedOut: t("vacancySources.language.signedOut"),
                }}
              />
            </section>
          ) : null}

          {member.descriptionRaw.trim().length > 0 && (
            <section className="mt-8">
              <h2 className="text-base font-medium">
                {DESCRIPTION_HEADING[active]}
              </h2>
              {/* The publisher's own words, rendered as TEXT. `whitespace-pre-line`
                  keeps their paragraph breaks without interpreting anything in
                  the string as markup — this is third-party content. */}
              <p
                lang={sourceLang}
                className="mt-2 whitespace-pre-line text-sm leading-relaxed text-text-muted"
              >
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
              <p className="mt-2 text-xs text-text-muted">
                {APPLY_NOTE[active]}
              </p>
            </section>
          )}

          {/* REQUIREMENT BY REQUIREMENT — the ONE engine's reading of this
              job against this person (acquisition loop P0). Categorical,
              never a score: band chip, one honest sentence for the band,
              the hard/weighted/negotiable tiers with the facts still
              missing, and the ad's own unknowns. */}
          <section
            className="mt-8 rounded-lg border p-5"
            data-testid="public-job-comparison"
            data-band={ready ? ready.band : undefined}
          >
            <h2 className="text-base font-medium">{COMPARE_TITLE[active]}</h2>
            {reading === null || reading.kind === "no_worker" ? (
              <>
                <p className="mt-2 text-sm text-text-muted">{NO_WORKER[active]}</p>
                <Link
                  href="/dashboard/profile"
                  className={`${buttonLinkClassName("secondary")} mt-3`}
                >
                  {NEXT_PROFILE[active]}
                </Link>
              </>
            ) : !ready?.matchable ? (
              <>
                <p className="mt-2 text-sm text-text-muted">{NOT_MATCHABLE[active]}</p>
                <Link
                  href="/dashboard/profile"
                  className={`${buttonLinkClassName("primary")} mt-3`}
                >
                  {NEXT_PROFILE[active]}
                </Link>
              </>
            ) : (
              <>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <FitBandChip band={ready.band} label={bandChip(ready.band)} />
                  {whyLine ? (
                    <span className="text-sm text-text-muted" data-testid="public-job-why">
                      {whyLine}
                    </span>
                  ) : null}
                </div>
                <p className="mt-3 text-sm text-text-muted">
                  {BAND_SENTENCE[ready.band][active]}
                </p>
                <div className="mt-4">
                  <MatchTierExplanation
                    blocking={ready.match.blocking}
                    strengths={ready.match.strengths}
                    negotiables={ready.match.negotiables}
                    missingFacts={ready.match.missingFacts}
                    labels={tierLabels}
                    testId="public-job-tiers"
                  />
                </div>
                {ready.adGaps.length > 0 ? (
                  <p className="mt-4 text-xs text-text-muted" data-testid="public-job-ad-gaps">
                    {to("external.gapsTitle")}: {ready.adGaps.map(gapLabel).join(", ")}
                  </p>
                ) : null}
              </>
            )}
          </section>

          {/* THE ONE WORKER ACTION on a public ad — the existing "I want this
              job" control, exactly as the board mounts it (same labels, same
              consent question, same server action). Rendered only when the
              interest store admits a vacancy source and the person has a
              worker row; never a dead button. */}
          {ready && ready.interestAvailable && member.storeId ? (
            <section className="mt-8" data-testid="public-job-interest">
              <h2 className="text-base font-medium">{INTEREST_TITLE[active]}</h2>
              <div className="mt-3">
                <VacancyInterestButton
                  locale={active}
                  vacancyId={member.storeId}
                  initialStatus={ready.interest.status}
                  initialHandoff={ready.interest.handoff}
                  labels={interestLabels}
                />
              </div>
            </section>
          ) : null}

          {/* NOT A DEAD END. Beside anything short of a full fit, other
              current ads of the same profession, judged by the same engine.
              "Closer" is coverage of known requirements — never "better for
              you", never a rank of the person. */}
          {ready && ready.alternatives.length > 0 ? (
            <section className="mt-8" data-testid="public-job-alternatives">
              <h2 className="text-base font-medium">{ALT_TITLE[active]}</h2>
              <p className="mt-1 text-xs text-text-muted">{ALT_NOTE[active]}</p>
              <ul className="mt-3 space-y-2">
                {ready.alternatives.map((alt) => (
                  <li key={alt.vacancyId} className="rounded-md border p-3">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <Link
                        href={`/jobs/${alt.vacancyId}`}
                        // Each alternative is its OWN publisher's text — its
                        // own language tag, never this page's.
                        lang={langTag(alt.sourceLanguage)}
                        className="font-medium hover:underline"
                      >
                        {alt.title}
                      </Link>
                      <FitBandChip band={alt.band} label={bandChip(alt.band)} />
                    </div>
                    <p className="mt-1 text-xs text-text-muted">
                      {[alt.employerName, alt.city, alt.country].filter(Boolean).join(" · ")}
                      {alt.closerThanCurrent ? ` · ${ALT_CLOSER[active]}` : ""}
                    </p>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

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
            <p className="mt-1 text-sm text-text-muted">
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
      ) : user ? (
        /* A MEMBER whose member read returned nothing: the ad went inactive or
           expired between the anonymous preview and the member read. Telling
           a signed-in person to "create a free account" was the old defect in
           a new place — say what actually changed and offer the board. */
        <section
          className="mt-8 rounded-lg border border-dashed p-5"
          data-testid="public-job-closed"
        >
          <h2 className="text-base font-medium">{CLOSED_TITLE[active]}</h2>
          <p className="mt-1 text-sm text-text-muted">{CLOSED_BODY[active]}</p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Link
              href="/dashboard/opportunities"
              className={buttonLinkClassName("primary")}
            >
              {NEXT_OPPORTUNITIES[active]}
            </Link>
          </div>
        </section>
      ) : (
        <section className="mt-8 rounded-lg border border-dashed p-5">
          <h2 className="text-base font-medium">{LOCKED_TITLE[active]}</h2>
          <p className="mt-1 text-sm text-text-muted">{LOCKED_BODY[active]}</p>
          <div className="mt-4 flex flex-wrap gap-2">
            {/* REGISTRATION_CTA of the funnel: the same `cta_clicked` event
                every acquisition CTA emits, with a stable id per control and
                the visitor's first-touch attribution merged in. */}
            <TrackedCta
              ctaId="public_job_signup"
              audience="workers"
              href={`/auth/signup?next=${next}`}
              className={buttonLinkClassName("primary")}
            >
              {CTA_SIGNUP[active]}
            </TrackedCta>
            <TrackedCta
              ctaId="public_job_login"
              audience="workers"
              href={`/auth/login?next=${next}`}
              className={buttonLinkClassName("secondary")}
            >
              {CTA_LOGIN[active]}
            </TrackedCta>
          </div>
        </section>
      )}

      {attribution && (
        <p className="mt-8 text-xs text-text-muted">{attribution}</p>
      )}
    </main>
  );
}
