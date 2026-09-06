# SAFE_CHECKPOINT — 2026-09-06 window 6 (REAL LAUNCH EXECUTION DAY)

> Durable hand-off for the NEXT MASTER. Recover from this file +
> `SAFE_CHECKPOINT_2026-09-06_window5.md` + `MASTER_COMPLETION_MAP_2026-09-05.md`
> + git / PR / CI / production. Do NOT restart architecture, design, billing,
> Stripe or repository audits. Do NOT redo PROD_PROVEN work. No secrets here.
>
> Window 6 was an EXECUTION window: eight parallel lanes in reused worktrees,
> every lane measured production as a real person / company / college first,
> fixed at the canonical layer, and left a post-merge walk script. The owner
> intends NEXT WEEK to let real people join, invite real companies, and meet a
> real college. NO demo mode, demo data, fake learners or owner-only shortcuts
> were built — the college meeting is a deadline, not a demo.

## 0. Coordinates (verified at write time)

| Item | Value |
|---|---|
| `main` at start | `ca96605b` (window 5 close); production served `ca96605b` at 06:31 UTC |
| Merged this window | #1568 docs · #1569 services · #1570 landing · #1571 hygiene · #1574 education · #1575 journal/evidence · #1576 join · #1578 D5 proof · #1579 language (see §2 for served state) |
| Owner-gated drafts opened / refreshed | #1572 jobs count function v2 (RED) · #1573 jobs honest degrade (owner WAIVER) · #1577 professions catalogue seed (RED data) · #1566 notification_events GRANT (CI fixed twice, ratchet 267) |
| Applied to production (GREEN, autonomous, reversible) | `public_vacancies_active_last_seen_idx` — ledger `20260906072604`; freshness read 272 ms mean → **0.46 ms mean** (106 calls) |
| Counts | PROD_PROVEN as inherited **61 / 75** — unchanged by design (§8). SAFE PILOT 33 / 33. |
| Real users | REAL_RECRUITER_USED_PRODUCT = FALSE (unchanged). REAL_LEARNER_COHORT = 0. |
| Canonical direction recorded | `docs/ARCHITECTURE.md` §5.6 + `docs/product/OWNER_MASTER_EXECUTION_CONTRACT_2026-09-04.md` §1c (verbatim owner lines) + `docs/product/delegated-authority-and-evidence-graph-contract-v1.md` |

## 1. Lanes → PRs → production proof

| Lane | PR | Served | Post-merge walk | Result |
|---|---|---|---|---|
| I+J+K inventory (delegated AI / import / evidence graph / agent CV) | #1568 | docs | — | canonical direction + scope matrix recorded |
| G multi-context + services | #1569 | `606234cf` → re-walked on `93b8069e` | `walk-multi-context-services-prod.cjs` | **36/36 PASS**, residue 0 (two "seen" rows swept) |
| F landing / public doors | #1570 | `dd5d92c3` | `walk-public-doors-prod.cjs` (anonymous) | **66/66 PASS**: canonical hero, 5 doors incl. college, 6 examples routing, sentence carried, 0 px overflow 390/320 |
| H performance / hygiene | #1571 | `93b8069e` | `pg_stat_statements` + runtime logs | index applied; notification write-block live; agencies embed gone; no new error classes |
| C real college | #1574 | `ad319044` | `walk-education-real-use-prod.cjs` | **22/22 PASS**: institution answers as institution; student internship question ends in next steps |
| D living evidence loop | #1575 | `5ba753a7` | proof taken BEFORE merge with rollback (§4) | loop PROVEN; quick-confirm scoped; receipt served (UI not re-walked) |
| A real person join | #1576 | `ab16654f` | `walk-real-person-join-prod.cjs` | **14/14 PASS**; one standing E2E identity per run (user delete blocked by `pilot_events`) |
| D5 agency-origin chain | #1578 (docs) | proof on `93b8069e`/`5ba753a7` | `walk-d5-agency-chain/` | **11/11 PASS**, 15 rows rolled back, zero residue |
| E+B professional language | #1579 | pending at write time | `walk-professional-language-prod.cjs` (+ `LEGS=followup`) | see §2 |

## 2. Language lane — served state and walk

