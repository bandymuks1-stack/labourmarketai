import { getTranslations } from "next-intl/server";

import { AthleteProfileView, type AthleteTranslator } from "@/components/app/cv/athlete-profile-view";
import { roundHours } from "@/lib/cv-export/professional-summary";
import type { VerifiedCvData } from "@/lib/cv-export/verified-cv";
import { buildAthleteProfile, seasonPhotoProjects, withSeasonPhotos } from "@/lib/cv/athlete-profile";
import { readAthleteProfileFacts, readSeasonPhotos } from "@/lib/cv/athlete-profile-read";
import { durationLocale, formatDuration } from "@/lib/journal/format-duration";
import { countryDisplayName } from "@/lib/location/country-model";
import { viewerWorkToday } from "@/lib/time/viewer-day";
import { WORKER_LANGUAGE_NATIVE_NAMES } from "@/lib/worker/worker-languages-model";

/**
 * `/{locale}/cv?template=profile`: the athlete-profile form of the Living CV,
 * built from the CV the page already read. buildVerifiedCv only ever reads the
 * signed-in person's own CV, so this reader IS the person. A page root of its
 * own, because this form renders none of the default CV's toolbar or register.
 */
export async function AthleteProfilePage({
  cv,
  locale,
  profileId,
}: {
  readonly cv: VerifiedCvData;
  readonly locale: string;
  readonly profileId: string | null;
}) {
  const [a, tCv, premium, orgHistory, tier, journey, tDisclosure, tProf, tSkill, tRel, tDocTypes, facts, today] =
    await Promise.all([
      getTranslations("cvExport.athlete"),
      getTranslations("cvExport"),
      getTranslations("cvExport.premium"),
      getTranslations("cvOrganizationHistory"),
      getTranslations("evidenceTier"),
      getTranslations("careerJourney"),
      getTranslations("common.disclosure"),
      getTranslations("professions"),
      getTranslations("skillNames"),
      getTranslations("relationshipTypes"),
      getTranslations("documents.types"),
      readAthleteProfileFacts(profileId),
      viewerWorkToday(),
    ]);

  const base = buildAthleteProfile({
    cv,
    names: {
      skill: (slug) => (tSkill.has(slug as never) ? tSkill(slug as never) : slug),
      profession: (slug) => (tProf.has(slug as never) ? tProf(slug as never) : null),
      relationship: (slug) => (tRel.has(slug as never) ? tRel(slug as never) : slug),
      documentType: (slug) => (tDocTypes.has(slug as never) ? tDocTypes(slug as never) : slug),
      language: (code) =>
        WORKER_LANGUAGE_NATIVE_NAMES[code as keyof typeof WORKER_LANGUAGE_NATIVE_NAMES] ?? code.toUpperCase(),
    },
    place: facts.countryCode ? countryDisplayName(facts.countryCode, locale) : null,
    portraitUrl: facts.portraitUrl,
    todayIso: today.todayIso,
    readerIsThePerson: true,
  });
  const profile = withSeasonPhotos(base, await readSeasonPhotos(seasonPhotoProjects(base)), facts.workerId);

  return (
    <main className="cv-doc min-h-screen bg-ink-900 px-4 py-6 text-text-primary sm:px-6 sm:py-10 print:p-0">
      <div className="mx-auto max-w-3xl">
        <AthleteProfileView
          profile={profile}
          locale={locale}
          formatHours={(h) => formatDuration(roundHours(h), "hours", durationLocale(locale), { splitFractions: false })}
          copy={{
            a: a as unknown as AthleteTranslator,
            cv: tCv as unknown as AthleteTranslator,
            premium: premium as unknown as AthleteTranslator,
            orgHistory: orgHistory as unknown as AthleteTranslator,
            tier: tier as unknown as AthleteTranslator,
            journey: journey as unknown as AthleteTranslator,
            showAll: (count) => tDisclosure("showAll", { count }),
          }}
        />
      </div>
    </main>
  );
}
