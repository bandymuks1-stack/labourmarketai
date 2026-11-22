"use client";

import { useId, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/Button";
import {
  confirmOfferTermsAction,
  loadOfferTermsAction,
  proposeOfferTermsAction,
  respondToTeamOfferAction,
  type OfferTermsData,
} from "@/lib/company/team-offer-actions";
import {
  answerableTerms,
  confirmableTerms,
  type OfferTermsVersion,
  type TeamOfferRefusal,
  type TeamOfferStatus,
} from "@/lib/market/team-offer-model";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";

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
  offerStatus,
  canAgree,
}: {
  offerId: string;
  /** offered: propose + the preliminary yes; accepted (after the client's
   *  preliminary yes): keep proposing, and BOTH sides confirm one version
   *  (20261122200000); anything else: history only. */
  offerStatus: TeamOfferStatus;
  /** This reader may agree to the OTHER side's open version. */
  canAgree: boolean;
}) {
  const offerOpen = offerStatus === "offered";
  const canPropose = offerStatus === "offered" || offerStatus === "accepted";
  const t = useTranslations("teamDemandOffer.terms");
  const tRefusal = useTranslations("teamDemandOffer.refusal");
  const router = useRouter();
  const uid = useId();
  const [pending, startTransition] = useTransition();
  const [data, setData] = useState<OfferTermsData | null>(null);
  const EMPTY = { capacity: "", rateText: "", startDate: "", endDate: "", scopeText: "", conditionsText: "", placeText: "" };
  const [form, setForm] = useState(EMPTY);
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
        setForm(EMPTY);
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

  function confirm() {
    if (!confirmable) return;
    setMsg(null);
    startTransition(async () => {
      // Confirm the version ON THE SCREEN — a newer one refuses and reloads.
      const r = await confirmOfferTermsAction({ offerId, expectedVersion: confirmable.version });
      if (r.status === "ok") {
        setMsg({ ok: true, text: r.outcome === "agreed" ? t("agreedBoth", { version: r.version }) : t("confirmedMine") });
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
  const confirmable = offerStatus === "accepted" ? confirmableTerms(versions) : null;
  // The shared Input/Textarea carry the field look; this only adds the phone floor.
  const input = "min-h-11 max-sm:text-base";

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
                      {v.placeText ? <Row k={t("place")} v={v.placeText} wide /> : null}
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
                  <Button className="min-h-11" type="button" size="sm" disabled={pending} onClick={agree} data-testid={`team-offer-terms-agree-${offerId}`}>
                    {t("agree", { version: answerable.version })}
                  </Button>
                </div>
              </div>
            ) : null}

            {offerStatus === "accepted" ? (
              <div className="flex flex-col gap-1" data-testid={`team-offer-terms-confirm-${offerId}`}>
                {confirmable === null ? (
                  <p className="text-meta text-text-muted">{t("confirmNeedsTerms")}</p>
                ) : confirmable.supplierConfirmed && confirmable.receiverConfirmed ? (
                  <p className="text-xs text-state-success">{t("agreedBoth", { version: confirmable.version })}</p>
                ) : (
                  <>
                    <p className="text-meta text-text-muted">{t("confirmNote")}</p>
                    <p className="text-xs text-text-secondary">
                      {confirmable.confirmedByMe ? t("confirmedByYou", { version: confirmable.version }) : t("notConfirmedByYou", { version: confirmable.version })}
                      {" · "}
                      {otherConfirmed(confirmable) ? t("otherConfirmed") : t("otherNotConfirmed")}
                    </p>
                    {!confirmable.confirmedByMe ? (
                      <div>
                        <Button className="min-h-11" type="button" size="sm" disabled={pending} onClick={confirm}
                          data-testid={`team-offer-terms-confirm-submit-${offerId}`}>
                          {t("confirm", { version: confirmable.version })}
                        </Button>
                      </div>
                    ) : null}
                  </>
                )}
              </div>
            ) : null}

            {canPropose ? (
              <fieldset className="flex flex-col gap-2" data-testid={`team-offer-terms-form-${offerId}`}>
                <legend className="text-xs font-medium text-text-secondary">
                  {versions.length === 0 ? t("proposeFirst") : t("proposeNext")}
                </legend>
                <div className="grid gap-2 sm:grid-cols-2">
                  <label className="flex flex-col gap-1 text-meta text-text-muted" htmlFor={`${uid}-cap`}>
                    {t("capacity")}
                    <Input id={`${uid}-cap`} type="number" min={1} max={500} inputMode="numeric" value={form.capacity}
                      onChange={(e) => setForm((f) => ({ ...f, capacity: e.target.value }))} className={input} />
                  </label>
                  <label className="flex flex-col gap-1 text-meta text-text-muted" htmlFor={`${uid}-rate`}>
                    {t("rate")}
                    <Input id={`${uid}-rate`} type="text" maxLength={200} value={form.rateText}
                      onChange={(e) => setForm((f) => ({ ...f, rateText: e.target.value }))} className={input} />
                  </label>
                  <label className="flex flex-col gap-1 text-meta text-text-muted" htmlFor={`${uid}-start`}>
                    {t("start")}
                    <Input id={`${uid}-start`} type="date" value={form.startDate}
                      onChange={(e) => setForm((f) => ({ ...f, startDate: e.target.value }))} className={input} />
                  </label>
                  <label className="flex flex-col gap-1 text-meta text-text-muted" htmlFor={`${uid}-end`}>
                    {t("end")}
                    <Input id={`${uid}-end`} type="date" value={form.endDate}
                      onChange={(e) => setForm((f) => ({ ...f, endDate: e.target.value }))} className={input} />
                  </label>
                </div>
                <label className="flex flex-col gap-1 text-meta text-text-muted" htmlFor={`${uid}-scope`}>
                  {t("scope")}
                  <Textarea id={`${uid}-scope`} rows={2} maxLength={2000} value={form.scopeText}
                    onChange={(e) => setForm((f) => ({ ...f, scopeText: e.target.value }))} className={input} />
                </label>
                <label className="flex flex-col gap-1 text-meta text-text-muted" htmlFor={`${uid}-place`}>
                  {t("place")}
                  <Input id={`${uid}-place`} type="text" maxLength={300} value={form.placeText} placeholder={t("placePlaceholder")}
                    onChange={(e) => setForm((f) => ({ ...f, placeText: e.target.value }))} className={input} />
                </label>
                <label className="flex flex-col gap-1 text-meta text-text-muted" htmlFor={`${uid}-cond`}>
                  {t("conditions")}
                  <Textarea id={`${uid}-cond`} rows={2} maxLength={2000} value={form.conditionsText}
                    onChange={(e) => setForm((f) => ({ ...f, conditionsText: e.target.value }))} className={input} />
                </label>
                <div>
                  <Button className="min-h-11" type="button" size="sm" variant="ghost" disabled={pending} onClick={propose}
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

/** Whether the OTHER party confirmed this version: the reader's side is the
 *  author's when the version is `mine`, the opposite side otherwise. */
function otherConfirmed(v: OfferTermsVersion): boolean {
  const mySide = v.mine ? v.proposedSide : v.proposedSide === "supplier" ? "receiver" : "supplier";
  return mySide === "supplier" ? v.receiverConfirmed : v.supplierConfirmed;
}

function Row({ k, v, wide }: { k: string; v: string; wide?: boolean }) {
  return (
    <div className={`flex flex-col gap-0.5 ${wide ? "sm:col-span-2" : ""}`}>
      <dt className="font-mono text-meta uppercase tracking-label text-text-muted">{k}</dt>
      <dd className="whitespace-pre-line text-text-primary">{v}</dd>
    </div>
  );
}
