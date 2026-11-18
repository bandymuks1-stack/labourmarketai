/**
 * WHAT BOTH PARTIES SHOULD CHECK BEFORE A FINAL AGREEMENT — the mutual,
 * neutral recommendation (owner correction 2026-10-24, extending decision
 * 0021 "documents are readiness requirements, not a vault").
 *
 * LabourMarket.ai never requires anyone to upload documents to take part:
 * not to register, appear in search, be selected, negotiate or be planned.
 * When two parties consider a CONCRETE collaboration, both are shown the same
 * recommendation — check the documents, qualifications, permits and terms that
 * matter for THIS job or deal — and what is worth checking depends on the
 * deal, the work, and where it happens. There is no universal mandatory list.
 *
 * Every topic carries its BASIS, so the page never overstates the law:
 *   - `law`    — required by law wherever this kind of work is done (e.g. a
 *                driving licence to drive for work);
 *   - `law_if` — required by law under a stated condition (posting a worker to
 *                another EU/EEA country, a person from outside the EU/EEA, a
 *                profession regulated in that country) — the copy names the
 *                condition and points to the country's own rules;
 *   - `agreement` — a matter for the parties to agree; nobody's law demands it.
 * The external legal duties stay where they are; this module only says them
 * plainly, never as a platform gate and never as "verified".
 *
 * Pure: no IO, no i18n. The caller localises the topic and basis keys.
 */

export type CollaborationDealKind =
  /** A person is booked / employed / assigned to do the work. */
  | "work_engagement"
  /** A team / brigade is offered for a need. */
  | "team_offer"
  /** A service bought from a provider (person or business). */
  | "service"
  /** A business-to-business proposal or contract. */
  | "b2b_contract";

export type CollaborationTopic =
  | "terms"
  | "identity_right_to_work"
  | "posting_a1"
  | "work_permit"
  | "site_safety"
  | "driving_licence"
  | "professional_qualification"
  | "business_details"
  | "insurance"
  | "client_requirements";

export type CollaborationBasis = "law" | "law_if" | "agreement";

export interface CollaborationCheck {
  readonly topic: CollaborationTopic;
  readonly basis: CollaborationBasis;
}

export interface CollaborationContext {
  readonly dealKind: CollaborationDealKind;
  /** ISO-3166 alpha-2 of the country where the work happens, if known. */
  readonly workCountry?: string | null;
  /** ISO-3166 alpha-2 the worker / provider comes from, if known. */
  readonly partyCountry?: string | null;
  /** Coarse sector of the work, if known (e.g. "construction"). */
  readonly sector?: string | null;
  /** Profession slug of the work, if known (e.g. "driver", "electrician"). */
  readonly professionSlug?: string | null;
}

/** Professions whose WORK is driving — a licence of the right category is a
 *  legal precondition everywhere. Slugs from professions.json. */
const DRIVING_PROFESSIONS: ReadonlySet<string> = new Set(["driver"]);

/** Professions commonly REGULATED nationally (a licence / registered
 *  qualification may be legally required, depending on the country). */
const OFTEN_REGULATED_PROFESSIONS: ReadonlySet<string> = new Set([
  "electrician",
  "plumber",
  "welder",
  "crane_operator",
  "caregiver",
]);

/** The ONE list above, readable by other surfaces (the worker board's formal
 *  requirements layer) — never a second copy of it. */
export function isOftenRegulatedProfession(slug: string | null | undefined): boolean {
  return OFTEN_REGULATED_PROFESSIONS.has((slug ?? "").trim());
}

const CONSTRUCTION_PROFESSIONS: ReadonlySet<string> = new Set([
  "tiler",
  "mason",
  "carpenter",
  "roofer",
  "concrete_worker",
  "rebar_worker",
  "welder",
  "electrician",
  "plumber",
  "painter",
  "drywaller",
  "general_laborer",
  "foreman",
  "site_manager",
  "site_engineer",
  "crane_operator",
]);

const norm = (s: string | null | undefined) => (s ?? "").trim().toUpperCase();

/** True only when BOTH countries are known and differ. Unknown is not "cross-border". */
export function isCrossBorder(ctx: Pick<CollaborationContext, "workCountry" | "partyCountry">): boolean {
  const a = norm(ctx.workCountry);
  const b = norm(ctx.partyCountry);
  return a.length === 2 && b.length === 2 && a !== b;
}

export function collaborationChecks(ctx: CollaborationContext): readonly CollaborationCheck[] {
  const out: CollaborationCheck[] = [{ topic: "terms", basis: "agreement" }];
  const peopleWork = ctx.dealKind === "work_engagement" || ctx.dealKind === "team_offer";
  const profession = (ctx.professionSlug ?? "").trim();
  const construction =
    (ctx.sector ?? "").trim() === "construction" || CONSTRUCTION_PROFESSIONS.has(profession);

  if (peopleWork) out.push({ topic: "identity_right_to_work", basis: "law_if" });
  if (peopleWork && isCrossBorder(ctx)) {
    out.push({ topic: "posting_a1", basis: "law_if" });
  }
  if (peopleWork) out.push({ topic: "work_permit", basis: "law_if" });
  if (construction) out.push({ topic: "site_safety", basis: "law_if" });
  if (DRIVING_PROFESSIONS.has(profession)) out.push({ topic: "driving_licence", basis: "law" });
  if (OFTEN_REGULATED_PROFESSIONS.has(profession)) {
    out.push({ topic: "professional_qualification", basis: "law_if" });
  } else if (peopleWork || ctx.dealKind === "service") {
    out.push({ topic: "professional_qualification", basis: "agreement" });
  }
  if (ctx.dealKind === "service" || ctx.dealKind === "b2b_contract" || ctx.dealKind === "team_offer") {
    out.push({ topic: "business_details", basis: "agreement" });
    out.push({ topic: "insurance", basis: "agreement" });
  }
  out.push({ topic: "client_requirements", basis: "agreement" });
  return out;
}
