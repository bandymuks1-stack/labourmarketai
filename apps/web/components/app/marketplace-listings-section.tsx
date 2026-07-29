"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Plus, Pencil, Trash2, Play, Archive, RotateCcw, MessageSquare } from "lucide-react";

import {
  createMarketplaceListingAction,
  updateMarketplaceListingAction,
  setMarketplaceListingStatusAction,
  deleteMarketplaceListingAction,
  enquireAboutListingAction,
} from "@/lib/marketplace/listings";
import {
  LISTING_CATEGORIES,
  LISTING_KINDS,
  type ListingCategory,
  type ListingKind,
  type ListingStatus,
  type MarketplaceDiscoveryRow,
  type MarketplaceListingRow,
} from "@/lib/marketplace/listings-model";

/**
 * Marketplace work-resource listings (Wagon 13, slice 1). Real data only —
 * "my" rows come from the caller's own RLS-scoped rows; discovery shows only
 * `active` rows the SELECT policy already permits. No seed rows, no payment.
 * When the table is not applied yet the parent passes `needsMigration` and we
 * show a calm "not available yet" state, never an error and never fake rows.
 *
 * Two panels over ONE entity: manage YOUR listings, and browse ACTIVE ones and
 * enquire (the enquiry opens the canonical conversation — no second messaging).
 */

const STATUS_RING: Record<ListingStatus, string> = {
  draft: "border-ink-500 bg-ink-800/40 text-text-muted",
  active: "border-state-success/40 bg-state-success/5 text-state-success",
  closed: "border-state-warning/40 bg-state-warning/5 text-state-warning",
};

type Draft = {
  listingKind: ListingKind;
  category: ListingCategory;
  title: string;
  description: string;
  locationCountry: string;
  locationLabel: string;
  priceText: string;
};

const EMPTY_DRAFT: Draft = {
  listingKind: "rental",
  category: "accommodation",
  title: "",
  description: "",
  locationCountry: "",
  locationLabel: "",
  priceText: "",
};

