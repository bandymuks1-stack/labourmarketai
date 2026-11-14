import { getTranslations } from "next-intl/server";

import { AgencySuggestionCard } from "@/components/app/home/agency-suggestion-card";
import { readAgencySuggestionsForMe } from "@/lib/agency/agency-suggestion";

/**
 * THE AGENCY SUGGESTION ON THE WORKER HOME.
 *
 * The database decides who sees it (list_agency_suggestions_for_me_v1): a
 * worker no agency represents, who was never on this agency's list. Anyone
 * else — and everyone while the migration is not applied — sees nothing.
 * One suggestion at a time; the agency is named by its own record, never by
 * code.
 */
export async function HomeAgencySuggestion() {
  const suggestions = await readAgencySuggestionsForMe();
  const first = suggestions[0];
  if (!first) return null;
  const t = await getTranslations("agencySuggestion");
  const agency = first.agencyName;
  return (
    <AgencySuggestionCard
      companyId={first.companyId}
      consentTextVersion={first.consentTextVersion}
      labels={{
        eyebrow: t("eyebrow"),
        title: t("title", { agency }),
        body: t("body", { agency }),
        leave: t("leave"),
        consent: t("consent", { agency }),
        join: t("join"),
        joining: t("joining"),
        notNow: t("notNow"),
        joined: t("joined", { agency }),
        errors: {
          consent_required: t("errors.consentRequired"),
          consent_text_changed: t("errors.consentTextChanged"),
          represented_elsewhere: t("errors.representedElsewhere"),
          already_known: t("errors.alreadyKnown"),
          not_available: t("errors.notAvailable"),
          no_worker_profile: t("errors.noWorkerProfile"),
          needs_migration: t("errors.notAvailable"),
          auth: t("errors.auth"),
          error: t("errors.error"),
        },
      }}
    />
  );
}
