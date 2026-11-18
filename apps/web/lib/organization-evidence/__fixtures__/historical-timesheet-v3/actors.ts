/**
 * FIXTURE v3 §1 — THE ACTORS. Entirely SYNTHETIC (the repository is public):
 * names use only the tokens Fixture / Fixtura / Fixturos / Fixtuur / Gama and
 * the NATO alphabet, codes sit in 9990000xx, and every id is an RFC-4122 v4
 * UUID under the prefix below. Nothing here names a real organization,
 * person or customer. (The Layer D e-mail claims on the reserved
 * `fixture.invalid` domain arrive with Layer D in PR-3; Layer P needs none.)
 *
 * Spec: docs/design/historical-timesheet-fixture-v3.md §1.
 */

export const FIXTURE_UUID_PREFIX = "0f1e7300-0000-4000-8000-";

const id = (tail: number): string => `${FIXTURE_UUID_PREFIX}${String(tail).padStart(12, "0")}`;

export const ORG = {
  FX: { id: id(1), name: "Fixture Timesheets FX", roles: ["employer", "workforce_provider"], legacyCompanyId: id(401) },
  FY: { id: id(2), name: "Fixture Other Org FY", roles: ["employer"], legacyCompanyId: id(402) },
  FZ: { id: id(3), name: "Fixture Party Org FZ", roles: ["client"], legacyCompanyId: null },
  FN: { id: id(4), name: "Fixture No-Roles FN", roles: [] as string[], legacyCompanyId: null },
} as const;

/** Profiles, keyed by the fixture's actor key. */
export const PROFILE = {
  O_OSCAR: { id: id(101) },
  M_MIKE: { id: id(102) },
  E_EVE: { id: id(103) },
  P_ALPHA: { id: id(104) },
  X_XAVIER: { id: id(105) },
  Y_YANKEE: { id: id(106) },
  Z_ZULU: { id: id(107) },
  N_NOVEMBER: { id: id(108) },
} as const;

/** Governance memberships (§1). E-Eve is an external manager: she passes
 *  `manages_organization` today and fails the G(org) predicate of M1. */
export const MEMBERSHIPS = {
  O_OSCAR: [{ organizationId: ORG.FX.id, organizationName: ORG.FX.name, role: "owner" }],
  M_MIKE: [{ organizationId: ORG.FX.id, organizationName: ORG.FX.name, role: "manager" }],
  E_EVE: [{ organizationId: ORG.FX.id, organizationName: ORG.FX.name, role: "external_manager" }],
  X_XAVIER: [{ organizationId: ORG.FY.id, organizationName: ORG.FY.name, role: "manager" }],
  Y_YANKEE: [{ organizationId: ORG.FY.id, organizationName: ORG.FY.name, role: "owner" }],
  Z_ZULU: [{ organizationId: ORG.FZ.id, organizationName: ORG.FZ.name, role: "manager" }],
  N_NOVEMBER: [{ organizationId: ORG.FN.id, organizationName: ORG.FN.name, role: "owner" }],
} as const;

export const WORKER = { W_ALPHA: id(201), W_OSCAR: id(202) } as const;

/** The FX roster seeded before the script runs (§1). */
export const ROSTER = {
  PA: { id: id(301), display_name: "Person Alpha", normalized_name: "alpha person", external_ref: "EMP-001", linked_profile_id: PROFILE.P_ALPHA.id },
  PD1: { id: id(304), display_name: "Person Delta One", normalized_name: "delta one person", external_ref: null, linked_profile_id: null },
  PD2: { id: id(305), display_name: "Person Delta Two", normalized_name: "delta person two", external_ref: null, linked_profile_id: null },
  PO: { id: id(306), display_name: "Owner Oscar", normalized_name: "oscar owner", external_ref: "EMP-000", linked_profile_id: PROFILE.O_OSCAR.id },
} as const;

/** Entities that exist outside FX, for the negative controls of later layers. */
export const FOREIGN = {
  OY: { id: id(501), name: "Fixtura Other Site" },
  PY: { id: id(601) },
  PL: { id: id(602), title: "Fixture Live Project" },
} as const;

/** Customer identities the design expects (§1 "Expected created entities"). */
export const CUSTOMER = {
  C1: { key: "code:--:999000001", name: "UAB Fixtura Alfa" },
  C3: { key: "code:--:999000005", name: "UAB Fixtura Alfa" },
  C2: { key: "name:fixtura wonen", name: "Fixtura Wonen B.V." },
} as const;

/** Every fixture id, for the hygiene check. */
export const ALL_FIXTURE_IDS: readonly string[] = [
  ...Object.values(ORG).flatMap((o) => [o.id, ...(o.legacyCompanyId ? [o.legacyCompanyId] : [])]),
  ...Object.values(PROFILE).map((p) => p.id),
  ...Object.values(WORKER),
  ...Object.values(ROSTER).map((p) => p.id),
  FOREIGN.OY.id,
  FOREIGN.PY.id,
  FOREIGN.PL.id,
];
