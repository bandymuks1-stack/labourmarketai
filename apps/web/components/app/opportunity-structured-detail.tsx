import type { ReactNode } from "react";
import {
  derivePublicHonestyGaps,
  formatCents,
  formatPublicIsoDate,
  publicLanguageName,
  publicPayRange,
  publicRequiresTalentPoolDisclosure,
  type PublicCompensation,
  type StructuredDemandPublic,
} from "@/lib/opportunities/structured-public";

/**
 * Worker-board rendering of the worker-safe structured demand projection
 * (Marketplace Precision Phase-2 PR 2). Server-safe presentational components:
 *
 *  - `OpportunityStructuredChips` — compact card-level scan chips (pay range
 *    with explicit currency + basis, hours / guaranteed hours, engagement
 *    form, start window, application deadline) plus the MANDATORY talent-pool
 *    disclosure chip whenever `process.listing_kind === "talent_pool"`.
 *  - `OpportunityStructuredSections` — the organized detail inside the
 *    existing per-card progressive disclosure: pay & deductions (itemized,
 *    with the honesty gaps the company left as visible amber "not stated"
 *    items), time & schedule, accommodation, transport, requirements and
 *    process. Only stated facts render — no wall of "—".
 *
 * When `structured` is null (MP-3 migration not applied yet, or the row has
 * no valid projection) the sections render ONE honest "detailed conditions
 * not provided" line — never fake emptiness, never a fabricated default.
 *
 * All copy arrives through translator closures (`ts` = opportunities.structured,
 * `sd` = the existing structuredDemand option catalog) so enum labels are
 * never duplicated across namespaces.
 */

type Translate = (key: string, values?: Record<string, string | number>) => string;

const CHIP =
  "rounded-md border border-ink-500 bg-ink-800/40 px-2 py-0.5 text-[11px] text-text-secondary";
const CHIP_AMBER =
  "rounded-md border border-state-amber/40 bg-state-amber/10 px-2 py-0.5 text-[11px] text-state-amber";

/** Pay display text (amount + explicit currency + unit, basis when stated).
 *  Exported for reuse by the P2-PR5 compare facts — ONE pay rendering rule. */
export function payText(
  compensation: PublicCompensation | undefined,
  ts: Translate,
  sd: Translate,
): string | null {
  const range = publicPayRange(compensation);
  if (!range || !compensation?.currency || !compensation?.unit) return null;
  const amount =
    range.kind === "range"
      ? `${range.min}–${range.max}`
      : range.kind === "from"
        ? ts("amountFrom", { amount: range.min })
        : ts("amountUpTo", { amount: range.max });
  const unit = sd(`payUnit.${compensation.unit}`);
  // Basis is stated explicitly or the gap stays visible (amber item in the
  // detail) — "unspecified" is never silently rendered as a fact.
  const basis =
    compensation.basis && compensation.basis !== "unspecified"
      ? sd(`payBasis.${compensation.basis}`)
      : null;
  return basis
    ? ts("chipPayBasis", { amount, currency: compensation.currency, unit, basis })
    : ts("chipPay", { amount, currency: compensation.currency, unit });
}

