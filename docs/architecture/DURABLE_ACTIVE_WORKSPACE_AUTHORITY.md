# DURABLE ACTIVE WORKSPACE AUTHORITY — M-P0-5 contract

Owner directive 2026-08-05 ("OWNER DECISION — APPLY COMPANY_MEMBERSHIPS V1…"
§16–§18). Target: `DURABLE_ACTIVE_WORKSPACE_AUTHORITY_CODE_COMPLETE_PENDING_OWNER_GATES`.

The mechanism largely EXISTS (W8 slice 1 + owner audit P0.1); this document
is the §17 contract stating exactly how it works, and this slice closes the
one doctrinal gap it still had (the multi-org first-organization fallback).

## §17 answers — the authority contract

| Question | Answer (code truth) |
|---|---|
| Where is the selected workspace id stored? | TWO layers. (1) Session: httpOnly cookie `lm_active_workspace` (`lib/company/active-organization.ts: ACTIVE_WORKSPACE_COOKIE`). (2) Durable preference: `profiles.active_organization_id` (owner-gated migration 20260714210000, feature-detected). |
| Session, cookie, profile preference or server record? | Cookie for the in-session choice (wins), profile column as the durable cross-session preference. Both are only PREFERENCES — neither is authority. |
| How is it signed/validated? | It is deliberately NOT trusted, so it needs no signature: on EVERY request the stored id is re-validated against the live membership-validated workspace list (`resolveActiveWorkspaceId` — a pure function that only accepts ids present in that list). A forged or tampered value can select nothing the person does not belong to. |
| How is membership checked? | The workspace list is rebuilt per request from three sources: owned `organizations`, ACTIVE `engagement_contexts`, and (M-P0-4 Slice 2, feature-detected) ACTIVE `company_memberships`. The pointer can only match an entry of that list. |
| How does revocation invalidate it? | Revocation removes the org from the per-request list, so the stored pointer stops matching on the NEXT request and resolution fails closed (proven in the M-P0-3 spec: revoked workspace → C gone from surface + menu; and the M-P0-4 spec: revoked membership → org gone from the invitee's switcher). |
| Multiple browser tabs? | The cookie is per-browser-session (shared by tabs); a switch in tab 1 applies to tab 2's NEXT request — two tabs can never act in two different workspaces on interleaved requests' server state, because every server action re-reads the cookie + re-validates membership at execution time. No client-side cache is authority. |
| Logout? | Supabase auth signout ends the auth session; without `auth.uid()` no workspace resolves at all (`getWorkspaceContext` returns the empty context). The cookie may physically persist but is inert — it is a preference keyed to nothing until the next authenticated session re-validates it against THAT account's memberships. A different account logging in on the same browser cannot inherit the workspace unless it is genuinely a member (validation is per-account). |
| Personal context representation? | The sentinel `PERSONAL_WORKSPACE_ID = "personal"` — never an org id. Choosing it clears the durable pointer (`clearActiveOrganization`). Personal grants NO employer authority (`resolveEmployerCompanyContext` → `personal-workspace`, fail closed — proven in M-P0-3 test 4). |
| Stale organization ids? | Fail closed: not in the validated list → ignored. After this slice: multi-org holders resolve to Personal (explicit re-choice required); the SINGLE-org case may default to that only, unambiguous organization (see "The gap" below). |
| How do server actions obtain the context? | `getWorkspaceContext(identity)` (request-cached) → `activeWorkspaceId`; employer writes then go through `requireEmployerCompany()` (M-P0-3) or the membership commands' own SQL-side authority (M-P0-4). Never a client parameter. |
| How do RSC/server components obtain it? | The same request-cached `getWorkspaceContext` / `resolveEmployerCompanyContext` — one answer per request for every reader. |
| CSRF / context confusion on switching? | Switching is a Next.js server action (POST, origin-checked by the framework) that VALIDATES membership before writing the cookie (`switchActiveOrganization`), writes it httpOnly + `sameSite: "lax"`, and re-validates on every subsequent read. The client can REQUEST a workspace; the server decides. |

Client may request; server decides; no silent fallback to the first
organization (below). `localStorage` is not used anywhere in the chain.
`companies.profile_id` is not an authority input anywhere in the chain
(M-P0-3 removed the write-path uses; the resolver never read it).

## The gap this slice closes — array-first fallback

Before this slice `resolveActiveWorkspaceId` fell back to
`organizationIds[0]` for company identity whenever the stored pointer was
missing or stale. For a MULTI-org person that is exactly the forbidden
"first/oldest organization" inference (§16 "Do not use array-first
fallback"), and it is what made a revoked workspace silently "snap" to
another org instead of asking.

After this slice:

- stored pointer valid → that workspace (unchanged);
- company identity + EXACTLY ONE organization → that organization (an
  unambiguous default is not an array-first guess — same doctrine as
  M-P0-2's "1 owned → that single unambiguous row");
- company identity + 2+ organizations + no/stale pointer → **Personal,
  fail closed** — the person explicitly picks in the chip (which is exactly
  the M-P0-2 fail-closed-chooser pattern at the workspace level);
- person identity → Personal (unchanged).

`resolveActiveOrganizationId` (the header/company-context variant) gets the
identical treatment: one org → it; several + no valid pointer → null
(honest "choose"), never `organizations[0]`.

## §18 proof map

| Assertion | Where proven |
|---|---|
| select A, navigate + refresh → A remains | M-P0-3 spec (workspace persists across goto/reload; durable pointer) + M-P0-5 spec |
| select B → B remains | M-P0-3 spec test 1 (A→B rebinding, survives goto) |
| Personal → no employer authority | M-P0-3 spec test 4 |
| revoke B elsewhere → stale B fails closed | M-P0-3 spec test 6 (engagement source) + M-P0-4 spec test 5 (membership source) |
| lower-role org C exposes only permitted controls | M-P0-4 spec test 3 (member sees no admin controls) |
| forged organization D cookie rejected | M-P0-5 spec (cookie injected directly → resolution refuses D) |
| logout/login behaviour | M-P0-5 spec (after logout+login the workspace re-validates; no cross-account inheritance) |
| two tabs do not corrupt authorization | M-P0-5 spec (tab 2 acts in the NEW workspace after tab 1 switches) |
| actions stamp the org shown in the UI | M-P0-3 spec tests 1+3 (invite/project DB rows match the chip's workspace) |
| context switching changes no membership/engagement/project row | M-P0-4 §14 SQL proof (fingerprints) + M-P0-3 fixtures unchanged across switches |

## Out of scope

Signing the cookie value (pointless while it is validated-not-trusted),
moving the pointer into a server-side session table (no session table
exists in this stack), per-tab workspaces (product decision, not taken).
