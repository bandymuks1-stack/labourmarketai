"use client";

import { useActionState } from "react";
import { useLocale, useTranslations } from "next-intl";

import {
  markCanOfferAction,
  type CanOfferState,
} from "@/lib/agency/pool-actions";

/**
 * "Galim pasiūlyti" (S5) — one explicit tap that records the agency's
 * PROPOSAL on an open request (append-only payload marker via the gated
 * draft RPC). It is NOT a match and the button says so via the surrounding
 * copy; the match decision stays human at the admin workbench.
 */
export function CanOfferButton({ requestId }: { requestId: string }) {
  const t = useTranslations("agencyPool.demand");
  const locale = useLocale();
  const [state, action, pending] = useActionState<CanOfferState, FormData>(
    markCanOfferAction,
    null,
  );

  if (state?.outcome === "marked" || state?.outcome === "already_marked") {
    return (
      <span
        className="rounded-md border border-state-success/40 bg-state-success/10 px-3 py-1.5 text-xs font-medium text-state-success"
        role="status"
        data-testid="can-offer-done"
      >
        {t("marked")}
      </span>
    );
  }

  return (
    <form action={action} className="flex items-center gap-2">
      <input type="hidden" name="request_id" value={requestId} />
      <input type="hidden" name="locale" value={locale} />
      <button
        type="submit"
        disabled={pending}
        className="inline-flex min-h-9 items-center rounded-md border border-brand-blue/40 px-3 py-1.5 text-xs font-medium text-brand-blue transition-colors duration-fast hover:bg-brand-blue/10 disabled:opacity-50"
        data-testid="can-offer-button"
      >
        {pending ? t("marking") : t("markButton")}
      </button>
      {state ? (
        <span className="text-[11px] text-state-warning" role="status">
          {t(`outcome.${state.outcome}`)}
        </span>
      ) : null}
    </form>
  );
}
