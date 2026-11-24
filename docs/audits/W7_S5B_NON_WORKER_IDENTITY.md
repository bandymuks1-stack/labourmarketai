# W7-S5b — non-worker identity made explicit on `/dashboard/profile`

> Status: **W7_S5B_NON_WORKER_IDENTITY_EXPLICIT**
> Branch `feat/cc/w7-s5b-non-worker-identity`, built on `b9cfdb0a`.

## 1. The audited premise was wrong — and the correction matters

`W7_CLOSURE_AUDIT.md` recorded: *"a pure company/agency identity silently
loses 12 of 21 profile sections with no copy acknowledging it."* That reading
came from the page's code — every person block gates on `workerId` — and it is
**empirically unreachable for normally-created accounts**:

- Migration `0009_auth_role_architecture_v1.sql` installs
  `on_profile_created_ensure_worker`: **every** new `profiles` row gets a
  `workers` row, whatever role the account signed up with.
- `workers_select` RLS (`can_view_worker`) lets the owner read that row.

Verified against the local stack: a fresh `role=company` signup ends with
`profile_roles={company}` **and** a `workers` row, so `workerId` is never
null and every "gated" section renders. The fixtures `dev.company@local.test`
and `dev.agency@local.test` are both in this state.

The real, reachable defect is the **reverse shape**: an account holding no
person *role* (identity truth = `profile_roles` — exactly the set the
RoleSwitcher computes held/missing identities from) saw:

- worker-framed FeatureNote copy — *"Your professional passport: CV, skills
  and work journal…"* — rendered **unconditionally** (`page.tsx`, old L770);
- a page full of person sections holding no person data;
- no statement anywhere of which identity the page was being viewed with.

The audited no-`workers`-row state still exists as a **legacy/degraded**
state (`workers_delete` RLS lets an owner delete their row; pre-0009 data),
and in that state the sections genuinely vanish with no copy.

## 2. What shipped

One pure derivation + one notice + one copy fix. No new route, no schema
change, no new request stage, no worker sections restored to fill the page.

| piece | file |
|---|---|
| pure derivation (identity → notice state) | `apps/web/lib/profile/non-worker-identity.ts` |
| THE one notice (EmployerContextNotice precedent) | `apps/web/components/app/non-worker-identity-notice.tsx` |
| page wiring + FeatureNote honesty fix | `apps/web/app/[locale]/dashboard/profile/page.tsx` |
| copy, 11 catalogs | `apps/web/messages/*.json` (`profileIdentityNotice`) |
| guard | `apps/web/lib/guards/w7-s5b-non-worker-identity.test.ts` |
| evidence re-capture script (local stack only) | `apps/web/scripts/w7-s5b-evidence.ts` |

Model — the notice keys on **identity**, the entity row picks the honest
**presentation**:

- roles include `worker` → `hidden` (the page is genuinely theirs; degraded
  entity-row states stay owned by the per-section `needs-migration` copy).
- no person role → `visible`, `reason` = `organization-only`
  (company/agency/customer role held) or `no-person-role`;
  `presentation` = `sections-empty` (workers row exists — the normal case:
  the sections below are theirs but empty) or `sections-hidden` (no workers
  row — the blocks are genuinely not rendered).

The notice states, in the viewer's locale: which identity the page is being
viewed with; the true sentence about the person sections for the actual
presentation; that the organisation's details live in the company profile
(link, only when an organisation identity exists — 44 px target); and that a
person identity can be added in the role switcher, with nothing created or
filled automatically. `data-reason` + `data-presentation` make the states
machine-readable.

The FeatureNote swap is gated on the same identity derivation — **not** on
`workerId`, which would never fire (see §1). A non-worker identity now gets
`featureNotes.identityModel` (the two-identities doctrine line) instead of
the professional-passport line.

Copy: real translations in lt/en/ru/nl/de (active-locale parity guard) and
da (the DA debt ratchet forbids new `[EN]` strings); `[EN]` shells in
no/sv/lv/et/pl per convention. No silo framing, no "verified" claims, no
fake-payment CTA tokens (the first draft's "unlock" tripped
`launch-explanations-cta` and was reworded).

## 3. Constraints honoured

- **W7-S3 read waterfall**: the `profileIdentityNotice` namespace joined the
  existing `Promise.all` translation batch — page `await` count unchanged.
- **W7-S4 IA**: no `getOwnedOrganizations()` back on the page; page-level
  `<section>` count unchanged (the notice's `<section>` lives in the
  component); `marketplaceHub` namespace untouched.
- **W7-S1**: hub mounted once, untouched.
- Full guard suite: **10,927 passed / 0 failed** (was 10,925 + this slice's
  new tests, minus nothing).

## 4. Browser proof (local stack, 1440 + 375)

`docs/audits/evidence/w7-s5b/`:

| file | account | state proven |
|---|---|---|
| `profile-org-only-sections-empty-1440.png` / `-375.png` | `dev.company@local.test` | `organization-only` + `sections-empty` — notice at top, two-identities FeatureNote, empty person sections below |
| `profile-org-only-sections-hidden-1440.png` / `-375.png` | local user with `workers` row removed | `organization-only` + `sections-hidden` — worker header links gone, person blocks gone, notice says exactly that |

Both `data-reason` / `data-presentation` values were asserted by the capture
script before the screenshots were taken, not eyeballed.

## 5. Not done here, deliberately

- No re-gating of the 13 person blocks on role identity (a behavioural
  restructuring of the page, not a communication fix — and it would delete
  visible surface for existing organisation accounts without an owner
  decision).
- No change to the 0009 trigger. Whether every account *should* get a
  `workers` row at signup is a product/schema question; as shipped, the page
  now tells the truth in both worlds.