export function OpportunityStructuredChips({
  structured,
  locale,
  ts,
  sd,
}: {
  structured: StructuredDemandPublic | null;
  locale: string;
  ts: Translate;
  sd: Translate;
}) {
  if (!structured) return null;
  const time = structured.time;
  const chips: Array<{ key: string; text: string }> = [];

  const pay = payText(structured.compensation, ts, sd);
  if (pay) chips.push({ key: "pay", text: pay });
  if (time?.hours_per_week != null) {
    chips.push({ key: "hours", text: ts("chipHours", { hours: time.hours_per_week }) });
  }
  if (time?.min_guaranteed_hours != null) {
    chips.push({
      key: "min-hours",
      text: ts("chipMinHours", { hours: time.min_guaranteed_hours }),
    });
  }
  if (structured.engagement_form) {
    chips.push({
      key: "engagement",
      text: sd(`engagementForm.${structured.engagement_form}`),
    });
  }
  if (time?.start_earliest && time?.start_latest) {
    chips.push({
      key: "start",
      text: ts("chipStartWindow", {
        from: formatPublicIsoDate(time.start_earliest, locale),
        to: formatPublicIsoDate(time.start_latest, locale),
      }),
    });
  } else if (time?.start_earliest) {
    chips.push({
      key: "start",
      text: ts("chipStartFrom", { from: formatPublicIsoDate(time.start_earliest, locale) }),
    });
  }
  if (time?.application_deadline) {
    chips.push({
      key: "deadline",
      text: ts("chipDeadline", {
        date: formatPublicIsoDate(time.application_deadline, locale),
      }),
    });
  }

  const talentPool = publicRequiresTalentPoolDisclosure(structured);
  if (chips.length === 0 && !talentPool) return null;
  return (
    <div className="flex flex-wrap gap-1.5" data-testid="opportunity-structured-chips">
      {chips.map((c) => (
        <span key={c.key} className={CHIP} data-chip={c.key}>
          {c.text}
        </span>
      ))}
      {/* MANDATORY disclosure — a talent-pool listing must always say so at
          card level (goal spec: talent pools never masquerade as vacancies). */}
      {talentPool ? (
        <span className={CHIP_AMBER} data-testid="opportunity-talent-pool">
          {sd("listingKind.talent_pool")}
        </span>
      ) : null}
    </div>
  );
}

// ── Detail sections ──────────────────────────────────────────────────────────

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="font-mono text-[10px] uppercase tracking-label text-text-muted">
        {label}
      </dt>
      <dd className="text-xs text-text-primary">{children}</dd>
    </div>
  );
}

function Section({
  title,
  testId,
  children,
}: {
  title: string;
  testId: string;
  children: ReactNode;
}) {
  return (
    <section className="flex flex-col gap-2" data-testid={testId}>
      <h3 className="font-mono text-[10px] uppercase tracking-label text-text-muted">
        {title}
      </h3>
      {children}
    </section>
  );
}

function Grid({ children }: { children: ReactNode }) {
  return <dl className="grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-3">{children}</dl>;
}

