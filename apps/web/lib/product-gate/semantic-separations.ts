/**
 * SEMANTIC SEPARATIONS — the distinctions that may never collapse.
 *
 * Owner text, window 10 (2026-09-07), recorded in
 * `docs/PRODUCT_CONSTITUTION.md` §15.
 *
 * Every one of these has already collapsed at least once in this product, and
 * each collapse cost a real user a wrong answer:
 *
 *   · an agency's declared capacity was read as its need, and the agency's
 *     offer ate the employer's paid need quota;
 *   · a person's self-confirmation was counted as employer confirmation;
 *   · five years of real work read as "certificate missing";
 *   · "who is free?" answered from approved absences alone — a table with
 *     zero rows — while the bookings and assignments that existed were ignored.
 *
 * None of these was a crash. Every one passed CI. They are semantic failures:
 * the code did exactly what it said, and what it said had lost a distinction.
 *
 * WHAT THIS FILE CAN AND CANNOT DO. A tripwire is not a proof. Where a
 * separation can be checked by a machine, `enforcement` says `machine` and
 * `lib/guards/product-graph-journeys.test.ts` checks it. Where it can only be
 * detected — the vocabulary of the distinction disappearing from the module
 * that carries it — `enforcement` is `tripwire`, and the guard fails when the
 * vocabulary goes. Where neither is possible, `enforcement` is `review` and the
 * separation is listed in the Product Constitution's manual-acceptance list.
 * Nothing here pretends to be stronger than it is.
 *
 * Pure data. No IO.
 */

export type SeparationEnforcement = "machine" | "tripwire" | "review";

export interface SemanticSeparation {
  /** Permanent id. Referenced from capability notes and journey steps. */
  readonly id: string;
  /** The two (or more) things that must stay apart. */
  readonly separates: readonly string[];
  /** The rule, in one sentence. */
  readonly rule: string;
  /** What actually went wrong when it collapsed. Never delete this. */
  readonly collapsedBefore: string;
  readonly enforcement: SeparationEnforcement;
  /** The module that carries the distinction. Must exist. */
  readonly anchor: string | null;
  /** Vocabulary whose disappearance from `anchor` means the distinction went. */
  readonly vocabulary: readonly string[];
  /** For `review`: what a human must check, since no machine can. */
  readonly manualAcceptance?: string;
}

