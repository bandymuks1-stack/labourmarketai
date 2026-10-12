"use client";

import { useId, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { MessageSquare } from "lucide-react";

import { Button } from "@/components/ui/Button";
import {
  loadTeamOfferPanelAction,
  offerTeamToDemandAction,
  withdrawTeamOfferAction,
  type TeamOfferPanelData,
} from "@/lib/company/team-offer-actions";
import type { TeamOfferRefusal } from "@/lib/market/team-offer-model";
import { openTeamOfferConversationAction } from "@/lib/company/team-offer-conversation";
import { DisplayedWorkspaceField } from "@/components/app/workspace/displayed-workspace-field";
import { TeamOfferTerms } from "@/components/app/team-offer-terms";

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
export function TeamDemandOfferForm({
  teamId,
  memberCount,
  kind = "team",
}: {
  teamId: string;
  memberCount: number;
  /** "organization" = a company / agency offers ITSELF (no brigade needed). */
  kind?: "team" | "organization";
}) {
  const t = useTranslations("teamDemandOffer");
  const locale = useLocale();
  const router = useRouter();
  const uid = useId();
  const [pending, startTransition] = useTransition();
  const [data, setData] = useState<TeamOfferPanelData | null>(null);
  const [requestId, setRequestId] = useState("");
  const [note, setNote] = useState("");
  const [terms, setTerms] = useState({ capacity: "", rateText: "", startDate: "", scopeText: "" });
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  function load() {
    if (data) return;
    startTransition(async () => {
      setData(await loadTeamOfferPanelAction({ teamId, kind }));
    });
  }

  function refusalText(status: TeamOfferRefusal): string {
    return t(`refusal.${status}`);
  }

  function submit() {
    if (!requestId) return;
    setMsg(null);
    startTransition(async () => {
      const r = await offerTeamToDemandAction({ teamId, requestId, note, terms });
      if (r.status === "ok") {
        setMsg({ ok: true, text: t(`outcome.${r.outcome}`) });
        setRequestId("");
        setNote("");
        setTerms({ capacity: "", rateText: "", startDate: "", scopeText: "" });
        setData(await loadTeamOfferPanelAction({ teamId, kind }));
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
        setData(await loadTeamOfferPanelAction({ teamId, kind }));
        router.refresh();
      } else {
        setMsg({ ok: false, text: refusalText(r.status) });
      }
    });
  }

  const org = kind === "organization";

  return (
    <details
      className="rounded-md border border-ink-600 bg-ink-800/30 p-3"
      data-testid={`team-demand-offer-section-${teamId}`}
      onToggle={(e) => {
        if ((e.currentTarget as HTMLDetailsElement).open) load();
      }}
    >
      <summary className="cursor-pointer text-xs font-medium text-text-secondary">
        {org ? t("orgHeading") : t("heading")}
      </summary>
      <div className="flex flex-col gap-3 pt-3">
        <p className="text-xs text-text-secondary">{org ? t("orgIntro") : t("intro")}</p>
        <p className="text-meta leading-relaxed text-text-muted">{t("privacy")}</p>

        {!org && memberCount < 2 ? (
          <p className="text-xs text-text-muted" data-testid={`team-offer-too-small-${teamId}`}>
            {t("tooSmall")}
          </p>
        ) : data === null ? (
          <p className="text-xs text-text-muted">{t("loading")}</p>
        ) : data.status === "needs_migration" ? (
          <p className="text-xs text-text-muted" data-testid={org ? `team-offer-org-not-yet-${teamId}` : undefined}>
            {org ? t("orgNotYet") : t("refusal.needs_migration")}
          </p>
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
                <fieldset className="grid gap-2 sm:grid-cols-2">
                  <legend className="text-xs text-text-secondary">{t("termsLegend")}</legend>
                  <label className="flex flex-col gap-1 text-meta text-text-muted" htmlFor={`${uid}-cap`}>
                    {t("terms.capacity")}
                    <input id={`${uid}-cap`} type="number" min={1} max={500} inputMode="numeric" value={terms.capacity}
                      onChange={(e) => setTerms((v) => ({ ...v, capacity: e.target.value }))}
                      className="min-h-11 sm:min-h-9 rounded-md border border-ink-500 bg-ink-800 px-2 py-1 text-xs text-text-primary" />
                  </label>
                  <label className="flex flex-col gap-1 text-meta text-text-muted" htmlFor={`${uid}-rate`}>
                    {t("terms.rate")}
                    <input id={`${uid}-rate`} type="text" maxLength={200} value={terms.rateText} placeholder={t("terms.ratePlaceholder")}
                      onChange={(e) => setTerms((v) => ({ ...v, rateText: e.target.value }))}
                      className="min-h-11 sm:min-h-9 rounded-md border border-ink-500 bg-ink-800 px-2 py-1 text-xs text-text-primary" />
                  </label>
                  <label className="flex flex-col gap-1 text-meta text-text-muted" htmlFor={`${uid}-start`}>
                    {t("terms.start")}
                    <input id={`${uid}-start`} type="date" value={terms.startDate}
                      onChange={(e) => setTerms((v) => ({ ...v, startDate: e.target.value }))}
                      className="min-h-11 sm:min-h-9 rounded-md border border-ink-500 bg-ink-800 px-2 py-1 text-xs text-text-primary" />
                  </label>
                  <label className="flex flex-col gap-1 text-meta text-text-muted sm:col-span-2" htmlFor={`${uid}-scope`}>
                    {t("terms.scope")}
                    <textarea id={`${uid}-scope`} rows={2} maxLength={2000} value={terms.scopeText}
                      onChange={(e) => setTerms((v) => ({ ...v, scopeText: e.target.value }))}
                      className="rounded-md border border-ink-500 bg-ink-800 px-2 py-1 text-xs text-text-primary" />
                  </label>
                </fieldset>
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
                    <li key={o.offerId} className="flex flex-col gap-2 text-xs text-text-primary">
                      <div className="flex flex-wrap items-center gap-2">
                      <span>{[o.roleText ?? "-", o.country ?? "-", o.companyName ?? "-"].join(" / ")}</span>
                      <span className="rounded-full border border-ink-500 bg-ink-800 px-2 py-0.5 font-mono text-meta uppercase tracking-label text-text-muted">
                        {t(`status.${o.status}`)}
                      </span>
                      {o.status === "offered" || o.status === "accepted" || o.status === "assigned" ? (
                        // The negotiation thread with the need's owner — the action
                        // re-proves this caller manages the offering team.
                        <form action={openTeamOfferConversationAction}>
                          <DisplayedWorkspaceField />
                          <input type="hidden" name="offerId" value={o.offerId} />
                          <input type="hidden" name="locale" value={locale} />
                          <button
                            type="submit"
                            data-testid={`team-offer-sent-message-${o.offerId}`}
                            className="inline-flex min-h-11 sm:min-h-9 items-center gap-1 rounded-md border border-brand-blue/50 bg-brand-blue/10 px-2 text-xs font-semibold text-brand-blue transition-colors hover:border-brand-blue"
                          >
                            <MessageSquare className="h-3.5 w-3.5" aria-hidden /> {t("sent.message")}
                          </button>
                        </form>
                      ) : null}
                      {o.status === "offered" || o.status === "accepted" ? (
                        <Button type="button" size="sm" variant="ghost" disabled={pending} onClick={() => withdraw(o.offerId)}>
                          {t("sent.withdraw")}
                        </Button>
                      ) : null}
                      </div>
                      {o.status === "offered" || o.status === "accepted" || o.status === "assigned" ? (
                        <TeamOfferTerms offerId={o.offerId} offerOpen={o.status === "offered"} canAgree />
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
