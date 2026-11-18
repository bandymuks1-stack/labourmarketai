import { getTranslations } from "next-intl/server";

import { Card } from "@/components/ui/Card";
import { PartnershipActionForm } from "@/components/app/agency/partnership-action-form";
import type { AgencyCooperation } from "@/lib/agency/partnerships";
import { dueByCurrency, PARTNERSHIP_ERROR_CODES } from "@/lib/agency/partnerships-model";
import {
  acceptPartnershipAction,
  declinePartnershipAction,
  endPartnershipAction,
  invitePartnerAgencyAction,
  offerPartnerCandidateAction,
  passNeedToPartnerAction,
  takeBackNeedAction,
} from "@/lib/agency/partnerships-actions";

/**
 * AGENCY-TO-AGENCY COOPERATION AND COMMISSIONS on the agency's partners page
 * (register 4.30, migration 20261118100000, RED, owner-gated).
 *
 * Partner agencies (invite, accept for this agency, decline, end); passing one
 * of this agency's client needs to an active partner and taking it back; the
 * needs partners passed to this agency, each with this agency's own roster to
 * offer from; the partners' candidates on this agency's clients' needs; and
 * the commissions — due only on an actual placement, never charged here.
 */
const SELECT =
  "rounded-lg border border-ink-500 bg-ink-700 px-3 py-2 text-sm text-text-primary outline-none focus:border-brand-blue";

function money(amount: number, currency: string, locale: string): string {
  try {
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency,
      maximumFractionDigits: Number.isInteger(amount) ? 0 : 2,
    }).format(amount);
  } catch {
    return `${amount} ${currency}`;
  }
}

function percent(n: number, locale: string): string {
  return new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(n);
}

