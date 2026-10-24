"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";

import {
  MarketEntryActions,
  MarketEntryVisibility,
} from "@/components/app/market-entry-lifecycle";
import { applyDemandAction } from "@/lib/demand/demand-lifecycle-actions";
import { demandAdapter } from "@/lib/market-lifecycle/adapters";
import type { EntryAction } from "@/lib/market-lifecycle/contract";

/**
 * The own-needs list row's lifecycle (ONE contract, `lib/market-lifecycle`):
 * the same actions and words as listings and services — complete, remove
 * from market, publish again, discard a draft — right on the row, not only
 * on the scouting page. The server re-checks the same contract.
 *
 * A draft's "publish" lives in its form (the need wizard), so the row offers
 * Edit (continue the draft there) and Discard. A published need's text is
 * not editable yet (documented gap); the contract does not offer it.
 */
export function DemandEntryLifecycle({
  locale,
  requestId,
  status,
  closedOutcome,
  showVisibility,
  gateMet,
}: {
  locale: string;
  requestId: string;
  status: string;
  closedOutcome: string | null;
  /** The need side has a worker-facing search; the offer side does not yet. */
  showVisibility: boolean;
  /** Workers see a need only when its company is verified. */
  gateMet: boolean;
}) {
  const router = useRouter();
  const t = useTranslations("marketLifecycle");
  const [pending, startTransition] = useTransition();
  const [failed, setFailed] = useState(false);
  const adapter = demandAdapter({ closedOutcomeStored: false });
  const facts = adapter.facts({ status, closedOutcome });

  function onAction(action: EntryAction) {
    if (action === "edit") {
      router.push(`/${locale}/dashboard/company/needs#demand-intake`);
      return;
    }
    startTransition(async () => {
      setFailed(false);
      const r = await applyDemandAction(locale, requestId, action, status);
      if (r.kind === "ok") router.refresh();
      else setFailed(true);
    });
  }

  return (
    <div className="flex flex-col gap-1.5" data-testid="demand-entry-lifecycle" data-demand-status={status}>
      {showVisibility ? (
        <MarketEntryVisibility
          facts={facts}
          visibility={{ accessGateMet: gateMet }}
          testId={`demand-visibility-${requestId}`}
        />
      ) : null}
      <MarketEntryActions
        support={adapter.support}
        facts={facts}
        onAction={onAction}
        pending={pending}
        hide={["publish"]}
        testIdFor={(action) => `demand-${action}-${requestId}`}
      />
      {failed ? <span className="text-meta text-state-warning">{t("error")}</span> : null}
    </div>
  );
}
