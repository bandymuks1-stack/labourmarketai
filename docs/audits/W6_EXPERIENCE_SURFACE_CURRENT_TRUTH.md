# W6 EXPERIENCE SURFACE — CURRENT-MAIN TRUTH (audited 2026-08-06, main `779357aa`)

Audited in a PINNED worktree at `origin/main` — not from reports. This
document exists because two contradictory claims were both in circulation on
2026-08-06 and one of them entered a PR body and the W matrix.

## Why the contradiction happened (§5 Q13)

The 2026-08-06 late-evening PROD_QA report claimed *"the W6 experience
surface does not exist on main — `lib/trust/experience-eligibility.ts` is
OWNER_DECISION_GATED contract-only."* That audit was accidentally run against
the SHARED MAIN WORKING TREE, which a concurrent session had checked out at
`6e50df3f` — a pre-W6 baseline (168 migrations, no experiences result, no
trust modules beyond the contract library). Every grep "against main" was
against that stale tree. The report, the PR #1042 body rewrite, and the
2026-08-06 W6 matrix edit inherited the error. **The prior claim
"experiences result = real, local full cycle proven" (matrix, W6 memory) was
CORRECT; the late-evening "no UI" claim was the inaccurate one.** Lesson
re-learned: the main tree is never an audit target — a pinned worktree is
(CLAUDE.md operational discipline already says this).

## §5 answers, proven on `779357aa`

1. **Does an experiences ResultKind exist?** YES —
   `lib/conversation/result-registry.ts:74` (`"experiences"`).
2. **Is it registered?** YES — descriptor at `result-registry.ts:288`,
   `openedBy: ["worker.review-experiences"]` (its OWN action; the registry
   comment documents why it never shares `worker.what-next` — first-match-wins
   made the old `reputation` slot unreachable).
3. **Is `dataReadiness` real, unverified or absent?** **`real`** — promoted by
   W6 slice 3; store is canonical `experience_records` /
   `experience_responses` via `lib/trust/experience-records.ts`; the
   owner-gated-migration-absent state renders as a DISTINCT `unavailable`
   state, never a fabricated zero. (The superseded `reputation` kind remains
   registered as `unverified` with its own honest fallback.)
4. **Does a renderer exist?** YES — `result-body.tsx:216 case "experiences"`,
   plus components `experience-submit-form`, `experience-response-form`,
   `experience-dispute-form/-item`, `experience-counts-block`,
   `experience-moderation-panel/-item`.
5. **Can a worker open it from a real action?** YES — conversation action
   `worker.review-experiences` → `?result=experiences`.
6. **Can an organization actor open it?** YES — `contexts: ["personal",
   "organization", "project"]`; the registry comment records that
   personal-only was tried first and REFUTED by the authenticated browser
   proof (the employer author side was hidden).
7. **Is submission executable?** YES — `submitExperienceAction`
   (`lib/trust/experience-actions.ts:41`) through the eligibility/token chain
   (`experience-interaction-token.ts`, `experience-entry-actions.ts`).
8. **Does a server action call the production RPC?** YES —
   `lib/trust/experience-records.ts:119` → `rpc("submit_experience_record")`;
   also `start/decide_experience_moderation`, `submit_experience_response`,
   `open/resolve_experience_dispute`, `get_experience_counts`.
9. **Does the admin moderation queue render real records?** YES —
   `/dashboard/admin` (`app/[locale]/dashboard/admin/page.tsx:132-138`) reads
   `listModerationQueue()` + `listDisputeQueue()` and renders
   `ExperienceModerationPanel` (`admin-experience-moderation` testid). The
   production API logs of 2026-08-06 18:03 show exactly these reads running
   live (`experience_records?...moderation_status=in.(submitted,in_moderation)`
   with `author_side` — the post-#1037 columns).
10. **Is response submission reachable?** YES — `experience-response-form` +
    `submitExperienceResponseAction` → `submit_experience_response`.
11. **What exact guard blocks UI or storage?** **NONE, functionally.** The
    only artifact is the STALE HEADER COMMENT in
    `lib/trust/experience-eligibility.ts` ("OWNER_DECISION_GATED — no UI, no
    storage, no route…"), written when the module was created ahead of the
    §19 decision. It is a comment on a pure contract library; nothing reads
    it as a gate. The shipped UI, storage and routes all postdate it.
12. **Is that guard still canonical after the owner approved
    positive/negative-only, no stars, no numeric score, subjective
    experience, author-vs-subject?** NO — the shipped surface implements
    exactly that doctrine (dimension chips, `as_agreed|minor_issues|
    not_as_agreed` outcomes, count-only aggregation, moderation-always,
    response right, dispute separate; `no stars / no numeric score` is
    guard-pinned). The comment is stale documentation, reconciled by this
    audit (same commit updates the header to point here — the §6 rule that a
    gate is never silently deleted is honoured: nothing is deleted, the
    comment is corrected with a citation).
13. **Which previous report was inaccurate?** The 2026-08-06 late-evening
    "no shipped surface" report (see top). The PR #1042 body and the W6
    matrix row edited that evening carry the error and are corrected in the
    same train as this document.
14. **Does §19 require a product doctrine decision or only removal of a
    stale gate?** NEITHER a new decision NOR a functional gate removal: the
    doctrine decision already exists and is already implemented. Required:
    this documentation reconciliation + the PRODUCTION WRITE PROOF through
    the deployed surface (the deployed app IS `779357aa`).

## What W6 still needs to close

Only the production QA write proof, now executable with the retained cast:
accepted booking `88a43ead` (worker `c267dc8b…` ↔ org QA-SYNTHETIC Alfa
`9e4f4467…`) is the eligible interaction. Person-author → organization-subject
and organization-author → worker-subject submissions run through
`?result=experiences`; moderation approve/reject runs on the operator's admin
queue at `/dashboard/admin`; response + count-only render follow. No demand
needs reopening; no new QA identity is required.

State: `W6_FIT_NOT_RATING_SURFACE_SHIPPED_ON_MAIN_PENDING_PRODUCTION_QA_PROOF`
