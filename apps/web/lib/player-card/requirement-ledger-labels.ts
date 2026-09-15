import "server-only";

import { getTranslations } from "next-intl/server";

import type { InstructionLedgerLabels } from "@/components/app/instruction-project-asks";

/**
 * THE requirement-ledger copy, in one place.
 *
 * PER-13 is built for three contexts — project, opportunity, role — and this
 * mapping used to live inline on the ONE page that mounted it. Mounting a
 * second context meant either copying thirty lines of label wiring or giving
 * them a home; a copy would have let the same requirement acquire two
 * wordings, and "what is missing for me" must read identically wherever a
 * person meets it.
 *
 * The strings stay in the `instructions` namespace where they were written and
 * translated. That namespace name is now slightly narrower than its use, which
 * is a naming debt worth carrying: moving 30 keys across five locale files to
 * rename a namespace would risk the copy itself for no reader-visible gain.
 */
export async function buildRequirementLedgerLabels(): Promise<InstructionLedgerLabels> {
  const [t, tDocs, tSkills, tLm] = await Promise.all([
    getTranslations("instructions"),
    getTranslations("documents"),
    getTranslations("skills"),
    getTranslations("labourMarket"),
  ]);
  const countryName = (c: string | null): string =>
    c && tLm.has(`countryNames.${c}`) ? tLm(`countryNames.${c}`) : (c ?? "");

  return {
    ratio: (have, total) => t("card.ledger.ratio", { have, total }),
    state: {
      valid: t("card.ledger.state.valid"),
      expiring: t("card.ledger.state.expiring"),
      missing: t("card.ledger.state.missing"),
      unknown: t("card.ledger.state.unknown"),
    },
    why: (row, country) =>
      t(`card.ledger.why.${row.reason}`, { country: countryName(country) }),
    stateFrom: (row) => {
      const p = row.provenance;
      switch (p.source) {
        case "own_document":
          return p.validUntil
            ? t("card.ledger.from.ownDocumentUntil", { date: p.validUntil })
            : t("card.ledger.from.ownDocument");
        case "own_skill":
          return t(
            p.verified ? "card.ledger.from.ownSkillConfirmed" : "card.ledger.from.ownSkill",
          );
        case "own_language":
          return t("card.ledger.from.ownLanguage", { level: p.level });
        case "own_profile":
          return t("card.ledger.from.ownProfile");
        case "manager_checklist":
          return t("card.ledger.from.manager", {
            status: t(`card.ledger.managerStatus.${p.status}`),
          });
        case "not_readable":
          return t("card.ledger.from.notReadable");
        case "none":
          return t("card.ledger.from.none");
      }
    },
    level: {
      recommended: t("card.ledger.level.recommended"),
      conditional: t("card.ledger.level.conditional"),
    },
    availability: t("card.ledger.availability"),
    documentType: (slug) =>
      tDocs.has(`types.${slug}`) ? tDocs(`types.${slug}`) : slug.replace(/_/g, " "),
    skill: (slug) => (tSkills.has(slug) ? tSkills(slug) : slug.replace(/[-_]/g, " ")),
    resolution: (r) => {
      switch (r.kind) {
        case "add_document":
          return t("card.ledger.resolution.addDocument");
        case "issuing_authority":
          return t("card.ledger.resolution.issuingAuthority", { title: r.title });
        case "training_program":
          return t("card.ledger.resolution.trainingProgram", { title: r.title });
        case "service_offering":
          return r.rateText
            ? t("card.ledger.resolution.serviceOfferingRate", {
                title: r.title,
                rate: r.rateText,
              })
            : t("card.ledger.resolution.serviceOffering", { title: r.title });
        case "add_evidence":
          return t("card.ledger.resolution.addEvidence");
        case "set_availability":
          return t("card.ledger.resolution.setAvailability");
        case "ask":
          return t("card.ledger.resolution.ask");
      }
    },
    resolutionWhy: (r) => {
      if (r.kind === "training_program") {
        return t(
          `card.ledger.resolutionWhy.${r.why === "assigned_to_you" ? "assignedToYou" : "nameMatches"}`,
        );
      }
      if (r.kind === "service_offering") return t("card.ledger.resolutionWhy.nameMatches");
      return null;
    },
    rejected: (count) => t("card.ledger.rejected", { count }),
  };
}
