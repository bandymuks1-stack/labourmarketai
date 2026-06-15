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