export const SEMANTIC_SEPARATIONS: readonly SemanticSeparation[] = [
  {
    id: "SEP-1",
    separates: ["FACT", "DERIVED", "FORECAST"],
    rule:
      "A recorded fact, a value the system derived, and a value the system predicts are three different kinds. A derivation never outranks a record, and a forecast may never be stored where a fact is read.",
    collapsedBefore:
      "AI extraction was treated as fact in early CV import; the fix made every extracted fact a proposal the person confirms.",
    enforcement: "tripwire",
    anchor: "lib/evidence/provenance.ts",
    vocabulary: ["SELF_DECLARED", "EVIDENCE_SUPPORTED", "EMPLOYER_CONFIRMED", "SYSTEM_DERIVED"],
    manualAcceptance:
      "The FORECAST kind does not exist yet — nothing in the product forecasts anything (CAL-9, CAL-10). When it is built it must be a THIRD kind, not a fact with a flag.",
  },
  {
    id: "SEP-2",
    separates: ["COMMITMENT", "PROHIBITION"],
    rule:
      "A commitment reduces availability and warns. It does not prohibit. The authorized actor decides; the system detects, explains, warns, offers alternatives and records an override — it does not forbid unless law, safety, authorization or another person's rights require it.",
    collapsedBefore:
      "Not yet — and this is the separation most likely to collapse next, because an overlap constraint looks like obvious data hygiene to anyone who has not read this. A contractor with a full month may still take another project; a hairdresser with eight bookings may fit ten.",
    enforcement: "tripwire",
    anchor: "lib/projects/operations-centre-model.ts",
    vocabulary: ["overlappingBookings"],
    manualAcceptance:
      "No unique constraint, exclusion constraint or trigger may reject an overlapping assignment or booking. A migration that adds one is a product decision, not a schema cleanup, and belongs at the human gate.",
  },
  {
    id: "SEP-3",
    separates: ["EVIDENCE", "VERIFICATION"],
    rule:
      "Evidence is a claim with a provenance. Verification is another party standing behind it. Self-attestation is real history and is never independent verification.",
    collapsedBefore:
      "Production holds 13 journal confirmations, 3 of them self-confirmed by one person holding an owner engagement, and they were counted the same as employer confirmations.",
    enforcement: "tripwire",
    anchor: "lib/journal/work-verification-state.ts",
    vocabulary: ["deriveWorkVerificationState", "isVerificationDeadEnd"],
  },
  {
    id: "SEP-4",
    separates: ["DEMAND", "SUPPLY"],
    rule:
      "Direction is a property of the request itself, decided by one closed-set rule — never by a deny-list, and never inferred from who is looking.",
    collapsedBefore:
      "An agency declaring available welders was rendered as an agency looking for welders, and the offer consumed the employer's paid need quota.",
    enforcement: "machine",
    anchor: "lib/demand/market-direction.ts",
    vocabulary: ["MarketDirection", "isDemandKind", "isSupplyKind"],
  },
  {
    id: "SEP-5",
    separates: ["IDENTITY", "ROLE"],
    rule:
      "A person is an actor, not a product role. Employee, owner, student, brigade member, provider, client and job seeker are simultaneous contexts, never mutually exclusive identities.",
    collapsedBefore:
      "Role fragmentation across surfaces forced a person into one active role and hid the rest of their work from them.",
    enforcement: "tripwire",
    anchor: "lib/product-gate/entity-model.ts",
    vocabulary: ["isMultiRole", "RoleAssignment", "RELATIONSHIP_PREDICATES"],
  },
  {
    id: "SEP-6",
    separates: [
      "DEMONSTRATED CAPABILITY",
      "FORMAL QUALIFICATION",
      "RECOGNISED EQUIVALENCE",
      "VALID CREDENTIAL",
      "MISSING REQUIREMENT",
    ],
    rule:
      "Five different things. Demonstrated capability never silently satisfies a formal requirement, and it never becomes invisible either.",
    collapsedBefore:
      "`qualification_or_skill_evidence` — a row whose own name promised to accept skill evidence — mapped only to two document slugs, so five years of real work read as 'certificate missing'.",
    enforcement: "tripwire",
    anchor: "lib/documents/credential-validity.ts",
    vocabulary: ["CREDENTIAL_VALIDITY_STATES", "deriveCredentialValidity"],
    manualAcceptance:
      "RECOGNISED EQUIVALENCE (RPL) exists at no layer — SKL-9 is MISSING. Until it is built, no surface may present demonstrated capability as satisfying a formal requirement.",
  },
  {
    id: "SEP-7",
    separates: ["UNKNOWN", "ZERO", "FAILED", "NOT_MEASURED"],
    rule:
      "A read that failed is not an empty result. A value nobody measured is not zero. Every count that can fail must report its own answered-ness.",
    collapsedBefore:
      "`data ?? []` without checking the error made a failed read render as 'you have nothing', and a code comment claiming zero AI runs stood for ten days while production held 47.",
    enforcement: "review",
    anchor: null,
    vocabulary: [],
    manualAcceptance:
      "Any new Supabase read must check `error` before using `data`. A derived count must carry whether its inputs were answered. This is checkable case by case in review and by `lib/guards/*` for specific readers; there is no repo-wide machine proof, and claiming one would itself be a SEP-7 violation.",
  },
  {
    id: "SEP-8",
    separates: ["DATA EXISTS", "REACHABLE", "VISIBLE", "ACTIONABLE", "CORRECTLY INTERPRETED"],
    rule:
      "One does not prove the others. A capability that exists, passes tests and has no consumer is not a capability a user has.",
    collapsedBefore:
      "`work-verification-state.ts` shipped complete with zero consumers, and `/dashboard/learning` has no inbound link to this day. Two more examples in the same list turned out to be the collapse running the OTHER way: the employer calendar and the service-offering loop were both recorded as unreachable and both are reached — one in the import graph, one by eight real links. Naming which KIND of reachability is missing is the whole discipline; a claim that does not say cannot be checked, and rots into a confident wrong answer.",
    enforcement: "machine",
    anchor: "lib/product-gate/capability-register.ts",
    vocabulary: ["coreModule", "surfaces", "BUILT_NOT_CONNECTED"],
  },
];

export function separationById(id: string): SemanticSeparation | undefined {
  return SEMANTIC_SEPARATIONS.find((s) => s.id === id);
}
