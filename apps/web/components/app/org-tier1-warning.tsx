import { getTranslations } from "next-intl/server";

/**
 * Tier-1 organisation-profile warning, shown above company / agency /
 * buyer workspace pages. Sets expectations honestly: drafts stay
 * private until the owner decides otherwise; serious operation will later require
 * organisation rekvizitai (country, legal name, registration code,
 * correspondence address, representative role).
 *
 * Doc-only policy lives at:
 *   docs/policies/organization-profile-creation-policy-v1.md
 *   docs/audit/organization-profile-creation-gap-audit-v1.md
 *
 * v1 ships only this copy. Organisation verification + rekvizitai gating
 * are separate, careful slices (see the audit doc).
 */
export async function OrgTier1Warning() {
  const t = await getTranslations("orgTier1Warning");
  return (
    <section
      className="card-border bg-brand-blue/5 p-3 text-xs leading-relaxed text-text-secondary"
      data-testid="org-tier1-warning"
    >
      <p className="font-mono text-meta uppercase tracking-label text-brand-blue">
        {t("eyebrow")}
      </p>
      <p className="mt-1">{t("body")}</p>
    </section>
  );
}
