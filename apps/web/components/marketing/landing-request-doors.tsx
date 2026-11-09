import { getTranslations } from "next-intl/server";

import {
  LandingRequestDoorsForm,
  type RequestDoorLabels,
} from "@/components/marketing/landing-request-doors-form";
import { Link } from "@/lib/i18n/navigation";
import { countryOptionsForLocale } from "@/lib/location/country-options";

/**
 * THREE WORKING REQUEST DOORS, NO SIGN-UP (owner P0 2026-11-07). They sit under the
 * hero and the three ways; the sign-up invitations above stay for people who serve
 * themselves. The form and its rules: `landing-request-doors-form.tsx`,
 * `lib/staffing/request-doors.ts`. No documents: no safe public upload path exists.
 */
export async function LandingRequestDoors({ locale }: { readonly locale: string }) {
  const t = await getTranslations("landing.requestDoors");
  const labels: RequestDoorLabels = {
    doors: {
      "worker-search": { title: t("workerSearch.title"), body: t("workerSearch.body") },
      b2b: { title: t("b2b.title"), body: t("b2b.body") },
      project: { title: t("project.title"), body: t("project.body") },
    },
    name: t("name"),
    email: t("email"),
    phone: t("phone"),
    country: t("country"),
    countryChoose: t("countryChoose"),
    city: t("city"),
    profession: t("profession"),
    workers: t("workers"),
    start: t("start"),
    details: t("details"),
    work: t("work"),
    place: t("place"),
    scope: t("scope"),
    deadline: t("deadline"),
    need: t("need"),
    customer: t("customer"),
    customerPrivate: t("customerPrivate"),
    customerBusiness: t("customerBusiness"),
    optional: t("optional"),
    send: t("send"),
    sending: t("sending"),
    receivedTitle: t("receivedTitle"),
    receivedBody: t("receivedBody"),
    invalid: t("invalid"),
    limited: t("limited"),
    unavailable: t("unavailable"),
  };
  const countries = countryOptionsForLocale(locale).map((o) => ({ code: o.value, label: o.label }));
  return (
    <section className="mt-8 scroll-mt-24" id="request" aria-labelledby="request-doors-title" data-testid="landing-request-doors">
      <h2 id="request-doors-title" className="font-display text-2xl font-bold tracking-tightest text-text-primary">
        {t("title")}
      </h2>
      <p className="mb-4 mt-1 text-sm leading-relaxed text-text-secondary" data-testid="request-doors-promise">
        {t("promise")}
      </p>
      <LandingRequestDoorsForm
        labels={labels}
        countries={countries}
        notice={t.rich("notice", {
          privacy: (chunks) => (
            <Link href="/legal/privacy" className="underline hover:text-text-primary">
              {chunks}
            </Link>
          ),
        })}
      />
    </section>
  );
}
