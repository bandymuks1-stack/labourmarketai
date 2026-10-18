import { getTranslations } from "next-intl/server";

import type { AutoMatchReceipt } from "@/lib/scouting/auto-match-receipt";

/**
 * One calm line on the scouting page: when the automatic internal search last
 * ran for this need and what it covered. Wording is deliberately narrow: it
 * speaks only of candidates already in LabourMarket.ai, and never implies that
 * anyone was contacted.
 *
 * The copy lived inline in LT + EN only, so the Dutch, German, Polish and
 * Russian owners read it in English (walk 2026-10-11); it now reads from the
 * `scouting.autoMatchReceipt` catalogue like the rest of the page.
 */
export async function AutoMatchReceiptNote({
  receipt,
  locale,
}: {
  receipt: AutoMatchReceipt | null;
  locale: string;
}) {
  if (!receipt) return null;
  const t = await getTranslations({ locale, namespace: "scouting.autoMatchReceipt" });
  const when = new Date(receipt.finishedAt).toISOString().slice(0, 16).replace("T", " ") + " UTC";
  const count = receipt.poolSize ?? 0;
  let text: string;
  if (receipt.status === "failed") text = t("failed", { when });
  else if (receipt.status === "not_structured") text = t("notStructured", { when });
  else if (receipt.status === "no_candidates") text = t("none", { when, count });
  else text = t("ran", { when, count, relevant: receipt.relevantCount ?? 0 });
  if (receipt.poolCapped && (receipt.status === "completed" || receipt.status === "no_candidates")) {
    text += ` ${t("capped")}`;
  }
  return (
    <p className="text-xs leading-relaxed text-text-muted" data-testid="scouting-auto-match-receipt">
      {text}
    </p>
  );
}