**#1579 merged → `main` `6f6820ad`, served by production at 09:1x UTC.** Logs: `walk-professional-language-followup-6f6820ad.log`, `walk-professional-language-6f6820ad.log` (run 1), `…-run2.log`.

| Legs | Result | Notes |
|---|---|---|
| Follow-up A1–A4 / G1–G3 (WORKER, PERSON, COMPANY) | **39 / 39 PASS** | "ieškau darbo Norvegijoje" → "…nieko nematoma. Matoma: NL." + chips **Pridėti šalį prie savo pageidavimų · Kokių dokumentų man trūksta?**; "ieškau darbo Švedijoje" → the honest supply line; "esu suvirintojas, ieškau darbo Norvegijoje" → "Supratau: Suvirintojas…" + the same doors; COMPANY "ieškau darbo" → "Darbo paieška yra tavo asmeninis veiksmas — įmonės erdvėje jo…" + switch chip; "remontuoju automobilius" → offered service; "reikia buhalterio paslaugų" → service door; the request sentence is never saved (preview only, journal count unchanged) |
| Default E1–E11 / P1–P10 | run 1 **91 / 97**, run 2 **93 / 97**; every EMPLOYER leg passed in at least one run | E1 ("Reikia 2 automechanikų.") and G1 failed ONCE each because the opening brief landed inside the capture window of the session's FIRST sentence (walk race, not product: the same sentence passed in the other run). Two expectation issues stay recorded: P4 expects a profession chip first but the country branch now answers by design (chips = add-country + documents gap); P1's chip row read empty on run 2 — the answer text "Supratau: Buhalteris…" passed; the chip renders outside the thread node the walk reads. |

Verdict: **PROD_PROVEN** for the employer role/headcount/date legs, the person profession statements, the country dead end, the journal-request refusal, the availability intent and the company-context leaks; the two P-leg chip expectations are walk debt, listed in §6.

## 3. End-of-window answers (production evidence)

