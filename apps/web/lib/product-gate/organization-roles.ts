/**
 * ORGANIZATION ROLE ORCHESTRATION — the business-orchestration contract.
 *
 * Owner text, locked 2026-07-28:
 * `docs/product/ORGANIZATION_ROLE_ORCHESTRATION_V1.md`.
 *
 * THE PRINCIPLE: labourmarket.ai is a market ORCHESTRATOR. It is not tied to a
 * single employment model, and it never depends on the name of a specific legal
 * entity — only on organization ROLES, of which one organization may hold
 * several at once.
 *
 * THE RULE THAT BITES: an unbroken chain must exist from the first AI
 * conversation to the real start of work. If the chain breaks anywhere, that is
 * a product architecture error — never the user's problem.
 *
 * Pure data + pure functions. No IO. This defines the CONTRACT; it builds no
 * orchestration engine and changes no schema.
 */

// ═══════════════════════════════════════════════════════════════════════════
// 1. Roles — a registry, never a closed type
// ═══════════════════════════════════════════════════════════════════════════

/**
 * The roles the owner named. This list is a REGISTRY, not a constraint:
 * "Ateityje prie platformos gali būti prijungta neribotas organizacijų
 * skaičius. Tam neturi reikėti keisti architektūros. Pakanka naujai
 * organizacijai priskirti reikiamus vaidmenis."
 *
 * Adding a role must therefore be data — never a migration, never a new enum.
 */
export const ORGANIZATION_ROLES = [
  "employer",
  "workforce_provider",
  "talent_provider",
  "client",
  "recruitment_partner",
  "training_provider",
  "payroll_provider",
  "logistics_provider",
  // Canonical name: the owner's later text (UNIFIED_WORLD_MODEL_V1) says
  // "Verification Provider". One name, one role — see the doc §2.
  "verification_provider",
  "project_operator",
] as const;

export type OrganizationRole = (typeof ORGANIZATION_ROLES)[number] | (string & {});

/**
 * An organization holds MANY roles at once — the single `organization_type`
 * column cannot express this (see the assessment below).
 */
export interface OrganizationRoleAssignment {
  readonly organizationId: string;
  readonly roles: readonly OrganizationRole[];
}

export function hasRole(a: OrganizationRoleAssignment, role: OrganizationRole): boolean {
  return a.roles.includes(role);
}

/**
 * No architecture may depend on a specific legal entity NAME. Legal copy that
 * must name the data controller or the selling entity (GDPR, Terms) is a
 * different thing and is explicitly allowed — the ban is on logic.
 */
export const ENTITY_NAME_DEPENDENCY_IS_FORBIDDEN = true;
export const LEGAL_COPY_MAY_NAME_THE_ENTITY = true;

// ═══════════════════════════════════════════════════════════════════════════
// 2. Employment models — what the platform can actually execute
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Which roles must be present for a model to be EXECUTABLE. This is the
 * machine-readable form of "AI negali siūlyti tokio sprendimo, kurio platforma
 * negali realiai įvykdyti."
 */
export interface EmploymentModel {
  readonly id: string;
  readonly label: string;
  /** Roles that MUST exist (in some organization) for this model to work. */
  readonly requiredRoles: readonly OrganizationRole[];
  /** Chosen when the client expresses no preference. */
  readonly isDefault: boolean;
}

export const EMPLOYMENT_MODELS: readonly EmploymentModel[] = [
  {
    id: "direct_employment",
    label: "The client employs the candidate directly",
    requiredRoles: ["employer", "client"],
    isDefault: false,
  },
  {
    id: "intermediated_employment",
    label: "A workforce provider employs the candidate and places them with the client",
    requiredRoles: ["workforce_provider", "client"],
    // "Jeigu klientas nepasirenka kito įdarbinimo modelio, arba platforma
    // nustato, kad reikalingas tarpinis įdarbinimas" — this is the default.
    isDefault: true,
  },
  {
    id: "talent_introduction",
    label: "A talent/recruitment partner introduces the candidate; the client employs",
    requiredRoles: ["talent_provider", "employer", "client"],
    isDefault: false,
  },
] as const;

export function defaultEmploymentModel(): EmploymentModel {
  const d = EMPLOYMENT_MODELS.find((m) => m.isDefault);
  if (!d) throw new Error("no default employment model declared");
  return d;
}

/** Models the platform can execute given the roles actually available today. */
export function executableModels(
  available: readonly OrganizationRoleAssignment[],
): readonly EmploymentModel[] {
  const roles = new Set(available.flatMap((a) => a.roles));
  return EMPLOYMENT_MODELS.filter((m) => m.requiredRoles.every((r) => roles.has(r)));
}

// ═══════════════════════════════════════════════════════════════════════════
// 3. Real availability + expectation consistency
// ═══════════════════════════════════════════════════════════════════════════

export type ChainBreak =
  /** A candidate is shown that the platform cannot actually deliver. */
  | "no_delivery_path"
  /** Both sides agreed, but no organization is responsible for employing. */
  | "no_responsible_organization"
  /** The AI proposed a model the platform cannot execute. */
  | "model_not_executable"
  /** No default exists, so an undecided client has no path at all. */
  | "no_default_model";

