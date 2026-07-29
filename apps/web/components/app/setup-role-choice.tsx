import { getTranslations } from "next-intl/server";
import { Link } from "@/lib/i18n/navigation";

/**
 * Neutral role-choice guide (slice remove-wrong-agency-gate; simplified in
 * slice company-role-simplicity-v1).
 *
 * The START choice is intentionally simple: a person either WORKS themselves
 * (worker) or REPRESENTS A COMPANY. An agency is NOT a separate root role —
 * it is a company whose type is 'staffing_agency'; a client/requester
 * organisation is a company whose type is 'client_customer'. Both are picked
 * inside the ONE canonical company profile (/dashboard/start/company).
 * The candidate/provider DRAFT path stays surfaced honestly (not registered /
 * not verified / draft / can be linked later) WITHOUT creating any fake
 * account, consent, or verification.
 */

const OPTIONS = [
  { key: "offerWork", href: "/dashboard/profile", testid: "role-choice-worker" },
  { key: "representCompany", href: "/dashboard/start/company", testid: "role-choice-company" },
] as const;

export async function SetupRoleChoice() {
  const t = await getTranslations("setupRoleChoice");
  return (
    <section
      className="card-border flex flex-col gap-4 p-6"
      data-testid="setup-role-choice"
    >
      <header className="flex flex-col gap-1">
        <h2 className="font-display text-xl font-semibold text-text-primary">
          {t("title")}
        </h2>
        <p className="max-w-prose text-sm leading-relaxed text-text-secondary">
          {t("body")}
        </p>
      </header>

      <ul className="grid gap-2 sm:grid-cols-2">
        {OPTIONS.map((o) => (
          <li key={o.key}>
            <Link
              href={o.href as "/dashboard"}
              className="flex flex-col gap-0.5 rounded-md border border-ink-600 p-3 transition-colors hover:border-brand-cyan"
              data-testid={o.testid}
            >
              <span className="text-sm font-medium text-text-primary">
                {t(`options.${o.key}.label`)}
              </span>
              <span className="text-meta leading-relaxed text-text-secondary">
                {t(`options.${o.key}.hint`)}
              </span>
            </Link>
          </li>
        ))}
      </ul>

      <div
        className="flex flex-col gap-2 rounded-md border border-ink-600 bg-ink-800/40 p-4"
        data-testid="candidate-draft-note"
      >
        <h3 className="font-display text-sm font-semibold text-text-primary">
          {t("draft.title")}
        </h3>
        <p className="text-meta leading-relaxed text-text-secondary">{t("draft.body")}</p>
        <div className="flex flex-wrap gap-1.5">
          {(["notRegistered", "notVerified", "draft", "canLinkLater"] as const).map((k) => (
            <span
              key={k}
              className="rounded-full border border-ink-600 px-2 py-0.5 text-meta uppercase tracking-label text-text-muted"
            >
              {t(`draft.labels.${k}`)}
            </span>
          ))}
        </div>
        <Link
          href={"/dashboard/candidates" as "/dashboard"}
          className="self-start text-meta font-medium text-brand-cyan hover:underline"
          data-testid="role-choice-candidates-link"
        >
          {t("draft.cta")} →
        </Link>
      </div>
    </section>
  );
}
