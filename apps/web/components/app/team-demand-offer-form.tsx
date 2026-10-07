"use client";

import { useId, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/Button";
import {
  loadTeamOfferPanelAction,
  offerTeamToDemandAction,
  withdrawTeamOfferAction,
  type TeamOfferPanelData,
} from "@/lib/market/team-offer-actions";
import type { TeamOfferRefusal } from "@/lib/market/team-offer-model";

/**
 * E6 - offer this team / brigade as ONE unit against ONE open demand.
 *
 * What the company that owns the demand will see is stated here, before the
 * button: team-level facts only (size, skills, availability), never a member.
 * Members appear on a project only after the company accepts and assigns the
 * team there - the same disclosure a team assignment has always had.
 *
 * No payment, no extra confirmation step: the manager's own offer IS the
 * authorization the database records. Opens lazily (a folded section).
 */
export function TeamDemandOfferForm({ teamId, memberCount }: { teamId: string; memberCount: number }) {
  const t = useTranslations("teamDemandOffer");
  const router = useRouter();
  const uid = useId();
  const [pending, startTransition] = useTransition();
  const [data, setData] = useState<TeamOfferPanelData | null>(null);
  const [requestId, setRequestId] = useState("");
  const [note, setNote] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  function load() {
    if (data) return;
    startTransition(async () => {
      setData(await loadTeamOfferPanelAction({ teamId }));
    });
  }

  function refusalText(status: TeamOfferRefusal): string {
    return t(`refusal.${status}`);
  }

  function submit() {
    if (!requestId) return;
    setMsg(null);
    startTransition(async () => {
      const r = await offerTeamToDemandAction({ teamId, requestId, note });
      if (r.status === "ok") {
        setMsg({ ok: true, text: t(`outcome.${r.outcome}`) });
        setRequestId("");
        setNote("");
        setData(await loadTeamOfferPanelAction({ teamId }));
        router.refresh();
      } else {
        setMsg({ ok: false, text: refusalText(r.status) });
      }
    });
  }

  function withdraw(offerId: string) {
    setMsg(null);
    startTransition(async () => {
      const r = await withdrawTeamOfferAction({ offerId });
      if (r.status === "ok") {
        setMsg({ ok: true, text: t(`outcome.${r.outcome}`) });
        setData(await loadTeamOfferPanelAction({ teamId }));
        router.refresh();
      } else {
        setMsg({ ok: false, text: refusalText(r.status) });
      }
    });
  }

  return (
    <details
      className="rounded-md border border-ink-600 bg-ink-800/30 p-3"
      data-testid={`team-demand-offer-section-${teamId}`}
      onToggle={(e) => {
        if ((e.currentTarget as HTMLDetailsElement).open) load();
      }}
    >
      <summary className="cursor-pointer text-xs font-medium text-text-secondary">{t("heading")}</summary>
      <div className="flex flex-col gap-3 pt-3">
        <p className="text-xs text-text-secondary">{t("intro")}</p>
        <p className="text-meta leading-relaxed text-text-muted">{t("privacy")}</p>

        {memberCount < 2 ? (
          <p className="text-xs text-text-muted" data-testid={`team-offer-too-small-${teamId}`}>
            {t("tooSmall")}
          </p>
        ) : data === null ? (
          <p className="text-xs text-text-muted">{t("loading")}</p>
        ) : data.status === "needs_migration" ? (
          <p className="text-xs text-text-muted">{t("refusal.needs_migration")}</p>
        ) : data.status !== "ok" ? (
          <p className="text-xs text-text-muted">{t("unavailable")}</p>
        ) : (
          <>
            {data.demands.length === 0 ? (
              <p className="text-xs text-text-muted" data-testid={`team-offer-no-demand-${teamId}`}>
                {t("noDemand")}
              </p>
            ) : (
              <div className="flex flex-col gap-2">
                <label className="text-xs text-text-secondary" htmlFor={`${uid}-demand`}>
                  {t("demandLabel")}
                </label>
                <select
                  id={`${uid}-demand`}
                  value={requestId}
                  onChange={(e) => setRequestId(e.target.value)}
                  className="min-h-11 sm:min-h-9 rounded-md border border-ink-500 bg-ink-800 px-2 py-1 text-xs text-text-primary"
                  data-testid={`team-offer-demand-${teamId}`}
                >
                  <option value="">{t("demandPlaceholder")}</option>
                  {data.demands.map((d) => (
                    <option key={d.requestId} value={d.requestId} disabled={d.openOfferId !== null}>
                      {[d.roleText ?? "-", d.country ?? "-", d.companyName ?? "-"].join(" / ")}
                      {d.teamSize ? ` (${d.teamSize})` : ""}
                      {d.openOfferId ? ` - ${t("alreadyOffered")}` : ""}
                    </option>
                  ))}
                </select>
                <label className="text-xs text-text-secondary" htmlFor={`${uid}-note`}>
                  {t("noteLabel")}
                </label>
                <textarea
                  id={`${uid}-note`}
                  value={note}
                  maxLength={500}
                  rows={2}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder={t("notePlaceholder")}
                  className="rounded-md border border-ink-500 bg-ink-800 px-2 py-1 text-xs text-text-primary"
                  data-testid={`team-offer-note-${teamId}`}
                />
                <div>
                  <Button
                    type="button"
                    size="sm"
                    disabled={pending || !requestId}
                    onClick={submit}
                    data-testid={`team-offer-submit-${teamId}`}
                  >
                    {pending ? t("submitting") : t("submit")}
                  </Button>
                </div>
              </div>
            )}

            <div className="flex flex-col gap-1">
              <span className="font-mono text-meta uppercase tracking-label text-text-muted">{t("sent.heading")}</span>
              {data.sent.length === 0 ? (
                <p className="text-xs text-text-muted">{t("sent.none")}</p>
              ) : (
                <ul className="flex flex-col gap-1.5" data-testid={`team-offer-sent-${teamId}`}>
                  {data.sent.map((o) => (
                    <li key={o.offerId} className="flex flex-wrap items-center gap-2 text-xs text-text-primary">
                      <span>{[o.roleText ?? "-", o.country ?? "-", o.companyName ?? "-"].join(" / ")}</span>
                      <span className="rounded-full border border-ink-500 bg-ink-800 px-2 py-0.5 font-mono text-meta uppercase tracking-label text-text-muted">
                        {t(`status.${o.status}`)}
                      </span>
                      {o.status === "offered" || o.status === "accepted" ? (
                        <Button type="button" size="sm" variant="ghost" disabled={pending} onClick={() => withdraw(o.offerId)}>
                          {t("sent.withdraw")}
                        </Button>
                      ) : null}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </>
        )}

        {msg ? (
          <p
            className={`text-xs ${msg.ok ? "text-state-success" : "text-state-danger"}`}
            role="status"
            data-testid={`team-offer-msg-${teamId}`}
          >
            {msg.text}
          </p>
        ) : null}
      </div>
    </details>
  );
}