export interface FulfilmentChain {
  readonly candidateId: string;
  readonly clientOrganizationId: string;
  /** The model chosen (or the default). */
  readonly model: EmploymentModel | null;
  /** The organization that will actually employ / place the candidate. */
  readonly responsibleOrganizationId: string | null;
  /** Roles available across the platform for this case. */
  readonly available: readonly OrganizationRoleAssignment[];
}

/**
 * Validate that an unbroken chain exists from agreement to the start of work.
 *
 * "Platforma negali sukurti situacijos, kai kandidatas sutinka, klientas
 *  sutinka, bet toliau nėra aiškaus proceso, kas organizuoja įdarbinimą.
 *  Tokia situacija laikoma architektūros klaida."
 */
export function validateFulfilmentChain(
  chain: FulfilmentChain,
): readonly { code: ChainBreak; detail: string }[] {
  const out: { code: ChainBreak; detail: string }[] = [];
  const executable = executableModels(chain.available);

  if (executable.length === 0) {
    out.push({
      code: "no_delivery_path",
      detail:
        "no employment model is executable with the roles available — this candidate may not be shown to the client at all",
    });
  }

  const model = chain.model ?? EMPLOYMENT_MODELS.find((m) => m.isDefault) ?? null;
  if (!model) {
    out.push({
      code: "no_default_model",
      detail: "the client chose nothing and no default model is declared",
    });
  } else if (!executable.some((m) => m.id === model.id)) {
    out.push({
      code: "model_not_executable",
      detail: `model "${model.id}" requires roles [${model.requiredRoles.join(", ")}] that no available organization holds — the AI may not propose it`,
    });
  }

  if (!chain.responsibleOrganizationId) {
    out.push({
      code: "no_responsible_organization",
      detail:
        "no organization is assigned to organise the employment — agreement on both sides with nobody responsible is an architecture error",
    });
  }

  return out;
}

/**
 * Default orchestration: assign the candidate to a suitable organization
 * automatically, by ROLE — the user makes no extra decision.
 * Returns null when no organization can carry the model (which must then
 * surface as `no_delivery_path`, never as a silent gap).
 */
export function assignResponsibleOrganization(
  model: EmploymentModel,
  available: readonly OrganizationRoleAssignment[],
): string | null {
  // The organization that carries the model's "employing" role.
  const employingRole =
    model.requiredRoles.find((r) => r === "workforce_provider") ??
    model.requiredRoles.find((r) => r === "employer") ??
    model.requiredRoles[0];
  const match = available.find((a) => a.roles.includes(employingRole));
  return match?.organizationId ?? null;
}

// ═══════════════════════════════════════════════════════════════════════════
// 4. Where the product stands today (recorded, not fixed)
// ═══════════════════════════════════════════════════════════════════════════

export interface OrchestrationAssessment {
  readonly rolesAreMultiValued: boolean;
  readonly rolesAreRegistered: boolean;
  readonly addingRoleNeedsMigration: boolean;
  readonly employmentModelExists: boolean;
  readonly fulfilmentChainValidated: boolean;
  readonly architectureDependsOnEntityName: boolean;
  readonly currentTypeValues: readonly string[];
  readonly verdict: "orchestrator" | "single_type_directory";
  readonly evidence: string;
}

/**
 * VERIFIED 2026-07-28 against production and the codebase:
 *   - `public.organizations.organization_type` is a SINGLE text column with a
 *     CLOSED CHECK: 'company' | 'agency' | 'team' | 'other';
 *   - 9 organizations exist, using 'company' and 'agency';
 *   - an organization therefore cannot hold two roles at once, and adding
 *     "payroll_provider" or "verification_provider" REQUIRES A MIGRATION;
 *   - no employment-model concept exists anywhere (grep: 0 hits for
 *     employmentModel / employment_model / fulfilment / fulfillment);
 *   - no fulfilment-chain validation exists;
 *   - the only hardcoded legal-entity names are in LEGAL COPY
 *     (`lib/privacy/consent-definitions.ts` data-controller disclosure, Terms),
 *     which the lock explicitly allows — no LOGIC depends on an entity name.
 */
export const ORCHESTRATION_ASSESSMENT: OrchestrationAssessment = {
  rolesAreMultiValued: false,
  rolesAreRegistered: false,
  addingRoleNeedsMigration: true,
  employmentModelExists: false,
  fulfilmentChainValidated: false,
  architectureDependsOnEntityName: false,
  currentTypeValues: ["company", "agency", "team", "other"],
  verdict: "single_type_directory",
  evidence:
    "organizations.organization_type is a single text column with a closed CHECK (company|agency|team|other); no employment model and no fulfilment chain exist; entity names appear only in legal copy.",
};

/** The five answers a PR touching orchestration must give. */
export const MANDATORY_ORCHESTRATION_QUESTIONS = [
  { field: "usesRolesNotEntityNames", question: "Does it depend on ROLES rather than a specific legal entity?" },
  { field: "supportsMultipleRoles", question: "Does it allow one organization to hold several roles?" },
  { field: "hasExecutableModel", question: "Is there an employment model the platform can actually execute?" },
  { field: "hasResponsibleOrganization", question: "Is an organization responsible for organising the employment?" },
  { field: "chainUnbroken", question: "Is the chain unbroken from the first AI conversation to the start of work?" },
] as const;
