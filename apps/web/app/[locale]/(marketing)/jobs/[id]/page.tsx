import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { setRequestLocale, getTranslations } from "next-intl/server";
import { Link } from "@/lib/i18n/navigation";
import { buttonLinkClassName } from "@/components/ui/Button";
import { resolveActiveLocale } from "@/lib/seo/metadata";
import type { ActiveLocale } from "@/lib/i18n/config";
import { getPublicVacancyPreview } from "@/lib/vacancy-store/public-vacancy-preview";
import { formatUtcDate } from "@/lib/time/display";

/**
 * ONE PUBLIC JOB PAGE — the indexable unit of the acquisition funnel.
 *
 * Shows the anonymous projection and then asks for an account to reveal the
 * rest. The restricted half (employer, location, full description, application
 * URL) is never fetched on this route, so "locked" is a statement of fact about
 * this request, not a CSS overlay hiding data that was already sent.
 *
 * ── WHY THERE IS NO JobPosting JSON-LD HERE ────────────────────────────────
 * Google's JobPosting schema REQUIRES `hiringOrganization` and `jobLocation`.
 * Both are restricted fields under the owner's anonymous-visibility rule, so a
 * schema block on this page could only be built by either leaking them or
 * fabricating them. Emitting an incomplete JobPosting would also produce
 * structured-data errors and could be read as a false claim about the ad. The
 * page is therefore indexable as ordinary content with correct metadata, and
 * carries no JobPosting markup. Turning rich job results on is a product
 * decision about what may appear anonymously — recorded, not silently taken.
 */
export const revalidate = 3600;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}): Promise<Metadata> {
  const { locale, id } = await params;
  const active = resolveActiveLocale(locale);
  const preview = await getPublicVacancyPreview(id);

  if (preview === "not_provisioned" || preview === null) {
    return { title: "—", robots: { index: false, follow: false } };
  }

  // Title and category only. No employer, no location — the same restriction
  // that governs the body governs the metadata, OpenGraph and the tab title.
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

const SOURCE: L = {
  en: "Source",
  lt: "Šaltinis",
  ru: "Источник",
  nl: "Bron",
  de: "Quelle",
};

export default async function JobDetailPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  const active = resolveActiveLocale(locale);

  const preview = await getPublicVacancyPreview(id);
  if (preview === null || preview === "not_provisioned") notFound();

  // The locale-prefixed return path, consumed by the auth forms' existing
  // `?next=` handling (which passes it through getSafeReturnPath, so this
  // cannot become an open redirect).
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

      {attribution && (
        <p className="mt-8 text-xs text-muted-foreground">
          {SOURCE[active]}: {attribution}
        </p>
      )}
    </main>
  );
}
