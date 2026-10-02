"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  Plus,
  Pencil,
  Trash2,
  Play,
  Pause,
  Archive,
  RotateCcw,
  MessageSquare,
  ArrowRight,
} from "lucide-react";

import { Link } from "@/lib/i18n/navigation";
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
  type ListingKind,
  type ListingStatus,
  type MarketplaceDiscoveryRow,
  type MarketplaceListingRow,
} from "@/lib/marketplace/listings-model";
import {
  LISTING_DOMAINS,
  SUBJECTS_BY_DOMAIN,
  allowedKindsForDomain,
  domainOfSubject,
  isExpired,
  type ListingDomain,
} from "@/lib/marketplace/market-model";
import { assessPublish } from "@/lib/marketplace/publish-policy";

/**
 * Universal marketplace listings — work resources, goods, service needs,
 * personal and project / contract listings. Real data only — "my" rows come
 * from the caller's own RLS-scoped rows; discovery shows only active,
 * not-expired rows the SELECT policy already permits (plus active service
 * offerings, which keep their own request loop in Services). No seed rows, no
 * payment, no held funds. When the migration is not applied yet the parent passes
 * `extended = false` (work resources only, no new fields) or `needsMigration`
 * and we show a calm state, never an error and never fake rows.
 *
 * Two panels over ONE discovery: manage YOUR listings, and browse ACTIVE ones
 * and enquire (the enquiry opens the canonical conversation — no second
 * messaging).
 */

const STATUS_RING: Record<ListingStatus, string> = {
  draft: "border-ink-500 bg-ink-800/40 text-text-muted",
  active: "border-state-success/40 bg-state-success/5 text-state-success",
  paused: "border-ink-500 bg-ink-800/40 text-text-secondary",
  closed: "border-state-warning/40 bg-state-warning/5 text-state-warning",
};

type Draft = {
  domain: ListingDomain;
  listingKind: ListingKind;
  category: string;
  title: string;
  description: string;
  locationCountry: string;
  locationLabel: string;
  priceText: string;
  priceAmount: string;
  currency: string;
  quantity: string;
  unit: string;
  expiresOn: string;
};

const EMPTY_DRAFT: Draft = {
  domain: "work_resource",
  listingKind: "rental",
  category: "accommodation",
  title: "",
  description: "",
  locationCountry: "",
  locationLabel: "",
  priceText: "",
  priceAmount: "",
  currency: "EUR",
  quantity: "",
  unit: "",
  expiresOn: "",
};

function toNumber(v: string): number | null {
  const t = v.trim().replace(",", ".");
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : Number.NaN;
}

function formatAmount(amount: number, currency: string | null, locale: string): string {
  try {
    return currency
      ? new Intl.NumberFormat(locale, { style: "currency", currency }).format(amount)
      : new Intl.NumberFormat(locale).format(amount);
  } catch {
    return `${amount} ${currency ?? ""}`.trim();
  }
}

function formatDate(iso: string, locale: string): string {
  try {
    return new Date(iso).toLocaleDateString(locale);
  } catch {
    return iso.slice(0, 10);
  }
}

