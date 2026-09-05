# MASTER COMPLETION MAP — 2026-09-05 (finite stages · three finish lines · lanes)

> State table, not an essay (owner contract §35). Authority: `docs/ARCHITECTURE.md` §5.5 →
> `docs/product/OWNER_MASTER_EXECUTION_CONTRACT_2026-09-04.md` (§1, §1a, §1b) →
> `WORLD_STATE_UX_ARCHITECTURE_V1` → `PLATFORM_DOCTRINE` → the FROZEN design contract
> [`docs/design/final/00-FROZEN-DESIGN-CONTRACT.md`](../design/final/00-FROZEN-DESIGN-CONTRACT.md).
> Rewritten in place after every production walk. Train-level ledger stays
> [`FINAL_COMPLETION_REGISTER.md`](FINAL_COMPLETION_REGISTER.md); the resumable state table stays
> [`RESUME_CHECKPOINT_2026-09-04.md`](RESUME_CHECKPOINT_2026-09-04.md). This file is the ONE
> finite completion map; it supersedes the draft of the same name that was opened on the #1441
> branch (its factual content is absorbed below; the #1441 copy is to be dropped on rebase).
>
> **FINAL_DESIGN_STATUS = READY_FOR_IMPLEMENTATION** (owner handoff 2026-09-05, frozen; Draft 3 does
> not exist). VISUAL_ARTIFACT_ACCESS = VERIFIED: `master design.zip` (3 files: the two contracts + `27-architecture.png`)
> and `des.zip` (the Draft-1 plan `00-DIZAINO-PLANAS.md` + six screens `01-workspace-employer-desktop`,
> `02-workspace-worker-mobile`, `03-living-identity-card`, `04-attention-gap-help`, `05-public-entry-hero`,
> `06-four-layers-one-state`). The frozen set `01–27 + A1–A4` named by the contract is in neither archive nor
> anywhere on this machine. Package mapping of what exists: `05` → P1 (direction confirmed by §2.8/§5 P1);
> `04` → P3 (gap → who can help → action); `03` → P2/P6 (K1 direction, but the frozen contract replaced fixed
> bars with the provenance EDGE + contextual strip); `01`/`02` → P5/P7 composition ONLY (their permanent
> conversation column was rejected: conversation is on-demand); `06` → superseded by `27` (eight lenses).
> Implementation follows the text; tokens only from `apps/web/tokens/*` and `globals.css`.

## 0. Mutable facts (verified 2026-09-05 ~09:00 UTC)

| Fact | Value |
|---|---|
| `main` | `169df06f` (#1518 GAP RESOLUTION, merged 08:39 UTC) |
| Production | **`169df06f`** — Vercel deployed 08:43 UTC; the Hobby freeze that held `fc579348` since 05:37 UTC lifted on the #1518 push (limit recurs under bursts — no probing pushes) |
| #1441 Stripe (RED, `needs-human-gate`, draft) | head `1a24cb1a` rebased after #1518; MERGEABLE; CI at head: CodeQL / migration-safety / mobile green, `quality` + `e2e-smoke` still running at 08:55 UTC; **write-owner handed off** — billing is now INTEGRATION / OWNER GATE / PROD ACCEPTANCE, no second writer |
| Invitation WIP | `8dbe1438` preserved → rebased onto main as `72e3602b` on `feat/cc/invitation-attention-journey` → lane J (one writer) |
| Real users | REAL_RECRUITER_USED_PRODUCT = FALSE (last event `dashboard_viewed` 06:15 UTC 2026-09-04); REAL_EDUCATION_INSTITUTION_USED_PRODUCT = FALSE |
| Local stack | Docker unavailable (LOCAL_DOCKER_UNAVAILABLE); verification = unit/guards/typecheck/lint/build + CI + production walks with `e2e-*` identities |

### Production walks run on `169df06f` (08:44–08:52 UTC, E2E Walker UAB ↔ E2E Worker Two)

| Walk | Result | Evidence |
|---|---|---|
| `walk-gemini-proposer-prod.cjs` | **PARTIAL** — the proposer IS reached in production (two paid `ai_runs` rows `propose_conversation_intent`, `gemini-3.5-flash-lite`, schema passed, ≈$0.001 each; "Pastolių montavimą užbaigėme" → `task-status` → the chat asked "Kuris projektas?" from real rows; "Ką dar turiu susitvarkyti… Vokietiją?" → `documents` → the document gap answer); **defect D1** (PRODUCT DEFECT, router precision, GREEN): "kuriems mano objektams gresia problemos" scored 1 on the bare `objekt` stem of `log-work`; "kurie darbuotojai nebus užimti" scored 4 on the bare `darbuotoj` stem of `need-workers`; the chat gate is score-blind (`intent !== "unknown"` → dispatch). Fix verified in a scratch copy (all 440 router tests pass): `project-risk` subject adds `objekt|объект` + risk stems `gresia|grėsm`; `who-available` adds a "which/who … people … free/not busy" pattern (weight 9); both sentences pinned in ROUTE_EXAMPLES; no score floor at the gate (pinned by `llm-proposal.test.ts`). The worker's unauthorized equivalent was refused honestly (fallback text) — acceptance 5 held | `ai_runs`, `pilot_events chat_intent_recognized` 08:45–08:48 UTC |
| `walk-confirm-work-prod.cjs` (§14) | **PROD_PROVEN 09:10–09:12 UTC (corrected walk) with ONE defect D2**: the chain runs end to end — "ką reikia patvirtinti?" → chip "Įjungti peržiūrą: …" → `set_engagement_journal_review` → "Laukia patvirtinimo: 1 įraš. • E2E Worker Two · 2026-09-04 — Klojau pamatus…" → "Patvirtinti: E2E Worker Two · 2026-09-04" → `confirm_entry_and_verify_skills` → "Patvirtinta: E2E Worker Two — įgūdžių patvirtinta: 0" → the person's brief "Darbdavys patvirtino 1 jūsų darbo įrašą per 7 d." → "Mano kortelė". **D2** (PRODUCT DEFECT, GREEN fix `fix/cc/confirm-work-person-name`): the enable-review line names the person by a profile-id fragment `#8cda64` because `engagement_contexts … profiles(full_name,email)` is null under `profiles` RLS; the fix reads the name through `workers` + `resolveWorkerName` (the journal surfaces' resolver). Readback: `90da8c16.journal_review_enabled=true`, 1 confirmation on `01d4a36d` (kept as evidence) | corrected walk log + MCP |
| `walk-gap-resolution-prod.cjs` (§11/§12/§16) | **PROD_PROVEN for links 1–4 and 7–9; link 5–6 (the person's reply visible on the manager's line) still PENDING one targeted walk.** Root cause (read-only pass): the first walk's "silent chat side" was a WALK ARTEFACT (cold-open empty state shrinks the body → empty slices; the recorded label is "Dokumentas užrašytas…"; the reply is offered after the file decision "Vėliau"); the screenshots show the chat rendered "Laukia nurodymų: 1." and "Vadovas laukia: …" and the ratio moved to **1/7** after Patikrinta. Corrected re-walk 09:13 UTC: chat asks line with own state "A1 (turite)" = the page's rows (parity holds); no record chip because none of the 4 asked rows maps to a missing document type (truth table, not a defect). Residue cleaned via MCP after both runs (rows → `needed`, document + instruction messages deleted) | walk logs + screenshots + MCP |

## 1. Finite stage table (real end-to-end capabilities; PRs/tests/docs are not stages)

States: `PROD_PROVEN` · `IMPL_PENDING_PROOF` · `PARTIAL` · `NOT_IMPLEMENTED` · `OWNER_BLOCKED` · `EXTERNAL_BLOCKED`. "Design" = frozen package that touches the stage (F = functional only).

| # | Stage | Actor | Required outcome | Status | Prod proof | Blocker / remaining | Design | Write domain | Parallel-safe |
|---|---|---|---|---|---|---|---|---|---|
| A1 | Public entry with a real sentence | anon | sentence → understood → auth → first conversation starts with it | PARTIAL | hero honest (#1511) but staged scenario; router exists | replace the staged hero with the deterministic router + carry-through + `landing_intent` event | P1 | PUBLIC | yes (lane P1 running) |
| A2 | Auth continuation (e-mail confirm, cross-device) | anon | confirmed session + `next` preserved | PROD_PROVEN | A1 evidence 2026-09-02 | real-inbox test = G-1 | F | — | — |
| A3 | Public opportunity discovery / SEO | anon | `/jobs`, sitemap, zero protected fields | PROD_PROVEN | K1, P0-1 fixed | JSON-LD = G-16 (#1433) | F | — | — |
| A4 | Ordinary-human first value after signup | new user | intent → identity → first useful answer | PARTIAL | first-run router #1447 by code walk; `/dashboard/start/*` lt/en only | prod walk of the five intents; ru/nl/de start copy | P1/P2 | CONV | after J |
| B1 | Register / login | worker | account + session | PROD_PROVEN | A1 + Google | — | F | — | — |
| B2 | Understands next action | worker | opening brief names the next step | PROD_PROVEN | daily walks | vocabulary polish (P2) | P2 | CONV | after J |
| B3 | Living Professional Identity / CV import | worker | card + skills from CV/journal | PROD_PROVEN | E1/E2 2026-09-02 | provenance classes (P6) | P2/P6 | READINESS/IDENTITY | yes |
| B4 | Find a real opportunity | worker | 3-best board with why | PROD_PROVEN | Gemini/3-best proof; #1459 type chip | — | P2 | — | — |
| B5 | Act on it (interest / contact) | worker | persisted interest → company sees it | PROD_PROVEN | #596/#597, MCP | — | F | — | — |
| B6 | Understand readiness gap | worker | documents/skills gap with who issues it | PROD_PROVEN | 2026-09-04 walks | contextual ledger (P3) | P3 | READINESS | yes after RequirementLedger type |
| B7 | Progress / resolve the gap | worker | record the asked document → readiness recalculates | **PARTIAL (D3)** | today: page yes, chat silent | fix the chat-side reads (brief line, asks, recorded, reply) | P3 | CONV | after J |
| B8 | Receive / respond to employer action | worker | booking answer · invitation accept in-app | PARTIAL | booking answer PROD_PROVEN (#1505); invitation only via `/invite/[token]` (no e-mail) | lane J: invitation → Attention → accept/decline over the dispatcher | Attention | CONV | lane J running |
| B9 | Assigned to real project | worker | assignment row, "mano projektai" | PROD_PROVEN | #1503–#1506 | org binding on accept = G-15 (#1436) | F | — | — |
| B10 | Receive instruction / task | worker | instruction in brief + thread | PROD_PROVEN | #1510 walk 04:49 UTC | — | F | — | — |
| B11 | Record work / evidence (file) | worker | journal entry with project + file | PROD_PROVEN | E2, #1502 | — | P7 later | — | — |
| B12 | Authorized confirmation changes state | employer→worker | confirm entry → skills verified | **FAILED today (D2)** | 0 confirmations | enable-review chip + name resolution in the confirm-work handler | P6-subset | CONV | after J |
| B13 | Identity reflects confirmed result | worker | "Darbdavys patvirtino…" on the brief + gold edge on the card | IMPL_PENDING_PROOF | #1515 code; blocked by B12 | prove after D2 | P6-subset | IDENTITY | yes |
| C1 | Register / set up organisation | org | org + capabilities declared | PROD_PROVEN | F4, #1460 | — | F | — | — |
| C2 | Express a real workforce need | org | sentence → prefilled form → `customer_requests` | PROD_PROVEN | 2026-09-04 | site as project object (later) | P2 | — | — |
| C3 | Receive useful matching | org | candidates with why | PROD_PROVEN | candidates walk | — | P2 | — | — |
| C4 | Contact / book / engage | org | booking → answer in chat → engagement | PROD_PROVEN | #1505 | admin verification of the E2E employer for the board leg = G-14 | F | — | — |
| C5 | Create / use project context | org | project by sentence | PROD_PROVEN | #1503 | — | P4 later | — | — |
| C6 | Assign people | org | assignment rows | PROD_PROVEN | #1503 | group assignment (P10) later | P4 | PROJECT | after P2 |
| C7 | Readiness / capacity | org | per-person facts, who is free | PROD_PROVEN | #1510, capacity walk | — | P3/P4 | — | — |
| C8 | Corrective instruction | org | instruction persisted, person's brief | PROD_PROVEN | today M1 | — | F | — | — |
| C9 | Task / work / progress / what-if move | org | task done by sentence, stage, move + confirm | PROD_PROVEN | #1506/#1509 | Field UI (P4) is V1, not pilot | P4 | PROJECT | after P2 |
| C10 | Review evidence | org | what awaits confirmation, per person | **FAILED today (D2)** | — | same fix as B12 | P6 | CONV | after J |
| C11 | Confirm permitted work | org | confirmation row → verified skills | **FAILED today (D2)** | — | same | P6 | CONV | after J |
| C12 | Resulting state propagates | both | brief, card, pulse, risk agree | PARTIAL | readiness ratio yes; confirmation no | after D2/D3 | F | — | — |
| C13 | Hours → timesheet → approval → export | org | F4 chain | PROD_PROVEN | 2026-09-02 | plan primitive = G-13 | F | — | — |
| C14 | Reports / CSV | org | figures + download | PROD_PROVEN | #1508 | — | F | — | — |
| D1 | Agency: client invite / accept | agency | connection row | PROD_PROVEN | A4–A8 (rolled back) | e-mail delivery = owner env gate | F | — | — |
| D2 | Client demand shared | agency | demand visible to agency | PROD_PROVEN | same | — | F | — | — |
| D3 | Propose candidate | agency | offer row | PROD_PROVEN | same | — | F | — | — |
| D4 | Client decision → booking → engagement | client | accepted offer → booking → engagement | PROD_PROVEN | same; #1448 UI | — | F | — | — |
| D5 | Placement → work → outcome → history | agency | placement continues into project/journal | PARTIAL | engagement created; no placement object | decide by real client need; no new object without proof | P10 later | PROJECT | after P4 |
| E1 | Institution: programme / cohort | institution | rows via definer commands | PROD_PROVEN | batch B/D applied; UI | — | P11 later | — | — |
| E2 | Learner invite / accept → student context | both | accepted membership | PROD_PROVEN | G3 | — | F | — | — |
| E3 | Learning Compass + demand connection | student | real demand counts, gaps | PROD_PROVEN | #1452/#1458 | — | P11 | — | — |
| E4 | Practice / internship → employer | student | internship postings + fit | PARTIAL | type live (#1455); 0 postings | verified positive internship company = owner decision | P11 | EDU | yes |
| E5 | Outcomes → identity | institution | aggregate outcomes (≥5) | IMPL_PENDING_PROOF | function applied; `walk-outcomes-prod.cjs` exists | run the walk | P11 | EDU | yes |
| F1 | Client / supervisor authorized view | client | sees only what the relationship allows | PROD_PROVEN | agency chain outsider 0 rows; K2 | — | F | — | — |
| F2 | Privacy boundary on documents / evidence | all | manager never reads worker documents | PROD_PROVEN | guard `gap-resolution-privacy`; `worker_documents_select` owner+admin | K2-1 companies contact columns = G-12 (#1430) | F | — | — |
| G1 | Deterministic actions | all | sentence → same executor as UI | PROD_PROVEN | daily | — | F | — | — |
| G2 | Gemini fallback (proposer) | all | unmatched sentence → existing intent → same handler | **PARTIAL (D1)** | reached in prod today | router precision on 2 patterns; the proposer must also get sentences the router matches with LOW weight | F | CONV | after J |
| G3 | Ambiguity / missing data | all | asks the genuinely missing thing from real rows | PROD_PROVEN | "Kuris projektas?" today | — | F | — | — |
| G4 | No fake success | all | honest refusal / not-ready states | PROD_PROVEN | guards + walks | — | F | — | — |
| H1 | Matching explainable | all | why / gaps | PROD_PROVEN | 3-best; candidates | — | P2 | — | — |
| H2 | World map layers / viewport | org | bounded, clustered, ≤60 objects | PARTIAL | `market-map` exists | P8 + 1M-point load validation (V1) | P8 | WORLD | after P2 |
| H3 | Bounded / scalable retrieval | all | no hot-path scans | PROD_PROVEN | P0-1 fixed, indexes, scan caps | — | F | — | — |
| H4 | Availability / capacity | org | who is free until when | PROD_PROVEN | capacity walk | — | P4 | — | — |
| I1 | Invitations reach the person | all | in-app Attention + accept/decline | PARTIAL | link page only | lane J | Attention | CONV | running |
| I2 | Instructions | org→worker | brief + thread | PROD_PROVEN | #1510 | — | F | — | — |
| I3 | Responses (booking answer, instruction reply) | worker | reply persisted, manager sees status | PARTIAL | booking yes; reply chat-side silent today (D3) | fix with D3 | F | CONV | after J |
| I4 | Attention brief | all | what changed / why / what to do | PROD_PROVEN | attention walks | grouping for >20 items (V1) | Attention | CONV | V1 |
| I5 | Transactional e-mail | all | invitations/instructions e-mailed | OWNER_BLOCKED | stored, not e-mailed; chat says so | `INVITE_EMAIL_*` env (Resend exists for auth mail) | F | — | — |
| J1 | Pricing contract €0 / €0 (1) / €99 (10) / >10 contact | org | `/pricing` + `plans` rows | IMPL_PENDING_PROOF | #1441 (RED); prod `plans` rows updated | owner G-8 + merge | P9 | BILLING (reserved → owner gate) | no writer |
| J2 | FREE=1 / PAID=10 / 11th → individual plan | org | open-needs gate on the ONE demand path | IMPL_PENDING_PROOF | #1441 tests | same | P9 | BILLING | — |
| J3 | Checkout → signed webhook → subscription → entitlement | org | canonical `billing_subscriptions` | IMPL_PENDING_PROOF | 0 rows | owner real payment after G-8 | P9 | BILLING | — |
| J4 | Account state + portal | org | portal session | IMPL_PENDING_PROOF | — | Stripe portal config (owner) | P9 | BILLING | — |
| J5 | Cancellation / refund readback | org | entitlement follows state | IMPL_PENDING_PROOF | — | owner refund in the acceptance walk | P9 | BILLING | — |
| K1 | Auth core | all | sessions, OAuth, connected apps | PROD_PROVEN | A1/A2 | LI/FB = G-2 (not in launch scope) | F | — | — |
| K2 | RLS / cross-tenant isolation | all | outsider 0 rows | PROD_PROVEN with one P1 open | K2 probe | apply #1430 (G-12) before real users | F | — | owner |
| K3 | Documents / evidence privacy | all | owner+admin only | PROD_PROVEN | guard + policy | S6 consent stays owner-gated | F | — | — |
| K4 | Webhook security / secrets | org | signature, idempotency, mode match | IMPL_PENDING_PROOF | #1441 tests | prod proof with J3 | P9 | BILLING | — |
| K5 | Audit / provenance / legal surfaces | all | `ai_runs`, `pilot_events`, privacy/terms | PROD_PROVEN | ai_runs rows today; consent log | provenance classes visible (P6) | P6 | IDENTITY | yes |
| L1 | No architecture vocabulary | all | ordinary words only | PARTIAL | "#8cda64" shown today; chip vocabulary findings (I2) | fix with D2; P2 object language | P2 | OBJ-UI + CONV | after J |
| L2 | Visual operation without chat | all | pages for every core action | PARTIAL | `/operations`, `/journal`, `/documents`, instructions page exist | P5 shell + Context is V1; pilot = existing pages | P5 | SHELL | V1 |
| L3 | Mobile / responsive core | all | 390 px zero overflow | PROD_PROVEN | J2/P8 walks | P7 PWA is V1 | P7 | MOBILE | V1 |
| L4 | Failures → understandable recovery | all | honest not-ready states | PARTIAL | many; today's silent chat side is the counter-example | D3 | F | CONV | — |
| M1 | Deployment | ops | main serves within minutes | EXTERNAL_BLOCKED (intermittent) | Hobby limit recurs | owner: Vercel plan decision; agents: no probing pushes | F | — | — |
| M2 | Migrations ledger | ops | applied = repo | PROD_PROVEN | APPLIED_LEDGER | RED drafts await owner | F | — | — |
| M3 | Storage | ops | document files | PROD_PROVEN | #1502 | — | F | — | — |
| M4 | Observability / rollback | ops | health cron, error lines | PROD_PROVEN | L1/L2 | rollback drill = owner click (L3) | F | — | — |
| M5 | Real-user acceptance | owner | a real recruiter / institution performs a persisted action | NOT_IMPLEMENTED (FALSE) | — | needs SAFE PILOT + a real person | — | — | — |

### Totals (denominator = 75 stages above)

| Count | Stages |
|---|---|
| TOTAL_REQUIRED_STAGES | **75** |
| PROD_PROVEN | **49** (incl. K2 with one P1 finding open) |
| IMPLEMENTED_PENDING_PROD_PROOF | **8** (B13, E5, J1–J5, K4) |
| PARTIAL | **17** (A1, A4, B7, B8, B12, C10, C11, C12, D5, E4, G2, H2, I1, I3, L1, L2, L4 — B12/C10/C11 are ONE defect, D2) |
| NOT_IMPLEMENTED | **1** (M5 real-user acceptance) |
| OWNER_BLOCKED | **1** (I5 e-mail env) + 5 billing stages waiting on G-8 (counted under pending proof) |
| EXTERNAL_BLOCKED | **1** (M1 deployment, intermittent) |

Check: 49 + 8 + 17 + 1 = 75. Percentage, if wanted: 49 / 75 = **65 % PROD_PROVEN**; (49 + 8) / 75 = 76 % implemented. These are stage counts, not effort.

## 2. Three finish lines

| Finish line | Stages in scope | Proven / scope | Critical remaining | Optimistic | Realistic | Conservative |
|---|---|---|---|---|---|---|
| **SAFE PILOT** (selected real workers/employers, free) | 33 = A1–A4, B1–B13, C1–C12, G1–G4 (+K2/K3 as gates) | **21 / 33** | D2 confirm-work (B12/C10/C11) · D3 gap chat side (B7/I3) · D1 router precision (G2) · lane J invitation in-app (B8/I1) · P1 public entry (A1) · A4 five-intent prod walk · owner: G-12 apply #1430, G-1 inbox test, G-14 admin click, G-15 apply #1436 · P2/P6-subset (EMPLOYER_CONFIRMED label + object language on the walked journeys) | 3 days | **7 days** | 14 days (each walk on a new build finds defects: today 2 of 3 journeys failed their first prod walk; Hobby freezes) |
| **PUBLIC COMMERCIAL V1** | SAFE PILOT + J1–J5, K4, H2, L2, I4 grouping, C6/C9 Field UI, L3 PWA, M1 stable = 45 | **22 / 45** | owner G-8 (Stripe LIVE objects + 8 Vercel vars + approve/merge #1441) → real €99 payment + refund walk · P4 Field · P5 shell + C1 · P6 full · P7 PWA · P8 World with 1M-point validation · Attention grouping · Vercel plan | 3 weeks after G-8 | **5–6 weeks** | 10 weeks (Stripe review/VAT, load validation surprises) |
| **FULL CURRENT CANONICAL VISION** | 75 + P10–P15 packages | 49 / 75 (+ audit 2026-09-03: 40 % of the vision domains, 24 % prod-verified) | P10 teams · P11 education field · P12 marketplace TARGET · P13 My Space (#1475) · P14 native · P15 time scrubber; agency placement object; language routing 5→26; automations engine | 3 months | **5 months** | 9 months |

ETA basis: connected journeys remaining (not PR count); one deploy + one walk per journey; the observed defect rate on first prod walks; owner gates answered within a day of being asked; no paid infrastructure decision required for SAFE PILOT.

## 3. Critical path (SAFE PILOT) and what runs in parallel

CRITICAL_PATH (serial, CONV domain — one writer at a time): lane J invitation (running) → CONV fix batch {D2 confirm-work chip + name, D3 worker chat-side reads, D1 router precision + low-weight → proposer} → ONE deploy → the three walks + the invitation walk re-run → P2 object language render places in the chat.
PARALLEL_NOW (disjoint write domains): P1 public entry (PUBLIC, running) · P3 RequirementLedger read model in `lib/player-card/*` + "who can help" ranking (READINESS, no CONV edits until the CONV lane frees) · P6-subset provenance classes derived from `journal_entry_confirmations` (IDENTITY, pure read) · P2 components in `components/visual/*` extending the canonical `PlayerIdentityCard` (OBJ-UI) · E5 outcomes walk (proof only) · QA/security read-only verifier on each PR touching RLS-adjacent reads.
OWNER_GATES (consolidated, ordered): 1. apply #1430 (G-12, K2-1 privacy) · 2. one real-inbox signup test (G-1) · 3. admin click verifying `E2E Walker UAB` (G-14) · 4. apply #1436 (G-15) · 5. reply on #1433 waiver (G-16) · 6. Stripe LIVE block (G-8 A–G as listed in the #1441 handoff) · 7. `INVITE_EMAIL_*` env (I5) · 8. Vercel plan (M1) · 9. #1475 My Space apply (P13, later).
EXTERNAL_GATES: Vercel Hobby deploy limit (intermittent); Stripe account review for LIVE.
ASSUMPTIONS: one CONV writer at a time; no migration needed for D1–D3 (verify in root cause); the frozen design is implemented from text; no new canonical model for the RequirementLedger (extend `lib/player-card/readiness.ts`).

## 4. Lanes — ONE WRITE OWNER PER DOMAIN

| Lane | Domain (files) | Owner | Current item | Next | Acceptance | Integration order |
|---|---|---|---|---|---|---|
| **J** conversation | `lib/conversation/**`, `components/app/conversation/**`, `messages/*.json` | writer J (worktree `labourmarketai-wt/lane-j-invitations`) | invitation → Attention → accept/decline over the dispatcher (WIP `72e3602b`, 7 guard failures) | CONV fix batch D1–D3 (same domain, next writer after J's PR is up) | guards green; PR auto-merge; prod walk | 1 |
| **P1** public | `app/[locale]/(marketing)/**`, landing entry, `lib/auth/redirect.ts` | writer P1 (worktree `lane-p1-public-entry`) | staged hero → real sentence → router → carry-through → `landing_intent` | — | 3 sentences / question with 2 chips / telemetry row; SEO + product gate green | independent |
| **S** billing | `lib/billing/**`, `app/api/billing/**`, pricing | none (handed off) — owner gate + prod acceptance | #1441 waits on G-8 + owner merge | `walk-stripe-live-prod.cjs` after the owner's real payment | J1–J5 proven | after owner |
| **P** proofs | walk scripts only | orchestrator | today's three walks recorded | invitation walk; re-run the three after the CONV fix; E5 outcomes walk; residue cleanup | every proof = MCP readback + zero residue | continuous |
| **Q** QA/security | read-only | verifier agents | root cause D1–D3 (running) | independent review of each RLS-adjacent PR | no guard weakened | continuous |
| **D** docs/register | `docs/launch/**`, `docs/design/final/**` | orchestrator | this map + checkpoint | rewritten after every proof | — | — |
| **R** readiness / identity / object UI | `lib/player-card/*`, `lib/documents/*`, `lib/trust/*`, `components/visual/*` | next writers (P3, P6-subset, P2 components) — start after J's PR to avoid CONV render conflicts on shared files | — | RequirementLedger type first (READINESS owns it; OBJ-UI consumes) | same person → 3 contexts → 3 ledgers; every "missing" row has ≥1 resolution or an honest "none yet" + ask | after J |

Rules: a lane never edits another lane's domain; `conversation-chat.tsx` has ONE owner (J now); `layout.tsx` only P5 (V1); one migration owner per window (none open); every lane ends in a production walk against the served SHA; no walk fabricates state; billing has no writer until an actual defect is found after the owner's acceptance.

## 5. Design packages ↔ stages (frozen contract §5, reconciled against function)

| Package | Design class | MASTER class | Why | Start |
|---|---|---|---|---|
| P1 public entry | SAFE PILOT | SAFE PILOT | A1 is the entry of every unfamiliar user | started |
| P2 object language + answer form (+ fact/derived marking) | SAFE PILOT | SAFE PILOT (subset: the walked journeys' render places + canonical `PlayerIdentityCard` extension) | L1 vocabulary defects are real | after J (CONV) / components now |
| P3 contextual Requirement Ledger + gap→resolution | SAFE PILOT | SAFE PILOT (read model + "who can help" over existing `training_programs` / `service_offerings`; chat wiring after CONV frees) | B6/B7 | now (READINESS) |
| P6 provenance | subset SAFE PILOT | subset SAFE PILOT (EMPLOYER_CONFIRMED label) — full = V1 | B13 | after D2 |
| P4 Field · P5 shell + C1 · P7 PWA · P8 World · P9 billing · P10-subset · Attention grouping | PUBLIC V1 | PUBLIC V1 (unchanged; pilot runs on chat + existing pages) | — | after P2 |
| P10 full · P11 · P12 · P13 · P14 · P15 | LATER | LATER | — | — |

Design's "owner decisions" reclassified: Stripe LIVE = genuine (G-8); #1475 = genuine, later; transactional e-mail = genuine env gate (Resend already carries auth mail — only the `INVITE_EMAIL_*` variables are missing); "does the pilot move teams" = NOT an owner question now (no pilot client has asked; P10-subset stays V1 until a real need); Marketplace TARGET breadth = no decision needed.

## 6. 7-DAY EXECUTION BOARD — PUBLIC COMMERCIAL V1 CORE (owner override 2026-09-05, ≤7 calendar days)

Target = the commercial spine production-proven: public entry → organisation signup/setup → need → results → contact/invitation → worker Attention → respond → readiness/gap → engagement/project → FREE=1 → €99 Checkout → signed webhook → subscription → PAID=10 → 11th = contact → portal/account → cancel/refund readback. Person side: entry → identity → opportunity/invitation → respond → readiness → work context → confirmation.

**COMMERCIAL_CRITICAL_STAGES (30):** A1 A2 B1 B3 B4 B5 B6 B7 B8 B9 B12 B13 C1 C2 C3 C4 C5 C6 C12 G1 G2 J1 J2 J3 J4 J5 K2 K4 L2 L3 — **proven 17 / 30** after today's corrected walks (B7 and B12 moved to proven; B13 proven by the brief line; D2 is a name defect on a proven chain).

| Day (UTC) | Target | Lane / write owner | Dependency | State | Prod proof | Blocker → recovery |
|---|---|---|---|---|---|---|
| **0 · 09-05** | D2 fix merged; #1441 rebased (done, `d2bdae56`); J, P1, P3, P5-subset, P4-subset PRs open; owner Stripe session block delivered | D2 = orchestrator (`fix/cc/confirm-work-person-name`); J/P1/P3/P5/P4 writers | none | running | D2 re-walk on the next served build | Vercel limit → keep pushes to merges only |
| **1 · 09-06** | CONV batch (D1 router precision + gap reply-visibility walk) merged; J invitation merged; ONE deploy; walks: invitation, gemini, confirm-work (name), gap link 5–6 | CONV writer after J (same domain) | J PR up | queued | 4 walks on one SHA | defects found → same-day fix + re-walk |
| **2 · 09-07** | P1 public entry + P3 ledger merged and walked; **owner Stripe activation session** (one block below) → #1441 squash-merged → deploy | P1, P3 writers; owner; orchestrator | owner | queued | landing 3 sentences + `landing_intent` row; ledger 3 contexts | Stripe review → keep the rest moving |
| **3 · 09-08** | owner real €99 payment → readback (subscription, entitlement 10, account, portal) → 11th need refused → refund → readback; G-12 apply (#1430) + G-14 click + G-1 inbox test | orchestrator (acceptance), owner | Day 2 | queued | `walk-stripe-live-prod.cjs` + MCP | webhook/signature defect → fix in BILLING (only then a writer) |
| **4 · 09-09** | P5/C1 subset + P4 Field subset merged and walked without the composer; P2/P6-subset (object language on walked journeys, EMPLOYER_CONFIRMED label) merged | P5, P4 writers; CONV writer for P2 render places | CONV free | queued | employer walk without chat; card gold edge | conflicts on `messages/*.json` → rebase, never parallel edits of one file |
| **5 · 09-10** | FULL SPINE WALK with fresh bounded identities (org + person), mobile 390 px, both themes; defects list | orchestrator + QA verifier (read-only: auth, RLS, cross-tenant, documents, billing, webhook, invitation, readiness) | Days 1–4 | queued | one log per leg + MCP | any P0 → Day 6 |
| **6 · 09-11** | fix + re-walk; residue zero; register/checkpoint rewritten | all | Day 5 | queued | re-walk log | — |
| **7 · 09-12** | PUBLIC COMMERCIAL V1 CORE = YES / NO with evidence; first real organisation admitted | owner + orchestrator | Day 6 | — | real org's first persisted action | — |

**7_DAY_TARGET: YES**, conditional on two external items only: (1) the owner's Stripe activation session + real payment happening by Day 3 (Stripe account review, if triggered, is outside our control); (2) the Vercel Hobby deploy limit not freezing production for more than a day in the window (mitigation: merges only, no probing pushes; owner plan decision if it freezes twice).

**Parallel expansion (not on the critical path, continues):** P8 World discovery subset (WORLD lane, after a writer slot frees), P7 mobile acceptance of the spine (MOBILE lane, Day 4–5), Attention grouping read model, E5 outcomes walk, agency placement continuation, 1M-point World validation (concurrent, only a structural finding becomes critical).

**OWNER_ACTION_NEXT (one session, when Day-2 merges are through — prepare now):** Stripe LIVE dashboard: product "LabourMarket.ai — Organization", €99/month recurring, tax-exclusive, one active price → copy the `price_…` id · enable Stripe Tax · webhook `https://labourmarket.ai/api/billing/webhook` with events `checkout.session.completed`, `customer.subscription.created/updated/deleted`, `invoice.paid`, `invoice.payment_succeeded`, `invoice.payment_failed`, `charge.refunded`, `charge.dispute.created/closed` → copy `whsec_…` · Customer Portal: save configuration · Vercel production env: `PAYMENTS_ENABLED=true`, `BILLING_PROVIDER=stripe`, `STRIPE_MODE=live`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`, `STRIPE_PRICE_COMPANY_PILOT=<price id>`, `STRIPE_LIVE_ACTIVATION=approved-by-owner` · approve + squash-merge #1441 · after deploy: one real-card €99 payment on the organisation you choose; say "paid" — the agent reads back and runs the refund walk. Same session, three clicks: approve "Apply #1430" (privacy P1), verify `E2E Walker UAB` in `/lt/dashboard/admin/company-verification`, register once with a real inbox on a phone (G-1).
