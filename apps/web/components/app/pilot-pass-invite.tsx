import { getTranslations } from "next-intl/server";

import { Link } from "@/lib/i18n/navigation";
import { PILOT_PASS_DAYS } from "@/lib/billing/pilot-pass-core";
import { readPilotPassOffer } from "@/lib/billing/pilot-pass-offer";
import { buttonLinkClassName } from "@/components/ui/Button";

/**
 * A one-line pointer to the organization pilot pass for the places an
 * employer looks for a plan — the pricing page and the employer home. It
 * shows ONLY to a person who may start the pass (or must first choose the
 * organization's workspace), and only links to the account section, where the
 * terms are stated before payment. Nothing is offered to anyone else.
 */
export async function PilotPassInvite({ className }: { className?: string }) {
  const offer = await readPilotPassOffer();
  const payable = offer.kind === "here" && offer.gate.ok;
  if (!payable && offer.kind !== "elsewhere") return null;

  const t = await getTranslations("pilotPass");
  const days = String(PILOT_PASS_DAYS);

  return (
    <aside
      data-testid="pilot-pass-invite"
      data-offer={offer.kind}
      className={`flex flex-col gap-2 rounded-md border border-brand-blue/40 bg-brand-blue/5 px-4 py-3 sm:flex-row sm:items-center sm:justify-between ${className ?? ""}`}
    >
      <div className="flex min-w-0 flex-col gap-1">
        <p className="text-sm font-semibold text-text-primary">{t("title", { days })}</p>
        <p className="text-meta text-text-secondary">
          {offer.kind === "elsewhere"
            ? t("elsewhere", { organization: offer.organizationName })
            : t("invite.line", { days })}
        </p>
      </div>
      {payable ? (
        <Link
          href="/dashboard/account#pilot-pass"
          data-testid="pilot-pass-invite-open"
          className={`${buttonLinkClassName("primary", "sm")} shrink-0`}
        >
          {t("invite.cta")}
        </Link>
      ) : null}
    </aside>
  );
}
