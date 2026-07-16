# Team Match Input Contract v1 (`TeamMatchInputV1`)

Status: **v1 — owned by Wagon 2 (Trust Connect Teams), consumed by Wagon 4
(team matching).** Any shape change requires a version bump of this document
and of the type name.

- Implementation: `apps/web/lib/company/team-match-input.ts`
  (`buildTeamMatchInput(teamId)`).
- Related migrations: `supabase/migrations/20260716130000_team_profile_details_v1.sql`
  (DRAFT, owner-gated), plus the applied team org spine `20260705220000`.

## Shape (exact field names)

```ts
type TeamMatchInputV1 = {
  teamId: string;
  activeMemberCount: number;
  deployableSize: { min: number | null; max: number | null };
  professionComposition: Array<{ slug: string; memberCount: number }>;
  skillComposition: Array<{ slug: string; membersDeclared: number; membersConfirmed: number }>;
  languageComposition: Array<{ code: string; level: string | null; memberCount: number }>;
  certificationCoverage: Array<{ slug: string; memberCount: number }> | null;
  availability: {
    status: "available_now" | "available_from" | "not_available" | "unknown";
    availableFrom: string | null;
  };
  destinationCountries: string[] | null;
  accommodationNeeded: boolean | null;
  transport: { ownTransport: boolean | null };
  memberConsentCompleteness: { consentedMembers: number; totalMembers: number };
  dataFreshness: {
    updatedAt: string | null;
    bucket: "active" | "recent" | "dormant" | "unknown";
  };
  visibilityState: "private" | "members_only" | "discoverable" | "unknown";
};
```

## Field derivations — every value from real schema, or explicitly empty

| Field | Source of truth | When not derivable |
|---|---|---|
| `teamId` | `organizations.id` where `organization_type='team'` | function returns `null` (not a readable team) |
| `activeMemberCount` | `engagement_contexts` rows: `relationship_slug='employee'`, `status='active'` (applied spine 20260705220000 / 20260530140000) | `0` |
| `deployableSize.min/max` | `team_details.deployable_size_min/max` (DRAFT 20260716130000) | `null` = not stated / migration unapplied |
| `professionComposition` | `worker_professions` → `professions.slug` for member workers (applied 0008); `memberCount` = distinct workers | `[]` |
| `skillComposition` | `get_team_capability_summary_v1` (applied 20260705220000) — member-declared vs manager-confirmed counts over real `worker_skills` | `[]` |
| `languageComposition` | `worker_languages.lang/level` for member workers (20260711250000), `code` = the `lang` value, `memberCount` = distinct workers per (code, level) | `[]` when the table is unreadable/unapplied |
| `certificationCoverage` | **none** — no structured certification slugs exist in the applied schema | always `null` in v1 (never invented) |
| `availability.status` | `team_details.availability_status` | `"unknown"` |
| `availability.availableFrom` | `team_details.available_from` | `null` |
| `destinationCountries` | `team_details.destination_countries` (uppercase ISO-alpha-2, ≤30) | `null` = not stated |
| `accommodationNeeded` | `team_details.accommodation_needed` | `null` when no details row |
| `transport.ownTransport` | `team_details.transport_own` | `null` when no details row |
| `memberConsentCompleteness` | `consentedMembers` = active members whose profile ACCEPTED a `join_team` invitation for this team (canonical `invitations` ledger, 20260712200000, inviter-or-admin read); `totalMembers` = active member count | when the ledger is unreadable, `consentedMembers` is `0` — zero RECORDED consents is the truth |
| `dataFreshness.updatedAt` | `team_details.updated_at` | `null` |
| `dataFreshness.bucket` | age of `updatedAt`: `< 7d` → `active`, `< 30d` → `recent`, else `dormant` | `unknown` when `updatedAt` is null |
| `visibilityState` | applied policy fact: `organizations_select` (0013) is `using (true)` — every team org row is readable to authenticated users (network search), so v1 reports `"discoverable"` | if a real visibility column lands later, derive from it and bump this contract |

## Guarantees for the consumer (Wagon 4)

1. **No invented data.** A field is real, or it is `null` / `"unknown"` / `[]`.
   In particular `certificationCoverage` stays `null` until real structured
   certification data exists.
2. **Honest degradation.** While the owner has not applied the draft-gated
   `team_details` migration, `deployableSize`, `availability`,
   `destinationCountries`, `accommodationNeeded`, `transport` and
   `dataFreshness` all read as nulls/unknowns — matching must treat that as
   "not stated", never as "available".
3. **Consent is measurable.** `memberConsentCompleteness` counts only
   ledger-recorded acceptances (accepted `join_team` invitations). Matching
   may rank consent-complete teams higher; it must not present
   consent-incomplete teams as consented.
4. **PII boundary.** The input carries NO member names, emails, phones or
   per-member identifiers — only counts and slugs. Contact disclosure stays
   the separate per-member auditable grant flow.
5. **RLS-scoped.** The builder runs under the caller's session; unreadable
   member data silently reduces counts rather than erroring or leaking.

## Shared contact/consent contract cross-reference

Team enquiries (`supabase/migrations/20260716131000_team_enquiries_v1.sql`)
follow the shared request contract: status vocabulary
`created → accepted | declined | withdrawn | expired`; `delivered`/`viewed`
recorded only as append-only `team_enquiry_events` rows; 10 open + 30/24h
rate limits; idempotent create (partial unique index on open rows, duplicate
create returns the existing enquiry); `expires_at = created_at + 14 days`
with an admin-only sweep and honest past-expiry reads; messages ≤ 500 chars
with server-side rejection of embedded emails / phone-like digit runs;
acceptance never discloses member contacts.
