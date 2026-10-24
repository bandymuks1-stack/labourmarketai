"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { MessageSquare } from "lucide-react";

import { transitionListingPurchaseAction } from "@/lib/marketplace/listing-purchases";
import { openListingPurchaseConversationAction } from "@/lib/marketplace/listing-purchase-conversation";
import {
  PURCHASE_LIMITS,
  availablePurchaseActions,
  canOpenPurchaseConversation,
  type ListingPurchaseListResult,
  type ListingPurchaseRow,
  type PurchaseAction,
  type PurchaseStatus,
} from "@/lib/marketplace/listing-purchase-model";

/**
 * Goods purchases (registry 6.13 + 6.14) in the parties' EXISTING workspaces:
 * the listings page shows both sides, the buyer workspace the buying side.
 * Real rows only (RLS-scoped read). `needs-migration` renders nothing — the
 * feature does not exist on this database yet, and nothing pretends it does.
 * A failed read is named, never shown as "no purchases" (SEP-7).
 */

const STATUS_RING: Record<PurchaseStatus, string> = {
  requested: "border-brand-blue/40 bg-brand-blue/5 text-text-primary",
  accepted: "border-state-success/40 bg-state-success/5 text-state-success",
  fulfilled: "border-state-success/40 bg-state-success/10 text-state-success",
  declined: "border-ink-500 bg-ink-800/40 text-text-muted",
  cancelled: "border-ink-500 bg-ink-800/40 text-text-muted",
};

function formatAmount(amount: number, currency: string | null, locale: string): string {
  try {
    return currency
      ? new Intl.NumberFormat(locale, { style: "currency", currency }).format(amount)
      : new Intl.NumberFormat(locale).format(amount);
  } catch {
    return `${amount} ${currency ?? ""}`.trim();
  }
}

export function ListingPurchasesSection({
  result,
  sides,
  locale,
}: {
  result: ListingPurchaseListResult;
  /** Which lists this workspace shows. */
  sides: readonly ("buyer" | "seller")[];
  locale: string;
}) {
  const t = useTranslations("listingPurchases");
  if (result.kind === "needs-migration" || result.kind === "not-authed") return null;

  return (
    <section className="flex flex-col gap-3" data-testid="listing-purchases-section">
      <div>
        <h2 className="font-display text-lg font-semibold text-text-primary">{t("sectionTitle")}</h2>
        <p className="text-sm text-text-secondary">{t("paymentHonest")}</p>
      </div>
      {result.kind === "unavailable" ? (
        <p role="status" className="rounded-md border border-state-warning/40 bg-state-warning/5 p-3 text-sm text-state-warning">
          {t("unavailable")}
        </p>
      ) : (
        <>
          {sides.includes("buyer") && (
            <PurchaseList
              title={t("buyingTitle")}
              empty={t("buyingEmpty")}
              rows={result.buying}
              testId="listing-purchases-buying"
              locale={locale}
            />
          )}
          {sides.includes("seller") && (
            <PurchaseList
              title={t("sellingTitle")}
              empty={t("sellingEmpty")}
              rows={result.selling}
              testId="listing-purchases-selling"
              locale={locale}
            />
          )}
        </>
      )}
    </section>
  );
}

function PurchaseList({
  title,
  empty,
  rows,
  testId,
  locale,
}: {
  title: string;
  empty: string;
  rows: readonly ListingPurchaseRow[];
  testId: string;
  locale: string;
}) {
  return (
    <div className="flex flex-col gap-2" data-testid={testId}>
      <h3 className="text-sm font-semibold text-text-primary">{title}</h3>
      {rows.length === 0 ? (
        <p className="rounded-md border border-ink-500 bg-ink-800/40 p-3 text-sm text-text-muted">{empty}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {rows.map((row) => (
            <PurchaseCard key={row.id} row={row} locale={locale} />
          ))}
        </ul>
      )}
    </div>
  );
}

