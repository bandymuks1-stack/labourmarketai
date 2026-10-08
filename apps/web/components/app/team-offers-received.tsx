"use client";

import { useId, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/Button";
import { handOffTeamOfferAction, respondToTeamOfferAction } from "@/lib/company/team-offer-actions";
import type { OfferMatchView, ReceivedTeamOffer, TeamOfferRefusal } from "@/lib/market/team-offer-model";

/**
 * E6 - the RECEIVING side of "a brigade offered itself against your need".
 *
 * Shows team-level facts only: size, skills, availability, and how the team fits
 * THIS need (matchTeamToNeed on the team-aggregate basis, basis named). There is
 * no member row and no way to reach one from here: members appear on a project
 * only after the team is assigned to it, through the existing team-assignment
 * resolver, exactly as for any other team.
 *
 * accept / decline -> (accepted) assign to one of YOUR projects. No payment and
 * no extra confirmation step: the offer is the team's authorization, the
 * accept + assign are yours.
 */
export function TeamOffersReceived({
  offers,
  projects,
  needOpen,
}: {
  offers: readonly { offer: ReceivedTeamOffer; match: OfferMatchView | null }[];
  projects: readonly { id: string; title: string | null }[];
  needOpen: boolean;
}) {
  const t = useTranslations("teamDemandOffer");
  const tSkill = useTranslations("skillNames");
  const router = useRouter();
  const uid = useId();
  const [pending, startTransition] = useTransition();
  const [projectByOffer, setProjectByOffer] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState<Record<string, { ok: boolean; text: string }>>({});

  const skillLabel = (slug: string) => (tSkill.has(slug) ? tSkill(slug) : slug);
  const refusalText = (s: TeamOfferRefusal) => t(`refusal.${s}`);
  const note = (offerId: string, ok: boolean, text: string) => setMsg((m) => ({ ...m, [offerId]: { ok, text } }));

  function respond(offerId: string, decision: "accept" | "decline") {
    startTransition(async () => {
      const r = await respondToTeamOfferAction({ offerId, decision });
      if (r.status === "ok") {
        note(offerId, true, t(`received.outcome.${r.outcome}`));
        router.refresh();
      } else {
        note(offerId, false, refusalText(r.status));
      }
    });
  }

  function assign(offerId: string) {
    const projectId = projectByOffer[offerId];
    if (!projectId) return;
    startTransition(async () => {
      const r = await handOffTeamOfferAction({ offerId, projectId });
      if (r.status === "ok") {
        note(offerId, true, t(`received.outcome.${r.outcome === "created" ? "assigned" : "already_assigned"}`));
        router.refresh();
      } else {
        note(offerId, false, refusalText(r.status));
      }
    });
  }

  return (
    <section className="flex flex-col gap-3 rounded-lg border border-ink-600 p-4" data-testid="scouting-team-offers">
      <header className="flex flex-col gap-1">
        <h2 className="font-display text-base font-semibold text-text-primary">{t("received.title")}</h2>
        <p className="text-xs leading-relaxed text-text-secondary">{t("received.subtitle")}</p>
        <p className="text-meta leading-relaxed text-text-muted">{t("received.privacy")}</p>
      </header>
      <ul className="flex flex-col gap-3">
        {offers.map(({ offer, match }) => {
          const m = msg[offer.offerId];
          const size =
            offer.deployableMin !== null || offer.deployableMax !== null
              ? t("received.deployable", { min: offer.deployableMin ?? "?", max: offer.deployableMax ?? "?" })
              : null;
          return (
            <li
              key={offer.offerId}
              className="flex flex-col gap-3 rounded-md border border-ink-600 bg-ink-800/30 p-3"
              data-testid={`team-offer-received-${offer.offerId}`}
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-display text-sm font-semibold text-text-primary">{offer.teamName}</span>
                <span className="rounded-full border border-ink-500 bg-ink-800 px-2 py-0.5 font-mono text-meta uppercase tracking-label text-text-muted">
                  {t(`status.${offer.status}`)}
                </span>
                <span className="text-xs text-text-secondary">{t("received.members", { count: offer.memberCount })}</span>
                {size ? <span className="text-xs text-text-secondary">{size}</span> : null}
              </div>

              <dl className="grid gap-2 text-xs sm:grid-cols-2">
                <div className="flex flex-col gap-0.5">
                  <dt className="font-mono text-meta uppercase tracking-label text-text-muted">
                    {t("received.availability")}
                  </dt>
                  <dd className="text-text-primary">
                    {offer.availabilityStatus === "available_now"
                      ? t("received.availableNow")
                      : offer.availabilityStatus === "available_from"
                        ? t("received.availableFrom", { date: offer.availableFrom ?? "-" })
                        : offer.availabilityStatus === "not_available"
                          ? t("received.notAvailable")
                          : t("received.availabilityUnknown")}
                  </dd>
                </div>
                <div className="flex flex-col gap-0.5">
                  <dt className="font-mono text-meta uppercase tracking-label text-text-muted">
                    {t("received.consent")}
                  </dt>
                  <dd className="text-text-primary">
                    {t("received.consentValue", { consented: offer.consentedMembers, total: offer.memberCount })}
                  </dd>
                </div>
                <div className="flex flex-col gap-0.5 sm:col-span-2">
                  <dt className="font-mono text-meta uppercase tracking-label text-text-muted">
                    {t("received.skills")}
                  </dt>
                  <dd>
                    {offer.skills.length === 0 ? (
                      <span className="text-text-muted">{t("received.skillsUnknown")}</span>
                    ) : (
                      <ul className="flex flex-wrap gap-1.5">
                        {offer.skills.map((s) => (
                          <li
                            key={s.slug}
                            className="rounded-md border border-ink-600 bg-ink-800/60 px-2 py-0.5 text-meta text-text-secondary"
                          >
                            <span className="text-text-primary">{skillLabel(s.slug)}</span> -{" "}
                            {t("received.skillCount", { declared: s.declared, confirmed: s.confirmed })}
                          </li>
                        ))}
                      </ul>
                    )}
                  </dd>
                </div>
                {offer.languages.length > 0 ? (
                  <div className="flex flex-col gap-0.5 sm:col-span-2">
                    <dt className="font-mono text-meta uppercase tracking-label text-text-muted">
                      {t("received.languages")}
                    </dt>
                    <dd className="text-text-primary">
                      {offer.languages
                        .map((l) => `${l.code.toUpperCase()}${l.level ? ` ${l.level}` : ""} x${l.count}`)
                        .join(" / ")}
                    </dd>
                  </div>
                ) : null}
              </dl>

              {match ? (
                <div className="flex flex-col gap-1 rounded-md border border-ink-600 bg-ink-800/40 p-2" data-testid={`team-offer-match-${offer.offerId}`}>
                  <span className="text-xs text-text-primary">
                    {t("received.fit")}: {t(`received.matchStatus.${match.status}`)}
                    {match.coveredCount !== null && match.needTotal !== null
                      ? ` - ${t("received.coverage", { covered: match.coveredCount, total: match.needTotal })}`
                      : ""}
                  </span>
                  <span className="text-meta text-text-muted">
                    {t(`received.basis.${match.basis === "member_results" ? "members" : "aggregate"}`)}
                  </span>
                  {match.blockers.length > 0 ? (
                    <span className="text-meta text-state-danger">
                      {t("received.blockers", { list: match.blockers.join(", ") })}
                    </span>
                  ) : null}
                  {match.missing.length > 0 || match.missingData.length > 0 ? (
                    <span className="text-meta text-text-muted">
                      {t("received.missing", { list: [...match.missing, ...match.missingData].join(", ") })}
                    </span>
                  ) : null}
                </div>
              ) : (
                <p className="text-meta text-text-muted">{t("received.noNeedStructure")}</p>
              )}

              {offer.note ? (
                <p className="text-xs text-text-secondary">
                  <span className="text-text-muted">{t("received.note")}:</span> {offer.note}
                </p>
              ) : null}

              {offer.status === "offered" ? (
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    size="sm"
                    disabled={pending || !needOpen}
                    onClick={() => respond(offer.offerId, "accept")}
                    data-testid={`team-offer-accept-${offer.offerId}`}
                  >
                    {t("received.accept")}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    disabled={pending}
                    onClick={() => respond(offer.offerId, "decline")}
                    data-testid={`team-offer-decline-${offer.offerId}`}
                  >
                    {t("received.decline")}
                  </Button>
                </div>
              ) : null}

              {offer.status === "accepted" ? (
                projects.length === 0 ? (
                  <p className="text-xs text-text-muted">{t("received.noProjects")}</p>
                ) : (
                  <div className="flex flex-col gap-2" data-testid={`team-offer-assign-${offer.offerId}`}>
                    <p className="text-xs text-text-secondary">{t("received.assignIntro")}</p>
                    <div className="flex flex-wrap items-center gap-2">
                      <label className="sr-only" htmlFor={`${uid}-${offer.offerId}`}>
                        {t("received.projectLabel")}
                      </label>
                      <select
                        id={`${uid}-${offer.offerId}`}
                        value={projectByOffer[offer.offerId] ?? ""}
                        onChange={(e) => setProjectByOffer((p) => ({ ...p, [offer.offerId]: e.target.value }))}
                        className="min-h-11 sm:min-h-9 rounded-md border border-ink-500 bg-ink-800 px-2 py-1 text-xs text-text-primary"
                      >
                        <option value="">{t("received.projectPlaceholder")}</option>
                        {projects.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.title ?? p.id.slice(0, 8)}
                          </option>
                        ))}
                      </select>
                      <Button
                        type="button"
                        size="sm"
                        disabled={pending || !projectByOffer[offer.offerId]}
                        onClick={() => assign(offer.offerId)}
                        data-testid={`team-offer-assign-submit-${offer.offerId}`}
                      >
                        {t("received.assign")}
                      </Button>
                    </div>
                  </div>
                )
              ) : null}

              {offer.status === "assigned" ? (
                <p className="text-xs text-state-success">{t("received.assignedNote")}</p>
              ) : null}

              {m ? (
                <p className={`text-xs ${m.ok ? "text-state-success" : "text-state-danger"}`} role="status">
                  {m.text}
                </p>
              ) : null}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
