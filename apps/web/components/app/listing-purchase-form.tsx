"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { ShoppingBag } from "lucide-react";

import { requestListingPurchaseAction } from "@/lib/marketplace/listing-purchases";
import {
  PURCHASE_LIMITS,
  validatePurchaseInput,
  type FulfilmentMethod,
} from "@/lib/marketplace/listing-purchase-model";

/**
 * "Request to buy" on a goods listing (registry 6.13 + 6.14 delivery fields).
 * Rendered only for a purchasable row once the purchases migration is applied
 * (the parent decides). The database re-checks every rule; this form only
 * spares the person a round trip. NO payment: the honest line says payment is
 * arranged directly between the parties.
 */
export function ListingPurchaseForm({
  listingId,
  title,
  stock,
  unit,
  buyerOrganization,
}: {
  listingId: string;
  title: string;
  /** The listing's stated quantity, when it states one. */
  stock: number | null;
  unit: string | null;
  /** The governed active organization the person may buy for (RPC re-checks). */
  buyerOrganization: { id: string; name: string } | null;
}) {
  const t = useTranslations("listingPurchases");
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [quantity, setQuantity] = useState("1");
  const [method, setMethod] = useState<FulfilmentMethod | "">("");
  const [place, setPlace] = useState("");
  const [country, setCountry] = useState("");
  const [date, setDate] = useState("");
  const [note, setNote] = useState("");
  const [asOrg, setAsOrg] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  const inputCls =
    "w-full rounded-md border border-ink-500 bg-ink-800 px-3 py-2 text-sm text-text-primary outline-none placeholder:text-text-muted focus:border-brand-blue";
  const ids = {
    quantity: `purchase-qty-${listingId}`,
    method: `purchase-method-${listingId}`,
    place: `purchase-place-${listingId}`,
    country: `purchase-country-${listingId}`,
    date: `purchase-date-${listingId}`,
    note: `purchase-note-${listingId}`,
    buyAs: `purchase-as-${listingId}`,
  };

  if (sent) {
    return (
      <p role="status" data-testid={`listing-purchase-sent-${listingId}`} className="text-sm text-state-success">
        {t("sent")}
      </p>
    );
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => {
          setError(null);
          setOpen(true);
        }}
        data-testid={`listing-purchase-open-${listingId}`}
        className="inline-flex min-h-11 w-fit items-center gap-1.5 rounded-md border border-brand-blue px-3 py-2 text-sm font-medium text-text-primary transition-colors hover:bg-brand-blue/10"
      >
        <ShoppingBag aria-hidden className="h-4 w-4" />
        {t("requestButton")}
      </button>
    );
  }

  function submit() {
    setError(null);
    const today = new Date().toISOString().slice(0, 10);
    const input = {
      listingId,
      quantity: Number(quantity.trim().replace(",", ".")),
      fulfilmentMethod: method as FulfilmentMethod,
      note,
      deliveryLocationLabel: place,
      deliveryCountry: country,
      requestedDate: date || null,
      buyerOrganizationId: buyerOrganization && asOrg ? buyerOrganization.id : null,
    };
    const valid = validatePurchaseInput(input, { stock, today });
    if (!valid.ok) {
      setError(t(`errors.${valid.field}`));
      return;
    }
    startTransition(async () => {
      const res = await requestListingPurchaseAction(input);
      if (res.kind === "ok") {
        setSent(true);
        router.refresh();
      } else if (res.kind === "invalid") setError(t(`errors.${res.field}`));
      else if (res.kind === "refused") setError(t(`refusals.${res.reason}`));
      else if (res.kind === "needs-migration") setError(t("needsMigration"));
      else setError(t("errorGeneric"));
    });
  }

  return (
    <div
      className="mt-1 flex flex-col gap-3 rounded-md border border-ink-500 bg-ink-800/40 p-3"
      data-testid={`listing-purchase-form-${listingId}`}
    >
      <p className="text-sm font-medium text-text-primary">{t("formTitle", { title })}</p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1 text-sm">
          <label htmlFor={ids.quantity} className="text-text-secondary">
            {t("quantityLabel")}
          </label>
          <input
            id={ids.quantity}
            className={inputCls}
            inputMode="decimal"
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
          />
          {stock != null && (
            <span className="text-xs text-text-muted">
              {t("stockHelp", { stock: String(stock), unit: unit ?? "" })}
            </span>
          )}
        </div>
        <div className="flex flex-col gap-1 text-sm">
          <label htmlFor={ids.method} className="text-text-secondary">
            {t("methodLabel")}
          </label>
          <select
            id={ids.method}
            className={inputCls}
            value={method}
            onChange={(e) => setMethod(e.target.value as FulfilmentMethod)}
          >
            <option value="" disabled>
              {t("methodChoose")}
            </option>
            <option value="pickup">{t("methods.pickup")}</option>
            <option value="delivery">{t("methods.delivery")}</option>
          </select>
        </div>
      </div>
      {method === "delivery" && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="flex flex-col gap-1 text-sm sm:col-span-2">
            <label htmlFor={ids.place} className="text-text-secondary">
              {t("deliveryPlaceLabel")}
            </label>
            <input
              id={ids.place}
              className={inputCls}
              maxLength={PURCHASE_LIMITS.deliveryLabel}
              placeholder={t("deliveryPlacePlaceholder")}
              value={place}
              onChange={(e) => setPlace(e.target.value)}
            />
            <span className="text-xs text-text-muted">{t("deliveryPlaceHelp")}</span>
          </div>
          <div className="flex flex-col gap-1 text-sm">
            <label htmlFor={ids.country} className="text-text-secondary">
              {t("deliveryCountryLabel")}
            </label>
            <input
              id={ids.country}
              className={inputCls}
              maxLength={2}
              placeholder="LT"
              value={country}
              onChange={(e) => setCountry(e.target.value.toUpperCase())}
            />
          </div>
        </div>
      )}
      <div className="flex flex-col gap-1 text-sm">
        <label htmlFor={ids.date} className="text-text-secondary">
          {t("requestedDateLabel")}
        </label>
        <input id={ids.date} type="date" className={inputCls} value={date} onChange={(e) => setDate(e.target.value)} />
      </div>
      <div className="flex flex-col gap-1 text-sm">
        <label htmlFor={ids.note} className="text-text-secondary">
          {t("noteLabel")}
        </label>
        <textarea
          id={ids.note}
          className={inputCls}
          rows={2}
          maxLength={PURCHASE_LIMITS.note}
          placeholder={t("notePlaceholder")}
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
      </div>
      {buyerOrganization && (
        <div className="flex flex-col gap-1 text-sm">
          <label htmlFor={ids.buyAs} className="text-text-secondary">
            {t("buyAsLabel")}
          </label>
          <select
            id={ids.buyAs}
            className={inputCls}
            value={asOrg ? "organization" : "self"}
            onChange={(e) => setAsOrg(e.target.value === "organization")}
          >
            <option value="organization">{buyerOrganization.name}</option>
            <option value="self">{t("buyAsSelf")}</option>
          </select>
        </div>
      )}
      <p className="text-xs text-text-muted" data-testid="listing-purchase-payment-honest">
        {t("paymentHonest")}
      </p>
      {error && (
        <p role="alert" className="text-sm text-state-danger">
          {error}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={submit}
          disabled={pending}
          data-testid={`listing-purchase-submit-${listingId}`}
          className="inline-flex min-h-11 items-center rounded-md border border-brand-blue bg-brand-blue px-3 py-2 text-sm font-semibold text-text-on-brand transition-colors hover:bg-brand-champagne disabled:opacity-60"
        >
          {pending ? t("sending") : t("submit")}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          disabled={pending}
          className="inline-flex min-h-11 items-center rounded-md border border-ink-500 px-3 py-2 text-sm text-text-secondary transition-colors hover:border-text-secondary"
        >
          {t("cancelForm")}
        </button>
      </div>
    </div>
  );
}
