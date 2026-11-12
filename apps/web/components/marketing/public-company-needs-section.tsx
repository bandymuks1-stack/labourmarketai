import { getTranslations } from "next-intl/server";

import { Link } from "@/lib/i18n/navigation";
import type { PublicCompanyNeed } from "@/lib/opportunities/public-company-needs-model";
import { buildWorkTypeLabelMap } from "@/lib/taxonomy/work-categories";

/**
 * NEEDS POSTED BY COMPANIES — the public /jobs section (owner decision V-1,
 * 2026-11-12).
 *
 * Renders ONLY the nine columns `list_public_company_needs_v1` returns: role,
 * country, place, team size, start, date, company name and whether the company
 * is confirmed. There is no contact, poster, description or link field to
 * render — the database never sends one — so this component cannot leak it.
 *
 * A company that is not verified is SAID so ("Company not confirmed") on every
 * card. A verified company gets the same "Verified company" wording the worker
 * board uses. No other badge exists (SEP-3 EVIDENCE != VERIFICATION).
 *
 * WHO is listed is not decided here: the database's one rule
 * (`need_public_state_v1`) already held every incomplete or suspicious need.
 */
export async function PublicCompanyNeedsSection({
  needs,
  signedIn,
  locale,
}: {
  readonly needs: readonly PublicCompanyNeed[];
  readonly signedIn: boolean;
  readonly locale: string;
}) {
  if (needs.length === 0) return null;
  const t = await getTranslations("publicCompanyNeeds");
  const tOpp = await getTranslations("opportunities");
  const workLabels = buildWorkTypeLabelMap(locale);
  const regionName = (() => {
    try {
      return new Intl.DisplayNames([locale], { type: "region" });
    } catch {
      return null;
    }
  })();
  const roleLabel = (slug: string | null): string => {
    if (!slug) return t("roleUnknown");
    return workLabels[slug] ?? slug;
  };
  const countryLabel = (code: string | null): string | null => {
    if (!code) return null;
    try {
      return regionName?.of(code) ?? code;
    } catch {
      return code;
    }
  };

  return (
    <section
      aria-labelledby="public-company-needs-title"
      className="mt-8 rounded-md border p-4 sm:p-5"
      data-testid="public-company-needs"
    >
      <h2 id="public-company-needs-title" className="text-lg font-semibold tracking-tight">
        {t("title")}
      </h2>
      <p className="mt-1 text-sm text-text-muted">{t("intro")}</p>
      <ul className="mt-4 space-y-3">
        {needs.map((n) => {
          const place = [n.locationLabel, countryLabel(n.country)].filter(Boolean).join(" · ");
          return (
            <li
              key={n.id}
              className="rounded-md border p-3"
              data-testid={`public-company-need-${n.id}`}
              data-company-confirmed={n.companyConfirmed ? "true" : "false"}
            >
              <p className="font-medium text-text-primary">{roleLabel(n.roleText)}</p>
              <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-text-secondary">
                {n.companyName ? <span>{n.companyName}</span> : null}
                {n.companyConfirmed ? (
                  <span
                    className="rounded-sm border border-state-success/40 px-1.5 py-0.5 font-mono text-meta uppercase tracking-label text-state-success"
                    data-testid="public-company-need-verified"
                  >
                    {tOpp("companyVerified")}
                  </span>
                ) : (
                  <span
                    className="rounded-sm border border-state-warning/40 px-1.5 py-0.5 font-mono text-meta uppercase tracking-label text-state-warning"
                    data-testid="public-company-need-not-confirmed"
                  >
                    {tOpp("companyNotConfirmed")}
                  </span>
                )}
              </p>
              <p className="mt-1 text-meta text-text-muted">
                {[place || null, n.teamSize ? t("people", { count: n.teamSize }) : null]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
              <Link
                href={signedIn ? "/dashboard/opportunities" : "/auth/login?next=/dashboard/opportunities"}
                className="mt-2 inline-block text-sm underline underline-offset-4"
                locale={locale}
              >
                {signedIn ? t("openBoard") : t("respond")}
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