function PurchaseCard({ row, locale }: { row: ListingPurchaseRow; locale: string }) {
  const t = useTranslations("listingPurchases");
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [note, setNote] = useState("");
  const [carrier, setCarrier] = useState("");
  const [error, setError] = useState<string | null>(null);
  const actions = availablePurchaseActions(row.status, row.side);
  const sellerCanNoteCarrier = row.side === "seller" && (actions.includes("accept") || actions.includes("fulfil"));
  const noteId = `purchase-action-note-${row.id}`;
  const carrierId = `purchase-carrier-${row.id}`;

  function act(action: PurchaseAction) {
    setError(null);
    startTransition(async () => {
      const res = await transitionListingPurchaseAction(
        row.id,
        action,
        note,
        action === "accept" || action === "fulfil" ? carrier : null,
      );
      if (res.kind === "ok") {
        setNote("");
        setCarrier("");
        router.refresh();
      } else if (res.kind === "refused") setError(t(`transitionRefused.${res.reason}`));
      else if (res.kind === "needs-migration") setError(t("needsMigration"));
      else setError(t("errorGeneric"));
    });
  }

  const price =
    row.priceAmount != null
      ? formatAmount(row.priceAmount, row.currency, locale)
      : row.priceText;

  return (
    <li
      className="flex flex-col gap-2 rounded-lg border border-ink-500 bg-surface-1 p-3"
      data-testid="listing-purchase-row"
      data-status={row.status}
      data-side={row.side}
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium text-text-primary">{row.listingTitle}</span>
        <span className={`rounded-full border px-2 py-0.5 text-meta ${STATUS_RING[row.status]}`}>
          {t(`statuses.${row.status}`)}
        </span>
        {row.viaOrganization && (
          <span className="rounded-full border border-ink-500 bg-ink-800/40 px-2 py-0.5 text-meta text-text-muted">
            {t("viaOrganization")}
          </span>
        )}
      </div>
      <dl className="grid grid-cols-1 gap-1 text-xs text-text-secondary sm:grid-cols-2">
        <div>
          <dt className="inline text-text-muted">{t("factQuantity")}: </dt>
          <dd className="inline">
            {row.quantity}
            {row.unit ? ` ${row.unit}` : ""}
          </dd>
        </div>
        <div>
          <dt className="inline text-text-muted">{t("methodLabel")}: </dt>
          <dd className="inline">{t(`methods.${row.fulfilmentMethod}`)}</dd>
        </div>
        {row.deliveryLocationLabel && (
          <div>
            <dt className="inline text-text-muted">{t("factDeliveryTo")}: </dt>
            <dd className="inline">
              {row.deliveryLocationLabel}
              {row.deliveryCountry ? ` (${row.deliveryCountry})` : ""}
            </dd>
          </div>
        )}
        {row.requestedDate && (
          <div>
            <dt className="inline text-text-muted">{t("requestedDateLabel")}: </dt>
            <dd className="inline">{row.requestedDate}</dd>
          </div>
        )}
        {price && (
          <div>
            <dt className="inline text-text-muted">{t("factPriceAsShown")}: </dt>
            <dd className="inline">{price}</dd>
          </div>
        )}
        <div>
          <dt className="inline text-text-muted">{t("factRequestedOn")}: </dt>
          <dd className="inline">{row.createdAt.slice(0, 10)}</dd>
        </div>
      </dl>
      {row.buyerNote && <p className="text-sm text-text-secondary">{t("factBuyerNote", { note: row.buyerNote })}</p>}
      {row.sellerNote && <p className="text-sm text-text-secondary">{t("factSellerNote", { note: row.sellerNote })}</p>}
      {row.carrierNote && <p className="text-sm text-text-secondary">{t("factCarrierNote", { note: row.carrierNote })}</p>}
      {row.cancelledBy && (
        <p className="text-xs text-text-muted">
          {row.cancelledBy === "buyer" ? t("cancelledByBuyer") : t("cancelledBySeller")}
        </p>
      )}
      {row.listingId === null && <p className="text-xs text-text-muted">{t("listingRemoved")}</p>}

      {actions.length > 0 && (
        <div className="flex flex-col gap-2">
          <div className="flex flex-col gap-1 text-sm">
            <label htmlFor={noteId} className="text-text-secondary">
              {t("actionNoteLabel")}
            </label>
            <input
              id={noteId}
              className="w-full rounded-md border border-ink-500 bg-ink-800 px-3 py-2 text-sm text-text-primary outline-none focus:border-brand-blue"
              maxLength={PURCHASE_LIMITS.note}
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </div>
          {sellerCanNoteCarrier && (
            <div className="flex flex-col gap-1 text-sm">
              <label htmlFor={carrierId} className="text-text-secondary">
                {t("carrierNoteLabel")}
              </label>
              <input
                id={carrierId}
                className="w-full rounded-md border border-ink-500 bg-ink-800 px-3 py-2 text-sm text-text-primary outline-none focus:border-brand-blue"
                maxLength={PURCHASE_LIMITS.carrierNote}
                value={carrier}
                onChange={(e) => setCarrier(e.target.value)}
              />
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            {actions.map((a) => (
              <button
                key={a}
                type="button"
                disabled={pending}
                onClick={() => act(a)}
                data-testid={`listing-purchase-${a}-${row.id}`}
                className={
                  a === "accept" || a === "fulfil"
                    ? "inline-flex min-h-11 items-center rounded-md border border-brand-blue bg-brand-blue px-3 py-2 text-sm font-semibold text-text-on-brand transition-colors hover:bg-brand-champagne disabled:opacity-60"
                    : "inline-flex min-h-11 items-center rounded-md border border-ink-500 px-3 py-2 text-sm text-text-secondary transition-colors hover:border-text-secondary disabled:opacity-60"
                }
              >
                {t(`actions.${a}`)}
              </button>
            ))}
          </div>
        </div>
      )}
      {error && (
        <p role="alert" className="text-sm text-state-danger">
          {error}
        </p>
      )}
      {canOpenPurchaseConversation(row.status) && (
        <form action={openListingPurchaseConversationAction}>
          <input type="hidden" name="purchaseId" value={row.id} />
          <input type="hidden" name="locale" value={locale} />
          <button
            type="submit"
            data-testid={`listing-purchase-conversation-${row.id}`}
            className="inline-flex min-h-11 items-center gap-1.5 rounded-md border border-ink-500 px-3 py-2 text-sm font-medium text-text-primary transition-colors hover:border-text-secondary"
          >
            <MessageSquare aria-hidden className="h-4 w-4" />
            {t("openConversation")}
          </button>
        </form>
      )}
    </li>
  );
}