export async function AgencyPartnershipsSection({
  companyId,
  locale,
  cooperation,
  sharedNeeds,
  roster,
}: {
  companyId: string;
  locale: string;
  cooperation: AgencyCooperation;
  /** This agency's client needs (its active client shares). */
  sharedNeeds: readonly { readonly shareId: string; readonly requestId: string; readonly title: string }[];
  /** This agency's own active roster. */
  roster: readonly { readonly workerId: string; readonly label: string }[];
}) {
  const t = await getTranslations("agencyPartnerships");
  const errors = Object.fromEntries(PARTNERSHIP_ERROR_CODES.map((c) => [c, t(`errors.${c}`)]));
  const common = { pending: t("working"), errors };

  if (cooperation.kind !== "ok") {
    return (
      <Card className="flex flex-col gap-2" data-testid="agency-partnerships">
        <h2 className="font-display text-lg font-semibold text-text-primary">{t("title")}</h2>
        <p className="text-sm text-text-muted" data-testid="agency-partnerships-unavailable">
          {t("unavailable")}
        </p>
      </Card>
    );
  }

  const { partnerships, passedToMe, myPasses, partnerOffers, commissions } = cooperation;
  const activeLead = partnerships.filter((p) => p.side === "lead" && p.status === "active");
  const titleByShare = new Map(sharedNeeds.map((n) => [n.shareId, n.title]));
  const titleByRequest = new Map<string, string>([
    ...passedToMe.map((n) => [n.requestId, n.title] as const),
    ...sharedNeeds.map((n) => [n.requestId, n.title] as const),
  ]);
  const partnerNameById = new Map(partnerships.map((p) => [p.id, p.partnerName ?? ""]));
  const due = dueByCurrency(commissions);

  return (
    <Card className="flex flex-col gap-5" data-testid="agency-partnerships">
      <header className="flex flex-col gap-1">
        <h2 className="font-display text-lg font-semibold text-text-primary">{t("title")}</h2>
        <p className="text-sm text-text-secondary">{t("intro")}</p>
      </header>

      {/* Partner agencies */}
      <section className="flex flex-col gap-3" data-testid="agency-partnerships-list">
        {partnerships.length === 0 ? (
          <p className="text-sm text-text-muted">{t("empty")}</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {partnerships.map((p) => {
              const other = p.side === "lead" ? (p.partnerName ?? p.invitedEmail ?? "") : p.leadName;
              return (
                <li
                  key={p.id}
                  className="flex flex-col gap-2 rounded-md border border-ink-500 bg-ink-800/40 p-3"
                  data-testid={`agency-partnership-${p.id}`}
                  data-side={p.side}
                  data-status={p.status}
                >
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <p className="text-sm font-semibold text-text-primary">{other}</p>
                    <p className="font-mono text-meta uppercase tracking-label text-text-muted">
                      {t(`side.${p.side}`)} · {t(`status.${p.status}`)}
                    </p>
                  </div>
                  <p className="text-sm text-text-secondary">
                    {t("shareLine", { percent: percent(p.partnerSharePercent, locale) })}
                  </p>
                  {p.side === "invited" && p.status === "pending" ? (
                    <div className="flex flex-col gap-2">
                      <p className="text-sm text-text-secondary">
                        {t("acceptConsequence", { agency: p.leadName, percent: percent(p.partnerSharePercent, locale) })}
                      </p>
                      <div className="flex flex-wrap gap-3">
                        <PartnershipActionForm
                          action={acceptPartnershipAction}
                          hidden={{ partnership_id: p.id, company_id: companyId }}
                          submit={t("accept")}
                          done={t("accepted")}
                          testId={`agency-partnership-accept-${p.id}`}
                          variant="primary"
                          {...common}
                        />
                        <PartnershipActionForm
                          action={declinePartnershipAction}
                          hidden={{ partnership_id: p.id }}
                          submit={t("decline")}
                          done={t("declined")}
                          testId={`agency-partnership-decline-${p.id}`}
                          variant="ghost"
                          {...common}
                        />
                      </div>
                    </div>
                  ) : null}
                  {(p.side === "lead" || p.side === "partner") && (p.status === "active" || p.status === "pending") ? (
                    <PartnershipActionForm
                      action={endPartnershipAction}
                      hidden={{ partnership_id: p.id }}
                      submit={p.status === "pending" ? t("withdrawInvite") : t("end")}
                      done={t("ended")}
                      testId={`agency-partnership-end-${p.id}`}
                      variant="ghost"
                      {...common}
                    />
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}

        <PartnershipActionForm
          action={invitePartnerAgencyAction}
          hidden={{ company_id: companyId }}
          submit={t("invite.submit")}
          done={t("invite.sent")}
          testId="agency-partnership-invite"
          {...common}
        >
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
            <label className="flex min-w-48 flex-1 flex-col gap-1">
              <span className="text-xs font-medium text-text-secondary">{t("invite.email")}</span>
              <input type="email" name="email" required maxLength={254} autoComplete="off" className={SELECT} />
            </label>
            <label className="flex w-full flex-col gap-1 sm:w-48">
              <span className="text-xs font-medium text-text-secondary">{t("invite.share")}</span>
              <input
                type="number"
                name="share_percent"
                required
                min="0.01"
                max="99.99"
                step="0.01"
                inputMode="decimal"
                className={SELECT}
              />
            </label>
          </div>
        </PartnershipActionForm>
      </section>

      {/* Pass one of this agency's client needs to an active partner */}
      {activeLead.length > 0 ? (
        <section className="flex flex-col gap-3" data-testid="agency-partnerships-pass">
          <h3 className="text-sm font-semibold text-text-primary">{t("pass.title")}</h3>
          {sharedNeeds.length === 0 ? (
            <p className="text-sm text-text-muted">{t("pass.none")}</p>
          ) : (
            activeLead.map((p) => (
              <PartnershipActionForm
                key={p.id}
                action={passNeedToPartnerAction}
                hidden={{ partnership_id: p.id }}
                submit={t("pass.submit", { agency: p.partnerName ?? "" })}
                done={t("pass.done")}
                testId={`agency-partnership-pass-${p.id}`}
                {...common}
              >
                <label className="flex flex-col gap-1">
                  <span className="text-xs font-medium text-text-secondary">{t("pass.need")}</span>
                  <select name="client_share_id" required defaultValue="" className={SELECT}>
                    <option value="" disabled>
                      {t("pass.choose")}
                    </option>
                    {sharedNeeds.map((n) => (
                      <option key={n.shareId} value={n.shareId}>
                        {n.title}
                      </option>
                    ))}
                  </select>
                </label>
              </PartnershipActionForm>
            ))
          )}
          {myPasses.length > 0 ? (
            <ul className="flex flex-col gap-2">
              {myPasses.map((m) => (
                <li
                  key={m.partnerShareId}
                  className="flex flex-wrap items-center justify-between gap-2 text-sm text-text-secondary"
                  data-testid={`agency-partnership-passed-${m.partnerShareId}`}
                >
                  <span>
                    {titleByShare.get(m.clientShareId) ?? "—"} → {partnerNameById.get(m.partnershipId) ?? ""}
                  </span>
                  <PartnershipActionForm
                    action={takeBackNeedAction}
                    hidden={{ partner_share_id: m.partnerShareId }}
                    submit={t("pass.takeBack")}
                    done={null}
                    testId={`agency-partnership-takeback-${m.partnerShareId}`}
                    variant="ghost"
                    {...common}
                  />
                </li>
              ))}
            </ul>
          ) : null}
        </section>
      ) : null}

      {/* Needs partners passed to this agency */}
      {passedToMe.length > 0 ? (
        <section className="flex flex-col gap-3" data-testid="agency-partnerships-passed-to-me">
          <h3 className="text-sm font-semibold text-text-primary">{t("passedToMe.title")}</h3>
          <ul className="flex flex-col gap-3">
            {passedToMe.map((n) => (
              <li
                key={n.partnerShareId}
                className="flex flex-col gap-2 rounded-md border border-ink-500 bg-ink-800/40 p-3"
                data-testid={`agency-partnership-need-${n.partnerShareId}`}
              >
                <p className="text-sm font-semibold text-text-primary">{n.title}</p>
                <p className="text-sm text-text-secondary">
                  {t("passedToMe.from", { agency: n.leadName, percent: percent(n.partnerSharePercent, locale) })}
                </p>
                {roster.length === 0 ? (
                  <p className="text-sm text-text-muted">{t("passedToMe.noRoster")}</p>
                ) : (
                  <PartnershipActionForm
                    action={offerPartnerCandidateAction}
                    hidden={{ partner_share_id: n.partnerShareId }}
                    submit={t("passedToMe.offer")}
                    done={t("passedToMe.offered")}
                    testId={`agency-partnership-offer-${n.partnerShareId}`}
                    {...common}
                  >
                    <label className="flex flex-col gap-1">
                      <span className="text-xs font-medium text-text-secondary">{t("passedToMe.worker")}</span>
                      <select name="worker_id" required defaultValue="" className={SELECT}>
                        <option value="" disabled>
                          {t("passedToMe.choose")}
                        </option>
                        {roster.map((w) => (
                          <option key={w.workerId} value={w.workerId}>
                            {w.label}
                          </option>
                        ))}
                      </select>
                    </label>
                  </PartnershipActionForm>
                )}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {/* Partners' candidates on this agency's clients' needs */}
      {partnerOffers.length > 0 ? (
        <section className="flex flex-col gap-2" data-testid="agency-partnerships-partner-offers">
          <h3 className="text-sm font-semibold text-text-primary">{t("partnerOffers.title")}</h3>
          <ul className="flex flex-col gap-1">
            {partnerOffers.map((o) => (
              <li
                key={o.offerId}
                className="flex flex-wrap justify-between gap-2 text-sm text-text-secondary"
                data-testid={`agency-partnership-partner-offer-${o.offerId}`}
                data-status={o.status}
              >
                <span>
                  {titleByRequest.get(o.requestId) ?? "—"} · {o.partnerName}
                </span>
                <span className="text-text-muted">{t(`offerStatus.${o.status}` as never)}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {/* Commissions */}
      <section className="flex flex-col gap-2" data-testid="agency-commissions">
        <h3 className="text-sm font-semibold text-text-primary">{t("commissions.title")}</h3>
        <p className="text-sm text-text-secondary">{t("commissions.intro")}</p>
        {commissions.length === 0 ? (
          <p className="text-sm text-text-muted">{t("commissions.empty")}</p>
        ) : (
          <>
            <ul className="flex flex-col gap-1">
              {commissions.map((c) => (
                <li
                  key={`${c.offerId}-${c.role}`}
                  className="flex flex-wrap justify-between gap-2 text-sm text-text-secondary"
                  data-testid={`agency-commission-${c.offerId}`}
                  data-role={c.role}
                  data-status={c.placementStatus}
                >
                  <span>
                    {titleByRequest.get(c.requestId) ?? t("commissions.need")} ·{" "}
                    {c.role === "direct"
                      ? t("commissions.role.direct")
                      : t(`commissions.role.${c.role}`, { agency: c.counterpartName ?? "" })}
                  </span>
                  <span className="text-text-primary">
                    {c.amount !== null
                      ? t("commissions.amount", {
                          amount: money(c.amount, c.currency, locale),
                          percent: percent(c.sharePercent, locale),
                          fee: money(c.feeAmount, c.currency, locale),
                        })
                      : t(`commissions.status.${c.placementStatus}`)}
                  </span>
                </li>
              ))}
            </ul>
            {due.size > 0 ? (
              <p className="text-sm font-semibold text-text-primary" data-testid="agency-commissions-due">
                {t("commissions.due", {
                  total: [...due].map(([cur, sum]) => money(sum, cur, locale)).join(" · "),
                })}
              </p>
            ) : null}
          </>
        )}
      </section>
    </Card>
  );
}
