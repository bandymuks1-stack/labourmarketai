"use client";

import { useId, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/Button";
import {
  loadOfferTermsAction,
  proposeOfferTermsAction,
  respondToTeamOfferAction,
  type OfferTermsData,
} from "@/lib/company/team-offer-actions";
import { answerableTerms, type OfferTermsVersion, type TeamOfferRefusal } from "@/lib/market/team-offer-model";

/**
 * The NEGOTIATION of one offer (20261011200000): every version of the terms
 * either side proposed, newest first, and — while the offer is open — a form
 * to propose the next version. The side that did NOT write the open version
 * may agree to it (agreed in principle — never a signed contract). Rendered
 * for both parties; the database decides who is a party and which side.
 * Opens lazily (a folded section) so a list of offers costs nothing.
 */
export function TeamOfferTerms({
  offerId,
  offerOpen,
  canAgree,
}: {
  offerId: string;
  /** The offer is still `offered` — new versions may be proposed. */
  offerOpen: boolean;
  /** This reader may agree to the OTHER side's open version. */
  canAgree: boolean;
}) {
  const t = useTranslations("teamDemandOffer.terms");
  const tRefusal = useTranslations("teamDemandOffer.refusal");
  const router = useRouter();
  const uid = useId();
  const [pending, startTransition] = useTransition();
  const [data, setData] = useState<OfferTermsData | null>(null);
  const [form, setForm] = useState({ capacity: "", rateText: "", startDate: "", endDate: "", scopeText: "", conditionsText: "" });
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const reload = async () => setData(await loadOfferTermsAction({ offerId }));
  const refusal = (s: TeamOfferRefusal) => tRefusal(s);

  function load() {
    if (data) return;
    startTransition(reload);
  }

  function propose() {
    setMsg(null);
    startTransition(async () => {
      const r = await proposeOfferTermsAction({ offerId, terms: form });
      if (r.status === "ok") {
        setMsg({ ok: true, text: t("proposed", { version: r.version }) });
        setForm({ capacity: "", rateText: "", startDate: "", endDate: "", scopeText: "", conditionsText: "" });
        await reload();
        router.refresh();
      } else {
        setMsg({ ok: false, text: refusal(r.status) });
      }
    });
  }

  function agree() {
    setMsg(null);
    startTransition(async () => {
      // Agree to the version ON THE SCREEN — a newer one refuses, and the
      // list reloads so the person sees what changed.
      const r = await respondToTeamOfferAction({
        offerId,
        decision: "accept",
        expectedVersion: answerable?.version ?? null,
      });
      if (r.status === "ok") {
        setMsg({ ok: true, text: t("agreed") });
        await reload();
        router.refresh();
      } else {
        setMsg({ ok: false, text: refusal(r.status) });
        if (r.status === "terms_changed") await reload();
      }
    });
  }

  const versions: readonly OfferTermsVersion[] = data?.status === "ok" ? data.versions : [];
  const answerable = answerableTerms(versions);
  const input =
    "min-h-11 sm:min-h-9 rounded-md border border-ink-500 bg-ink-800 px-2 py-1 text-xs text-text-primary";

  return (
    <details
      className="rounded-md border border-ink-600 bg-ink-800/30 p-3"
      data-testid={`team-offer-terms-${offerId}`}
      onToggle={(e) => {
        if ((e.currentTarget as HTMLDetailsElement).open) load();
      }}
    >
      <summary className="cursor-pointer text-xs font-medium text-text-secondary">{t("heading")}</summary>
      <div className="flex flex-col gap-3 pt-3">
        {data === null ? (
          <p className="text-xs text-text-muted">{t("loading")}</p>
        ) : data.status === "needs_migration" ? (
          <p className="text-xs text-text-muted">{t("notYet")}</p>
        ) : data.status !== "ok" ? (
          <p className="text-xs text-text-muted">{t("unavailable")}</p>
        ) : (
          <>
            {versions.length === 0 ? (
              <p className="text-xs text-text-muted">{t("none")}</p>
            ) : (
              <ol className="flex flex-col gap-2" data-testid={`team-offer-terms-history-${offerId}`}>
                {versions.map((v) => (
                  <li
                    key={v.version}
                    className={`flex flex-col gap-1 rounded-md border p-2 text-xs ${
                      v.status === "proposed" ? "border-brand-blue/50" : "border-ink-600"
                    }`}
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-meta text-text-muted">v{v.version}</span>
                      <span className="text-text-secondary">{v.mine ? t("byYou") : t("byOther")}</span>
                      <span className="rounded-full border border-ink-500 bg-ink-800 px-2 py-0.5 font-mono text-meta uppercase tracking-label text-text-muted">
                        {t(`status.${v.status}`)}
                      </span>
                    </div>
                    <dl className="grid gap-1 sm:grid-cols-2">
                      {v.capacity !== null ? <Row k={t("capacity")} v={String(v.capacity)} /> : null}
                      {v.rateText ? <Row k={t("rate")} v={v.rateText} /> : null}
                      {v.startDate || v.endDate ? (
                        <Row k={t("period")} v={`${v.startDate ?? "?"} – ${v.endDate ?? "?"}`} />
                      ) : null}
                      {v.scopeText ? <Row k={t("scope")} v={v.scopeText} wide /> : null}
                      {v.conditionsText ? <Row k={t("conditions")} v={v.conditionsText} wide /> : null}
                    </dl>
                  </li>
                ))}
              </ol>
            )}

            {answerable && canAgree && offerOpen ? (
              <div className="flex flex-col gap-1">
                <p className="text-meta text-text-muted">{t("agreeNote")}</p>
                <div>
                  <Button type="button" size="sm" disabled={pending} onClick={agree} data-testid={`team-offer-terms-agree-${offerId}`}>
                    {t("agree", { version: answerable.version })}
                  </Button>
                </div>
              </div>
            ) : null}

            {offerOpen ? (
              <fieldset className="flex flex-col gap-2" data-testid={`team-offer-terms-form-${offerId}`}>
                <legend className="text-xs font-medium text-text-secondary">
                  {versions.length === 0 ? t("proposeFirst") : t("proposeNext")}
                </legend>
                <div className="grid gap-2 sm:grid-cols-2">
                  <label className="flex flex-col gap-1 text-meta text-text-muted" htmlFor={`${uid}-cap`}>
                    {t("capacity")}
                    <input id={`${uid}-cap`} type="number" min={1} max={500} inputMode="numeric" value={form.capacity}
                      onChange={(e) => setForm((f) => ({ ...f, capacity: e.target.value }))} className={input} />
                  </label>
                  <label className="flex flex-col gap-1 text-meta text-text-muted" htmlFor={`${uid}-rate`}>
                    {t("rate")}
                    <input id={`${uid}-rate`} type="text" maxLength={200} value={form.rateText} placeholder={t("ratePlaceholder")}
                      onChange={(e) => setForm((f) => ({ ...f, rateText: e.target.value }))} className={input} />
                  </label>
                  <label className="flex flex-col gap-1 text-meta text-text-muted" htmlFor={`${uid}-start`}>
                    {t("start")}
                    <input id={`${uid}-start`} type="date" value={form.startDate}
                      onChange={(e) => setForm((f) => ({ ...f, startDate: e.target.value }))} className={input} />
                  </label>
                  <label className="flex flex-col gap-1 text-meta text-text-muted" htmlFor={`${uid}-end`}>
                    {t("end")}
                    <input id={`${uid}-end`} type="date" value={form.endDate}
                      onChange={(e) => setForm((f) => ({ ...f, endDate: e.target.value }))} className={input} />
                  </label>
                </div>
                <label className="flex flex-col gap-1 text-meta text-text-muted" htmlFor={`${uid}-scope`}>
                  {t("scope")}
                  <textarea id={`${uid}-scope`} rows={2} maxLength={2000} value={form.scopeText}
                    onChange={(e) => setForm((f) => ({ ...f, scopeText: e.target.value }))} className={input} />
                </label>
                <label className="flex flex-col gap-1 text-meta text-text-muted" htmlFor={`${uid}-cond`}>
                  {t("conditions")}
                  <textarea id={`${uid}-cond`} rows={2} maxLength={2000} value={form.conditionsText}
                    onChange={(e) => setForm((f) => ({ ...f, conditionsText: e.target.value }))} className={input} />
                </label>
                <div>
                  <Button type="button" size="sm" variant="ghost" disabled={pending} onClick={propose}
                    data-testid={`team-offer-terms-propose-${offerId}`}>
                    {t("propose")}
                  </Button>
                </div>
              </fieldset>
            ) : null}
          </>
        )}

        {msg ? (
          <p className={`text-xs ${msg.ok ? "text-state-success" : "text-state-danger"}`} role="status">
            {msg.text}
          </p>
        ) : null}
      </div>
    </details>
  );
}

function Row({ k, v, wide }: { k: string; v: string; wide?: boolean }) {
  return (
    <div className={`flex flex-col gap-0.5 ${wide ? "sm:col-span-2" : ""}`}>
      <dt className="font-mono text-meta uppercase tracking-label text-text-muted">{k}</dt>
      <dd className="whitespace-pre-line text-text-primary">{v}</dd>
    </div>
  );
}
