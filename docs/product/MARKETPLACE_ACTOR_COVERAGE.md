# Marketplace actor coverage (ACTOR x DOMAIN x DIRECTION)

Status: 2026-10-04, read against production (read-only) and the #2124 / #2151 branches.
Scope: what the federated `/dashboard/listings` discovery can say about WHO is on a row.
Not a target architecture (see `docs/OWNER_TARGET_ARCHITECTURE_V1.md`); an honest status table.

## Rule

`ActorKind` (`person | company | institution | agency | service_provider | supplier | other`) is
derived per row from a canonical fact and carries an `actorBasis`:

| basis | meaning |
|---|---|
| `source_column` | a column of the origin row: `marketplace_listings.owner_id` (profile, no organisation) -> person; `service_offerings.provider_id` (profile) -> service_provider |
| `source_kind` | the origin reader's own gate: `customer_requests.kind = agency_offer` -> agency; verified-company demand reader -> company |
| `capability` | `organization_roles.role_slug`, read under the CALLER's RLS (members only): `training_provider` -> institution; `workforce_provider` / `talent_provider` / `recruitment_partner` -> agency; `supplier` / `logistics_provider` / `payroll_provider` / `verification_provider` -> supplier; `employer` / `client` / `contractor` / `subcontractor` / `project_operator` -> company |
| `undisclosed` | the source does not state it -> `other` |

Never read as authority: `companies.company_type`, `organizations.organization_type` (ORG-2:
an agency is a capability, not an account type). Kind is shown; identity never is (agency
supply and vacancies stay anonymous).

## Coverage today

Legend: S = canonical source exists and the kind is derivable; C = only when the caller can read the
organisation's roles (own / member organisation); - = no canonical source today (no row is faked).

| actor | WORK offer | WORK need | SERVICE offer | SERVICE need | GOODS offer | GOODS need | PROJECT offer | PROJECT need |
|---|---|---|---|---|---|---|---|---|
| person | - (no people list, by design: consent-gated scouting) | - | - | S (service_need listing, no org) | S (sale/rental listing) | S (wanted listing) | - | S (project listing, no org) |
| company | - | S (verified demand; vacancies = `other`) | C (org listing) | C (org listing) | C (org listing) | C (org listing) | - | S (verified demand) |
| institution | - | C (org listing) | C (org listing) | C (org listing) | C | C | - | C |
| agency | S (`agency_offer` supply) | - (agency demand is delegated demand, not a federated row) | - | - | - | - | - | - |
| service_provider | - | - | S (`service_offerings`) | - | - | - | - | - |
| supplier | - | - | C | - | C (org listing) | - | - | - |

## Gaps (honest)

1. Organisation listings of ANOTHER organisation render as `other`: `organization_roles` is RLS-scoped to
   members, so a third party cannot read its capability. Fixing it needs a public-safe capability
   projection (RED: new view / grant) - not done here, owner decision.
2. `public_vacancies` states no poster, so a vacancy is `other`; employer vs agency is not knowable.
3. `service_offerings` has no organisation column (`organization_id` deferred in #2124): an organisation
   offering services cannot be represented; every offering reads as an individual service provider.
4. No row sources exist for: person offering work (by design), company/institution offering services
   through a dedicated source, supplier needing goods, agency/service-provider need rows, any project/contract OFFER
   (subcontractor capacity) - these cells stay `-`.