export function MarketplaceListingsSection({
  myRows,
  discoveryRows,
  needsMigration,
  locale,
}: {
  myRows: MarketplaceListingRow[];
  discoveryRows: MarketplaceDiscoveryRow[];
  needsMigration: boolean;
  locale: string;
}) {
  const t = useTranslations("marketplaceListings");
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [mode, setMode] = useState<
    { kind: "idle" } | { kind: "create" } | { kind: "edit"; id: string }
  >({ kind: "idle" });
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [error, setError] = useState<string | null>(null);

  const inputCls =
    "w-full rounded-md border border-ink-500 bg-ink-800 px-3 py-2 text-sm text-text-primary outline-none placeholder:text-text-muted focus:border-brand-blue";

  function openCreate() {
    setError(null);
    setDraft(EMPTY_DRAFT);
    setMode({ kind: "create" });
  }
  function openEdit(row: MarketplaceListingRow) {
    setError(null);
    setDraft({
      listingKind: row.listingKind,
      category: row.category,
      title: row.title,
      description: row.description ?? "",
      locationCountry: row.locationCountry ?? "",
      locationLabel: row.locationLabel ?? "",
      priceText: row.priceText ?? "",
    });
    setMode({ kind: "edit", id: row.id });
  }
  function close() {
    setMode({ kind: "idle" });
    setDraft(EMPTY_DRAFT);
    setError(null);
  }

  function errorFor(kind: string, field?: string): string {
    if (kind === "invalid" && field === "title") return t("errorTitleRequired");
    if (kind === "invalid" && field === "locationCountry") return t("errorCountry");
    if (kind === "needs-migration") return t("notAvailable");
    return t("errorGeneric");
  }

  function submit() {
    setError(null);
    startTransition(async () => {
      const input = {
        listingKind: draft.listingKind,
        category: draft.category,
        title: draft.title,
        description: draft.description || null,
        locationCountry: draft.locationCountry || null,
        locationLabel: draft.locationLabel || null,
        priceText: draft.priceText || null,
      };
      const res =
        mode.kind === "edit"
          ? await updateMarketplaceListingAction(mode.id, input)
          : await createMarketplaceListingAction(input);
      if (res.kind === "ok") {
        close();
        router.refresh();
      } else {
        setError(errorFor(res.kind, "field" in res ? res.field : undefined));
      }
    });
  }

  function changeStatus(id: string, status: ListingStatus) {
    startTransition(async () => {
      const res = await setMarketplaceListingStatusAction(id, status);
      if (res.kind === "ok") router.refresh();
      else setError(errorFor(res.kind));
    });
  }

  function remove(id: string) {
    startTransition(async () => {
      const res = await deleteMarketplaceListingAction(id);
      if (res.kind === "ok") router.refresh();
      else setError(errorFor(res.kind));
    });
  }

  if (needsMigration) {
    return (
      <section className="card-border p-4">
        <h2 className="font-display text-lg font-semibold text-text-primary">{t("title")}</h2>
        <p className="mt-2 text-sm text-text-secondary">{t("intro")}</p>
        <p className="mt-3 rounded-md border border-ink-500 bg-ink-800/40 p-3 text-sm text-text-muted">
          {t("notAvailable")}
        </p>
      </section>
    );
  }

  const otherRows = discoveryRows.filter((r) => !r.isMine);

  return (
    <div className="flex flex-col gap-6">
      {/* ── Manage my listings ─────────────────────────────────────────── */}
      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h2 className="font-display text-lg font-semibold text-text-primary">{t("myTitle")}</h2>
            <p className="text-sm text-text-secondary">{t("intro")}</p>
          </div>
          {mode.kind === "idle" && (
            <button
              type="button"
              onClick={openCreate}
              className="inline-flex min-h-11 items-center gap-1.5 rounded-md border border-brand-blue bg-brand-blue/10 px-3 py-2 text-sm font-medium text-text-primary transition-colors hover:bg-brand-blue/20"
            >
              <Plus aria-hidden className="h-4 w-4" />
              {t("addButton")}
            </button>
          )}
        </div>

        {error && (
          <p
            role="alert"
            className="rounded-md border border-state-danger/40 bg-state-danger/5 p-2 text-sm text-state-danger"
          >
            {error}
          </p>
        )}

        {mode.kind !== "idle" && (
          <div className="flex flex-col gap-3 rounded-lg border border-ink-500 bg-surface-1 p-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="flex flex-col gap-1 text-sm">
                <span className="text-text-secondary">{t("formKindLabel")}</span>
                <select
                  className={inputCls}
                  value={draft.listingKind}
                  onChange={(e) => setDraft({ ...draft, listingKind: e.target.value as ListingKind })}
                >
                  {LISTING_KINDS.map((k) => (
                    <option key={k} value={k}>
                      {t(`kinds.${k}`)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1 text-sm">
                <span className="text-text-secondary">{t("formCategoryLabel")}</span>
                <select
                  className={inputCls}
                  value={draft.category}
                  onChange={(e) => setDraft({ ...draft, category: e.target.value as ListingCategory })}
                >
                  {LISTING_CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {t(`categories.${c}`)}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-text-secondary">{t("formTitleLabel")}</span>
              <input
                className={inputCls}
                value={draft.title}
                maxLength={160}
                placeholder={t("formTitlePlaceholder")}
                onChange={(e) => setDraft({ ...draft, title: e.target.value })}
              />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-text-secondary">{t("formDescriptionLabel")}</span>
              <textarea
                className={inputCls}
                value={draft.description}
                maxLength={2000}
                rows={3}
                placeholder={t("formDescriptionPlaceholder")}
                onChange={(e) => setDraft({ ...draft, description: e.target.value })}
              />
            </label>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <label className="flex flex-col gap-1 text-sm">
                <span className="text-text-secondary">{t("formCountryLabel")}</span>
                <input
                  className={inputCls}
                  value={draft.locationCountry}
                  maxLength={2}
                  placeholder={t("formCountryPlaceholder")}
                  onChange={(e) => setDraft({ ...draft, locationCountry: e.target.value.toUpperCase() })}
                />
              </label>
              <label className="flex flex-col gap-1 text-sm">
                <span className="text-text-secondary">{t("formLabelLabel")}</span>
                <input
                  className={inputCls}
                  value={draft.locationLabel}
                  maxLength={120}
                  placeholder={t("formLabelPlaceholder")}
                  onChange={(e) => setDraft({ ...draft, locationLabel: e.target.value })}
                />
              </label>
              <label className="flex flex-col gap-1 text-sm">
                <span className="text-text-secondary">{t("formPriceLabel")}</span>
                <input
                  className={inputCls}
                  value={draft.priceText}
                  maxLength={80}
                  placeholder={t("formPricePlaceholder")}
                  onChange={(e) => setDraft({ ...draft, priceText: e.target.value })}
                />
              </label>
            </div>
            <p className="text-xs text-text-muted">{t("priceHint")}</p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={submit}
                disabled={pending}
                className="inline-flex min-h-11 items-center rounded-md border border-brand-blue bg-brand-blue px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
              >
                {pending ? t("saving") : t("save")}
              </button>
              <button
                type="button"
                onClick={close}
                disabled={pending}
                className="inline-flex min-h-11 items-center rounded-md border border-ink-500 px-4 py-2 text-sm text-text-secondary"
              >
                {t("cancel")}
              </button>
            </div>
          </div>
        )}

        {myRows.length === 0 && mode.kind === "idle" ? (
          <p className="rounded-md border border-ink-500 bg-ink-800/40 p-3 text-sm text-text-muted">
            {t("empty")}
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {myRows.map((row) => (
              <li
                key={row.id}
                className="flex flex-col gap-2 rounded-lg border border-ink-500 bg-surface-1 p-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium text-text-primary">{row.title}</span>
                    <span className={`rounded-full border px-2 py-0.5 text-meta ${STATUS_RING[row.status]}`}>
                      {t(`status.${row.status}`)}
                    </span>
                  </div>
                  <p className="mt-0.5 text-xs text-text-muted">
                    {t(`kinds.${row.listingKind}`)} · {t(`categories.${row.category}`)}
                    {row.locationLabel ? ` · ${row.locationLabel}` : ""}
                    {row.locationCountry ? ` (${row.locationCountry})` : ""}
                    {row.priceText ? ` · ${row.priceText}` : ""}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  {row.status !== "active" ? (
                    <button
                      type="button"
                      title={t("activate")}
                      onClick={() => changeStatus(row.id, "active")}
                      disabled={pending}
                      className="inline-flex h-8 w-8 items-center justify-center rounded border border-ink-500 text-state-success hover:border-state-success"
                    >
                      <Play aria-hidden className="h-4 w-4" />
                    </button>
                  ) : (
                    <button
                      type="button"
                      title={t("close")}
                      onClick={() => changeStatus(row.id, "closed")}
                      disabled={pending}
                      className="inline-flex h-8 w-8 items-center justify-center rounded border border-ink-500 text-state-warning hover:border-state-warning"
                    >
                      <Archive aria-hidden className="h-4 w-4" />
                    </button>
                  )}
                  {row.status === "closed" && (
                    <button
                      type="button"
                      title={t("reopen")}
                      onClick={() => changeStatus(row.id, "draft")}
                      disabled={pending}
                      className="inline-flex h-8 w-8 items-center justify-center rounded border border-ink-500 text-text-secondary hover:border-brand-blue"
                    >
                      <RotateCcw aria-hidden className="h-4 w-4" />
                    </button>
                  )}
                  <button
                    type="button"
                    title={t("edit")}
                    onClick={() => openEdit(row)}
                    disabled={pending}
                    className="inline-flex h-8 w-8 items-center justify-center rounded border border-ink-500 text-text-secondary hover:border-brand-blue"
                  >
                    <Pencil aria-hidden className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    title={t("remove")}
                    onClick={() => remove(row.id)}
                    disabled={pending}
                    className="inline-flex h-8 w-8 items-center justify-center rounded border border-ink-500 text-state-danger hover:border-state-danger"
                  >
                    <Trash2 aria-hidden className="h-4 w-4" />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* ── Browse active listings + enquire ───────────────────────────── */}
      <section className="flex flex-col gap-3">
        <div>
          <h2 className="font-display text-lg font-semibold text-text-primary">{t("browseTitle")}</h2>
          <p className="text-sm text-text-secondary">{t("browseIntro")}</p>
        </div>
        {otherRows.length === 0 ? (
          <p className="rounded-md border border-ink-500 bg-ink-800/40 p-3 text-sm text-text-muted">
            {t("browseEmpty")}
          </p>
        ) : (
          <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {otherRows.map((row) => (
              <li key={row.id} className="flex flex-col gap-2 rounded-lg border border-ink-500 bg-surface-1 p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium text-text-primary">{row.title}</span>
                  <span className="rounded-full border border-ink-500 bg-ink-800/40 px-2 py-0.5 text-meta text-text-muted">
                    {t(`kinds.${row.listingKind}`)}
                  </span>
                </div>
                <p className="text-xs text-text-muted">
                  {t(`categories.${row.category}`)}
                  {row.locationLabel ? ` · ${row.locationLabel}` : ""}
                  {row.locationCountry ? ` (${row.locationCountry})` : ""}
                  {row.priceText ? ` · ${row.priceText}` : ""}
                </p>
                {row.description && (
                  <p className="line-clamp-3 text-sm text-text-secondary">{row.description}</p>
                )}
                <form action={enquireAboutListingAction} className="mt-1">
                  <input type="hidden" name="listingId" value={row.id} />
                  <input type="hidden" name="locale" value={locale} />
                  <button
                    type="submit"
                    className="inline-flex min-h-11 items-center gap-1.5 rounded-md border border-brand-blue bg-brand-blue/10 px-3 py-2 text-sm font-medium text-text-primary transition-colors hover:bg-brand-blue/20"
                  >
                    <MessageSquare aria-hidden className="h-4 w-4" />
                    {t("enquire")}
                  </button>
                </form>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
