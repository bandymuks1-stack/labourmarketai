"use client";

import { useEffect, useId, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import {
  addOfferCandidateAction,
  loadOfferCandidatesAction,
  selectOfferCandidateAction,
  withdrawOfferCandidateAction,
  type OfferCandidatesData,
} from "@/lib/company/team-offer-actions";
import type { OfferCandidate } from "@/lib/market/team-offer-model";

/**
 * AGENCY CANDIDATES ON AN OPEN NEED (owner decision 2026-11-22, item 3).
 *
 * The agency attaches specific workers of its own roster to its company
 * offer — no earlier link to the client needed. The client reads each one as
 * a pseudonym with professional facts only (experience, country,
 * availability, languages, skills): no name, photo, contact or document.
 * Choosing a candidate is the client's own act; it proposes a booking to the
 * WORKER, who decides — the name is shown only after the worker accepts,
 * through the existing relation rule. The client deals with the agency only.
 */
export function OfferCandidatesPanel({ offerId, side }: { offerId: string; side: "supplier" | "receiver" }) {
  const t = useTranslations("teamDemandOffer.candidates");
  const tRefusal = useTranslations("teamDemandOffer.refusal");
  const tSkill = useTranslations("skillNames");
  const router = useRouter();
  const uid = useId();
  const [pending, startTransition] = useTransition();
  const [data, setData] = useState<OfferCandidatesData | null>(null);
  const [worker, setWorker] = useState("");
  const [note, setNote] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const reload = async () => setData(await loadOfferCandidatesAction({ offerId, side }));
  useEffect(() => {
    startTransition(reload);
    // Once per offer on mount; actions reload it explicitly.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [offerId, side]);

  const refusal = (s: string) => (tRefusal.has(s) ? tRefusal(s) : tRefusal("error"));
  const skill = (slug: string) => (tSkill.has(slug) ? tSkill(slug) : slug);

  if (data === null || data.status !== "ok") return null;
  const visible = data.candidates.filter((c) => side === "supplier" || c.status !== "withdrawn");
  // The client sees the section only when the agency proposed someone; the
  // supplier sees it only when it acts as a staffing agency.
  if (side === "receiver" && visible.length === 0) return null;
  if (side === "supplier" && data.roster === null && visible.length === 0) return null;

  function run(fn: () => Promise<{ status: string }>, okText: string) {
    setMsg(null);
    startTransition(async () => {
      const r = await fn();
      if (r.status === "ok") {
        setMsg({ ok: true, text: okText });
        await reload();
        router.refresh();
      } else {
        setMsg({ ok: false, text: refusal(r.status) });
      }
    });
  }

  const facts = (c: OfferCandidate) => {
    const rows: Array<[string, string]> = [];
    if (c.experienceYears !== null) rows.push([t("experience"), t("years", { count: c.experienceYears })]);
    if (c.workCountry) rows.push([t("country"), c.workCountry]);
    if (c.availability) {
      rows.push([
        t("availability"),
        c.availability === "available_from" && c.availableFrom
          ? t("availableFrom", { date: c.availableFrom })
          : t.has(`availabilityValue.${c.availability}`)
            ? t(`availabilityValue.${c.availability}`)
            : t("availabilityValue.unknown"),
      ]);
    }
    if (c.languages.length) rows.push([t("languages"), c.languages.map((l) => `${l.lang.toUpperCase()}${l.level ? ` ${l.level}` : ""}`).join(", ")]);
    if (c.skills.length) {
      rows.push([t("skills"), c.skills.map((k) => `${skill(k.slug)}${k.confirmed ? ` (${t("confirmed")})` : ""}`).join(", ")]);
    }
    return rows;
  };

  return (
    <div className="flex flex-col gap-2 rounded-md border border-ink-600 bg-ink-800/40 p-3 text-xs" data-testid={`offer-candidates-${offerId}`}>
      <span className="font-mono text-meta uppercase tracking-label text-text-muted">{t("heading")}</span>
      <p className="text-meta text-text-muted">{side === "supplier" ? t("introSupplier") : t("introReceiver")}</p>

      {visible.length > 0 ? (
        <ul className="flex flex-col gap-2">
          {visible.map((c) => (
            <li key={c.candidateId} className="flex flex-col gap-1.5 rounded-md border border-ink-600 p-2" data-testid={`offer-candidate-${c.candidateId}`}>
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-semibold text-text-primary">{c.label}</span>
                <span className="rounded-full border border-ink-500 bg-ink-800 px-2 py-0.5 font-mono text-meta uppercase tracking-label text-text-muted">
                  {t(`status.${c.status}`)}
                </span>
                {side === "supplier" && !c.available && c.status === "offered" ? (
                  <span className="text-state-amber" data-testid={`offer-candidate-unavailable-${c.candidateId}`}>{t("unavailable")}</span>
                ) : null}
                {c.bookingStatus ? (
                  <span className="text-text-secondary">{t.has(`booking.${c.bookingStatus}`) ? t(`booking.${c.bookingStatus}`) : c.bookingStatus}</span>
                ) : null}
              </div>
              <dl className="grid gap-x-3 gap-y-0.5 sm:grid-cols-[auto_1fr]">
                {facts(c).map(([k, v]) => (
                  <div key={k} className="contents">
                    <dt className="text-text-muted">{k}</dt>
                    <dd className="text-text-primary">{v}</dd>
                  </div>
                ))}
              </dl>
              {side === "supplier" && c.status === "offered" ? (
                <div>
                  <Button className="min-h-11" type="button" size="sm" variant="ghost" disabled={pending}
                    onClick={() => run(() => withdrawOfferCandidateAction({ candidateId: c.candidateId }), t("withdrawn"))}
                    data-testid={`offer-candidate-withdraw-${c.candidateId}`}>
                    {t("withdraw")}
                  </Button>
                </div>
              ) : null}
              {side === "receiver" && c.status === "offered" ? (
                <div className="flex flex-col gap-1.5">
                  <p className="text-meta text-text-muted">{t("selectNote")}</p>
                  <label className="flex flex-col gap-1 text-text-secondary" htmlFor={`${uid}-${c.candidateId}`}>
                    {t("noteLabel")}
                    <Input id={`${uid}-${c.candidateId}`} maxLength={500} value={note[c.candidateId] ?? ""}
                      onChange={(e) => setNote((n) => ({ ...n, [c.candidateId]: e.target.value }))}
                      className="min-h-11 max-sm:text-base" />
                  </label>
                  <div>
                    <Button className="min-h-11" type="button" size="sm" disabled={pending}
                      onClick={() => run(() => selectOfferCandidateAction({ candidateId: c.candidateId, note: note[c.candidateId] ?? null }), t("selected"))}
                      data-testid={`offer-candidate-select-${c.candidateId}`}>
                      {t("select")}
                    </Button>
                  </div>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}

      {side === "supplier" && data.roster !== null ? (
        data.roster.length === 0 ? (
          <p className="text-text-muted">{t("noRoster")}</p>
        ) : (
          <div className="flex flex-wrap items-end gap-2">
            <label className="flex min-w-0 flex-1 flex-col gap-1 text-text-secondary" htmlFor={`${uid}-add`}>
              {t("addLabel")}
              <Select id={`${uid}-add`} value={worker} onChange={(e) => setWorker(e.target.value)}
                className="min-h-11 sm:min-h-9 max-sm:text-base" data-testid={`offer-candidate-add-select-${offerId}`}>
                <option value="">{t("addPlaceholder")}</option>
                {data.roster.map((w) => (
                  <option key={w.workerId} value={w.workerId}>{w.label}</option>
                ))}
              </Select>
            </label>
            <Button className="min-h-11" type="button" size="sm" disabled={pending || !worker}
              onClick={() => run(() => addOfferCandidateAction({ offerId, workerId: worker }), t("added"))}
              data-testid={`offer-candidate-add-submit-${offerId}`}>
              {t("add")}
            </Button>
          </div>
        )
      ) : null}

      {msg ? <p className={msg.ok ? "text-state-success" : "text-state-danger"} role="status">{msg.text}</p> : null}
    </div>
  );
}
