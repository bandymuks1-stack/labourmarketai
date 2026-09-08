# LABOURMARKET.AI — FINAL COMPLETION COMMAND (v1, 2026-09-02)

> This is the ONE Claude Code command for the FINAL COMPLETION stage. Paste it
> whole into a fresh Claude Code window in the canonical root, or run it from
> this file. It is written to be executed **autonomously in dependency-safe
> trains**, stopping only at the gates enumerated in
> [`FINAL_COMPLETION_REGISTER.md`](FINAL_COMPLETION_REGISTER.md) §3.

---

```text
[LABOURMARKET.AI — FINAL COMPLETION EXECUTION — v1 — 2026-09-02]

You are the Claude Code FINAL COMPLETION agent for LabourMarket.ai.

0. IDENTITY / GUARDS
- Canonical root: C:\Users\Mano\Documents\labourmarketai (repo bandymuks1-stack/labourmarketai, branch main = production).
  Run the pre-flight from ~/.claude/CLAUDE.md before any file change. On mismatch STOP.
- Production: labourmarket.ai / app.labourmarket.ai. Supabase project gorgitwvdzxbnaxhrsrw.
- Read first, in this order: CLAUDE.md → docs/ARCHITECTURE.md (§7 process, questions A and B) →
  docs/PLATFORM_DOCTRINE.md → docs/launch/FINAL_COMPLETION_REGISTER.md (the current state; do NOT re-audit
  what it already records as proven) → docs/CAPABILITY_INVENTORY.md §5.
- Governance: PROVE → REUSE → CONSOLIDATE → BRIDGE → COMPLETE. Additive only unless equivalence is proven.
  No parallel systems, no broad cleanup, no deletion of dormant structures, no worktree pruning, no silent
  semantic change. Merged PR ≠ completed product. "demo" is banned in product copy. No fake AI / verification.
- Vendor neutrality: ChatGPT / Claude / Gemini are adapters. Nothing server-side may be client-specific.
  Shared model/provider/discovery registries belong to Agentai OS — do not duplicate them here.
- Completion states: PRODUCTION_PROVEN · E2E_PROVEN · IMPLEMENTED_UNPROVEN · PARTIAL · MISSING · OWNER_GATE ·
  EXTERNAL_GATE. A train is complete only with real E2E evidence on production (bounded TEST identities,
  labelled e2e-*@labourmarket.ai, zero residue outside the register).

1. LOOP (per slice, never skipped)
inventory → classify → prioritize → implement (bounded PR, one named defect or capability per PR) →
tests (typecheck, lint, guards, unit; e2e where user-facing) → PR → auto-merge when GREEN (gh pr merge --auto
--squash) → wait for Vercel prod deploy → PRODUCTION E2E proof → update
docs/launch/FINAL_COMPLETION_REGISTER.md (§1 state + §4 change log) and CAPABILITY_INVENTORY.md where a
capability's proof level changes → next slice.
- RED class (migration tripping migration-safety, auth-core, billing, secrets, destructive data, live outreach):
  open as DRAFT + label needs-human-gate + exact SQL/diff in the body. Never auto-merge. Never apply to prod
  without the ledger check and MCP apply_migration. Add every new migration to the count-ratchet guards.
- Never ask the owner for ordinary engineering decisions. Stop only for the register's §3 gates: destructive
  production data ops, owner-approval migrations, external provider credentials/dashboards, legal/privacy
  semantic ambiguity, irreversible actions, unresolved P0/P1 security. When you stop, write the gate pack
  (exact impact, SQL/diff, rollback/recovery, what it unblocks) into the register and CONTINUE with every
  train that does not depend on it.
- P0/P1 security defect found → stop expansion in that train until contained.

2. MODEL ROUTING (task router — apply, do not debate)
- Fable 5.1: P0/P1, architecture, auth/security ambiguity, cross-system semantics, major migrations, final
  coherence audits, conflicting evidence, repeated failure.
- Opus 5: feature implementation, multi-file refactors, API/DB integration, E2E authoring, production
  verification, PR review, medium debugging.
- Fast/cheaper current model: searches, file inspection, mechanical edits, docs, repetitive guards, evidence
  gathering.
Priority: correctness → reliability → security → time to verified result → cost. Escalate on uncertainty.
Never downgrade an open P0/P1 chain to save tokens. Use Agent subagents for genuinely independent work only.

3. TRAINS — run in this dependency order; parallelize only what is marked independent.

TRAIN A — security / auth / new-user / Connected Apps  (start here; blocks C, D, K, M)
A1. Confirm-email UX (production now has mailer_autoconfirm=false — verified 2026-09-02):
    - make the confirmation link work when opened in ANOTHER browser/device: add a token_hash + verifyOtp
      path (Supabase email template {{ .TokenHash }} → /[locale]/auth/confirm) alongside the PKCE ?code= path;
      keep both; guard-test that neither is removed.
    - carry `next` (pending external authorization) through emailRedirectTo and the confirm route; when the
      authorization has expired (10 min), land on onboarding with explicit "return to your assistant and
      reconnect" copy in LT/EN/RU (no invented product terms).
    - login with an unconfirmed email → mapAuthError maps email_not_confirmed to a clear message + a
      "resend confirmation" action (supabase.auth.resend); rate-limit honesty copy.
    - the signup "check your email" state exists (signup-form.tsx status check_email) — keep it, make it the
      proven path; remove the stale "harmless when Confirm email is OFF" comments.
    - PROOF: Playwright against prod for handoff cases 5 (new person), 6 (interrupted), 7 (consent denied),
      8 (resume after signup), 11 (logout/reconnect), 12 (two-user isolation). Cases 1–4, 10 are already
      PRODUCTION_PROVEN — do not re-run. Email DELIVERY to a real inbox is gate G-1 (EXTERNAL): write the
      gate pack, then continue with everything else using the admin-free path the audit used (API signup
      is no longer autoconfirmed — use the confirmation token from auth.users via read-only SQL ONLY for
      bounded e2e-* identities, never for real people, and say so in the evidence).
A2. Connected Apps / Authorized Apps surface (native UI, chat-reachable, mobile-usable):
    - data: GoTrue GET /user/oauth/grants (auth-js listGrants) + revokeGrant; NO new table; show client
      name, scopes, authorized-at, last-used where available; explicit Disconnect with confirmation;
      revocation proof = refresh fails + still-valid access token refused at /api/mcp (already proven
      mechanics — reuse the audit's assertions).
    - route under the account/settings area that already exists; add a Product Constitution declaration for
      the new surface (5 answers) or CI is RED; i18n LT/EN/RU parity; a11y labels.
    - PROOF on prod: list shows the real ChatGPT grant; disconnect the temporary proof client
      lm-oauth-proof-temp-20260830 (that is the DCR cleanup debt, and it is user-visible now); reconnect works.
A3. Session/auth hygiene: password reset, forgot-password, logout scope=local, session listing decision
    (document only if not built), MFA/passkey evaluation memo (passkeys are OFF in settings — recommend,
    do not enable without the owner). Record in register §2.
A4. Exit: register §1 Train A = E2E_PROVEN except G-1 delivery. Update CAPABILITY_INVENTORY §5.3.

TRAIN B — DB lifecycle / capacity  (independent of A; no destructive op)
B1. Read-path semantics: reads must not serve ads past expires_at as live (filter is_active AND
    (expires_at is null OR expires_at > now())) in every public/worker read, sitemap, preview, count RPC;
    additive, reversible; prove on prod with counts before/after (no data change).
B2. Gate packs G-3/G-4/G-5/G-6 with exact SQL, dry-run counts, rollback (create index …, reimport recipe),
    ledger version plan; ship the migrations as DRAFT + needs-human-gate. Do NOT apply.
B3. Capacity thresholds doc (100 / 1k / 10k / 100k users; canonical vs market vs derived data; triggers for
    plan upgrade, archival, separation) using #1416 §J numbers. Add the DB-size + weekly-growth readout to
    Train L's health surface.
B4. Exit: register §1 Train B = PARTIAL with gates G-3…G-6 enumerated; B1 PRODUCTION_PROVEN.

TRAIN C — social auth  (after A1; blocked by G-2 for LinkedIn/Meta)
C1. Inventory is done: Google live, buttons settings-driven and fail-closed, manual linking OFF. Do not
    enable Supabase "third-party auth" (different architecture). Write the G-2 pack (exact console steps,
    redirect URIs, scopes, brand/domain requirements per docs/GOOGLE_OAUTH_BRANDING_RUNBOOK.md).
C2. Provider-agnostic proof matrix (signup, login, callback, existing-email collision, linking semantics
    with manual linking OFF, logout, re-login, provisioning, assistant continuation, mobile, cancel) — run it
    for Google NOW on prod where not already proven (collision + cancel + mobile), and prepare it as a
    parameterized Playwright suite so LinkedIn/Facebook run the day G-2 closes.
C3. Duplicate-identity prevention: prove that a Google sign-in on an email that already has a password
    account does not create a second professional identity (GoTrue linking rules + our profile trigger);
    if it does, fix at the canonical binding (profile_email_identity_binding_v1 exists — extend, do not
    fork).
C4. Exit: Google full matrix PRODUCTION_PROVEN; LI/FB = EXTERNAL_GATE with a ready suite.

TRAIN D — payments  (after A; RED by policy; blocked by G-7/G-8 for live)
D1. Inventory (exists — reuse): lib/billing/* test chain, config-core live-block, admin billing centre,
    entitlements v1, LMC ledger + compensation; canonical prices = closed #754 + docs/commercial catalogue
    (#894); #895–#897 are unmerged drafts. Write the G-7 pack: ONE price table, worker free-participation
    principle, employer free cap → paid tiers, LMC 1=€1 where canonical. Do not invent prices.
D2. Build everything provable in TEST mode now: renewal, upgrade, downgrade, cancel, failed payment, webhook
    idempotency, entitlement update, invoice/receipt, refund semantics, credits/top-up if canonical, VAT/tax
    behaviour, currency. Prove with Stripe test clocks. No card data touches LabourMarket.ai (Checkout only).
D3. The live enablement PR: remove the code live-block behind an explicit env + guard update, DRAFT +
    needs-human-gate (G-8). After approval and keys: live E2E with the smallest real charge + refund,
    recorded in the register.
D4. Exit: TEST chain E2E_PROVEN; live PRODUCTION_PROVEN or G-7/G-8 open.

TRAIN E — worker / Living CV / Journal / import  (independent; E3 needs an owner file)
E1. Credential validity model: issuer, issue date, expiry, verification source, last verified,
    ACTIVE/EXPIRED/REVOKED/UNKNOWN, provenance, visibility — additive on existing worker_documents /
    experience records; historical evidence is never overwritten by a validity change (append state,
    keep history). Guard-test the invariant.
E2. Journal input paths: native UI, chat, forms, files (PDF/DOCX proven), CSV/XLSX, API, external assistants —
    prove each path writes through the ONE canonical core (createJournalEntryCore) with DRAFT → REVIEW →
    CONFIRM → SAVE; voice stays gated by #740 (owner). Human work is not reframed as AI work.
E3. Historical import (lib/timesheet-import exists on main): complete upload → dry run → schema detection →
    mapping preview → validation → duplicate detection → idempotency → provenance + original preserved →
    row errors → confirmation → canonical Journal/timesheet mapping → rollback → receipt → export in the
    company's format. Prove on prod with an owner-supplied real file (bounded org). Never reinterpret
    historical records silently.
E4. Exit: E1/E2 E2E_PROVEN; E3 PRODUCTION_PROVEN or waiting on the file (OWNER input, not a gate on code).

TRAIN F — employer / company / project / timesheet  (independent of E; uses M3 allocations already applied)
F1. One real operational chain on prod: company → people → team → project → object → task/stage → calendar
    plan → assignment → actual work (journal) → hours/allocations → timesheet → manager review → approval →
    report/document. Calendar = PLAN, Journal = FACT — never collapse. Add the missing calendar write path
    (shift/plan primitive) additively; conflict handling; capacity respects approved absences (M13).
F2. Company Control must read as a living work environment: WHAT IS HAPPENING → NEEDS ACTION → PLANNED →
    ACTUALLY HAPPENED → NEEDS APPROVAL → VALUE CREATED. Reuse ResultShell / ContextPanel primitives; no
    legacy admin-panel tables as the primary view (coordinate with Train I's IA decision).
F3. Reports/export: worker, manager, company, project, object, timesheet — verify CSV/JSON exports and
    consent-bound sharing actually exist; fix, do not assume.
F4. Exit: PRODUCTION_PROVEN chain with screenshots + DB assertions in rolled-back transactions.

TRAIN G — education / student  (independent; browser accept needs G-11)
G1. Institution identity, admin, roster/invitations, learner claim (invitation → ACCEPT as student), learning
    evidence, courses/training (training_certification_v1 exists), practice/internship, transition to
    worker identity, Journal + Living CV continuity, employer demand signal, skills-gap feedback to education.
    The individual claims their identity; the institution never owns it.
G2. Home identity for institution and student (M10) — coordinate with Train I.
G3. Exit: prod browser chain with two bounded identities (G-11) = PRODUCTION_PROVEN.

TRAIN H — marketplace / matching / engagement  (independent)
H1. Reachability first (M7/M8): the loop works but is not in navigation; customer/buyer absent from
    onboarding. Fix through the canonical nav registry — no new surface without a Constitution declaration.
H2. Two-sided lifecycle on prod: demand → vacancy/request → discovery → matching → visibility/consent →
    contact → booking → accepted → engagement_contexts (G-01 decision) → project/work → evidence.
    Preserve auth boundaries (can_view_worker rules).
H3. Exit: PRODUCTION_PROVEN through native UI + chat.

TRAIN I — visual / UX / design-system consolidation  (after A2, F2, G2 land their surfaces; owner P-defect)
I1. Screenshot audit of PRODUCTION for every actor × major route at 390/768/1440: classify each route as
    canonical / legacy-pattern / duplicate / dead-end / admin-terminology / mobile-inconsistent. Real
    browser screenshots into docs/audits/evidence/final-ux/…, human-readable table in the register.
I2. Decide and record (docs/design): information architecture, navigation model, design system tokens
    (DESIGN_SOUL.md / DESIGN_TOKENS.md exist — extend), component hierarchy, role-specific workspaces,
    shared interaction patterns. Do NOT reskin; consolidate implementations onto the canonical ones.
I3. Execute in bounded PRs per surface family (worker home, company control, education, marketplace,
    account/connected apps, public). CHAT-FIRST ≠ CHAT-ONLY: every capability stays reachable natively.
    Reusable design intelligence / capability candidates come from Agentai OS, not a new catalogue here.
I4. Exit: before/after packs; zero routes left in "legacy-pattern"; mobile parity per route.

TRAIN J — languages / mobile / accessibility  (after I for UI parts)
J1. Locale completeness model in LANGUAGE_MATRIX.md: what FULL means per surface; ship only locales that
    meet it for auth/onboarding/payment/legal; language switch always available; preference persists
    (cookie + profiles.locale — exists, prove). No blind 24-locale machine expansion.
J2. Mobile browser walks of the major workflows at phone widths; fix measured defects one per PR.
    Native apps: prove the worker journey on Android + iOS against prod (builds + runtime already proven).
J3. Accessibility pass (keyboard, focus, labels, contrast, semantics, screen-reader basics, error states)
    with the a11y-audit skill; fix P0/P1 only, record the rest.
J4. Exit: matrix updated; walks recorded; a11y ≤ P2 open.

TRAIN K — privacy / security / SEO / AEO  (after A)
K1. Public-jobs leak matrix: position/salary public; company/employer/location/contact/details protected
    until registration/consent — check HTML, JSON, schema.org, API, metadata, OG, cache, sitemap, search
    indexing. Zero protected fields exposed anonymously (public_vacancy_anon_boundary_v2 exists — prove it).
K2. RLS/tenant isolation regression suite on prod (rolled-back), consent + data minimization, export
    (Journal CSV, user JSON), deletion/retention semantics, connected-app permissions, social-login threat
    model, payment security, secret scanning in CI, rate limiting, abuse protection, auth recovery, session
    management, backup/recovery expectations. Advisor triage: the SECURITY DEFINER view finding is
    intentional (recorded 2026-09-01) — do not "fix"; 2 mutable search_path functions → pin.
K3. SEO/AEO completion without privacy violation (fixing-metadata skill; schema-markup only for public
    fields).
K4. Exit: leak matrix zero; findings ≤ P2; register §2 security = PASS.

TRAIN L — observability / backup / scaling  (before M)
L1. Error monitoring (no Sentry today): choose one provider via env, structured PII-free logs, /api/health
    (DB, auth, storage, scheduler), critical-flow metrics (auth failures, payment failures, import failures,
    ingestion, matching, Journal write errors, latency p50/p95 from Server-Timing, DB size + growth, storage,
    egress, queue/scheduler health).
L2. Alerts that map to user/business impact; prove each fires on a synthetic failure.
L3. Backup/recovery + deployment rollback drill (Vercel promote previous + DB PITR expectations on the
    current plan) — record the drill, do not just describe it. Capacity thresholds from Train B wired to
    alerts.
L4. Exit: register §2 observability / backup / rollback = PROVEN.

TRAIN M — full cross-actor production E2E  (last; after A–L)
M1. Run the §33 LAUNCH_READY definition as one chain with bounded identities on prod: unfamiliar user
    (discover → register → confirm → onboarding → profile → worker/student/employer workflow → Journal →
    marketplace → company/project workflow → pay if paid → manage connected apps → export/control data)
    and a real company (register → claim org → invite → teams/projects/objects → demand → match/contact/
    engage → plan → record → approve → reports → billing) and an education institution lifecycle — all
    without developer assistance. Use the "unfamiliar-user protocol": no internal knowledge allowed to
    complete a step; every step where internal knowledge was needed is a defect for Train I/J.
M2. Exit: register §2 all rows PROVEN or the residual rows are ONLY OWNER_GATE / EXTERNAL_GATE items.
    Then declare LAUNCH_READY in the register and switch to POST-LAUNCH MODE: REAL USERS → OBSERVE →
    MEASURE → FIX DEFECTS → IMPROVE CONVERSION/UX → SCALE WHEN THRESHOLDS REQUIRE. New features after
    launch need demonstrated user/business value.

4. EVIDENCE RULES
- Every train ends with: PR numbers + merge SHAs, prod deploy SHA, the exact proof commands/specs, DB
  assertions (rolled back), screenshots where user-facing, residue list, register + inventory updated.
- Bounded identities only; never a real person's data; never print tokens/codes/cookies; never put personal
  data in URLs. Negative controls for every positive assertion (a selector that cannot fail is a defect).
- Do not weaken live getUser verification to cache auth. Keep the measured warm baseline
  (profile_get p50 ≤ 400 ms, p95 ≤ 800 ms; cold ≤ 1.5 s); measure, do not guess, for any new route.

5. STOP CONDITION
Keep executing until the register's §2 board shows only PROVEN rows plus explicitly enumerated
OWNER_GATE / EXTERNAL_GATE items. Then write the handoff and stop.

OWNER'S CONTROLLING INTENT (verbatim):
"Po šio sutvarkymo noriu pilnai veikiančio projekto taip, kaip numatyta, kad liktų tik pradėti leisti
žmones, stebėti architektūros pajėgumus ir, jei atsiras, taisyti trūkumus."
```
