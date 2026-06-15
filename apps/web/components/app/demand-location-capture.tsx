"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { MapPin } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";
import { addDemandLocationAction } from "@/lib/demand/demand-location-actions";
import { MARKET_COUNTRIES } from "@/lib/taxonomy/work-categories";

/**
 * Demand location capture (v1) — a SIGNAL-ONLY entry for one of the owner's
 * real demands. The owner records WHERE the work is (country + optional
 * city / label / address). It writes NO coordinates and NO map marker: the
 * copy is explicit that a point only appears once coordinates are confirmed
 * later. There is no field to set coordinates or a "verified" status here.
 */
export function DemandLocationCapture({ requestId }: { requestId: string }) {
  const t = useTranslations("demandLocationCapture");
  const tlm = useTranslations("labourMarket");
  const [open, setOpen] = useState(false);
  const [country, setCountry] = useState("");
  const [city, setCity] = useState("");
  const [label, setLabel] = useState("");
  const [address, setAddress] = useState("");
  const [pending, startTransition] = useTransition();
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function submit() {
    setError(null);
    if (!country) {
      setError(t("errorCountry"));
      return;
    }
    startTransition(async () => {
      const res = await addDemandLocationAction({
        requestId,
        countryCode: country,
        city,
        locationLabel: label,
        addressText: address,
      });
      if (res.kind === "ok") {
        setDone(true);
        setCity("");
        setLabel("");
        setAddress("");
        setCountry("");
      } else {
        setError(t("errorSave"));
      }
    });
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        data-testid="demand-location-capture-open"
        className="inline-flex w-fit items-center gap-1.5 rounded-md border border-border-subtle bg-surface-1 px-2.5 py-1.5 text-xs font-medium text-text-secondary transition-colors hover:border-brand-blue hover:text-text-primary"
      >
        <MapPin className="h-3.5 w-3.5 text-brand-blue" strokeWidth={1.75} aria-hidden />
        {t("open")}
      </button>
    );
  }

  return (
    <div
      className="flex flex-col gap-2.5 rounded-md border border-ink-600 bg-ink-800/60 p-3"
      data-testid="demand-location-capture"
    >
      <div className="flex flex-col gap-0.5">
        <span className="flex items-center gap-1.5 text-xs font-semibold text-text-primary">
          <MapPin className="h-3.5 w-3.5 text-brand-blue" strokeWidth={1.75} aria-hidden />
          {t("title")}
        </span>
        <span className="text-[11px] leading-relaxed text-text-muted">
          {t("note")}
        </span>
      </div>

      {done ? (
        <p
          className="rounded-md border border-state-success/40 bg-state-success/5 px-2.5 py-2 text-[11px] leading-relaxed text-text-secondary"
          data-testid="demand-location-capture-done"
        >
          {t("done")}
        </p>
      ) : (
        <>
          <label className="flex flex-col gap-1">
            <Label>{t("country")}</Label>
            <select
              value={country}
              onChange={(e) => setCountry(e.target.value)}
              data-testid="demand-location-country"
              className="w-full rounded-md border border-ink-500 bg-ink-700 px-3 py-2 text-sm text-text-primary outline-none focus:border-brand-blue"
            >
              <option value="">—</option>
              {MARKET_COUNTRIES.map((code) => (
                <option key={code} value={code}>
                  {tlm(`countryNames.${code}`)}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1">
            <Label>{t("city")}</Label>
            <Input
              value={city}
              onChange={(e) => setCity(e.target.value)}
              placeholder={t("cityPlaceholder")}
              data-testid="demand-location-city"
            />
          </label>

          <label className="flex flex-col gap-1">
            <Label>{t("label")}</Label>
            <Input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder={t("labelPlaceholder")}
              data-testid="demand-location-label"
            />
          </label>

          <label className="flex flex-col gap-1">
            <Label>{t("address")}</Label>
            <Input
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder={t("addressPlaceholder")}
              data-testid="demand-location-address"
            />
          </label>

          {error && (
            <p className="text-[11px] text-state-danger" data-testid="demand-location-error">
              {error}
            </p>
          )}

          <div className="flex items-center gap-2">
            <Button
              type="button"
              onClick={submit}
              disabled={pending}
              data-testid="demand-location-submit"
            >
              {pending ? t("saving") : t("save")}
            </Button>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="text-xs text-text-muted hover:text-text-secondary"
            >
              {t("cancel")}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