1. **Can a new real person join next week without owner instruction?** YES. Landing sentence → signup (plain e-mail, one legal notice, honest "check your e-mail" with spam line + resend) → confirm → login keeps `?next=…say=` → 2-step onboarding pre-ticked from the sentence → first screen = the conversation with the sentence as the first turn. 9 taps, 0 failed requests, 0 overflow at 390. E-mail DELIVERY to a real inbox is still unproven (G-1, owner).
2. **Meaningful first value?** After #1579: a profession sentence is read ("Supratau: Buhalteris"), a country the person cannot see gets an honest supply line + the add-country and documents-gap doors, availability is read into the work card, and the journal refuses to save a request sentence as evidence. Before #1579 the landing's own example dead-ended.
3. **Can real evidence change the Living Profile?** YES, PROD_PROVEN (§4): journal entry → recognised skills → manager confirmation → worker card shows "Patvirtino E2E Walker UAB".
4. **Can the Living Profile influence opportunity discovery?** YES: the company's own-need candidate match moved from "PER MAŽAI DUOMENŲ · 0 %" to "STIPRUS ATITIKIMAS · 100 % · vadovo patvirtinti 1" after the entry + confirmation. The worker board cannot show that need (unverified company, G-14).
5. **Can a real company join and state a need naturally?** YES for any profession after #1579: "Reikia buhalterio." → role + headcount 1; "reikia suvirintojo nuo spalio" → start 2026-10-01; professional roles carried as honest free text until #1577 seeds the catalogue.
6. **Reach candidates or a useful next action?** YES: C3–C14 PROD_PROVEN earlier; own-demand candidates from the drilldown (#1562); D5 proves the agency origin through assignment and journal.
7. **Can a real college independently begin?** CONDITIONAL GO: the landing has the door ("Atstovauju mokyklai, kolegijai ar universitetui" → org setup with `training_provider`); programmes, groups, invitations, outcomes and the four staff questions work by sentence (22/22). Conditions: the invitation e-mail is not sent (`INVITE_EMAIL_*`, owner); the onboarding wizard still needs one tap on the education card after the door (F8); `education_cohort_members` = 0 — no real cohort yet.
8. **Which education workflows work end-to-end?** org setup → programme → group → learner invitation (link) → student engagement → student compass / journal / EU CV → institution outcomes (k-anonymous ≥ 5) → privacy boundary (institution sees participation and counts only; no policy scoped by student anywhere).
9. **What prevents the remaining workflow?** Internship → student: 0 of 20 needs carry `opportunity_type`; the worker feed requires a VERIFIED company (G-14 owner click); a partner employer must post a need of type "praktika". Cohort membership needs real learners.
10. **Professional language sufficient for launch?** Trades and professionals (accountant, lawyer, engineer, developer, project manager, sales, teacher, designer, consultant, finance) reach the right doors in LT (+ EN/RU/DE/NL for employer demand). Catalogue rows for the professional set wait on #1577 (owner apply).
11. **One human, several contexts?** YES (36/36): person + company owner + provider + requester on one identity; chip switch; no second account; company-context leaks fixed (#1569, #1579).
12. **What can an authorized AI assistant write today?** MCP: journal draft/confirm, work card, demand create, context switch (draft→confirm token, RLS as caller). Server-action only: full profile, documents/evidence, confirmations, projects, assignments, timesheets. Consent scopes are identity-only (all-or-nothing); the OAuth client id is never read → actor ≠ recorder is NOT representable for delegated writes.
13. **Missing before ChatGPT/Claude/Agentai can maintain history under delegation?** Stage 0 `recorded_via` metric on delegated journal writes (GREEN, held until after launch week); Stage 1 recorder everywhere; Stage 2 capability scopes on OAuth consent (RED auth-core). Contract §A–§E.
14. **Can a company record worker activity without false authorship?** Partly: a company cannot write a worker's journal (RLS `owns_worker`); it confirms, records hours (`entered_by` ≠ `worker_id`), imports timesheets, links task evidence. ONE surface shows the worker as author of company-recorded work: timesheet lines (`timesheet_compute_allocations_v1` omits `entered_by`) — v2 SQL + rollback recorded in `walk-living-evidence-loop/` (RED, owner).
15. **Import/timesheet capability today?** XLSX only (read → grid parse → resolve entities → preview → one atomic commit). CV PDF/DOCX → suggestions. No CSV/HR/ERP/e-mail sources.
16. **Provenance + no side effects?** Provenance partial (`entered_by`, `source='import'`; no batch id, no file hash, no rollback). **No-side-effect PASS** with evidence: the confirm action imports no notification/invitation/e-mail/workflow module.
17. **Contribution/Evidence-graph pieces that exist?** journal entries + metrics, task evidence links, confirmations, evidence tiers (self_declared < work_journal < manager_confirmed; SELF_DECLARED / EVIDENCE_SUPPORTED / EMPLOYER_CONFIRMED / SYSTEM_DERIVED), `correction_of/superseded_by`, `visibility_scope`, work_tasks / work_items / project_clients. Missing: COMPANY_RECORDED as a named tier, deliverable/outcome/significance columns, multi-contributor table (Stage 3/4, RED).
18. **AI/Agent Living CV pieces?** `ai_agent` entity type, `ai_runs` (model/provider/version per run), `usage_cost_events`; `profiles.actor_type` absent in prod. Contract: agent = profiles row + owner org; competence only from reviewed tasks (Stage 5, RED).
19. **Launch-critical defects fixed today** — §5.
20. **Autonomous work remaining** — §6.
21. **Owner action** — §7.
22. **Real external users needed** — §9.

## 4. Living-evidence loop — BEFORE / AFTER (production, rolled back)

| Edge | BEFORE | AFTER entry | AFTER manager confirm |
|---|---|---|---|
| `worker_skills` (worker2) | 0 rows | `welding-blueprint`, `structural-steel` `source=work_journal verified=false` | `verified=true source=manager_confirmed verified_by=<owner>` |
| worker card | — | 2 skills, "Dar neperžiūrėta" (fixed → confirmed helper) | "Patvirtino E2E Walker UAB, 2026-09-06 · VADOVO PATVIRTINTI ĮGŪDŽIAI ×2" |
| company own-need candidates ("Suvirintojas") | "PER MAŽAI DUOMENŲ · 0 % · vadovo patvirtinti 0" | "STIPRUS ATITIKIMAS · 100 % · vadovo patvirtinti 0" | "STIPRUS ATITIKIMAS · 100 % · vadovo patvirtinti 1" |
| rollback | entries 40, metrics 129, links 48, confirmations 13, skills 50, audit 64 | — | back to BEFORE on every table |

Actor/recorder: the journal has no recorder column — RLS `owns_worker` + RPC as the worker make recorder ≡ worker by construction. Quick-confirm previously verified EVERY declared-unverified skill of the worker; now only the entry's linked skills (#1575).

## 5. Launch-critical defects fixed today (all measured on production first)

- Landing: no institution door; manual-labour-only examples; hero with internal vocabulary; FAQ payment copy contradicting `/pricing` (#1570).
- Join: login dropped `?next=…say=`; onboarding asked again what the sentence said; first screen was a 4,613 px profile wall; "Darbo el. paštas" for a job-seeker; legal notice twice; "Šalis" ambiguous (#1576).
- Conversation: role empty for every non-manual profession; "Reikia projektų vadovo" → projects list; person profession statements unanswered; "ieškau darbo Norvegijoje" dead end; **request sentence persisted as a journal entry**; availability not read; company-context leaks; EN/RU/DE professional demand; `paslaugų`/`elektrod` false stems (#1579).
- Education: four staff questions answered as the wrong actor; student internship dead end (#1574).
- Journal: quick-confirm over-verified unrelated skills; no manager receipt; stale "not reviewed" helper (#1575).
- Services: raw invitee e-mail as a deadline label; unbounded discovery read; three empty states with no next action; provider could not write the note the requester side rendered; 390 px row clipping (#1569).
- Production hygiene: anonymous `/jobs` 500s named honestly (#1573 pending waiver); freshness read 272 → 0.46 ms (index applied); notification 42501 storm bounded; `agencies` embed denial gone (#1571).

## 5b. Second wave (after the eight lanes) — small connect fixes, each from a lane's measurement

| PR | What | Proof |
|---|---|---|
| #1580 | chat assign picker offers accepted-booking candidates like the page (D5 edge; pure `composeAssignableWorkers`) | merged, served `556ec32d`; chat re-walk needs the rolled-back engagement re-created (not done) |
| #1581 | a FAILED profile read never lands a company in the person space (named `dashboard-profile-read-failed` + WorkspaceChip chooser); compass names the institution from the student link; learner line once | CI |
| #1582 | 40 px tap floor for shell controls on phones (ONE mobile-only CSS rule on `[data-chrome]`/`[data-mobile-sheet]` + shared Button `sm`); 86 controls < 40 px measured before | **served `f6d0ce9c`; re-measured: 86 → 8**, of which 7 are the inline "Sukurta Rexora" footer credit (15 px, not a launch control) and 1 the company-name heading link (22 px). Every walked primary control ≥ 40 px. `walk-tap-targets-f6d0ce9c.md` |
| #1583 | work-card form opens prefilled; `preferred_countries` partial list no longer replaces the whole; explicit `[]` can clear (was impossible on every path) | CI |
| #1584 | institution door pre-ticks the education card; a corrected choice is no longer dragged back to the door's path (`returnTo` always won) | CI |

## 6. Autonomous work remaining (safe, not started)

- Re-walk the CHAT assign picker on production (needs a controlled booking engagement re-created, then rolled back — the D5 script is resumable with `START=S4`).
- Work-history form has no country field ("dirbau … Norvegijoje" loses NO) — schema `workerAddWorkHistorySchema` change.
- `lib/capabilities/registry.ts` `work_card.save_draft` says "a field sent as null clears it" — false under the RPC's coalesce; scalars cannot be cleared by any path (copy + decision).
- `worker.save-preferences` sends `not_stated` for untouched tristates — verify `save_worker_availability_prefs_v2` coalesces (same replace hazard class).
- Dead `learnerContextLine` prop left in `conversation-chat.tsx` (#1581 note).
- Chat assign chip row shows the first 4 only (pre-existing cap).
- Walk debt: `walk-professional-language-prod.cjs` P4 expectation (country branch by design) and P1 chip capture (result panel outside the thread node); the language walk's FIRST sentence per session races the opening brief — count from the second sentence or wait for the brief before typing.
- Stage 0 `recorded_via` on delegated journal writes (held until after launch week by decision).
- `/[locale]/jobs` unfiltered page 1 could be ISR like the landing (after #1572 applies).

## 7. Owner batch — ONE list (each already attempted or proven agent-impossible)

0. **Apply #1572 (RED, SECURITY DEFINER body replace)** — anonymous `/jobs` 500s, 1,571 timeouts/day. Same signature/grants; rollback = previous body. Sentence: "Apply jobs count v2 2026-09-06". Agent then re-probes `/lt/jobs` ×6 and reads `pg_stat_statements`.
1. **Extend the `/jobs` waiver with #1573** (`public-acquisition-route-jobs` is PR-scoped by design) — the honest "did not answer in time" state instead of a 500; agent re-arms auto-merge.
2. **Apply #1566 (RED GRANT)** — `grant select, insert, update on public.notification_events to service_role` — the bell/preferences channel has emitted nothing since 2026-07-05; CI is green now; rollback = revoke.
3. **Apply #1577 (RED data seed) BEFORE merging it** — 9 professional professions + 15 skills + 50 links; readback 58/176/282; sentence "Apply professions catalogue office v1 2026-09-06". Unlocks: profile can SET accountant/lawyer/engineer/…; matching by profession sees them.
4. **Stripe, 1 minute** — add `checkout.session.expired` to endpoint `we_1UCKs6…`; delete stale `we_1U0mr9…` and rotate its bypass token (K4 zero-money LIVE proof; the agent's restricted key is blocked by the harness — verified again this window as unavailable to retry).
5. **G-14** verify `E2E Walker UAB` (unlocks E4 internship walk).
6. **`INVITE_EMAIL_*`** via the clipboard intake (I5) — college invitations currently say honestly "no e-mail sent".
7. `GET /api/billing/reconcile` as superadmin once; correct the one `billing_customers.test_mode=true` row (2026-09-05 17:06).
8. Decisions: inner-page navigation A/B; booking-only placements get an employer `engagement_contexts` row (gate relaxation, RED) so the client can review a placed person's journal; sent invitations following the person into the personal space; RU "Ищу сантехника" → need-service outright; taxonomy slug for foundation laying ("Klojau pamatus").
9. Unchanged: G-12 #1430 · G-1 real-inbox signup · G-15 #1436 · Vercel plan (M1) · 8 placeholder `customer_requests` rows · cron secret for `/api/cron/weekly-digest` (`not_configured`).

## 8. Counts — stated without manipulation

PROD_PROVEN stays **61 / 75**: every fix today lives inside already-counted stages (A4/B6/C2/E-series/G3/L1) or is a proof of composition (D5 → the window-5 §1 row D5 moves from `IMPLEMENTED_PENDING_PROD_PROOF` to PROD_PROVEN if the owner accepts the walk as the missing evidence: **62 / 75**, recorded, not applied). Implementation completeness 75 / 75. The definition corrections of window 5 §1 (L4, H2, M5) remain the owner's yes/no.

## 9. External real-world proof pending

First real person (e-mail delivery + one persisted action) · first real company need with a real candidate · first real college cohort (E5 needs ≥ 5 learners) · first real internship posting by a partner employer (E4) · first paying organisation (J2–J5) · first real agency placement.

## 10. Traps learned this window (also in memory `window6-launch-execution-2026-09-06`)

- `app/[locale]/(marketing)/jobs/**` is under a PR-scoped owner waiver — any PR touching it fails the product gate; split such edits out.
- Two RED drafts bumping the migration ratchets from the same base collide; a FOURTH guard (`booking-engagement-end-v1` marked list) had been missed by #1566.
- A copy edit inside a frozen landing namespace needs the baseline regenerated in the same commit.
- Running the product gate locally modifies the tracked `PRODUCT_ARCHITECTURE_DIFF.md`; restore before rebasing.
- A Playwright click that lands before hydration is a silent no-op (services add button) — click until the form is attached.
- Shared E2E identities are switched by concurrent lanes (`profiles.active_role`) — a walk must enter its context via the product's own chip, and readback must be `execute_sql` (service_role has no table grants in production).
- Each join walk creates a standing E2E identity (user delete blocked by `pilot_events`) — run it sparingly.
