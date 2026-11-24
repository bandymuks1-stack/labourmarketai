"use client";

import { useEffect, useState, useTransition } from "react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/Button";
import {
  loadMyOfferCandidaciesAction,
  withdrawOfferCandidateAction,
  type MyOfferCandidaciesData,
} from "@/lib/company/team-offer-actions";

/**
 * WHERE AN AGENCY PROPOSED YOU (20261122210000, R3 #3651). An agency whose
 * roster the person is on may propose them, without their name, for a
 * company's open need — only while the person has chosen to be visible to
 * companies. This is the person's notice of each proposal, and their own
 * "do not propose me for this" (withdraw_offer_candidate_v1 accepts the
 * worker themself). The client company is never named here: it learns the
 * person's name only if it chooses them AND they accept the booking.
 * Renders nothing when there is nothing to show.
 */
export function MyOfferCandidacies() {
  const t = useTranslations("teamDemandOffer.mine");
  const tStatus = useTranslations("teamDemandOffer.candidates");
  const tRefusal = useTranslations("teamDemandOffer.refusal");
  const [pending, startTransition] = useTransition();
  const [data, setData] = useState<MyOfferCandidaciesData | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const reload = async () => setData(await loadMyOfferCandidaciesAction());
  useEffect(() => {
    startTransition(reload);
  }, []);

  if (data === null || data.status !== "ok" || data.rows.length === 0) return null;

  function withdraw(candidateId: string) {
    setMsg(null);
    startTransition(async () => {
      const r = await withdrawOfferCandidateAction({ candidateId });
      if (r.status === "ok") {
        setMsg({ ok: true, text: t("withdrawn") });
        await reload();
      } else {
        setMsg({ ok: false, text: tRefusal.has(r.status) ? tRefusal(r.status) : tRefusal("error") });
      }
    });
  }

  return (
    <section className="flex flex-col gap-2 rounded-md border border-ink-600 bg-ink-800/40 p-4 text-sm" data-testid="my-offer-candidacies">
      <h2 className="font-mono text-meta uppercase tracking-label text-text-muted">{t("heading")}</h2>
      <p className="text-xs text-text-muted">{t("intro")}</p>
      <ul className="flex flex-col gap-2">
        {data.rows.map((c) => (
          <li key={c.candidateId} className="flex flex-col gap-1.5 rounded-md border border-ink-600 p-2" data-testid={`my-offer-candidacy-${c.candidateId}`}>
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-semibold text-text-primary">{c.agencyName}</span>
              {c.role ? <span className="text-text-secondary">{t("role", { role: c.role })}</span> : null}
              <span className="rounded-full border border-ink-500 bg-ink-800 px-2 py-0.5 font-mono text-meta uppercase tracking-label text-text-muted">
                {tStatus(`status.${c.status}`)}
              </span>
              {c.bookingStatus && tStatus.has(`booking.${c.bookingStatus}`) ? (
                <span className="text-text-secondary">{tStatus(`booking.${c.bookingStatus}`)}</span>
              ) : null}
            </div>
            <span className="text-xs text-text-muted">{t("since", { date: c.createdAt.slice(0, 10) })}</span>
            {c.status === "offered" ? (
              <div>
                <Button className="min-h-11" type="button" size="sm" variant="ghost" disabled={pending}
                  onClick={() => withdraw(c.candidateId)} data-testid={`my-offer-candidacy-withdraw-${c.candidateId}`}>
                  {t("withdraw")}
                </Button>
              </div>
            ) : null}
          </li>
        ))}
      </ul>
      {msg ? <p className={msg.ok ? "text-state-success" : "text-state-danger"} role="status">{msg.text}</p> : null}
    </section>
  );
}
