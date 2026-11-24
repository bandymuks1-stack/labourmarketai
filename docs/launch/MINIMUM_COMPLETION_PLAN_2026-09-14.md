# MINIMUM COMPLETION PLAN — CURRENT → OWNER TARGET

| Field | Value |
|---|---|
| **Date** | 2026-09-14 |
| **Target** | [`docs/OWNER_TARGET_ARCHITECTURE_V1.md`](../OWNER_TARGET_ARCHITECTURE_V1.md) V1.2 — 28 nodes |
| **Evidence** | [`REUSE_COMPLETION_AUDIT_2026-09-14.md`](REUSE_COMPLETION_AUDIT_2026-09-14.md) — all 61 PARTIAL/MISSING items |
| **Owner decisions folded in** | ARCH-1 APPROVED · ARCH-2 principle approved / implementation deferred · ARCH-4 APPROVED consent-scoped · UNAUTHORIZED-is-not-ZERO classified as a FIX |
| **Status** | **Plan only. Nothing implemented. #1739 draft and unmerged.** |

**Rule for every step below: CONNECT → FIX → EXTEND → CONSOLIDATE, and only
then NEW.** A step that creates a module where a connection would do is a
defect in this plan, not a delivery.

---

## 0. NO SEQUENCING AMBIGUITIES REMAIN

Both blockers are resolved. Nothing in this plan waits on a decision that has
not been made.

| Was blocking | Now |
|---|---|
| **ARCH-4** — could an employer read a team's capability summary? | **Yes, consent-scoped.** Step B4 is unblocked and its rule is fixed |
| **ARCH-2** — who may assert an RPL equivalence? | **Principle binding, structure deferred.** RPL is *scheduled at its dependency point*, not blocked. It is Step E1 and it stays behind a schema gate |

ARCH-3, ARCH-5 and ARCH-6 remain open and **block nothing** in this plan.

---

## 1. THE TWO CATEGORIES, STATED PLAINLY

### ALREADY BUILT, DISCONNECTED — 9 items, ~3–4 windows total

Working code with no path to it. Highest value per unit in the whole plan.

| Item | What exists | What is missing |
|---|---|---|
| **SKL-8 + GEO-3** | `lib/country-readiness/` — 6 files, full requirement matrix | **Zero product importers.** Referenced only by a build script and two AI prompt strings |
| **AI-3** | AI runtime, 47 real production runs, real spend | **Six registered agents have zero call sites** |
| **PER-13** | Requirement ledger, three contexts built | Remaining mounts |
| **ORG-9** | `/business/[slug]` renders | Index/directory route |
| **WRK-2** | Objects model + workspace section | A route of its own |
| **EDU-5** | Learning review complete, route renders | One inbound link |
| **DEM-6** | `matchTeamToNeed` complete — coverage, set blockers, per-member results | Employer-side surface (now unblocked by ARCH-4) |

### GENUINELY MISSING — 4 items, ~10–16 windows

Nothing exists at any layer.

| Item | Why it is real | Depends on |
|---|---|---|
| **CAL-10** planned vs actual → learned duration | The flywheel's learning loop. Without it "better forecasts" has no mechanism | — |
| **CAL-7** capacity reservation | Nothing decrements anything. Must warn, never prohibit (SEP-2) | — |
| **CAL-9** utilisation / FTE | Derived measure | **CAL-10** |
| **DEM-8** saved searches / alerts | Closes the FUTURE DEMAND node | notification spine (exists) |

**CAL-8 shifts/rotas is deliberately NOT here** — "roster" in this product
means the active `company_workers` list, never a schedule. Building one is
scope expansion.

Everything else among the 61 is FIX, EXTEND, CONSOLIDATE, by-design,
usage-only, proof-only or external.

---

## 2. THE PLAN, DEPENDENCY ORDERED

### STEP A — the two defects on a real user's screen (do first, ~2–3 windows)

Neither needs a decision. Both are wrong *today*.

**A1 · Journal live-entry filter — FIX.** One shared predicate beside
`journal-list-core:198`, wired into `trust-signals`, `player-card` and
`capabilities/registry`. Guard must **execute the reader** against a
superseded fixture, not construct its own input.
→ *The Verified CV and profile stop counting deleted and superseded work.
Production: 65 counted vs 46 live, 4 workers affected.* **Unit M.**

**A2 · `languageLevelSatisfies` convergence — FIX.** Delete the
`capacity-model` copy, import the canonical `boolean | null`, and decide the
`null` case explicitly — a gap of unknown size is neither zero nor filled.
→ *Employers stop being shown a headcount shortfall that may not exist.*
**Unit S.**

**A3 · UNAUTHORIZED is not ZERO — FIX (owner-classified).** Make
`get_team_capability_summary_v1`'s unauthorized path **explicit**, and make
`team-match-input.ts` distinguish refusal from emptiness instead of
`skillComposition = []`.
→ *No surface can render "not allowed to see" as "has no skills".*
**Unit S.** **Must land before B4** — otherwise the first employer to use team
matching gets a confidently wrong answer about a real brigade.

### STEP B — connect what is already built (~3–4 windows)

**B1 · SKL-8 + GEO-3 on ONE surface — CONNECT.** One route serving both; the
matrix already exists. *Two capabilities, one surface — building two would be
the duplication this plan exists to avoid.* **Unit M.**

