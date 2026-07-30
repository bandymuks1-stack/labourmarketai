import "server-only";

import { getLocale, getTranslations } from "next-intl/server";

import type { WorkerPlayerCard } from "@/lib/player-card/player-card";
import { EVIDENCE_TIMELINE_MONTHS } from "@/lib/player-card/player-card";
import type { PlayerCardLabels } from "@/components/app/worker-player-card";
import { deriveWorkHistoryTimeline } from "@/lib/player-card/evidence-visuals";

/**
 * One place that turns the player-card's REAL data into resolved viewer-locale
 * labels (doctrine §2: slug → JSON, nothing user-facing hardcoded). Shared by
 * every mount of the card (dashboard today screen + /dashboard/player-card) —
 * zero duplication (DESIGN_SOUL §1).
 */
export async function buildPlayerCardLabels(
  card: WorkerPlayerCard,
): Promise<PlayerCardLabels> {
  const locale = await getLocale();
  const t = await getTranslations("playerCard");
  const tProf = await getTranslations("professions");
  const tSkill = await getTranslations("skillNames");
  const tWorkCard = await getTranslations("auth.dashboard.workCard");
  // Country names come from the ONE canonical country catalogue the rest of
  // the product reads (never a second list).
  const tlm = await getTranslations("labourMarket");

  const availabilityKey = card.availabilityStatus
    ? `editor.availabilityOption.${card.availabilityStatus}`
    : null;

  // ── §5.2 VISUALIZATION COPY ──────────────────────────────────────────────
  // Everything here is derived from the card's REAL series. A label is only
  // produced when the underlying number exists; `peak` stays null when there
  // is nothing to point at, so the chart never annotates an invented high.
  const monthFmt = new Intl.DateTimeFormat(locale, {
    month: "short",
    timeZone: "UTC",
  });
  const monthName = (key: string): string =>
    monthFmt.format(new Date(`${key}-01T00:00:00Z`));
  // The axis stays compact (many locales render "short" months numerically),
  // but the peak annotation names the month in words — "4 (06)" was a riddle.
  const monthLongFmt = new Intl.DateTimeFormat(locale, {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
  const monthLongName = (key: string): string =>
    monthLongFmt.format(new Date(`${key}-01T00:00:00Z`));
  const timelineTotal = card.evidenceTimeline.reduce((n, m) => n + m.entries, 0);
  const peakMonth = card.evidenceTimeline.reduce<{ month: string; entries: number } | null>(
    (best, m) => (m.entries > 0 && (best === null || m.entries > best.entries) ? m : best),
    null,
  );
  const dateFmt = new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeZone: "UTC",
  });
  // The history band is derived from the SAME rows the card's text list uses.
  const history = deriveWorkHistoryTimeline(card.workHistory, new Date());

  return {
    title: t("title"),
    subtitle: t("subtitle"),
    skillsLabel: t("skillsLabel"),
    skillsHint: t("skillsHint"),
    candidateLabel: t("candidateLabel"),
    candidateHint: t("candidateHint"),
    evidenceLabel: t("evidenceLabel"),
    evidenceHint: t("evidenceHint"),
    attentionLabel: t("attentionLabel"),
    attentionHint: t("attentionHint"),
    attentionZero: t("attentionZero"),
    workCardLabel: t("workCardLabel"),
    workCardConfirmed: t("workCardConfirmed"),
    workCardPending: t("workCardPending"),
    namePlaceholder: t("namePlaceholder"),
    professionName:
      card.professionSlug && tProf.has(card.professionSlug)
        ? tProf(card.professionSlug)
        : null,
    availabilityLabel:
      availabilityKey && tWorkCard.has(availabilityKey)
        ? tWorkCard(availabilityKey)
        : null,
    availabilityFrom: card.availableFrom
      ? t("availabilityFrom", {
          date: new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(
            new Date(card.availableFrom),
          ),
        })
      : null,
    // §5.2 LOCATION — the country NAME for the worker's own stated code.
    // An unknown code renders the raw code rather than a guessed country.
    locationName: card.locationCountry
      ? tlm.has(`countryNames.${card.locationCountry}`)
        ? (tlm(`countryNames.${card.locationCountry}`) as string)
        : card.locationCountry
      : null,
    // §5.2 DOCUMENTS — real counts only; absent when the surface is not
    // available for this account (the card then shows no documents block).
    documentsLabel: card.documents ? t("documentsLabel") : null,
    // A ZERO is stated in words, never rendered as a bare "0 valid" tile —
    // the same rule the reputation block follows. (Premium self-check on the
    // production card: "0 galiojantys" read as a verdict, not as an absence.)
    documentsValue: card.documents
      ? card.documents.total === 0
        ? t("documentsEmpty")
        : card.documents.expiring > 0
          ? t("documentsValueExpiring", {
              valid: card.documents.total,
              expiring: card.documents.expiring,
            })
          : t("documentsValue", { valid: card.documents.total })
      : null,
    // §5.2 REPUTATION — what other people really confirmed. No universal
    // score, no medal tier: a count of real confirmations, or the honest
    // "nothing confirmed yet" line.
    reputationLabel: t("reputationLabel"),
    reputationValue:
      card.managerConfirmations > 0
        ? t("reputationValue", { count: card.managerConfirmations })
        : null,
    reputationEmpty: t("reputationEmpty"),
    reputationHint: t("reputationHint"),
    workHistoryLabel: t("workHistoryLabel"),
    workHistoryUnnamed: t("workHistoryUnnamed"),
    workHistoryCurrent: t("workHistoryCurrent"),
    verifiedTitle: t("verifiedTitle"),
    verifiedEmpty: t("verifiedEmpty"),
    journalSupportedLabel: t("journalSupportedLabel"),
    journalSupportedHint: t("journalSupportedHint"),
    verifiedSkillNames: card.verifiedSkills.map((s) =>
      tSkill.has(s.slug) ? tSkill(s.slug) : s.slug.replace(/-/g, " "),
    ),
    latestEvidenceLabel: t("latestEvidenceLabel"),
    latestEvidenceValue: card.latestEvidenceAt
      ? new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(
          new Date(card.latestEvidenceAt),
        )
      : null,
    latestEvidenceEmpty: t("latestEvidenceEmpty"),
    thermoLabel: t("thermoLabel"),
    thermoHint: t("thermoHint"),
    thermoMissingPosition: t("thermoMissingPosition"),
    thermoMissingMarket: t("thermoMissingMarket"),
    thermoMissingBoth: t("thermoMissingBoth"),
    thermoSmallSample: t("thermoSmallSample"),
    readiness: {
      label: t("readiness.label"),
      hint: t("readiness.hint"),
      levelReady: t("readiness.levelReady"),
      levelBuilding: t("readiness.levelBuilding"),
      levelStart: t("readiness.levelStart"),
      signalsTemplate: t("readiness.signalsTemplate"),
      nextLabel: t("readiness.nextLabel"),
      pillars: {
        profession: t("readiness.pillars.profession"),
        availability: t("readiness.pillars.availability"),
        skills: t("readiness.pillars.skills"),
        journal: t("readiness.pillars.journal"),
        evidence: t("readiness.pillars.evidence"),
        workCard: t("readiness.pillars.workCard"),
      },
    },
    visuals: {
      evidence: {
        title: t("visuals.evidenceTitle"),
        hint: t("visuals.evidenceHint", { months: EVIDENCE_TIMELINE_MONTHS }),
        empty: t("visuals.evidenceEmpty"),
        total: t("visuals.evidenceTotal", {
          count: timelineTotal,
          months: EVIDENCE_TIMELINE_MONTHS,
        }),
        peak: peakMonth
          ? t("visuals.evidencePeak", {
              count: peakMonth.entries,
              month: monthLongName(peakMonth.month),
            })
          : null,
        monthLabels: card.evidenceTimeline.map((m) => monthName(m.month)),
        ariaLabel: t("visuals.evidenceAria", {
          months: EVIDENCE_TIMELINE_MONTHS,
        }),
      },
      skills: {
        title: t("visuals.skillsTitle"),
        hint: t("visuals.skillsHint"),
        empty: t("visuals.skillsEmpty"),
        skillNames: card.skillEvidence.map((s) =>
          tSkill.has(s.slug) ? tSkill(s.slug) : s.slug.replace(/-/g, " "),
        ),
        entryLabels: card.skillEvidence.map((s) =>
          t("visuals.skillsEntries", { count: s.entries }),
        ),
        noEvidence: t("visuals.skillsNoEvidence"),
        legendTitle: t("visuals.skillsLegendTitle"),
        tierLabels: {
          verified: t("visuals.skillsTierVerified"),
          journal: t("visuals.skillsTierJournal"),
          declared: t("visuals.skillsTierDeclared"),
        },
        ariaLabel: t("visuals.skillsAria"),
      },
      history: {
        title: t("visuals.historyTitle"),
        current: t("visuals.historyCurrent"),
        undated:
          history.undatedCount > 0
            ? t("visuals.historyUndated", { count: history.undatedCount })
            : null,
        range:
          history.fromIso && history.toIso
            ? t("visuals.historyRange", {
                from: dateFmt.format(new Date(`${history.fromIso}T00:00:00Z`)),
                to: dateFmt.format(new Date(`${history.toIso}T00:00:00Z`)),
              })
            : null,
        // One compact detail row per placed engagement, so the real dates are
        // readable without a second history list underneath the card.
        laneDetails: history.lanes.map((lane) => {
          const entry = card.workHistory.find((h) => h.id === lane.id);
          const from = entry?.startedAt
            ? dateFmt.format(new Date(`${entry.startedAt}T00:00:00Z`))
            : null;
          const to = entry?.current
            ? t("workHistoryCurrent")
            : entry?.endedAt
              ? dateFmt.format(new Date(`${entry.endedAt}T00:00:00Z`))
              : null;
          return from && to ? `${from} — ${to}` : (from ?? "");
        }),
        empty: t("visuals.historyEmpty"),
        ariaLabel:
          history.fromIso && history.toIso
            ? t("visuals.historyAria", {
                from: dateFmt.format(new Date(`${history.fromIso}T00:00:00Z`)),
                to: dateFmt.format(new Date(`${history.toIso}T00:00:00Z`)),
              })
            : t("visuals.historyEmpty"),
      },
    },
  };
}