export function OpportunityStructuredSections({
  structured,
  locale,
  ts,
  sd,
  countryLabel,
}: {
  structured: StructuredDemandPublic | null;
  locale: string;
  ts: Translate;
  sd: Translate;
  countryLabel: (code: string) => string;
}) {
  if (!structured) {
    // Honest degradation: ONE line, the current narrow facts stay above.
    return (
      <p
        className="text-xs leading-relaxed text-text-muted"
        data-testid="opportunity-structured-not-provided"
      >
        {ts("notProvided")}
      </p>
    );
  }

  const s = structured;
  const c = s.compensation;
  const time = s.time;
  const acc = s.accommodation;
  const tr = s.transport;
  const req = s.requirements;
  const proc = s.process;
  const gaps = derivePublicHonestyGaps(s);
  const date = (iso: string) => formatPublicIsoDate(iso, locale);
  const yn = (b: boolean) => ts(b ? "yes" : "no");
  // Pay-cluster amounts (incl. deductions from that pay) carry the cluster's
  // explicit currency; accommodation amounts have no stated currency of their
  // own, so they render as the bare stated amount — a currency is never
  // implied where the company did not state one.
  const money = (centsValue: number) =>
    c?.currency ? `${formatCents(centsValue)} ${c.currency}` : formatCents(centsValue);
  const accMoney = (centsValue: number) => formatCents(centsValue);
  const pay = payText(c, ts, sd);

  const engagementRows: Array<[string, ReactNode]> = [];
  if (s.opportunity_type)
    engagementRows.push([sd("opportunityTypeLabel"), sd(`opportunityType.${s.opportunity_type}`)]);
  if (s.target_supply)
    engagementRows.push([sd("targetSupplyLabel"), sd(`targetSupply.${s.target_supply}`)]);
  if (s.engagement_form)
    engagementRows.push([sd("engagementFormLabel"), sd(`engagementForm.${s.engagement_form}`)]);
  if (s.contract_country)
    engagementRows.push([sd("contractCountryLabel"), countryLabel(s.contract_country)]);
  if (s.site_mode) engagementRows.push([ts("siteModeLabel"), ts(`siteMode.${s.site_mode}`)]);
  if (s.work_mode) engagementRows.push([ts("workModeLabel"), ts(`workMode.${s.work_mode}`)]);
  if (s.probation_days != null)
    engagementRows.push([ts("probationLabel"), ts("days", { count: s.probation_days })]);

  const payRows: Array<[string, ReactNode]> = [];
  if (pay) payRows.push([ts("payLabel"), pay]);
  if (c?.guaranteed_base_cents != null)
    payRows.push([sd("guaranteedBaseLabel"), money(c.guaranteed_base_cents)]);
  if (c?.per_diem_cents != null) payRows.push([sd("perDiemLabel"), money(c.per_diem_cents)]);
  if (c?.payment_frequency)
    payRows.push([sd("paymentFrequencyLabel"), sd(`paymentFrequency.${c.payment_frequency}`)]);
  if (c?.first_payment_days != null)
    payRows.push([ts("firstPaymentLabel"), ts("days", { count: c.first_payment_days })]);

  const timeRows: Array<[string, ReactNode]> = [];
  if (time?.start_earliest) timeRows.push([sd("startEarliestLabel"), date(time.start_earliest)]);
  if (time?.start_latest) timeRows.push([sd("startLatestLabel"), date(time.start_latest)]);
  if (time?.end_date) timeRows.push([sd("endDateLabel"), date(time.end_date)]);
  if (time?.extension_possible != null)
    timeRows.push([ts("extensionPossibleLabel"), yn(time.extension_possible)]);
  if (time?.hours_per_week != null)
    timeRows.push([sd("hoursPerWeekLabel"), ts("chipHours", { hours: time.hours_per_week })]);
  if (time?.min_guaranteed_hours != null)
    timeRows.push([
      sd("minGuaranteedHoursLabel"),
      ts("chipHours", { hours: time.min_guaranteed_hours }),
    ]);
  if (time?.shifts && time.shifts.length > 0)
    timeRows.push([sd("shiftsLabel"), time.shifts.map((sh) => sd(`shift.${sh}`)).join(", ")]);
  if (time?.overtime_expected != null)
    timeRows.push([sd("overtimeExpectedLabel"), yn(time.overtime_expected)]);
  if (time?.schedule_notice_days != null)
    timeRows.push([ts("scheduleNoticeLabel"), ts("days", { count: time.schedule_notice_days })]);
  if (time?.application_deadline)
    timeRows.push([sd("applicationDeadlineLabel"), date(time.application_deadline)]);
  if (time?.expected_response_days != null)
    timeRows.push([
      ts("expectedResponseLabel"),
      ts("days", { count: time.expected_response_days }),
    ]);

  const accRows: Array<[string, ReactNode]> = [];
  if (acc?.state) accRows.push([sd("accommodationStateLabel"), sd(`accommodationState.${acc.state}`)]);
  if (acc?.payer) accRows.push([sd("accommodationPayerLabel"), sd(`accommodationPayer.${acc.payer}`)]);
  if (acc?.price_cents != null)
    accRows.push([
      sd("accommodationPriceLabel"),
      `${accMoney(acc.price_cents)}${acc.price_period ? ` · ${sd(`period.${acc.price_period}`)}` : ""}`,
    ]);
  if (acc?.room) accRows.push([sd("roomLabel"), sd(`room.${acc.room}`)]);
  if (acc?.occupancy_per_room != null)
    accRows.push([sd("occupancyLabel"), String(acc.occupancy_per_room)]);
  if (acc?.distance_km != null)
    accRows.push([sd("distanceKmLabel"), ts("km", { km: acc.distance_km })]);
  if (acc?.travel_minutes != null)
    accRows.push([ts("travelMinutesLabel"), ts("minutes", { min: acc.travel_minutes })]);
  if (acc?.amenities && acc.amenities.length > 0)
    accRows.push([sd("amenitiesLabel"), acc.amenities.map((a) => sd(`amenity.${a}`)).join(", ")]);
  if (acc?.registration_possible != null)
    accRows.push([ts("registrationPossibleLabel"), yn(acc.registration_possible)]);
  if (acc?.deposit_cents != null) accRows.push([sd("depositLabel"), accMoney(acc.deposit_cents)]);
  if (acc?.family_possible != null)
    accRows.push([sd("familyPossibleLabel"), yn(acc.family_possible)]);
  if (acc?.available_from) accRows.push([ts("availableFromLabel"), date(acc.available_from)]);

  const trRows: Array<[string, ReactNode]> = [];
  if (tr?.international_travel)
    trRows.push([sd("internationalTravelLabel"), sd(`transportLevel.${tr.international_travel}`)]);
  if (tr?.arrival_pickup != null) trRows.push([sd("arrivalPickupLabel"), yn(tr.arrival_pickup)]);
  if (tr?.daily) trRows.push([sd("dailyTransportLabel"), sd(`transportLevel.${tr.daily}`)]);
  if (tr?.between_sites)
    trRows.push([sd("betweenSitesLabel"), sd(`transportLevel.${tr.between_sites}`)]);
  if (tr?.company_vehicle != null)
    trRows.push([sd("companyVehicleLabel"), yn(tr.company_vehicle)]);
  if (tr?.fuel_card != null) trRows.push([sd("fuelCardLabel"), yn(tr.fuel_card)]);
  if (tr?.own_vehicle_required != null)
    trRows.push([sd("ownVehicleRequiredLabel"), yn(tr.own_vehicle_required)]);
  if (tr?.licence_categories && tr.licence_categories.length > 0)
    trRows.push([sd("licenceCategoriesLabel"), tr.licence_categories.join(", ")]);
  if (tr?.driver_supplement != null)
    trRows.push([ts("driverSupplementLabel"), yn(tr.driver_supplement)]);
  if (tr?.return_travel_contribution != null)
    trRows.push([sd("returnTravelLabel"), yn(tr.return_travel_contribution)]);

  const reqRows: Array<[string, ReactNode]> = [];
  if (req?.min_experience_years != null)
    reqRows.push([
      sd("minExperienceYearsLabel"),
      ts("yearsExperience", { count: req.min_experience_years }),
    ]);
  if (req?.similar_project_experience != null)
    reqRows.push([ts("similarProjectLabel"), yn(req.similar_project_experience)]);
  if (req?.independent_work != null)
    reqRows.push([sd("independentWorkLabel"), yn(req.independent_work)]);
  if (req?.drawings_reading != null)
    reqRows.push([sd("drawingsReadingLabel"), yn(req.drawings_reading)]);
  if (req?.leadership != null) reqRows.push([sd("leadershipLabel"), yn(req.leadership)]);
  if (req?.own_tools != null) reqRows.push([sd("ownToolsLabel"), yn(req.own_tools)]);
  if (req?.own_vehicle != null) reqRows.push([sd("ownVehicleLabel"), yn(req.own_vehicle)]);
  if (req?.own_workwear != null) reqRows.push([sd("ownWorkwearLabel"), yn(req.own_workwear)]);
  const languages = req?.languages ?? [];

  const procRows: Array<[string, ReactNode]> = [];
  if (proc?.application_method)
    procRows.push([sd("applicationMethodLabel"), sd(`applicationMethod.${proc.application_method}`)]);
  if (proc?.interview_stages != null)
    procRows.push([sd("interviewStagesLabel"), String(proc.interview_stages)]);
  if (proc?.practical_test != null)
    procRows.push([sd("practicalTestLabel"), yn(proc.practical_test)]);
  if (proc?.document_verification != null)
    procRows.push([sd("documentVerificationLabel"), yn(proc.document_verification)]);
  if (proc?.response_deadline_days != null)
    procRows.push([
      sd("responseDeadlineDaysLabel"),
      ts("days", { count: proc.response_deadline_days }),
    ]);
  if (proc?.listing_kind)
    procRows.push([sd("listingKindLabel"), sd(`listingKind.${proc.listing_kind}`)]);

  const rows = (entries: Array<[string, ReactNode]>) =>
    entries.map(([label, value], i) => (
      <Row key={`${label}-${i}`} label={label}>
        {value}
      </Row>
    ));

  return (
    <div
      className="flex flex-col gap-4 border-t border-ink-600 pt-3"
      data-testid="opportunity-structured-detail"
    >
      <h3 className="font-display text-sm font-semibold text-text-primary">
        {ts("detailTitle")}
      </h3>

      {engagementRows.length > 0 ? (
        <Section title={sd("sections.engagement")} testId="opportunity-structured-engagement">
          <Grid>{rows(engagementRows)}</Grid>
        </Section>
      ) : null}

      {/* Pay & deductions — ALWAYS rendered: even a demand with no pay facts
          must show the amber gaps (workers see what the company did not
          state; goal spec's missing minimum / basis / hours / deductions). */}
      <Section title={sd("sections.compensation")} testId="opportunity-structured-pay">
        {payRows.length > 0 ? <Grid>{rows(payRows)}</Grid> : null}
        {c?.no_deductions === true ? (
          <p className="text-xs text-text-primary" data-testid="opportunity-no-deductions">
            {sd("noDeductionsLabel")}
          </p>
        ) : null}
        {c?.deductions && c.deductions.length > 0 ? (
          <div className="flex flex-col gap-1" data-testid="opportunity-deductions">
            <span className="font-mono text-[10px] uppercase tracking-label text-text-muted">
              {sd("deductionsLabel")}
            </span>
            <ul className="flex flex-col gap-0.5">
              {c.deductions.map((d, i) => (
                <li key={`${d.kind}-${i}`} className="text-xs text-text-primary">
                  {sd(`deductionKind.${d.kind}`)}
                  {d.amount_cents != null ? ` · ${money(d.amount_cents)}` : ""}
                  {d.period ? ` · ${sd(`period.${d.period}`)}` : ""}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        {gaps.length > 0 ? (
          <div className="flex flex-col gap-1" data-testid="opportunity-structured-gaps">
            <span className="font-mono text-[10px] uppercase tracking-label text-state-amber">
              {ts("gapsTitle")}
            </span>
            <div className="flex flex-wrap gap-1.5">
              {gaps.map((g) => (
                <span key={g} className={CHIP_AMBER} data-gap={g}>
                  {sd(`honesty.${g}`)}
                </span>
              ))}
            </div>
          </div>
        ) : null}
      </Section>

      {timeRows.length > 0 ? (
        <Section title={sd("sections.time")} testId="opportunity-structured-time">
          <Grid>{rows(timeRows)}</Grid>
        </Section>
      ) : null}

      {accRows.length > 0 ? (
        <Section
          title={sd("sections.accommodation")}
          testId="opportunity-structured-accommodation"
        >
          <Grid>{rows(accRows)}</Grid>
        </Section>
      ) : null}

      {trRows.length > 0 ? (
        <Section title={sd("sections.transport")} testId="opportunity-structured-transport">
          <Grid>{rows(trRows)}</Grid>
        </Section>
      ) : null}

      {reqRows.length > 0 || languages.length > 0 ? (
        <Section
          title={sd("sections.requirements")}
          testId="opportunity-structured-requirements"
        >
          {languages.length > 0 ? (
            <div className="flex flex-wrap gap-1.5" data-testid="opportunity-structured-languages">
              {languages.map((l, i) => (
                <span key={`${l.lang}-${i}`} className={CHIP}>
                  {publicLanguageName(l.lang)} · {l.level}
                  {l.one_per_team_sufficient ? ` · ${sd("onePerTeamLabel")}` : ""}
                </span>
              ))}
            </div>
          ) : null}
          {reqRows.length > 0 ? <Grid>{rows(reqRows)}</Grid> : null}
        </Section>
      ) : null}

      {procRows.length > 0 || publicRequiresTalentPoolDisclosure(s) ? (
        <Section title={sd("sections.process")} testId="opportunity-structured-process">
          {procRows.length > 0 ? <Grid>{rows(procRows)}</Grid> : null}
          {publicRequiresTalentPoolDisclosure(s) ? (
            <p
              className="rounded-md border border-state-amber/40 bg-state-amber/10 px-3 py-2 text-xs leading-relaxed text-state-amber"
              data-testid="opportunity-talent-pool-disclosure"
            >
              {sd("talentPoolDisclosure")}
            </p>
          ) : null}
        </Section>
      ) : null}
    </div>
  );
}
