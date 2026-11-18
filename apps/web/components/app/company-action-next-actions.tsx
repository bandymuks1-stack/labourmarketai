import type { ReactNode } from "react";
import { getTranslations } from "next-intl/server";
import { ArrowRight } from "lucide-react";
import { Link } from "@/lib/i18n/navigation";
import { ExplainMore } from "@/components/app/premium/disclosure";

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
  extra,
}: {
  readonly room: CompanyActionRoomKey;
  readonly primaryHref?: string;
  /** The room's own extra explanation, folded into the SAME single
   *  disclosure so a page never stacks two "How this works" lines. */
  readonly extra?: ReactNode;
}) {
  const t = await getTranslations(`companyActionRooms.${room}`);
  // Calm room lead (owner 2026-10-10: no text walls): ONE sentence and the
  // room's first action in view; the three-step flow and "what happens next"
  // one tap away. Nothing removed; ids kept for the guards and walks.
  return (
    <section className="flex flex-col gap-2" data-testid="company-action-next-actions">
      <h2 className="sr-only">{t("whatTitle")}</h2>
      <p className="max-w-[62ch] text-support leading-relaxed text-text-secondary">{t("whatBody")}</p>
      {primaryHref ? (
        <Link
          href={primaryHref as "/dashboard"}
          data-testid="company-action-primary"
          className="inline-flex min-h-11 items-center gap-1.5 self-start rounded-md bg-gradient-cta px-4 py-2 text-sm font-semibold text-text-on-brand transition-opacity hover:opacity-95"
        >
          {t("primaryLabel")}
          <ArrowRight className="h-4 w-4" strokeWidth={2} aria-hidden />
        </Link>
      ) : null}
      <ExplainMore>
        <ol className="flex flex-col gap-1.5" data-testid="company-action-flow">
          {(["step1", "step2", "step3"] as const).map((step, i) => (
            <li key={step} className="flex items-start gap-2">
              <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-ink-500 font-mono text-meta text-text-secondary">
                {i + 1}
              </span>
              <span className="leading-relaxed">{t(`flow.${step}`)}</span>
            </li>
          ))}
        </ol>
        <p>{t("nextLine")}</p>
        {extra}
      </ExplainMore>
    </section>
  );
}
