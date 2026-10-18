# Entitlement parity: WEB / MCP / mobile (PR #2010)

## Web resolver (main)
`getEffectiveEntitlements()` reads the cookie session (`supabase.auth.getUser()`), `isSuperadmin()` (cookie), and the billing subject from `resolveBillingSubject()` (cookie workspace -> `resolveEmployerCompanyContext`, membership proven under RLS). Organization subscription rows are read via service role scoped by that proven org id.

## MCP resolver (main, before fix)
Same function, called from `gateOpenNeeds` with no arguments. A bearer request has no cookie, so user = null -> anonymous `worker` plan -> every demand create/reopen refused while billing is enforced. Not a bypass; a wrong subject.

## Difference
Only WHERE the (user, organization) pair comes from: cookie vs the caller's own verified bearer identity. The plan/limit/LMC semantics (`resolveEntitlements`, `entitlementAllows`, `limitFor`, count) were already shared.

## Change (#2010, smallest canonicalization)
`getEffectiveEntitlements(caller?: {supabase, userId, organizationId})`; `isSuperadminFor`; `gateOpenNeeds` passes its own (client, profileId, organizationId). No caller = cookie path, byte-for-byte unchanged. Billing is never bypassed; the same decision function runs for all transports. Mobile uses the same explicit-caller form. Only confirmation tokens remain interface-specific.

## Security
- organizationId is never client-asserted: it comes from `requireEmployerCompanyForCaller` (caller's own active `company_memberships` row, RLS client) before the gate; no membership -> `ok:false`, gate never reached.
- Cross-org: subscription read is `.eq(organization_id, <proven org>)` only; another org's plan never applies.
- Fail-closed: unreadable count refuses once enforced; admin probe fails closed (false) on unavailable role signal.
- Residual (defense in depth, not a defect): `getEffectiveEntitlements(caller)` trusts the organizationId its caller proved. A future caller that skipped the employer gate would be unsafe; the doc comment and a source pin in the new test name the contract.

## Tests
`open-needs-gate.parity.test.ts` (new): flag off unchanged; free org capped (upgrade); free under cap allowed; paid allowed to 10 then individual_plan; cross-org denied; unreadable count fails closed; web vs bearer same verdict; authority source pin. Existing `effective-entitlements.test.ts` explicit-caller test retained. tsc clean; billing + guards + capabilities + demand vitest green.

## Remaining gate
No migration, no schema, no prod apply. PR stays draft + `needs-human-gate` (RED because it touches auth-core `superadmin.ts`). Owner approval needed for the `isSuperadminFor` addition only.
