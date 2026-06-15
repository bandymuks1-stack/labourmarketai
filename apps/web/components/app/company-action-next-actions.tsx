import { getTranslations } from "next-intl/server";
import { ArrowRight } from "lucide-react";
import { Link } from "@/lib/i18n/navigation";

/**
 * Reusable practical "next actions" card for the company action rooms
 * (/dashboard/company, /candidates, /buyer, /agency, /projects). Keeps the
 * five rooms consistent: WHAT you do here → the FIRST clear action → WHAT
 * happens next. Short, no SaaS jargon, no fake data.
 *
 * Copy lives in the `companyActionRooms.<room>` i18n namespace (en/lt/ru).
 * `primaryHref` is the room's real first-action route (passed by the page so
 * it always points at an existing destination).
 */
export type CompanyActionRoomKey =
  | "company"
  | "candidates"
  | "buyer"
  | "agency"
  | "projects";

export async function CompanyActionNextActions({
  room,
  primaryHref,
}: {
  readonly room: CompanyActionRoomKey;
  readonly primaryHref?: string;
}) {
  const t = await getTranslations(`companyActionRooms.${room}`);
  return (
    <section
      className="card-border flex flex-col gap-2 p-4"
      data-testid="company-action-next-actions"
    >
      <h2 className="font-display text-base font-semibold text-text-primary">
        {t("whatTitle")}
      </h2>
      <p className="text-sm leading-relaxed text-text-secondary">{t("whatBody")}</p>
      {/* Practical 3-step flow: what to fill/choose → what the system does
          next → the human action after. Operational copy, no fake data. */}
      <ol
        className="mt-1 flex flex-col gap-1.5"
        data-testid="company-action-flow"
      >
        {(["step1", "step2", "step3"] as const).map((step, i) => (
          <li key={step} className="flex items-start gap-2 text-sm text-text-secondary">
            <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-brand-blue/40 font-mono text-[11px] text-brand-blue">
              {i + 1}
            </span>
            <span className="leading-relaxed">{t(`flow.${step}`)}</span>
          </li>
        ))}
      </ol>
      {primaryHref ? (
        <Link
          href={primaryHref as "/dashboard"}
          data-testid="company-action-primary"
          className="mt-1 inline-flex items-center gap-1.5 self-start rounded-md bg-gradient-cta px-4 py-2 text-sm font-semibold text-white shadow-cta-glow transition-opacity hover:opacity-95"
        >
          {t("primaryLabel")}
          <ArrowRight className="h-4 w-4" strokeWidth={2} aria-hidden />
        </Link>
      ) : null}
      <p className="text-xs leading-relaxed text-text-muted">{t("nextLine")}</p>
    </section>
  );
}
