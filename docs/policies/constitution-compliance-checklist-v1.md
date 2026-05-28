# Constitution compliance checklist — v1

> **Status:** Binding. Every PR that touches user-facing surfaces,
> schema, RLS, auth, roles, onboarding, or signal-classified visuals
> must paste this checklist (filled) into its PR description and into
> the matching sprint artefact under
> `runtime/artifacts/labourmarketai-real-visual-os-2026-05-28/`.

Trivial docs-only / chore PRs (no UX surface, no schema change, no
DoD-relevant behaviour) may skip this checklist — but if there is
any doubt, fill it.

## How to use

Copy the block in §1 verbatim into the PR description. Replace each
`[ ]` with `[x]` only after honestly confirming the bullet. Where a
bullet does not apply, replace it with `[n/a — <why>]`. Do not delete
bullets.

## 1. Checklist block (paste into PR)

```
## Constitution compliance — labourmarket.ai

### Read & cited
- [ ] PRODUCT_CONSTITUTION.md read this session
- [ ] PLATFORM_DOCTRINE.md sections relevant to my change read
- [ ] Relevant docs/policies/*-v1.md files read

### Account, roles, permissions
- [ ] One human = one profiles row preserved (no second user-identity model)
- [ ] Roles written through profile_roles (or add_role RPC), not collapsed into active_role
- [ ] active_role used for workspace view only, NEVER for permission checks
- [ ] Admin recognised via the dual signal (active_role OR profile_roles[admin]); no inline `active_role === 'admin'` checks
- [ ] If new role added: lib/config/roles.ts row + profile_roles allowlist + add_role RPC branch + i18n labels for LT + EN
- [ ] Role responsibilities, permissions, visibility, and limits documented (in docs/ROLES.md or the new policy)

### Self-entry + invitations (onboarding-channels-policy-v1)
- [ ] Self-entry path open and reachable for every surface I added
- [ ] If invitation flow added: self-start path surfaced with equal prominence on the same screen
- [ ] No parallel invite-only data model — invitations converge on profile_roles
- [ ] No copy implying "invitation required to join"

### Signal classification (DEMO_TO_REAL_DATA_POLICY)
- [ ] Every new card / counter / score / chart classified as concept | sample | preview | real
- [ ] Sample data carries literal `Sample ·` or `Example` prefix where confusable
- [ ] Preview surfaces carry a product-stage label (PRE-ALPHA / Activity preview / Concept / Sample / Early access)
- [ ] No fabricated numbers — undefined renders as `—`, not as a number
- [ ] No `verified` / `trusted by` / `X jobs filled` / `X matches made` claims
- [ ] No universal-value scoring (no "X / 99", no profile-strength rating, no league table)

### Feature Definition of Done (feature-definition-of-done-v1)
- [ ] BEFORE answered literally
- [ ] AFTER answered literally
- [ ] URL (LT and EN) provided
- [ ] ACTION named (single concrete action)
- [ ] RESULT (visible state change) described
- [ ] RELOAD persistence stated (or honest "does not persist (<why>)")
- [ ] BLOCKER named or `none`
- [ ] Progression state (real / partial / blocked / preview) declared
- [ ] visible-product-progress advance request matches the declared state (or omitted if preview/blocked)

### Locale (PLATFORM_DOCTRINE §2.4, owner override 2026-05-28)
- [ ] All 10 locale JSON files still present in repo
- [ ] New i18n keys added to all 10 files (placeholder `[EN] …` allowed for non-Tier-1)
- [ ] No new locale added to activeLocales without explicit owner approval
- [ ] No /lv/, /de/, /et/, /nl/, /da/, /no/, /sv/, /pl/ routes prerendered

### Database / DB writes
- [ ] No production DB schema change in this PR (or: schema change explicitly authorised in the goal)
- [ ] If new user-content table: original_text + original_language + prev_hash + content_hash columns present from day 1 (PLATFORM_DOCTRINE §2.3 + §3.3)
- [ ] If new RLS policy: default-closed; grants are rows, not flags
- [ ] No fake / sample / synthetic rows inserted at release time

### Safety hard-stops
- [ ] No manual deploy command run
- [ ] No production migration applied without explicit owner approval
- [ ] No secrets printed (env var values redacted)
- [ ] No fake users / companies / agencies / buyers / chats created
- [ ] If next sprint must wait, this PR does NOT start it

### Validation
- [ ] pnpm -F web typecheck → exit 0
- [ ] pnpm -F web lint → exit 0
- [ ] pnpm -F web build → "Compiled successfully" + only lt+en routes prerender + no MISSING_MESSAGE errors
- [ ] pnpm -F web check:constitution → exit 0
- [ ] Relevant tests pass (lib/auth / lib/i18n / lib/guards as touched)
```

## 2. Sprint artefact additional block

Sprint artefacts under
`runtime/artifacts/labourmarketai-real-visual-os-2026-05-28/` must
ALSO carry this short audit trail at the bottom:

```
## Constitution audit trail
- Constitution read: yes
- Violations found: yes | no (list)
- Feature DoD satisfied: yes | no | partial (state which lines failed)
- check:constitution result: pass | fail (cite reason if fail)
```

The Agentai final-report template
(`runtime/artifacts/labourmarketai-real-visual-os-2026-05-28/agentai-future-sprint-protocol-v1.md`)
inherits this block. Sprint reports without it are treated as
incomplete.

## 3. What this checklist does NOT do

- It does not replace the constitution or any binding doc.
- It does not invent new rules; it enumerates already-binding ones.
- It does not gate technical green checks — those still run via
  `pnpm -F web typecheck` / `lint` / `build`.
- It does not auto-grant DoD; the human author still confirms each
  bullet.

## 4. Pinned by

- `apps/web/lib/guards/constitution-compliance.test.ts` — verifies
  that this file plus the two companion policies
  (`onboarding-channels-policy-v1.md`,
  `feature-definition-of-done-v1.md`) exist and carry the required
  pinned phrases.
- `pnpm -F web check:constitution` — runs the guard above and exits
  non-zero if any pinned phrase is missing.

## 5. See also

- `docs/PRODUCT_CONSTITUTION.md`
- `docs/PLATFORM_DOCTRINE.md`
- `docs/policies/account-and-role-model-v1.md`
- `docs/policies/onboarding-channels-policy-v1.md`
- `docs/policies/feature-definition-of-done-v1.md`
- `docs/DEMO_TO_REAL_DATA_POLICY.md`
- `docs/PLACEHOLDERS.md`
