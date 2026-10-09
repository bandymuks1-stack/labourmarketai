import { getTranslations } from "next-intl/server";

import { Link } from "@/lib/i18n/navigation";
import { formatUtcDate } from "@/lib/time/display";
import { readMyLedOrganizations } from "@/lib/organization-evidence/my-organizations-read";

/**
 * ORGANIZATIONS AND LEADERSHIP — the person's own profile and Living CV.
 *
 * The organizations this person owns or manages, each with the business
 * periods stated for it (e.g. an earlier Vivat Rex period of a continuing
 * business) and a door into that organization's business history. Leadership
 * is a relationship to an organization — kept apart from the person's own
 * recorded work, never converted into personal hours. Renders nothing for a
 * person who leads no organization; says UNKNOWN when the read failed.
 */
export async function OrganizationsLeadership({
  locale,
  variant = "profile",
}: {
  readonly locale: string;
  readonly variant?: "profile" | "cv";
}) {
  const read = await readMyLedOrganizations();
  const t = await getTranslations("organizationsLeadership");
  if (read.kind === "unavailable") {
    return (
      <p className="text-meta text-text-muted" data-testid="organizations-leadership-unavailable">
        {t("unavailable")}
      </p>
    );
  }
  if (read.organizations.length === 0) return null;
  const date = (iso: string | null) =>
    iso ? (formatUtcDate(iso, locale, { month: "short", year: "numeric" }) ?? iso) : t("notDocumented");

  return (
    <section
      id="organizations-leadership"
      className="flex scroll-mt-20 flex-col gap-4"
      data-testid="organizations-leadership"
      data-variant={variant}
      data-count={read.organizations.length}
    >
      <header className="flex flex-col gap-1">
        <span className="font-mono text-[0.7rem] uppercase tracking-[0.14em] text-text-muted">{t("eyebrow")}</span>
        <h2 className="font-display text-xl font-semibold tracking-[-0.02em] text-text-primary">{t("title")}</h2>
        <p className="max-w-[60ch] text-sm text-text-secondary">{t("subtitle")}</p>
      </header>
      <ol className="flex flex-col">
        {read.organizations.map((o) => (
          <li
            key={o.organizationId}
            className="flex flex-col gap-2 border-t border-text-primary/10 py-4 first:border-t-0"
            data-testid="organizations-leadership-row"
            data-relationship={o.relationship}
          >
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <p className="font-display text-lg font-semibold text-text-primary">
                {o.name || <span className="italic text-text-muted">{t("unnamed")}</span>}
              </p>
              <span className="text-meta text-text-muted">{t(`role.${o.relationship}`)}</span>
            </div>
            {o.periods.map((p) => (
              <p key={p.id} className="text-sm text-text-secondary" data-testid="organizations-leadership-period">
                {t("period", {
                  label: p.periodLabel,
                  from: date(p.periodStart),
                  to: date(p.periodEnd),
                })}{" "}
                <span className="text-text-muted">
                  · {t(`basis.${p.basis}`)} · {t(`relation.${p.legalEntityRelation === "not_asserted" ? "not_asserted" : "stated"}`)}
                </span>
              </p>
            ))}
            <Link
              href={`/dashboard/company/history?org=${o.organizationId}` as "/dashboard"}
              className="inline-flex min-h-11 w-fit items-center text-sm font-semibold text-brand-blue hover:underline"
              data-testid="organizations-leadership-history-link"
            >
              {t("openHistory")} →
            </Link>
          </li>
        ))}
      </ol>
      <p className="text-meta text-text-muted">{t("note")}</p>
    </section>
  );
}