export function MarketplaceListingsSection({
  myRows,
  discoveryRows,
  needsMigration,
  extended,
  locale,
}: {
  myRows: MarketplaceListingRow[];
  discoveryRows: MarketplaceDiscoveryRow[];
  needsMigration: boolean;
  /** The universal-marketplace migration is applied. */
  extended: boolean;
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
  const [legalAck, setLegalAck] = useState(false);
  const [ackFor, setAckFor] = useState<string | null>(null);
  const [domainTab, setDomainTab] = useState<string>("all");
  // Canonical destination of a listing: /dashboard/listings?focus=<id>. There is
  // no per-listing route, so the section anchors and highlights that row.
  const focusId = useSearchParams().get("focus");
  useEffect(() => {
    if (!focusId) return;
    setDomainTab("all");
    const el = document.getElementById(`listing-${focusId}`);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [focusId]);
  const focusCls = (id: string) => (focusId === id ? " ring-2 ring-brand-blue" : "");

  const inputCls =
    "w-full rounded-md border border-ink-500 bg-ink-800 px-3 py-2 text-sm text-text-primary outline-none placeholder:text-text-muted focus:border-brand-blue";

  const formDomains: readonly ListingDomain[] = extended ? LISTING_DOMAINS : ["work_resource"];
  const subjects: readonly string[] =
    extended ? SUBJECTS_BY_DOMAIN[draft.domain] : LISTING_CATEGORIES;
  const allowedKinds = allowedKindsForDomain(draft.domain);
  const verdict = assessPublish({
    subject: draft.category,
    listingKind: draft.listingKind,
    title: draft.title,
    description: draft.description,
  });

  function openCreate() {
    setError(null);
    setLegalAck(false);
    setDraft(EMPTY_DRAFT);
    setMode({ kind: "create" });
  }
  function openEdit(row: MarketplaceListingRow) {
    setError(null);
    setLegalAck(false);
    setDraft({
      domain: domainOfSubject(row.category) ?? "work_resource",
      listingKind: row.listingKind,
      category: row.category,
      title: row.title,
      description: row.description ?? "",
      locationCountry: row.locationCountry ?? "",
      locationLabel: row.locationLabel ?? "",
      priceText: row.priceText ?? "",
      priceAmount: row.priceAmount != null ? String(row.priceAmount) : "",
      currency: row.currency ?? "EUR",
      quantity: row.quantity != null ? String(row.quantity) : "",
      unit: row.unit ?? "",
      expiresOn: row.expiresAt ? row.expiresAt.slice(0, 10) : "",
    });
    setMode({ kind: "edit", id: row.id });
  }
  function close() {
    setMode({ kind: "idle" });
    setDraft(EMPTY_DRAFT);
    setError(null);
    setLegalAck(false);
  }

  function changeDomain(domain: ListingDomain) {
    const nextSubjects = SUBJECTS_BY_DOMAIN[domain];
    const kinds = allowedKindsForDomain(domain);
    setDraft({
      ...draft,
      domain,
      category: nextSubjects[0],
      listingKind: kinds.includes(draft.listingKind) ? draft.listingKind : kinds[0],
    });
  }

  function errorFor(res: { kind: string; field?: string }): string {
    if (res.kind === "invalid" && res.field === "title") return t("errorTitleRequired");
    if (res.kind === "invalid" && res.field === "locationCountry") return t("errorCountry");
    if (res.kind === "invalid" && res.field === "price") return t("errorPrice");
    if (res.kind === "invalid" && res.field === "quantity") return t("errorQuantity");
    if (res.kind === "invalid" && res.field === "expiry") return t("errorExpiry");
    if (res.kind === "legal-check-required") return t("legalCheckFood");
    if (res.kind === "restricted") return t("errorRestricted");
    if (res.kind === "needs-migration") return t("notAvailable");
    return t("errorGeneric");
  }

  function submit() {
    setError(null);
    const priceAmount = toNumber(draft.priceAmount);
    const quantity = toNumber(draft.quantity);
    if (Number.isNaN(priceAmount)) return setError(t("errorPrice"));
    if (Number.isNaN(quantity)) return setError(t("errorQuantity"));
    startTransition(async () => {
      const input = {
        listingKind: draft.listingKind,
        category: draft.category,
        title: draft.title,
        description: draft.description || null,
        locationCountry: draft.locationCountry || null,
        locationLabel: draft.locationLabel || null,
        priceText: draft.priceText || null,
        priceAmount: extended ? priceAmount : null,
        currency: extended && priceAmount !== null ? draft.currency || null : null,
        quantity: extended ? quantity : null,
        unit: extended ? draft.unit || null : null,
        expiresAt:
          extended && draft.expiresOn
            ? new Date(`${draft.expiresOn}T23:59:59`).toISOString()
            : null,
      };
      const res =
        mode.kind === "edit"
          ? await updateMarketplaceListingAction(mode.id, input, legalAck)
          : await createMarketplaceListingAction(input);
      if (res.kind === "ok") {
        close();
        router.refresh();
      } else {
        setError(errorFor(res));
      }
    });
  }

  function changeStatus(id: string, status: ListingStatus, ack = false) {
    startTransition(async () => {
      const res = await setMarketplaceListingStatusAction(id, status, ack);
      if (res.kind === "ok") {
        setAckFor(null);
        setLegalAck(false);
        router.refresh();
      } else if (res.kind === "legal-check-required") {
        setError(null);
        setAckFor(id);
      } else {
        setError(errorFor(res));
      }
    });
  }

  function remove(id: string) {
    startTransition(async () => {
      const res = await deleteMarketplaceListingAction(id);
      if (res.kind === "ok") router.refresh();
      else setError(errorFor(res));
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
  const tabDomains = ["all", ...LISTING_DOMAINS, "service"] as const;
  const shownRows =
    domainTab === "all" ? otherRows : otherRows.filter((r) => r.domain === domainTab);

  function subjectLabel(subject: string | null, domain: string): string {
    if (subject && domainOfSubject(subject)) return t(`categories.${subject}`);
    return t(`domains.${domain === "service" ? "service" : "other"}`);
  }

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
              className="inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-md border border-brand-blue bg-brand-blue/10 px-3 py-2 text-sm font-medium text-text-primary transition-colors hover:bg-brand-blue/20"
            >
              <Plus aria-hidden className="h-4 w-4" />
              {t("addButton")}
            </button>
          )}
        </div>

        {!extended && (
          <p className="rounded-md border border-ink-500 bg-ink-800/40 p-3 text-sm text-text-muted">
            {t("moreTypesSoon")}
          </p>
        )}

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
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              {extended && (
                <label className="flex flex-col gap-1 text-sm">
                  <span className="text-text-secondary">{t("formDomainLabel")}</span>
                  <select
                    className={inputCls}
                    value={draft.domain}
                    onChange={(e) => changeDomain(e.target.value as ListingDomain)}
                  >
                    {formDomains.map((d) => (
                      <option key={d} value={d}>
                        {t(`domains.${d}`)}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              <label className="flex flex-col gap-1 text-sm">
                <span className="text-text-secondary">{t("formKindLabel")}</span>
                <select
                  className={inputCls}
                  value={draft.listingKind}
                  onChange={(e) => setDraft({ ...draft, listingKind: e.target.value as ListingKind })}
                >
                  {LISTING_KINDS.filter((k) => allowedKinds.includes(k)).map((k) => (
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
                  onChange={(e) => setDraft({ ...draft, category: e.target.value })}
                >
                  {subjects.map((c) => (
                    <option key={c} value={c}>
                      {t(`categories.${c}`)}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            {draft.domain === "service_need" && (
              <p className="text-xs text-text-muted">{t("serviceNeedHint")}</p>
            )}
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
            {extended && (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
                <label className="flex flex-col gap-1 text-sm">
                  <span className="text-text-secondary">{t("formAmountLabel")}</span>
                  <input
                    className={inputCls}
                    inputMode="decimal"
                    value={draft.priceAmount}
                    onChange={(e) => setDraft({ ...draft, priceAmount: e.target.value })}
                  />
                </label>
                <label className="flex flex-col gap-1 text-sm">
                  <span className="text-text-secondary">{t("formCurrencyLabel")}</span>
                  <input
                    className={inputCls}
                    value={draft.currency}
                    maxLength={3}
                    placeholder="EUR"
                    onChange={(e) => setDraft({ ...draft, currency: e.target.value.toUpperCase() })}
                  />
                </label>
                <label className="flex flex-col gap-1 text-sm">
                  <span className="text-text-secondary">{t("formQuantityLabel")}</span>
                  <input
                    className={inputCls}
                    inputMode="decimal"
                    value={draft.quantity}
                    placeholder={t("formQuantityPlaceholder")}
                    onChange={(e) => setDraft({ ...draft, quantity: e.target.value })}
                  />
                </label>
                <label className="flex flex-col gap-1 text-sm">
                  <span className="text-text-secondary">{t("formUnitLabel")}</span>
                  <input
                    className={inputCls}
                    value={draft.unit}
                    maxLength={24}
                    placeholder={t("formUnitPlaceholder")}
                    onChange={(e) => setDraft({ ...draft, unit: e.target.value })}
                  />
                </label>
                <label className="col-span-2 flex flex-col gap-1 text-sm sm:col-span-1">
                  <span className="text-text-secondary">{t("formExpiryLabel")}</span>
                  <input
                    type="date"
                    className={inputCls}
                    value={draft.expiresOn}
                    onChange={(e) => setDraft({ ...draft, expiresOn: e.target.value })}
                  />
                </label>
              </div>
            )}
            <p className="text-xs text-text-muted">{t("priceHint")}</p>
            {extended && <p className="text-xs text-text-muted">{t("formExpiryHint")}</p>}
            {verdict.kind === "LEGAL_CHECK_REQUIRED" && (
              <div className="flex flex-col gap-2 rounded-md border border-state-warning/40 bg-state-warning/5 p-3 text-sm text-text-secondary">
                <p>{t("legalCheckFood")}</p>
                <label className="flex items-start gap-2">
                  <input
                    type="checkbox"
                    className="mt-1 h-4 w-4"
                    checked={legalAck}
                    onChange={(e) => setLegalAck(e.target.checked)}
                  />
                  <span>{t("legalCheckAck")}</span>
                </label>
              </div>
            )}
            {verdict.kind === "CHANNEL_RESTRICTED" && verdict.reasonKey === "restricted_category" && (
              <p role="alert" className="text-sm text-state-danger">
                {t("errorRestricted")}
              </p>
            )}
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={submit}
                disabled={pending}
                className="inline-flex min-h-11 items-center rounded-md border border-brand-blue bg-brand-blue px-4 py-2 text-sm font-medium text-text-on-brand disabled:opacity-50"
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
                id={`listing-${row.id}`}
                className={`flex flex-col gap-2 rounded-lg border border-ink-500 bg-surface-1 p-3${focusCls(row.id)}`}
              >
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium text-text-primary">{row.title}</span>
                      <span className={`rounded-full border px-2 py-0.5 text-meta ${STATUS_RING[row.status]}`}>
                        {t(`status.${row.status}`)}
                      </span>
                      {isExpired(row.expiresAt) && (
                        <span className="rounded-full border border-state-warning/40 bg-state-warning/5 px-2 py-0.5 text-meta text-state-warning">
                          {t("expired")}
                        </span>
                      )}
                    </div>
                    <p className="mt-0.5 text-xs text-text-muted">
                      {t(`kinds.${row.listingKind}`)} · {subjectLabel(row.category, "other")}
                      {row.locationLabel ? ` · ${row.locationLabel}` : ""}
                      {row.locationCountry ? ` (${row.locationCountry})` : ""}
                      {row.priceAmount != null
                        ? ` · ${formatAmount(row.priceAmount, row.currency, locale)}`
                        : row.priceText
                          ? ` · ${row.priceText}`
                          : ""}
                      {row.quantity != null ? ` · ${row.quantity}${row.unit ? ` ${row.unit}` : ""}` : ""}
                      {row.expiresAt ? ` · ${t("expiresOn", { date: formatDate(row.expiresAt, locale) })}` : ""}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    {row.status !== "active" ? (
                      <button
                        type="button"
                        title={t("activate")}
                        aria-label={t("activate")}
                        onClick={() => changeStatus(row.id, "active")}
                        disabled={pending}
                        className="inline-flex h-11 w-11 items-center justify-center rounded border border-ink-500 text-state-success hover:border-state-success sm:h-8 sm:w-8"
                      >
                        <Play aria-hidden className="h-4 w-4" />
                      </button>
                    ) : (
                      <>
                        {extended && (
                          <button
                            type="button"
                            title={t("pause")}
                            aria-label={t("pause")}
                            onClick={() => changeStatus(row.id, "paused")}
                            disabled={pending}
                            className="inline-flex h-11 w-11 items-center justify-center rounded border border-ink-500 text-text-secondary hover:border-brand-blue sm:h-8 sm:w-8"
                          >
                            <Pause aria-hidden className="h-4 w-4" />
                          </button>
                        )}
                        <button
                          type="button"
                          title={t("close")}
                          aria-label={t("close")}
                          onClick={() => changeStatus(row.id, "closed")}
                          disabled={pending}
                          className="inline-flex h-11 w-11 items-center justify-center rounded border border-ink-500 text-state-warning hover:border-state-warning sm:h-8 sm:w-8"
                        >
                          <Archive aria-hidden className="h-4 w-4" />
                        </button>
                      </>
                    )}
                    {row.status === "closed" && (
                      <button
                        type="button"
                        title={t("reopen")}
                        aria-label={t("reopen")}
                        onClick={() => changeStatus(row.id, "draft")}
                        disabled={pending}
                        className="inline-flex h-11 w-11 items-center justify-center rounded border border-ink-500 text-text-secondary hover:border-brand-blue sm:h-8 sm:w-8"
                      >
                        <RotateCcw aria-hidden className="h-4 w-4" />
                      </button>
                    )}
                    <button
                      type="button"
                      title={t("edit")}
                      aria-label={t("edit")}
                      onClick={() => openEdit(row)}
                      disabled={pending}
                      className="inline-flex h-11 w-11 items-center justify-center rounded border border-ink-500 text-text-secondary hover:border-brand-blue sm:h-8 sm:w-8"
                    >
                      <Pencil aria-hidden className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      title={t("remove")}
                      aria-label={t("remove")}
                      onClick={() => remove(row.id)}
                      disabled={pending}
                      className="inline-flex h-11 w-11 items-center justify-center rounded border border-ink-500 text-state-danger hover:border-state-danger sm:h-8 sm:w-8"
                    >
                      <Trash2 aria-hidden className="h-4 w-4" />
                    </button>
                  </div>
                </div>
                {ackFor === row.id && (
                  <div className="flex flex-col gap-2 rounded-md border border-state-warning/40 bg-state-warning/5 p-3 text-sm text-text-secondary">
                    <p>{t("legalCheckFood")}</p>
                    <label className="flex items-start gap-2">
                      <input
                        type="checkbox"
                        className="mt-1 h-4 w-4"
                        checked={legalAck}
                        onChange={(e) => setLegalAck(e.target.checked)}
                      />
                      <span>{t("legalCheckAck")}</span>
                    </label>
                    <button
                      type="button"
                      disabled={pending || !legalAck}
                      onClick={() => changeStatus(row.id, "active", true)}
                      className="inline-flex min-h-11 w-fit items-center rounded-md border border-brand-blue bg-brand-blue px-4 py-2 text-sm font-medium text-text-on-brand disabled:opacity-50"
                    >
                      {t("activate")}
                    </button>
                  </div>
                )}
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

        {extended && (
          <div
            role="tablist"
            aria-label={t("domainFilterLabel")}
            className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1"
          >
            {tabDomains.map((d) => (
              <button
                key={d}
                type="button"
                role="tab"
                aria-selected={domainTab === d}
                onClick={() => setDomainTab(d)}
                className={`inline-flex min-h-11 shrink-0 items-center rounded-full border px-3 py-2 text-sm transition-colors ${
                  domainTab === d
                    ? "border-brand-blue bg-brand-blue/10 text-text-primary"
                    : "border-ink-500 text-text-secondary hover:border-brand-blue"
                }`}
              >
                {t(`domains.${d}`)}
              </button>
            ))}
          </div>
        )}

        {shownRows.length === 0 ? (
          <p className="rounded-md border border-ink-500 bg-ink-800/40 p-3 text-sm text-text-muted">
            {t("browseEmpty")}
          </p>
        ) : (
          <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {shownRows.map((row) => (
              <li
                key={`${row.sourceTable}:${row.id}`}
                id={row.sourceTable === "marketplace_listings" ? `listing-${row.id}` : undefined}
                className={`flex flex-col gap-2 rounded-lg border border-ink-500 bg-surface-1 p-3${
                  row.sourceTable === "marketplace_listings" ? focusCls(row.id) : ""
                }`}
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium text-text-primary">{row.title}</span>
                  <span className="rounded-full border border-ink-500 bg-ink-800/40 px-2 py-0.5 text-meta text-text-muted">
                    {t(`directions.${row.direction}`)}
                  </span>
                </div>
                <p className="text-xs text-text-muted">
                  {subjectLabel(row.subject, row.domain)}
                  {row.locationLabel ? ` · ${row.locationLabel}` : ""}
                  {row.locationCountry ? ` (${row.locationCountry})` : ""}
                  {row.priceAmount != null
                    ? ` · ${formatAmount(row.priceAmount, row.currency, locale)}`
                    : row.priceText
                      ? ` · ${row.priceText}`
                      : ""}
                  {row.quantity != null ? ` · ${row.quantity}${row.unit ? ` ${row.unit}` : ""}` : ""}
                  {row.expiresAt ? ` · ${t("expiresOn", { date: formatDate(row.expiresAt, locale) })}` : ""}
                </p>
                {row.description && (
                  <p className="line-clamp-3 text-sm text-text-secondary">{row.description}</p>
                )}
                {row.contactAction === "enquire" ? (
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
                ) : (
                  <Link
                    href={row.destinationPath as "/dashboard"}
                    className="mt-1 inline-flex min-h-11 w-fit items-center gap-1.5 rounded-md border border-ink-500 px-3 py-2 text-sm text-text-secondary transition-colors hover:border-brand-blue"
                  >
                    {t("openInServices")}
                    <ArrowRight aria-hidden className="h-4 w-4" />
                  </Link>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
