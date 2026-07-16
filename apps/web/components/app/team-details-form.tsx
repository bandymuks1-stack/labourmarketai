"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/Button";
import { saveTeamDetailsAction } from "@/lib/company/team-brigade-actions";
import type { TeamAvailabilityStatus, TeamDetails } from "@/lib/company/team-brigades";

/**
 * Compact team-scoped details form (Trust Connect Teams v1, gap 2):
 * availability, accommodation, transport, trip length, note. Writes go only
 * through the gated save_team_details_v1 RPC; every outcome is reported
 * honestly (including the not-enabled state handled by the parent).
 */
export function TeamDetailsForm({
  teamId,
  details,
}: {
  teamId: string;
  details: TeamDetails | null;
}) {
  const router = useRouter();
  const t = useTranslations("teamBrigades.details");
  const [pending, startTransition] = useTransition();
  const [status, setStatus] = useState<TeamAvailabilityStatus>(
    details?.availabilityStatus ?? "not_available",
  );
  const [availableFrom, setAvailableFrom] = useState(
    details?.availableFrom ?? "",
  );
  const [accommodation, setAccommodation] = useState(
    details?.accommodationNeeded ?? false,
  );
  const [transport, setTransport] = useState(details?.transportOwn ?? false);
  const [maxTripDays, setMaxTripDays] = useState(
    details?.maxTripDays != null ? String(details.maxTripDays) : "",
  );
  const [sizeMin, setSizeMin] = useState(
    details?.deployableSizeMin != null ? String(details.deployableSizeMin) : "",
  );
  const [sizeMax, setSizeMax] = useState(
    details?.deployableSizeMax != null ? String(details.deployableSizeMax) : "",
  );
  const [countries, setCountries] = useState(
    (details?.destinationCountries ?? []).join(", "),
  );
  const [note, setNote] = useState(details?.note ?? "");
  const [msg, setMsg] = useState<string | null>(null);

  function parseIntOrNull(v: string): number | null {
    return v.trim() === "" ? null : Number(v);
  }

  function save() {
    setMsg(null);
    const trip = parseIntOrNull(maxTripDays);
    if (trip !== null && (!Number.isInteger(trip) || trip < 1 || trip > 365)) {
      setMsg(t("outcome.invalidTripDays"));
      return;
    }
    const min = parseIntOrNull(sizeMin);
    const max = parseIntOrNull(sizeMax);
    for (const n of [min, max]) {
      if (n !== null && (!Number.isInteger(n) || n < 1 || n > 200)) {
        setMsg(t("outcome.invalidSize"));
        return;
      }
    }
    if (min !== null && max !== null && max < min) {
      setMsg(t("outcome.invalidSize"));
      return;
    }
    const countryList = countries
      .split(/[\s,;]+/)
      .map((c) => c.trim().toUpperCase())
      .filter((c) => c.length > 0);
    if (countryList.some((c) => !/^[A-Z]{2}$/.test(c)) || countryList.length > 30) {
      setMsg(t("outcome.invalidCountries"));
      return;
    }
    if (status === "available_from" && !availableFrom) {
      setMsg(t("outcome.dateRequired"));
      return;
    }
    startTransition(async () => {
      const res = await saveTeamDetailsAction({
        teamId,
        availabilityStatus: status,
        availableFrom: status === "available_from" ? availableFrom : null,
        deployableSizeMin: min,
        deployableSizeMax: max,
        destinationCountries: countryList.length > 0 ? countryList : null,
        accommodationNeeded: accommodation,
        transportOwn: transport,
        maxTripDays: trip,
        note: note.trim() === "" ? null : note.trim(),
      });
      if (res.outcome === "saved") setMsg(t("outcome.saved"));
      else if (res.outcome === "not_allowed") setMsg(t("outcome.notAllowed"));
      else if (res.outcome === "date_required") setMsg(t("outcome.dateRequired"));
      else if (res.outcome === "invalid_trip_days")
        setMsg(t("outcome.invalidTripDays"));
      else if (res.outcome === "invalid_size") setMsg(t("outcome.invalidSize"));
      else if (res.outcome === "invalid_countries")
        setMsg(t("outcome.invalidCountries"));
      else if (res.outcome === "note_too_long") setMsg(t("outcome.noteTooLong"));
      else if (res.outcome === "needs_migration") setMsg(t("notEnabled"));
      else setMsg(t("outcome.error"));
      router.refresh();
    });
  }

  return (
    <div
      className="flex flex-col gap-3"
      data-testid={`team-details-form-${teamId}`}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-xs text-text-secondary">
          {t("availabilityLabel")}
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as TeamAvailabilityStatus)}
            data-testid={`team-details-status-${teamId}`}
            className="min-h-9 rounded-md border border-ink-500 bg-ink-800/40 px-2 py-1.5 text-sm text-text-primary"
          >
            <option value="available_now">{t("status.availableNow")}</option>
            <option value="available_from">{t("status.availableFrom")}</option>
            <option value="not_available">{t("status.notAvailable")}</option>
          </select>
        </label>
        {status === "available_from" && (
          <label className="flex flex-col gap-1 text-xs text-text-secondary">
            {t("availableFromLabel")}
            <input
              type="date"
              value={availableFrom}
              onChange={(e) => setAvailableFrom(e.target.value)}
              data-testid={`team-details-from-${teamId}`}
              className="min-h-9 rounded-md border border-ink-500 bg-ink-800/40 px-2 py-1.5 text-sm text-text-primary"
            />
          </label>
        )}
        <label className="flex flex-col gap-1 text-xs text-text-secondary">
          {t("maxTripDaysLabel")}
          <input
            type="number"
            min={1}
            max={365}
            value={maxTripDays}
            onChange={(e) => setMaxTripDays(e.target.value)}
            data-testid={`team-details-trip-${teamId}`}
            className="min-h-9 rounded-md border border-ink-500 bg-ink-800/40 px-2 py-1.5 text-sm text-text-primary"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-text-secondary">
          {t("sizeMinLabel")}
          <input
            type="number"
            min={1}
            max={200}
            value={sizeMin}
            onChange={(e) => setSizeMin(e.target.value)}
            data-testid={`team-details-size-min-${teamId}`}
            className="min-h-9 rounded-md border border-ink-500 bg-ink-800/40 px-2 py-1.5 text-sm text-text-primary"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-text-secondary">
          {t("sizeMaxLabel")}
          <input
            type="number"
            min={1}
            max={200}
            value={sizeMax}
            onChange={(e) => setSizeMax(e.target.value)}
            data-testid={`team-details-size-max-${teamId}`}
            className="min-h-9 rounded-md border border-ink-500 bg-ink-800/40 px-2 py-1.5 text-sm text-text-primary"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-text-secondary">
          {t("countriesLabel")}
          <input
            type="text"
            value={countries}
            onChange={(e) => setCountries(e.target.value)}
            placeholder={t("countriesPlaceholder")}
            data-testid={`team-details-countries-${teamId}`}
            className="min-h-9 rounded-md border border-ink-500 bg-ink-800/40 px-2 py-1.5 text-sm text-text-primary"
          />
        </label>
      </div>

      <div className="flex flex-wrap gap-x-5 gap-y-2">
        <label className="flex items-center gap-2 text-xs text-text-secondary">
          <input
            type="checkbox"
            checked={accommodation}
            onChange={(e) => setAccommodation(e.target.checked)}
            data-testid={`team-details-accommodation-${teamId}`}
            className="h-4 w-4"
          />
          {t("accommodationLabel")}
        </label>
        <label className="flex items-center gap-2 text-xs text-text-secondary">
          <input
            type="checkbox"
            checked={transport}
            onChange={(e) => setTransport(e.target.checked)}
            data-testid={`team-details-transport-${teamId}`}
            className="h-4 w-4"
          />
          {t("transportLabel")}
        </label>
      </div>

      <label className="flex flex-col gap-1 text-xs text-text-secondary">
        {t("noteLabel")}
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={2}
          maxLength={500}
          data-testid={`team-details-note-${teamId}`}
          className="rounded-md border border-ink-500 bg-ink-800/40 px-2 py-1.5 text-sm text-text-primary"
        />
      </label>

      <div className="flex items-center gap-3">
        <Button
          type="button"
          size="sm"
          disabled={pending}
          onClick={save}
          data-testid={`team-details-save-${teamId}`}
        >
          {pending ? t("saving") : t("save")}
        </Button>
        {msg && (
          <p
            role="status"
            className="text-xs text-text-secondary"
            data-testid={`team-details-msg-${teamId}`}
          >
            {msg}
          </p>
        )}
      </div>
    </div>
  );
}