**B2 · AI-3's six agents — CONNECT.** Give the six registered agents call
sites. **Unit M.**

**B3 · PER-13 mounts · ORG-9 index · WRK-2 route · EDU-5 link — CONNECT.**
Four capabilities become reachable. **Unit M total.**

**B4 · DEM-6 employer surface — CONNECT, consent-scoped (ARCH-4).** Reachable
only where a team has offered its supply against that employer's demand.
Aggregate columns only: `skill_slug`, `members_declared`, `members_confirmed`.
**Requires A3 first.** **Unit M.**
→ *Note: production holds **0 teams**, so this serves nobody until a team
exists. Its value is that the agency journey stops being structurally
impossible.*

### STEP C — finish what is half-built (~5–7 windows)

**C1 · ORG-5** — `owns_company` excludes managers, so an org manager cannot
read `company_workers`. **FIX, unit S–M.**
**C2 · PER-9** — `confirmed_by_manager` has no write path, permanently false.
**FIX, unit S.**
**C3 · MKT-3** — `issue_asset_v1` has no availability guard or lock;
double-issue is possible. **FIX, unit S.**
**C4 · One scheduler, three consumers** — CAL-6 booking expiry, COM-2
disclosure expiry, DEM-4 ingestion. All three RPCs exist and none has a
caller. **EXTEND, unit M.** *One scheduler, not three.*
**C5 · CAL-6 past `accepted` · COM-1 organization participant type · PER-12
export breadth (6 of ~20 relations).** **EXTEND, unit L.**

### STEP D — converge duplicated truth (~7–10 windows, schedule behind A–C)

Eleven parallel implementations. **None unlocks a new outcome; each removes a
way for two surfaces to disagree.** Two are user-visible and go first:

**D1 · DEM-5** — retire the frozen matching fork still public at
`/match-preview`. A second public answer to "do I fit". **Unit S.**
**D2 · EVID-5** — hours: three stores reconciled only inside one SQL function,
no TypeScript reader unions them. Feeds evidence. **Unit M.**
**D3** — roster (ORG-6, five stores) · availability (CAL-3, four vocabularies)
· calendar sources (CAL-1, ten dated stores never reach the projection) ·
search (GOV-6, four stacks) · SKL-4 · ORG-8 · ORG-1 · MKT-4 · COM-5.

### STEP E — genuinely new (~10–16 windows)

**E1 · RPL write path — DEFERRED BY OWNER (ARCH-2).** Build only when the
Institution/RPL chain reaches this point, under the normal schema gate. The
independence rule is already binding (canonical §1.10); reuse the
`organization_evidence_events` independence pattern and its existing
`assessor` / `training_provider` / `sector_body` actor-role vocabulary.
*Production: 0 training providers, 0 evidence events — nothing is served by
building it sooner.*

**E2 · CAL-7** capacity reservation → **E3 · CAL-10** learned duration →
**E4 · CAL-9** utilisation. Strict order; CAL-9 depends on CAL-10, CAL-10 is
most useful after CAL-7.
**E5 · DEM-8** saved searches / alerts — independent, closes FUTURE DEMAND.
**E6 · WRK-6** team→project FK — small once B4 exists; schema gate.

### STEP F — proof (0 agent windows)

A human walking each actor chain. **17 of 106 capabilities are
HUMAN_UI_PROVEN** and no amount of agent time changes that number. This is the
largest single gap between "green" and "true".

### STEP G — external (0 agent windows)

`SUPABASE_DB_URL` · Supabase OAuth 2.1 authorization server (blocks both MCP
surfaces) · privacy-policy wording · Apple + Play accounts, signing key, icon
approval, declarations, screenshots · leaked-password toggle · MKT-7 billing.

---

## 3. ESTIMATE

| Step | Optimistic | Realistic | Conservative |
|---|---|---|---|
| A — two live defects + SEP-7 | 2 | **2–3** | 5 |
| B — connect the disconnected | 2 | **3–4** | 6 |
| C — finish the half-built | 3 | **5–7** | 10 |
| D — converge duplicates | 4 | **7–10** | 16 |
| E — genuinely new | 6 | **10–16** | 25 |
| F — proof | 0 agent | 0 agent | 0 agent |
| G — external | 0 agent | 0 agent | 0 agent |

**Production-complete WEB** = A + B + C + D1–D2 = **optimistic 8 · realistic
12–17 · conservative 26**.

**Architecture-complete (28 nodes)** = A + B + C + D + E = **optimistic 17 ·
realistic 27–40 · conservative 62**.

**Mobile** 2–4 · **Store-submission** 2–4 agent windows then owner-gated.

**The dominant remaining uncertainty is D and E**, not A–C. A–C is well
characterised: known files, known defects, small units.

---

## 4. WHAT THIS PLAN REFUSES TO DO

- **No new module for a renamed node.** ARCH-1 named four nodes; all four are
  realized by existing capabilities and this plan builds nothing for them.
- **No second surface for SKL-8 and GEO-3.** One module, one route.
- **No third scheduler.** C4 is one scheduler serving three existing RPCs.
- **No rota system.** CAL-8 stays out; "roster" means the worker list.
- **No RPL structure before its dependency point** (ARCH-2, owner-deferred).
- **Nothing deleted to resolve a duplicate.** Each convergence picks a
  canonical implementation and migrates to it.
