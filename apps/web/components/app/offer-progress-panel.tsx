"use client";

import { useEffect, useId, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import Link from "next/link";

import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import {
  loadOfferProgressAction,
  nameOfferUnitAction,
  startWorkFromOfferAction,
  type OfferProgressData,
} from "@/lib/company/team-offer-actions";
import { startWorkBlockers } from "@/lib/market/team-offer-model";

/**
 * A COMPANY offer after the client's preliminary yes (owner decision
 * 2026-11-22, item 2): where it stands on the way to real work, for either
 * party. The supplier names the crew (one of its own brigades) that will do
 * the work; both parties confirm the same terms version (TeamOfferTerms);
 * then the client creates the project and the crew is put on it by the
 * existing hand-off. Nothing here is a contract or a signature, and nothing
 * consents for anyone: every step is the person's own click.
 */
export function OfferProgressPanel({
  offerId,
  side,
  needTitle,
}: {
  offerId: string;
  side: "supplier" | "receiver";
  /** The need's title, prefilled as the new project's name (client side). */
  needTitle?: string | null;
}) {
  const t = useTranslations("teamDemandOffer.progress");
  const tRefusal = useTranslations("teamDemandOffer.refusal");
  const locale = useLocale();
  const router = useRouter();
  const uid = useId();
  const [pending, startTransition] = useTransition();
  const [data, setData] = useState<OfferProgressData | null>(null);
  const [crew, setCrew] = useState("");
  const [title, setTitle] = useState((needTitle ?? "").slice(0, 120));
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const reload = async () => setData(await loadOfferProgressAction({ offerId }));
  useEffect(() => {
    startTransition(reload);
    // Once per offer on mount; actions reload it explicitly.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [offerId]);

  const refusal = (s: string) => (tRefusal.has(s) ? tRefusal(s) : tRefusal("error"));

  if (data === null) return <p className="text-xs text-text-muted">{t("loading")}</p>;
  if (data.status === "needs_migration") return <p className="text-xs text-text-muted">{t("notYet")}</p>;
  if (data.status !== "ok") return null;
  const p = data.progress;
  if (p.offerKind !== "organization") return null;

  function nameCrew() {
    if (!crew) return;
    setMsg(null);
    startTransition(async () => {
      const r = await nameOfferUnitAction({ offerId, unitTeamOrgId: crew });
      if (r.status === "ok") {
        setMsg({ ok: true, text: t("crewNamed") });
        await reload();
        router.refresh();
      } else {
        setMsg({ ok: false, text: refusal(r.status) });
      }
    });
  }

  function startWork() {
    setMsg(null);
    startTransition(async () => {
      const r = await startWorkFromOfferAction({ offerId, title });
      if (r.status === "ok") {
        router.push(`/${locale}/dashboard/projects/${r.projectId}`);
      } else {
        setMsg({ ok: false, text: r.status === "invalid_title" ? t("titleInvalid") : refusal(r.status) });
      }
    });
  }

  const blockers = startWorkBlockers(p);
  const agreedLine = p.agreed
    ? t("agreed", { version: p.latestVersion ?? 0 })
    : p.latestVersion === null
      ? t("noTerms")
      : (p.mySide === "supplier" ? p.supplierConfirmed : p.receiverConfirmed)
        ? t("waitingOther", { version: p.latestVersion })
        : t("waitingYou", { version: p.latestVersion });

  return (
    <div className="flex flex-col gap-2 rounded-md border border-ink-600 bg-ink-800/40 p-3 text-xs" data-testid={`offer-progress-${offerId}`}>
      <span className="font-mono text-meta uppercase tracking-label text-text-muted">{t("heading")}</span>
      {p.status === "assigned" ? (
        <p className="text-state-success" data-testid={`offer-progress-started-${offerId}`}>
          {side === "receiver" ? t("startedReceiver") : t("startedSupplier")}
        </p>
      ) : (
        <>
          <p className="text-text-primary" data-testid={`offer-progress-terms-${offerId}`}>{agreedLine}</p>
          <p className="text-text-primary" data-testid={`offer-progress-crew-${offerId}`}>
            {p.unitNamed
              ? t("crew", { name: p.unitName ?? "-", count: p.unitMemberCount })
              : side === "supplier"
                ? t("crewNotNamedSupplier")
                : t("crewNotNamedReceiver")}
          </p>

          {side === "supplier" && (p.status === "offered" || p.status === "accepted") ? (
            data.crews.length === 0 ? (
              <p className="text-text-muted">
                {t("noCrews")}{" "}
                <Link href={`/${locale}/dashboard/company/people#company-team`} className="font-semibold text-brand-blue underline-offset-2 hover:underline">
                  {t("createCrew")}
                </Link>
              </p>
            ) : (
              <div className="flex flex-wrap items-end gap-2">
                <label className="flex min-w-0 flex-1 flex-col gap-1 text-text-secondary" htmlFor={`${uid}-crew`}>
                  {t("crewLabel")}
                  <Select id={`${uid}-crew`} value={crew} onChange={(e) => setCrew(e.target.value)}
                    className="min-h-11 sm:min-h-9 max-sm:text-base" data-testid={`offer-progress-crew-select-${offerId}`}>
                    <option value="">{t("crewPlaceholder")}</option>
                    {data.crews.map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </Select>
                </label>
                <Button className="min-h-11" type="button" size="sm" disabled={pending || !crew} onClick={nameCrew}
                  data-testid={`offer-progress-crew-submit-${offerId}`}>
                  {t("crewSubmit")}
                </Button>
              </div>
            )
          ) : null}

          {side === "receiver" && p.status === "accepted" ? (
            blockers.length > 0 ? (
              <p className="text-text-muted" data-testid={`offer-progress-blocked-${offerId}`}>{t("startNeeds")}</p>
            ) : (
              <div className="flex flex-col gap-2" data-testid={`offer-progress-start-${offerId}`}>
                <p className="text-text-secondary">{t("startIntro")}</p>
                <label className="flex flex-col gap-1 text-text-secondary" htmlFor={`${uid}-title`}>
                  {t("titleLabel")}
                  <Input id={`${uid}-title`} value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)}
                    className="min-h-11 max-sm:text-base" data-testid={`offer-progress-title-${offerId}`} />
                </label>
                <div>
                  <Button className="min-h-11" type="button" size="sm" disabled={pending || title.trim().length < 2}
                    onClick={startWork} data-testid={`offer-progress-start-submit-${offerId}`}>
                    {t("startSubmit")}
                  </Button>
                </div>
              </div>
            )
          ) : null}
        </>
      )}
      {msg ? (
        <p className={msg.ok ? "text-state-success" : "text-state-danger"} role="status">{msg.text}</p>
      ) : null}
    </div>
  );
}
