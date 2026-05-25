# Account & role model — v1

This is a **product** policy, not a legal contract. It describes how labourmarket.ai treats accounts and roles so testers and the team have a shared mental model.

## Three layers

1. **Personal account** — your base identity. One Google login = one personal account. Email is the canonical id.
2. **Worker profile** — created automatically when you sign up. Your individual work history, skills, journal entries. Owner-private.
3. **Organisation profiles** — company, agency, buyer/client. **Higher-responsibility** surfaces. One personal account can represent multiple organisations across multiple countries.

The personal account is permanent. The roles are lenses on it.

## Roles are workspace lenses, not permanent identity

The role switcher in the dashboard header lets you switch active context (worker → company → agency → customer). Switching role does NOT:

- Change your underlying personal account.
- Delete data from other roles.
- Mark anything as "verified by another role".

It changes what the dashboard shows. Your worker journal entries don't disappear when you switch to a company workspace; they live on your worker profile.

## Admin is not a workspace role

`admin` is a **permission**, not a workspace. The role switcher only shows `worker / company / agency / customer`. Admin status is a separate signal (`profile_roles` row tagged `'admin'` OR `active_role = 'admin'`; see `deriveIsAdmin` in `lib/auth/admin-signal.ts`).

This means: switching from `worker` to `company` does NOT strip your admin permission. You can be a company workspace user AND an admin.

## No free fake companies

When you create a company / agency / buyer organisation profile, you are claiming to represent a real legal entity (or a real client). The product treats that claim seriously.

For pilot testing, organisation profiles can be created with minimal data. Before any serious use (matching, formal posting, payments — none of which exist in v1 yet), the organisation will need full `rekvizitai`:

- country
- organisation legal name
- registration code (if applicable)
- correspondence address
- representative role

These are required at the point of serious use, not at first creation. Creating an empty org profile to test the UI is fine; using that profile to formally post a job to real workers is not — and v1 doesn't even expose that surface.

## Multi-org / multi-country support

One personal account can represent:

- multiple companies (e.g. you own two limited companies);
- multiple agencies;
- the same company across multiple country contexts (e.g. UAB "X" operating in LT and PL).

Each organisation profile is independent at the data layer. The role switcher's dropdown will eventually list them all; v1 surfaces one workspace per role at a time.

## Pilot vs final marketplace

The current product is **not a marketplace** yet. There is no matching, no public job posting, no scoring, no payment. Every draft is private to the owner until they explicitly share it (and v1 has no "share" action).

The pilot exists to prove the foundation: the trust loop from free-text input to confirmed evidence. Marketplace mechanics are layered on after the foundation holds.

## What's verified vs self-declared

| Surface | State |
|---|---|
| Profile skills (`profile_skill_claims`) | **self-declared**. Visible to you + admin. NOT visible to employers. |
| Worker skills (`worker_skills`) | self-declared, employer-readable (this is intentional and predates the doctrine — to be tightened in a follow-up). |
| Journal entries before external confirmation | self-declared, editable / deletable by you. |
| Journal entries after external confirmation | self-declared content stays; the confirmation is a separate row added by a manager. Original entry never overwritten. |
| Anything labelled "AI-verified", "auto-matched", "guaranteed match" | **does not exist.** Pinned by `lib/guards/product-readiness.test.ts`. |

## See also

- `docs/policies/organization-profile-creation-policy-v1.md` — when can an org profile actually be used for real ops.
- `docs/policies/pilot-terms-and-responsibility-v1.md` — what pilot testers are agreeing to.
- `docs/policies/journal-evidence-and-correction-policy-v1.md` — how journal entries can be corrected.
- `apps/web/lib/auth/admin-signal.ts` — the dual `isAdmin` derivation.
