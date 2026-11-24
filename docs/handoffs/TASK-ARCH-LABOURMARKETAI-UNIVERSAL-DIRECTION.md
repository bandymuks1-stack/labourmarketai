# TASK: Perorientuoti labourmarket.ai i Universalią Darbo Rinkos OS

**Architect to:** Claude Code, Antigravity, Codex  
**Status:** STRATEGIC DIRECTION CORRECTION  
**Priority:** M1 foundation — must complete before landing launch  
**Scope:** Architecture + Data Model + UI/UX + 5 Safe PRs  
**Deadline:** End of May 2026 (parallel with PR #8 merge)  

---

## EXECUTIVE SUMMARY

**Problem:** Current system is too narrow. M1 Work Journal logic is single-profession ("tiler only"). CV is static form. Worker without company cannot start. Internal UI does not match landing vision.

**Vision:** One person. Many professions. Living CV as system spine. Work journal entries as universal trust evidence. Manager confirmation at entry-level, not profession-wide. Internal UI feels alive, interactive, signal-rich.

**Solution:** Rearchitect from "profession → work journal" to "person → [profession → entries → evidence → confirmations] → living CV".

**Safety:** Five-PR sequence. Non-destructive migrations. All work tied to RLS + doctrine. No fake AI. Clear rollback paths.

**Outcome:** By PR #13 merge, app internals match landing quality. Worker can build CV with or without company. Any profession supported. Trust signals transparent.

---

## NON-NEGOTIABLE PRINCIPLES

These are binding architectural rules. Any PR that violates them must be rejected. No interpretation, no exceptions.

### 🚫 NO TILER HARDCODE

The system supports many professions. Construction is the launch vertical, but the architecture is universal.

- No hardcoded `'tiler'` strings anywhere in code, schema, or UI.
- No profession-specific form fields baked into journal entry component.
- No SQL seed data assuming single profession.
- No conditional logic of the shape `if (profession === 'tiler') { ... }`.
- All profession-dependent behavior loads from slug + JSON taxonomy (§10 Lego).

**Test:** Adding a new profession (e.g., `'welder'`, `'driver'`, `'cleaner'`) must require only data migration, never code changes.

### 🆓 NEW WORKER MUST START WITHOUT COMPANY / PROJECT

A worker is a first-class user. Companies and projects are secondary trust layers.

- Worker can sign up, select profession, and build CV without any organization linkage.
- `worker_profession_context.context_type = 'PERSONAL'` is the default and valid state.
- Self-employed workers, freelancers, and pre-employed candidates must be fully functional.
- Company / manager confirmation is an enhancement layer, not a prerequisite.
- No flow blocks the worker on "Please join a company first."

**Test:** A user with zero org membership must complete onboarding, add 5 journal entries, and see their living CV — all without manager involvement.

### 💎 CV IS THE CENTRAL LIVING TRUST OBJECT

The CV is the spine of the system, not a side feature.

- CV displays all professions, all skills, all verified entries, all signals.
- CV updates in real time as entries are added and confirmations arrive.
- CV is the primary surface — dashboard exists to serve CV, not the other way around.
- Every architectural decision is checked against: "Does this make the CV more trustworthy / more alive / more useful for matching?"
- No data lives outside CV's reach. Profile form ≠ CV. CV is computed, layered, signal-rich.

**Test:** Removing every UI surface except `/dashboard/cv` should still leave a usable product for the worker.

### ❌ NO UNLABELED FAKE DATA, NO FAKE VERIFICATION, NO FAKE AI

The platform's value is trust. Trust is destroyed by any **unlabeled** fabricated signal. The rule is not "no placeholder data ever" — it is **"never present fabricated data as if it were real."**

#### Allowed: clearly-labeled placeholder data (pre-launch reality)

Until real data exists in the system (users, entries, confirmations), the UI may show sample / demo / placeholder values **only if** they are visibly marked as such. This is the standing agreement for the M1 / pre-launch phase.

Acceptable patterns:
- `Sample data` badge on metric cards
- `Demo` watermark on dashboards
- `Placeholder` label next to numbers
- Empty-state copy like *"No entries yet — example below"* with the example visually distinct (greyed out, dashed border, etc.)
- Onboarding tour with explicit "example" framing

Required for every placeholder surface:
- A persistent visual indicator while placeholder data is shown
- An automatic switch to real data the moment real data exists for that user
- A code-level flag (`isPlaceholder: true`) so the source is auditable

#### Forbidden: presenting fabricated data as real

- **No fake verification:** A skill is `verified` only when a real human (manager / client) clicked confirm on a specific entry. No auto-verification by AI, by tenure, by entry count, or any other proxy.
- **No fake AI:** AI may suggest, summarize, translate, or rank. AI never approves, sends, confirms, or modifies on behalf of a human (§7). AI-generated content is always labeled (`AI suggestion`, `Auto-translated`, etc.).
- **No fake market claims presented as real:** "10,000 workers in your area" is forbidden unless the number is computed from real data OR clearly marked as a sample / illustrative figure.
- **No fake readiness presented as real:** Readiness Signal % must be transparently computable. If shown before real entries exist, it must be labeled `Sample` or `0% — add your first entry`. Tooltip must always explain the formula.
- **No silent attribution loss:** Every confirmation states who confirmed it and when. Every translation marks the original language. Every AI suggestion is labeled. Every placeholder is labeled.

**Test 1 (placeholder honesty):** A new user looking at the dashboard before adding any data must be able to instantly tell which numbers are real and which are illustrative. No squinting required.

**Test 2 (real data traceability):** A skeptical user can click into any number, badge, or signal claiming to be real and see exactly which data record produced it. Nothing real is unattributable.

### 📜 PR #9 IS DOCS-ONLY (NO CODE)

PR #9 produces architecture documents and agent handoff guides. It must NOT change:

- ❌ Database schema (no migrations)
- ❌ Routes or API endpoints
- ❌ UI components or pages
- ❌ Authentication / authorization flows
- ❌ Supabase configuration
- ❌ RLS policies
- ❌ Deploy pipeline or environment settings
- ❌ Any executable code (`.ts`, `.tsx`, `.js`, `.sql`, etc.)

PR #9 only adds / modifies files under `docs/` and (if needed) `AGENTS.md`, `TASKS.md`, `CLAUDE.md`. Nothing else.

**Test:** `git diff --stat origin/main` for PR #9 must show changes only in `docs/`, `AGENTS.md`, `TASKS.md`, or `CLAUDE.md`. Any other path is grounds for rejection.

---

## PART 1: DIAGNOSIS

### 1.1 Current State (M1 as built)

**What's working:**
- PR #5: Unified auth + onboarding flow ✅
- PR #6: Profession as first-class entity (slug + JSON) ✅
- PR #6: Skill scoped to profession + verified flag ✅
- PR #7: PLATFORM_DOCTRINE.md established ✅
- Database schema supports translation + audit ✅

**What's broken:**
1. **Work Journal is tiler-only template**
   - Schema assumes single profession per user session
   - Entry form says "Ką tu veikei?" (What did you do?) — generic, but backend expects tiler-specific fields
   - No entry-profession-link table; profession is derived from worker context
   - Manager confirmation is profession-wide ("verify all tiler skills"), not entry-specific

2. **CV is a form, not a system**
   - CV page = profil_updated form + skill picker modal
   - No "living CV" concept; no entry-history view
   - No readiness/confidence visual (% verified, % self-declared)
   - No distinction between "self-typed" and "manager confirmed"
   - Static snapshot, not a trust signal

3. **Worker without company is stuck**
   - Onboarding requires "Select company" or "Register as company"
   - No "Personal Work History" / "Self-employed" personal context
   - Worker must choose role (Worker/Company/Agency/Buyer) but then can't act as individual
   - Cannot start building CV until linked to org

4. **Internal UI is lifeless**
   - Dashboard: 2–3 cards showing basic info
   - No interactive journal-entry list, no status flow, no visual progress
   - No emoji/signals/badges showing "verified vs declared"
   - Landing has "Industrial Intelligence" aesthetic (cinematic, grid, orange/cyan); app is plain gray form

5. **Hardcoded profession logic**
   - `useGetWorkerProfile()` hook assumes single profession
   - `journalEntryForm.tsx` uses hardcoded tiler field layout
   - `workerSkills` table has profession_id FK but worker_id is implicit (from session)
   - Migration files use literal `profession_slug = 'tiler'` in seed data

6. **Doctrine conflicts not surfaced**
   - §2.4: Locale set rule is binding, but PR #8 handoff doesn't declare 10-file i18n plan
   - §10: Lego architecture rule says all extensible taxonomy must be slug+JSON, but journal entry form is hardcoded layout per profession
   - §5: Positions rule says profession ≠ role, but code conflates them

### 1.2 Why This Blocks the Market

- **Profession-locked UX:** Launch must support construction (tillers, electricians, plumbers, etc.) from day 1. Single-profession template forces sequential feature work per profession.
- **CV as static data:** Workers see no evolution. Managers see no trust trajectory. No "this person's skills are 80% verified" signal. No market intelligence.
- **Freelancers/self-employed locked out:** 30–50% of construction workforce is self-employed or multi-project. Can't onboard without fake company.
- **Dashboard feels like form filler, not OS:** Workers don't feel they're in a labour market system; they feel they're filling a form for one sector.
- **Confirmation logic doesn't scale:** "Manager confirms all tilering skills" won't work when one person is tilerer + electrician + project lead in three different contexts.

### 1.3 Data Model Problems

**Current schema (inferred from M1):**

```
User
  ├─ profile (name, email, role: 'WORKER'|'COMPANY'|...)
  └─ onboarded_profession_id (single FK to Profession)

Profession (slug + JSON)

WorkerSkills
  ├─ worker_id
  ├─ profession_id
  └─ verified: boolean

WorkJournalEntry
  ├─ worker_id
  ├─ created_at
  ├─ content (text)
  └─ profession_id (implicit from worker context)

ManagerConfirmation
  └─ (does not exist yet; only skill-level verified flag)
```

**Problems:**
1. No `profession_id` in `WorkJournalEntry` — assumes one profession per worker
2. No entry-skill link table — can't confirm "in this entry, you proved skills X, Y, Z"
3. No evidence table — can't attach photos/documents to entry
4. No personal context — every worker must be tied to company/organization
5. No confirmation timestamp/author — can't audit who confirmed what when

---

## PART 2: NEW UNIVERSAL MODEL

### 2.1 Core Principle

**One person. Many professions. One living CV.**

```
Person
  └─ ProfessionContext (0..N, e.g., tilerer + electrician)
       ├─ Profession (slug: 'tiler', 'electrician', ...)
       ├─ WorkJournalEntry (0..M, e.g., "Laid tiles on Vilnius job")
       │    ├─ ProofOfWork (0..1..M, e.g., photo, document)
       │    ├─ EntrySkillLink (0..M, e.g., "Precision tiling", "Safety")
       │    └─ Confirmation (0..N, e.g., manager on 2026-05-22, client on 2026-05-25)
       ├─ Skills (inherited from profession template, personal taxonomy)
       │    ├─ SkillLevel (self-declared, entry-confirmed, manager-confirmed, client-confirmed)
       │    └─ SkillVerificationHistory (audit trail)
       └─ ReadinessSignal (% verified, last entry, next project)
```

### 2.2 Database Schema (New Tables & Columns)

#### A. Existing (Do Not Modify)

```sql
-- Already exists, no changes:
User (id, email, onboarded_at, language, ...)
Profession (id, slug, json, created_at)
WorkerSkills (id, worker_id, profession_id, skill_id, verified, ...)
```

#### B. New: Worker Profession Context (Cardinality Fix)

```sql
CREATE TABLE worker_profession_context (
  id UUID PRIMARY KEY,
  worker_id UUID NOT NULL REFERENCES "User"(id) ON DELETE CASCADE,
  profession_id UUID NOT NULL REFERENCES Profession(id),
  
  -- Context type: 'PERSONAL' (self-employed), 'COMPANY' (employed), 'PROJECT' (gig)
  context_type VARCHAR NOT NULL DEFAULT 'PERSONAL',
  organization_id UUID REFERENCES Organization(id), -- nullable for PERSONAL
  
  -- Self-employed / freelancer markers
  is_primary BOOLEAN DEFAULT FALSE, -- user's main profession for CV display
  is_active BOOLEAN DEFAULT TRUE,
  
  -- Audit
  created_at TIMESTAMP DEFAULT NOW(),
  created_by UUID REFERENCES "User"(id),
  updated_at TIMESTAMP DEFAULT NOW(),
  
  CONSTRAINT unique_context_per_worker 
    UNIQUE(worker_id, profession_id, organization_id, context_type)
);

CREATE INDEX idx_worker_profession_context ON worker_profession_context(worker_id, is_active);
```

**Rationale:** A person can be "Tilerer (Self-employed)" + "Tilerer (BuildCorp Inc)" + "Electrician (Personal)". Each gets its own context, its own skill verification trail, its own journal. No cardinality violation.

#### C. New: Universal Work Journal Entry (Profession-aware)

```sql
CREATE TABLE work_journal_entry (
  id UUID PRIMARY KEY,
  worker_id UUID NOT NULL REFERENCES "User"(id) ON DELETE CASCADE,
  profession_id UUID NOT NULL REFERENCES Profession(id),
  
  -- Content with i18n (§2: original_language + original_text)
  original_text TEXT NOT NULL,
  original_language VARCHAR(2) NOT NULL, -- 'lt', 'en', etc.
  
  -- Optional structured fields (not required, but allowed)
  activity_type VARCHAR, -- 'installation', 'repair', 'inspection', etc. (slug + JSON later)
  quantity_value NUMERIC,
  quantity_unit VARCHAR, -- 'm2', 'hours', 'items', etc.
  location TEXT, -- address or site name
  project_ref VARCHAR, -- external project ID or name
  
  -- Timestamps
  work_date DATE NOT NULL, -- when work was done (not entry date)
  created_at TIMESTAMP DEFAULT NOW(),
  created_by UUID REFERENCES "User"(id),
  
  CONSTRAINT entry_language_in_supported_set
    CHECK (original_language IN ('lt', 'en', 'lv', 'ee', 'nl', 'de', 'dk', 'no', 'se', 'pl'))
);

CREATE INDEX idx_work_journal_by_worker_profession ON work_journal_entry(worker_id, profession_id, work_date DESC);
```

**Rationale:** 
- Removes profession from implicit context; now explicit.
- Stores original language + text (§2 doctrine).
- Allows optional structured fields without forcing form layout.
- Entry is universal: tilerer, electrician, plumber all use same schema.

#### D. New: Entry-Skill Link (Entry-Specific Confirmation)

```sql
CREATE TABLE work_journal_entry_skill_link (
  id UUID PRIMARY KEY,
  entry_id UUID NOT NULL REFERENCES work_journal_entry(id) ON DELETE CASCADE,
  skill_id UUID NOT NULL REFERENCES Skill(id),
  
  -- Level: auto-detected from entry or manually tagged
  confidence_level VARCHAR NOT NULL, -- 'self_declared', 'entry_inferred', null for unconfirmed
  
  -- First confirmation (manager, client, system)
  confirmation_source VARCHAR, -- 'manager', 'client', 'system_inference'
  confirmed_at TIMESTAMP,
  confirmed_by UUID REFERENCES "User"(id),
  
  created_at TIMESTAMP DEFAULT NOW(),
  
  CONSTRAINT unique_entry_skill UNIQUE(entry_id, skill_id)
);

CREATE INDEX idx_entry_skill_by_skill ON work_journal_entry_skill_link(skill_id, confirmed_at DESC);
```

**Rationale:**
- Decouples skill confirmation from profession-wide "verified" flag.
- Entry #42 proves skill X; entry #99 proves skill Y. Manager confirms each.
- Non-destructive: old `WorkerSkills.verified` remains; new links layer on top during migration.

#### E. New: Proof of Work (Evidence Attachment)

```sql
CREATE TABLE proof_of_work (
  id UUID PRIMARY KEY,
  entry_id UUID NOT NULL REFERENCES work_journal_entry(id) ON DELETE CASCADE,
  
  -- Media
  file_type VARCHAR NOT NULL, -- 'image/jpeg', 'application/pdf', 'text/plain'
  file_path VARCHAR NOT NULL, -- S3 / Cloudflare R2 path
  file_name VARCHAR,
  
  -- Metadata
  uploaded_at TIMESTAMP DEFAULT NOW(),
  uploaded_by UUID REFERENCES "User"(id),
  
  -- Optional caption
  caption TEXT, -- original_language + original_text later if needed
  
  CONSTRAINT file_size_check CHECK (file_path IS NOT NULL)
);

CREATE INDEX idx_proof_by_entry ON proof_of_work(entry_id);
```

**Rationale:** Attach photo of job done, invoice, safety cert, etc. Non-blocking for M1 (can scaffold and gate to M2).

#### F. New: Skill Confirmation History (Audit Trail)

```sql
CREATE TABLE skill_confirmation_history (
  id UUID PRIMARY KEY,
  worker_id UUID NOT NULL REFERENCES "User"(id) ON DELETE CASCADE,
  profession_id UUID NOT NULL REFERENCES Profession(id),
  skill_id UUID NOT NULL REFERENCES Skill(id),
  
  -- Confirmation event
  confirmation_type VARCHAR NOT NULL, -- 'self_declared', 'manager_confirmed', 'client_confirmed', 'verified'
  confirmed_at TIMESTAMP DEFAULT NOW(),
  confirmed_by UUID REFERENCES "User"(id), -- who confirmed (manager or system)
  
  -- Reference to entry if applicable
  entry_id UUID REFERENCES work_journal_entry(id),
  
  -- Note from confirmer
  note TEXT,
  
  -- Audit
  created_at TIMESTAMP DEFAULT NOW(),
  ip_address INET, -- for audit §3
  
  CONSTRAINT unique_per_event UNIQUE(worker_id, profession_id, skill_id, confirmed_at, confirmed_by)
);

CREATE INDEX idx_skill_confirmation_by_worker ON skill_confirmation_history(worker_id, profession_id, confirmed_at DESC);
```

**Rationale:** §3 Doctrine (append-only, audit log). Every trust state change is recorded, timestamped, attributed. No retroactive edits.

#### G. Update: User Onboarding Marker (Remove Single-Profession Lock)

```sql
ALTER TABLE "User" 
ADD COLUMN IF NOT EXISTS onboarding_state VARCHAR DEFAULT 'PENDING'
  CHECK (onboarding_state IN ('PENDING', 'PROFESSION_SELECTED', 'PROFILE_COMPLETE'));

-- Remove old lock (if exists):
-- ALTER TABLE "User" DROP COLUMN IF EXISTS onboarded_profession_id;
```

**Rationale:** Worker can onboard with "I'm ready to build my CV" even without selecting profession. Profession selection is optional step 1, not blocker.

### 2.3 New Data Flow

```
Worker signs up (auth unified from PR #5)
  ↓
Worker sees: "Build your CV, or join a company?"
  ├─ Path A: "I'll build my own CV first"
  │   └─ worker_profession_context(context_type='PERSONAL')
  │   └─ Worker can add entries immediately
  │   
  └─ Path B: "I'll work with a company"
      └─ Organization join link
      └─ worker_profession_context(context_type='COMPANY', organization_id=...)

Worker enters first Journal Entry
  ├─ Selects profession (skill taxonomy loads)
  ├─ Fills entry form (profession-agnostic)
  ├─ System suggests related skills (from profession template)
  ├─ Worker confirms entry
  └─ work_journal_entry + entry_skill_link(confidence_level='self_declared')

Manager reviews entry (if context='COMPANY')
  ├─ Sees entry + skills
  ├─ Confirms specific skills from this entry
  └─ work_journal_entry_skill_link.confirmation_source='manager'
     skill_confirmation_history(confirmation_type='manager_confirmed')

CV displays:
  ├─ Profession 1 (Primary)
  │   ├─ 8 skills: 5 verified (manager), 2 self-declared, 1 in progress
  │   ├─ Last 3 entries (with dates, locations)
  │   └─ Readiness: "65% verified"
  │
  └─ Profession 2 (Secondary)
      ├─ 3 skills: 1 verified, 2 self-declared
      └─ Readiness: "20% verified"
```

### 2.4 Doctrine Alignment

| Doctrine Section | Requirement | Implementation |
|---|---|---|
| **§2 Translations** | All user content (journal entry, entry caption) has `original_language + original_text`. Stored once. No translations in DB. | `work_journal_entry.original_text + original_language`. Translations done at render time via `next-intl`. |
| **§2.4 Locale Set** | All 10 JSON files (EN + LT + 8 others) must exist. No locale ever removed. i18n keys in all 10. | New journal entry i18n keys added to all 10 `messages/*.json` files in same PR. Tier 1 (EN, LT) human-verified; Tier 2 (`[EN] <text>` placeholder) acceptable. |
| **§3 Legal Proof** | Append-only, server-side timestamps, hash chain, audit log. | `skill_confirmation_history` is write-only. `work_journal_entry` cannot be edited (only soft-deleted if needed). Entry creation timestamp server-side. (Hash chain in §14 if implemented.) |
| **§4 Default-Closed** | All conversations, entries default to closed. Access only via explicit membership. | `work_journal_entry.visibility` = 'PRIVATE' by default. Manager sees only if tied to org. Client sees only if explicitly added as reviewer. |
| **§5 Positions vs Roles** | Platform roles (RBAC) ≠ positions (org-assigned). Mixed model. | `worker_profession_context` and `Skill` are not RBAC roles; they are positions/responsibilities. RBAC remains: `platform_role` (worker, manager, client, admin). |
| **§7 AI-Never-Lies** | AI never sends/approves/changes without human. | No auto-confirmation. System can suggest skills from entry text, but manager must click "confirm" explicitly. |
| **§10 Lego Architecture** | All extensible taxonomy = slug + JSON. No hardcoded enums. | `Profession`, `Skill`, `activity_type`, `quantity_unit` all slug+JSON. Form layout is generic (text, optional fields), not profession-specific hardcode. |

---

## PART 3: UI/UX DIRECTION

### 3.1 Core: Living CV as System Spine

**Current:** CV = profile form + skill picker modal.  
**Future:** CV = interactive trust profile. Visual center of app.

#### CV Hub Layout

```
┌─────────────────────────────────────────────────────────┐
│  WORKER CV HUB                                          │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  👤 Jurgis Statyba                                      │
│     Vilnius, LT | Available 40h/week | Last entry: 2d  │
│                                                         │
│  ┌─────────────────┬─────────────────┬────────────────┐ │
│  │ PROFESSION 1    │ PROFESSION 2    │ + ADD PROF.    │ │
│  │ TILERER         │ (SECONDARY)     │                │ │
│  │ Primary         │                 │                │ │
│  └─────────────────┴─────────────────┴────────────────┘ │
│                                                         │
│  ┌─────────────────────────────────────────────────────┐ │
│  │ TILERER (Primary)                                   │ │
│  │ ================================= 65% Verified ⭐⭐⭐ │ │
│  │                                                     │ │
│  │ VERIFIED (5)        DECLARED (2)      IN PROGRESS   │ │
│  │ ✓ Precision tiling  • Waterproofing   ? Safety      │ │
│  │ ✓ Floor systems     • Grout & sealing               │ │
│  │ ✓ Safety protocols                                  │ │
│  │ ✓ Measurement                                       │ │
│  │ ✓ Pattern matching                                  │ │
│  │                                                     │ │
│  │ RECENT ENTRIES                         [+ New Entry]│ │
│  │ 2026-05-21  Laid tiles on Vilnius job  [view] [add]│ │
│  │             Skills: Precision, Pattern, Safety ✓   │ │
│  │             Manager confirmed: Antanas R. 2026-05-21│ │
│  │                                                     │ │
│  │ 2026-05-15  Grouted floor, Kaunas site [view] [add]│ │
│  │             Skills: Grout, Sealing ✓               │ │
│  │             Pending confirmation                    │ │
│  │                                                     │ │
│  │ [Show all entries...] [Add work journal entry...]  │ │
│  └─────────────────────────────────────────────────────┘ │
│                                                         │
│  [EDIT AVAILABILITY] [SETTINGS] [EXPORT CV]            │ │
└─────────────────────────────────────────────────────────┘
```

**Key signals:**
- Visual progress bars (% verified, by profession)
- Skills color-coded: ✓ verified (green), • declared (gray), ? in-progress (amber)
- Recent entries with confirmation status
- "Last entry" timestamp (signals active worker)
- One-click "Add entry" entry point

### 3.2 Universal Work Journal Entry Form

**Current:** Hardcoded tiler fields (tile size, grout type, etc.)  
**Future:** Generic form with optional structured data.

```
┌──────────────────────────────────────────────────────────┐
│  ADD WORK JOURNAL ENTRY                                  │
├──────────────────────────────────────────────────────────┤
│                                                          │
│  PROFESSION *                                           │
│  [Tilerer ▼] (Skill suggestions loaded)                │
│                                                          │
│  WHAT DID YOU DO? *                                     │
│  ┌──────────────────────────────────────────────────────┐│
│  │ Laid tiles on the main hallway floor. Floor area    ││
│  │ 35 m2. Used premium ceramic tiles with gray grout.  ││
│  │ Started at 9 AM, finished by 4 PM. No issues.       ││
│  └──────────────────────────────────────────────────────┘│
│                                                          │
│  📅 WHEN DID YOU DO IT? *                               │
│  [2026-05-21 ▼]                                         │
│                                                          │
│  OPTIONAL STRUCTURED DATA                              │
│  [+ Add location] [+ Add quantity] [+ Add project ref] │
│                                                          │
│  WHAT SKILLS DID YOU USE?                              │
│  (System suggests based on entry text)                 │
│  ✓ Precision tiling                                     │
│  ✓ Floor systems                                        │
│  ✓ Pattern matching                                     │
│  □ Safety protocols                                     │
│  □ Measurement                                          │
│  [+ Custom skill] (locked to M2)                        │
│                                                          │
│  ADD PROOF (optional, locked to M2)                    │
│  [+ Photo] [+ Document]                                │
│                                                          │
│  [SAVE ENTRY] [DISCARD]                                │
└──────────────────────────────────────────────────────────┘
```

**Design principles:**
- **Freeform first:** Worker writes what they did in own words.
- **System inference second:** System suggests skills based on entry text + profession template.
- **Structured optional:** Location, quantity, project ref are enhancers, not blockers.
- **Profession-agnostic:** Same form for tilerer, electrician, plumber. No hardcoded fields.
- **Language agnostic:** Original language captured; viewer sees translated version (§2, §7).

### 3.3 Manager Confirmation View (Entry-Level, Not Profession-Wide)

```
┌──────────────────────────────────────────────────────────┐
│  TEAM JOURNAL ENTRIES - WAITING FOR YOUR CONFIRMATION    │
├──────────────────────────────────────────────────────────┤
│                                                          │
│  🔴 5 entries pending confirmation                      │
│  🟡 2 entries partially confirmed                       │
│  🟢 23 entries fully confirmed                          │
│                                                          │
│  ┌──────────────────────────────────────────────────────┐│
│  │ ENTRY #142 - JURGIS STATYBA                          ││
│  │ Profession: TILERER | Date: 2026-05-21              ││
│  │                                                      ││
│  │ "Laid tiles on Vilnius job. 35 m2. Started 9 AM..."││
│  │ Location: Vilnius, Gedimino Ave 10                  ││
│  │ Quantity: 35 m2                                      ││
│  │ Project: BuildCorp-2026-05                          ││
│  │                                                      ││
│  │ WORKER CLAIMS THESE SKILLS:                         ││
│  │ ✓ Precision tiling   ✓ Pattern matching             ││
│  │ ✓ Floor systems      □ Safety protocols             ││
│  │                                                      ││
│  │ YOUR ACTION:                                        ││
│  │ [✓ Confirm all] [⚠️ Partial] [✗ Reject] [? Ask]    ││
│  │                                                      ││
│  │ CONFIRM SPECIFIC SKILLS:                            ││
│  │ ☑️ Precision tiling (confirmed)                      ││
│  │ ☑️ Pattern matching (confirmed)                      ││
│  │ ☐ Floor systems (uncertain - ask Jurgis)           ││
│  │ ☐ Safety protocols (not evident)                   ││
│  │                                                      ││
│  │ [SAVE CONFIRMATION] [SAVE & NEXT]                   ││
│  └──────────────────────────────────────────────────────┘│
│                                                          │
│  [Earlier entry] [Next entry]                           │
└──────────────────────────────────────────────────────────┘
```

**Key design:**
- Manager sees **entry**, not profession.
- Manager confirms **specific skills from this entry**, not all tilering skills.
- Clear distinction: "Worker claims" vs "You confirm."
- Multiple action states: All, Partial, Reject, Ask (for ambiguous skills).
- Entry-skill link is created with confirmation timestamp.

### 3.4 Dashboard Redesign (Internal UI Matches Landing)

**Current:** Plain gray form-based dashboard.  
**Future:** Industrial Intelligence aesthetic + interactive signals.

```
┌─────────────────────────────────────────────────────────────────────┐
│  labourmarket.ai OS - WORKER DASHBOARD                         [Profile] [...] │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ┌────────────────────────────────────────────────────────────────┐│
│  │  🎯 YOUR READY SIGNAL                                          ││
│  │  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ 67%    ││
│  │  2 professions | 8 verified skills | 12 journal entries       ││
│  │  Last activity: 2 days ago | Available: 40h/week              ││
│  └────────────────────────────────────────────────────────────────┘│
│                                                                     │
│  ┌──────────────────────┐ ┌──────────────────────┐ ┌──────────────┐│
│  │ ▼ TILERER (Primary)  │ │ ▼ ELECTRICIAN (✨3mo)│ │ ➕ ADD PROF. ││
│  │ 65% Verified         │ │ 40% Verified        │ │              ││
│  │ ━━━━━━━━━━━━━━━━━━━  │ │ ━━━━━━━━━━━━━━      │ │              ││
│  │ 7 entries this month │ │ 5 entries total     │ │              ││
│  │ Manager: Antanas R.  │ │ Manager: (pending)  │ │              ││
│  │ [Add Entry] [View CV]│ │ [Add Entry] [View CV]│ │              ││
│  └──────────────────────┘ └──────────────────────┘ └──────────────┘│
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────────┐│
│  │  📋 PENDING YOUR ATTENTION                                       ││
│  │  🔴 1 entry awaiting manager confirmation (5 skills)           ││
│  │  🟡 3 entries partially confirmed                              ││
│  │  [View all pending entries →]                                  ││
│  └─────────────────────────────────────────────────────────────────┘│
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────────┐│
│  │  📈 SKILL GROWTH (Last 30 days)                                 ││
│  │  New Skills Learned: 4 (Precision, Grouting, Patterns, Safety) ││
│  │  Skills Verified: 3 (by Antanas R.)                            ││
│  │  Entry-to-Confirmation Time: ⌀ 3 days                          ││
│  └─────────────────────────────────────────────────────────────────┘│
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────────┐│
│  │  💬 QUICK ACTIONS                                               ││
│  │  [+ Add Journal Entry]  [View Full CV]  [Invite Manager]       ││
│  │  [Settings]             [Help]          [Export as PDF]        ││
│  └─────────────────────────────────────────────────────────────────┘│
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

**Design intent:**
- **Trust signal front & center:** Ready Signal % with breakdown
- **Color + emoji:** Pending (🔴), Partial (🟡), Confirmed (🟢)
- **Per-profession cards:** Multiple professions visible at once
- **Interactive:** All sections clickable/expandable
- **Signals:** Last activity, growth metrics, manager name visible
- **One-click actions:** Add entry, view CV, invite manager
- **Aesthetic:** Blueprint grid background, orange accents, sans-serif (Bricolage Grotesque)

### 3.5 Component Library (What to Build)

New/modified React components for PRs #11–#13:

| Component | Purpose | Status |
|---|---|---|
| `<WorkJournalEntryForm>` | Universal entry form (not profession-hardcoded) | New, PR #11 |
| `<EntrySkillPicker>` | Skill selector with suggestion from entry text | New, PR #11 |
| `<ManagerConfirmationView>` | Entry-level confirmation UI | New, PR #12 |
| `<CVHub>` | Central CV display (multiple professions) | Refactor, PR #12 |
| `<ProfessionCard>` | Single profession + skill readiness (reusable) | New, PR #12 |
| `<SkillBadge>` | Verified / Declared / In-Progress visual | New, PR #12 |
| `<ReadinessSignal>` | % verified bar + metadata | New, PR #12 |
| `<WorkerDashboard>` | Redesigned dashboard hub (living) | Redesign, PR #13 |
| `<JournalEntryCard>` | Compact entry display with status | New, PR #13 |
| `<SkillConfirmationHistory>` | Audit trail for a skill (optional M2+) | Scaffold, PR #12 |

---

## PART 4: 5-PR SAFE SEQUENCE

### Overview

```
PR #8 (existing)  → Merge person-first onboarding (already in draft)
  ↓
PR #9 (ARCH)      → Architecture docs + doctrine alignment (non-code)
  ↓
PR #10 (DB)       → New universal schema (non-destructive migrations)
  ↓
PR #11 (JOURNAL)  → Universal Work Journal UI + entry form
  ↓
PR #12 (CV)       → Living CV Hub + manager confirmation view
  ↓
PR #13 (DASHBOARD)→ Redesigned internal dashboard + final polish
```

### PR #8 — Merge Existing (Prerequisite)

**Status:** DRAFT, under architect review  
**Scope:** Person-first multi-select onboarding, live CV preview, password rules, auth slug fix  
**Blockers:** Six architect items in `docs/handoffs/TASK-PR8-ARCHITECT-REVIEW.md`

**Action before PR #9:**
1. Merge or defer PR #8.
2. If deferred, make note in PR #9 of onboarding flow assumptions.
3. Assuming merge: proceed to PR #9.

---

### PR #9 — Architecture & Doctrine (Docs-Only)

**Title:** `docs: Universal labourmarket.ai architecture + doctrine alignment`

**Scope:**
- This document (`TASK-ARCH-LABOURMARKETAI-UNIVERSAL-DIRECTION.md`)
- Updated `AGENTS.md` with new role expectations
- Updated `TASKS.md` with PR #10–#13 sequence
- Doctrine conflict resolution table (§8.2 format) for all 5 PRs
- Four handoff guides for PR #10–#13

**Files to create / update:**

```
docs/
  ├─ ARCHITECTURE_UNIVERSAL_LABOURMARKETAI.md (new — summary of §2.1–2.4 data model)
  ├─ PLATFORM_DOCTRINE.md (only if §10 Lego rule needs activation language; no rewrites)
  └─ handoffs/
      ├─ TASK-ARCH-LABOURMARKETAI-UNIVERSAL-DIRECTION.md (this file — commit verbatim)
      ├─ TASK-PR10-UNIVERSAL-SCHEMA.md (Claude Code instructions for PR #10)
      ├─ TASK-PR11-UNIVERSAL-JOURNAL-UI.md (Claude Code instructions for PR #11)
      ├─ TASK-PR12-LIVING-CV-HUB.md (Claude Code instructions for PR #12)
      └─ TASK-PR13-DASHBOARD-REDESIGN.md (Claude Code instructions for PR #13)

AGENTS.md (update — reference new handoff sequence)
TASKS.md (update — add PR #10–#13 entries with status)
```

**🚫 Hard Guardrail — PR #9 must NOT change:**
- ❌ Database schema (no migration files)
- ❌ Prisma schema (`prisma/schema.prisma` untouched)
- ❌ Routes or API endpoints (no `apps/api/**` changes)
- ❌ UI components or pages (no `apps/web/src/**` changes)
- ❌ Authentication / authorization flows
- ❌ Supabase configuration or RLS policies
- ❌ Deploy pipeline (`.github/workflows/**`, `Dockerfile`, etc.)
- ❌ Environment variables or secrets
- ❌ Any executable code in any language

**✅ PR #9 only adds / modifies files in:**
- `docs/**` (architecture documents and handoffs)
- Root coordination files: `AGENTS.md`, `TASKS.md`, `CLAUDE.md`

**Verification before merge:**
```bash
git diff --stat origin/main | grep -v -E "^(docs/|AGENTS\.md|TASKS\.md|CLAUDE\.md)"
# Should produce zero output. Any other file = reject the PR.
```

**Definition of Done:**
- [ ] `TASK-ARCH-LABOURMARKETAI-UNIVERSAL-DIRECTION.md` committed verbatim under `docs/handoffs/`
- [ ] `ARCHITECTURE_UNIVERSAL_LABOURMARKETAI.md` created (1–2 page architecture summary)
- [ ] All four PR handoff guides (`TASK-PR10-*.md` … `TASK-PR13-*.md`) drafted
- [ ] `AGENTS.md` updated with PR #10–#13 sequence reference
- [ ] `TASKS.md` updated with PR #10–#13 entries
- [ ] Doctrine conflict resolution table included (§8.2 format)
- [ ] Verification command above returns zero non-docs files
- [ ] DI approval before PR #10 starts

**Out of Scope (defer to PR #10–#13):**
- Database schema changes
- Migrations
- UI implementation
- API endpoints
- RLS enforcement

**After:** Once DI approves PR #9, PR #10 (schema) can start. No blocking dependencies.

---

### PR #10 — Universal Data Model (Database Layer)

**Title:** `db: Universal work journal schema + profession-context cardinality fix`

**Scope:**
- New tables:
  - `worker_profession_context`
  - `work_journal_entry` (replaces old narrow tiler-only schema assumption)
  - `work_journal_entry_skill_link`
  - `skill_confirmation_history`
  - `proof_of_work` (scaffold only, not used yet)
- Migration:
  - Create new tables
  - Backfill `worker_profession_context` from existing user data (all users get `context_type='COMPANY'` + their current org)
  - Backfill `work_journal_entry` if old journal entries exist
- No destructive drops; old tables remain until PR #11 cutover

**Migration file naming:**
```
migrations/
  └─ 0013_add_universal_journal_schema.sql
```

**RLS (Row-Level Security):**
- `worker_profession_context`: owned by worker or organization owner
- `work_journal_entry`: visible to worker, manager (if org context), client (if added as reviewer)
- `work_journal_entry_skill_link`: same visibility as entry
- `skill_confirmation_history`: visible to worker, confirmer (manager/client)

**Definition of Done:**
- [ ] All 6 new tables created
- [ ] Migration passes local test (fresh schema + existing data)
- [ ] RLS policies written (not enforced yet; just in code)
- [ ] Prisma schema updated (`prisma/schema.prisma`)
- [ ] Seed data for new schema (sample profession contexts)
- [ ] Zero breaking changes to existing code
- [ ] Migration reversible (documented rollback)

**Out of Scope:**
- No UI changes
- No API endpoints
- No RLS enforcement (that's PR #11)

**After:** Old schema still in use; PR #11 will switch over to new schema.

---

### PR #11 — Universal Work Journal UI & API

**Title:** `feat: Universal work journal entry form + API layer`

**Scope:**

#### API Changes (Backend)
- New endpoints:
  - `POST /api/work-journal/entries` (create entry with profession + skills)
  - `GET /api/work-journal/entries?profession=tilerer` (list entries)
  - `PUT /api/work-journal/entries/{id}` (update, if allowed)
  - `POST /api/work-journal/entries/{id}/skills` (add skill link)
  - `POST /api/work-journal/entries/{id}/confirm` (manager confirmation)
- Migrate old journal logic to new schema (append-only, no destructive changes)
- RLS enforcement on for new endpoints

#### UI Changes (Frontend)
- New component: `<WorkJournalEntryForm>` (generic, not profession-hardcoded)
  - Profession selector at top
  - Freeform text area ("What did you do?")
  - Optional structured fields (location, quantity, project)
  - Skill picker (system-suggested + manual)
  - Save entry
- Replace old tiler-specific form with new universal form
- New page: `/dashboard/journal` (list + create entries)

#### Tests
- Unit: entry form submission, skill suggestion logic
- E2E: Create entry as tilerer, then as electrician (same form)

**Definition of Done:**
- [ ] All new endpoints implemented + tested
- [ ] `<WorkJournalEntryForm>` working for 2+ professions
- [ ] Old tiler-only form removed or hidden
- [ ] Skill suggestion working (system infers from entry text)
- [ ] i18n: All new strings in 10 locale files (Tier 1 human-verified, Tier 2 placeholder)
- [ ] RLS enforced; worker cannot see other workers' entries
- [ ] Migration: Old entries moved to new schema (if any exist)

**Out of Scope:**
- Manager confirmation view (that's PR #12)
- Proof of work attachments (scaffold only, defer to PR #12 or M2)
- Custom skills (scaffold, lock to M2)

**After:** Workers can create entries. Manager cannot confirm yet (next PR).

---

### PR #12 — Living CV Hub & Manager Confirmation

**Title:** `feat: Living CV hub + entry-level manager confirmation`

**Scope:**

#### API Changes
- New endpoints:
  - `GET /api/profile/cv` (CV with all professions, skills, readiness signals)
  - `POST /api/work-journal/entries/{id}/confirmation` (manager confirms specific skills)
  - `GET /api/work-journal/pending-confirmations` (manager's queue)

#### UI Changes
- New component: `<CVHub>` (replaces static profile page)
  - Multiple profession cards
  - Skill breakdown (verified / declared / in-progress)
  - Readiness % per profession
  - Recent entries list
  - "Add entry" CTA
- New component: `<ManagerConfirmationView>`
  - Queue of pending entries (unconfirmed skills)
  - Per-entry skill confirmation (not profession-wide)
  - Partial confirmation allowed (confirm some skills, ask about others)
  - Confirmation history
- New page: `/dashboard/team/confirmations` (manager view)
- Update old `/dashboard/profile` to redirect to `/dashboard/cv`

#### Tests
- Unit: CV readiness calculation, confirmation logic
- E2E: Manager confirms entry for tilerer; worker sees updated CV; confirmation history visible

**Definition of Done:**
- [ ] `<CVHub>` displays all professions + readiness signals
- [ ] Manager can confirm individual skills per entry
- [ ] Confirmation timeline visible (who confirmed, when)
- [ ] Worker sees updated CV after manager confirmation
- [ ] `<SkillBadge>` component visual (✓ verified, • declared, ? pending)
- [ ] `<ReadinessSignal>` bar + breakdown
- [ ] i18n: All new strings in 10 locales
- [ ] RLS: Manager cannot confirm skills outside org; worker sees only own CV

**Out of Scope:**
- Custom skill creation (M2)
- Proof of work visibility in CV (M2, may attach in this PR as read-only)
- AI skill suggestion refinement (M3+)

**After:** Workers have living CV. Managers can confirm entries. System tracks trust signals.

---

### PR #13 — Dashboard Redesign & Polish

**Title:** `ui: Internal dashboard redesign + Industrial Intelligence aesthetic`

**Scope:**

#### Design & Components
- Redesigned `/dashboard` (worker view)
  - Ready Signal % front & center
  - Profession cards (compact, interactive)
  - Pending confirmations indicator
  - Skill growth metrics
  - Quick-action buttons
  - Blueprint grid background + orange/cyan accents (match landing)
- Redesigned `/dashboard/team` (manager view)
  - Team member list with ready signals
  - Pending confirmation queue
  - Skill-by-profession heatmap (optional, polish)
  - Quick access to manage team

#### Components
- Refactor `<WorkerDashboard>` to use new design
- New `<JournalEntryCard>` (compact, with status indicator)
- Update `<ProfessionCard>` for consistency across dashboard + CV
- Add animations (subtle, on confirmation, on entry creation)

#### UX Polish
- Tooltip on "Ready Signal" explaining % calculation
- Breadcrumb navigation (Dashboard → Professions → CV)
- Mobile responsiveness (already tested in PR #11–#12, but polish here)
- Loading states for async data
- Error handling (graceful messages, not generic "Error occurred")

#### Tests
- E2E: Worker dashboard loads, shows correct ready signal
- E2E: Manager dashboard shows team entries + confirmation queue
- Visual regression: Dashboard design matches spec

**Definition of Done:**
- [ ] Dashboard visually matches landing aesthetic
- [ ] Ready Signal calculation correct + explained
- [ ] All interactive elements (profession cards, expandables) working
- [ ] Mobile-responsive (6-inch viewport test)
- [ ] i18n: All text in 10 locales
- [ ] No performance regression (dashboard loads < 2s)
- [ ] Accessibility: ARIA labels, keyboard navigation

**Out of Scope:**
- New advanced features
- Analytics / reporting (M3+)
- Dark mode toggle (existing app doesn't have, skip)

**After:** Launch-ready internal UI. Matches landing quality. Universal system visible to users.

---

### Rollback Strategy for All PRs

If any PR breaks production:

1. **PR #9 (docs):** No rollback needed (revert commit).
2. **PR #10 (schema):** 
   - If migration fails: run rollback SQL (documented in migration file).
   - Old code still reads old schema; new schema unused.
   - Safe: old and new schema coexist.
3. **PR #11 (journal UI):**
   - If endpoint fails: temporarily disable `/dashboard/journal` in UI.
   - Old entries still visible (old schema intact).
   - Revert PR, old tiler form resumes.
4. **PR #12 (CV hub):**
   - If CV calculation breaks: fall back to old profile page (redirect).
   - Manager confirmation deactivated; entries still viewable.
   - Revert PR, restore old confirmation flow (if any).
5. **PR #13 (dashboard):**
   - If design breaks: roll back to old dashboard design (CSS + layout).
   - Functionality (ready signal calculation) independent of design.
   - Revert PR, old dashboard resumes.

**No data loss in any scenario.** All migrations append-only; old tables remain.

---

## PART 5: DOCTRINE ALIGNMENT CHECKLIST

### PR #9 (Non-Code Review)
- [ ] §2 Translations: Audit that all journal-entry i18n keys will include `original_language + original_text`
- [ ] §2.4 Locale Set: Confirm plan to add keys to all 10 JSON files (EN, LT + 8 Tier 2)
- [ ] §3 Append-Only: Confirm `skill_confirmation_history` is write-only, audit log
- [ ] §4 Default-Closed: Confirm entry visibility = PRIVATE by default
- [ ] §5 Positions: Confirm profession ≠ RBAC role in schema
- [ ] §7 AI-Never-Lies: Confirm no auto-confirmation; manager must click
- [ ] §10 Lego: Audit for any hardcoded enums in new schema (should be all slug+JSON)

### PR #10 (Database)
- [ ] Schema matches §2 (original_language + original_text columns)
- [ ] RLS policies drafted (not enforced yet)
- [ ] No hardcoded profession values in SQL
- [ ] Migration reversible

### PR #11 (Journal UI)
- [ ] i18n keys in all 10 locale files
- [ ] Form is profession-agnostic (no hardcoded fields)
- [ ] RLS enforced on endpoints
- [ ] No auto-confirmation in backend

### PR #12 (CV Hub)
- [ ] i18n keys in all 10 locales
- [ ] Entry-level (not profession-level) confirmation
- [ ] Confirmation logged in `skill_confirmation_history`
- [ ] User sees confirmation attribution (who, when)

### PR #13 (Dashboard)
- [ ] i18n keys in all 10 locales
- [ ] No fake or unattributed information displayed
- [ ] Ready Signal logic transparent (explain % calculation)

---

## PART 6: WHAT NOT TO TOUCH

**Preserve working parts. Do not modify:**

- [ ] **Auth flow** (PR #5 unified auth + onboarding is locked)
- [ ] **Profession & Skill slug+JSON** (PR #6 established pattern; extend only)
- [ ] **Supabase RLS core** (layer new policies on top, don't rewrite existing)
- [ ] **Existing API endpoints** (add new, don't break old)
- [ ] **Organization & RBAC roles** (unchanged; only position model evolves)
- [ ] **Billing & subscription** (M3+, untouched)
- [ ] **Old profile page** (redirect to CV, don't delete data)
- [ ] **Existing journal entries** (if any; backfill to new schema, keep old table)

---

## PART 7: ALTERNATIVE PROPOSALS

### 7.1 Why Not: "Just Add a Multi-Select Profession Picker"?

**Rejected because:**
- Profession multi-select at onboarding is UI candy; doesn't fix data model.
- Work Journal would still be "profession-wide" confirmation, not entry-level.
- CV would still be static form, not living trust signal.
- Doesn't scale to "worker without company."

**This proposal rearchitects the spine, not just the UI.**

### 7.2 Why Not: "Skip CV Hub, Just Improve Profile Form"?

**Rejected because:**
- Profile form is not a "CV." It's a user object editor.
- Landing promises "living OS"; static profile doesn't deliver that.
- Manager confirmation is useless if worker can't see what was confirmed.
- Trust signals (readiness %) require historical data, not just form fields.

**This proposal makes CV the system spine, not an afterthought.**

### 7.3 Why Not: "Auto-Confirm Skills Based on Entry Text (AI)"?

**Rejected because §7 (AI-Never-Lies):**
- AI can suggest skills from entry text; OK.
- AI cannot confirm without manager click; **required**.
- System must be honest about attribution: worker claimed, AI suggested, manager confirmed.
- Fake verification destroys market trust.

**This proposal respects doctrine.**

### 7.4 Alternative: Async Work Journal (Socket.io, Realtime Updates)

**Deferred to M2+** because:
- M1 focus: core architecture, not realtime polish.
- Socket.io already in stack; can add in M2 for live confirmation notifications.
- Non-blocking for launch.

**This stays on roadmap, not in critical path.**

---

## PART 8: DEFINITION OF DONE (SYSTEM-WIDE)

By end of PR #13 merge:

### Functional
- [ ] Worker can build CV without company (personal context)
- [ ] Worker can add journal entries for any profession
- [ ] Manager can confirm specific skills per entry (not profession-wide)
- [ ] CV displays living trust signals (readiness %, verified vs declared)
- [ ] Dashboard feels alive (interactive, signal-rich, matches landing)
- [ ] Multiple professions supported simultaneously
- [ ] Confirmation history audited and attributable

### Architectural
- [ ] All extensible taxonomy is slug+JSON (§10)
- [ ] All author content has original_language + original_text (§2)
- [ ] Append-only audit log for confirmations (§3)
- [ ] Entry visibility default-closed (§4)
- [ ] No auto-confirmation without human click (§7)
- [ ] RLS enforced on all new tables
- [ ] 10 locale files updated for all new strings (§2.4)

### Quality
- [ ] No hardcoded profession enums
- [ ] No fake or unattributed trust signals
- [ ] Mobile-responsive (6-inch viewport)
- [ ] E2E tests for journal + CV + confirmation flows
- [ ] Rollback documented for all 5 PRs
- [ ] Doctrine conflicts surfaced in PR descriptions

### Market Readiness
- [ ] 5+ professions testable (tilerer, electrician, plumber, etc.)
- [ ] Worker onboarding does not require company
- [ ] Manager approval is clear & auditable
- [ ] CV export-ready (PDF scaffold, defer detail to M2)
- [ ] UI matches landing aesthetic (blueprint grid, orange/cyan, Industrial Intelligence)

---

## PART 9: NEXT STEPS

### For DI:
1. Review this handoff.
2. Approve 5-PR sequence or suggest changes.
3. Sign off on doctrine conflicts in Part 5.
4. Assign PR #9 to Claude Code for architecture doc production.

### For Claude Code:
1. Read all of Part 2–3 (understand new schema & UI intent).
2. Create PR #9 (docs + handoff guides for PRs #10–#13).
3. Await DI approval before starting PR #10.

### For Execution (PRs #10–#13):
- Each PR is self-contained.
- Handoff guides (Part 4) will be detailed step-by-step.
- Doctrine checklist (Part 5) is non-negotiable for each PR merge.
- Rollback strategy (Part 4) prevents panic if things break.

---

## APPENDIX: Schema Diagram (TextArt)

```
┌──────────────────────────────────────────────────────────────┐
│                      UNIVERSAL LABOURMARKETAI                         │
│                      DATA MODEL v1                           │
└──────────────────────────────────────────────────────────────┘

                           USER
                            │
         ┌──────────────────┼──────────────────┐
         │                  │                  │
         ▼                  ▼                  ▼
    WORKER_PROFESSION  ORGANIZATION       SKILL
    _CONTEXT           (unchanged)        (from PR#6)
         │                                     │
         │ profession_id                       │
         ├──────────────────┬──────────────────┘
         │                  │
         ▼                  ▼
    PROFESSION         SKILL (unchanged)
    (slug+JSON)        ├─ slug
                       ├─ json
                       └─ verified (changed from user-scoped)

    WORKER_PROFESSION_CONTEXT
    ├─ worker_id (FK User)
    ├─ profession_id (FK Profession)
    ├─ context_type ('PERSONAL' | 'COMPANY' | 'PROJECT')
    ├─ organization_id (nullable, FK Organization)
    └─ is_primary (boolean)

         │
         │ worker_id, profession_id
         ▼
    WORK_JOURNAL_ENTRY
    ├─ id
    ├─ worker_id
    ├─ profession_id  ← NEW: explicit, not implicit
    ├─ original_text  ← §2
    ├─ original_language ← §2
    ├─ work_date
    ├─ created_at
    ├─ visibility ('PRIVATE' | 'TEAM' | 'PUBLIC')
    └─ (optional: activity_type, quantity, location)

         │ entry_id
         ├──────────────────────┬──────────────────────┐
         │                      │                      │
         ▼                      ▼                      ▼
    ENTRY_SKILL_LINK  PROOF_OF_WORK   (ENTRY_COMMENT
    ├─ entry_id         ├─ entry_id     when M3+)
    ├─ skill_id         ├─ file_path
    ├─ confirmed_at  ← AUDIT         └─ caption
    ├─ confirmed_by (FK User)
    └─ confidence_level

         │ worker_id, profession_id, skill_id
         │ (or entry_id → entry_id → entry.worker_id)
         ▼
    SKILL_CONFIRMATION_HISTORY (§3 APPEND-ONLY)
    ├─ id
    ├─ worker_id
    ├─ profession_id
    ├─ skill_id
    ├─ confirmation_type ('self_declared'|'manager_confirmed'|...)
    ├─ confirmed_at
    ├─ confirmed_by
    ├─ entry_id (FK, nullable)
    └─ created_at

RELATIONSHIPS:
  • PERSONAL context: no manager (yet)
  • COMPANY context: manager can confirm entries
  • CLIENT context: client can confirm entries (M3+)
  • Entry visibility: PRIVATE by default (§4)
  • Skill confirmation: entry-level (new), not profession-level

RLS POLICIES:
  • Worker sees own entries + professions
  • Manager sees team entries (organization context)
  • Client sees only explicitly granted entries
  • Confirmation history visible to worker + confirmer
```

---

## APPENDIX: i18n Checklist (All 10 Locales)

For each new string in PRs #11–#13, add to:

```
apps/web/src/locales/messages/
├─ en.json          (human-verified, Tier 1)
├─ lt.json          (human-verified, Tier 1)
├─ lv.json          ([EN] placeholders initially, Tier 2)
├─ ee.json          ([EN] placeholders initially, Tier 2)
├─ nl.json          ([EN] placeholders initially, Tier 2)
├─ de.json          ([EN] placeholders initially, Tier 2)
├─ dk.json          ([EN] placeholders initially, Tier 2)
├─ no.json          ([EN] placeholders initially, Tier 2)
├─ se.json          ([EN] placeholders initially, Tier 2)
└─ pl.json          ([EN] placeholders initially, Tier 2)
```

**Example entry for PR #11 (Work Journal):**

```json
// en.json
{
  "workJournal": {
    "form": {
      "title": "Add Work Journal Entry",
      "placeholder": "What did you do?",
      "whenLabel": "When did you do it?",
      "skillsLabel": "What skills did you use?"
    }
  }
}

// lt.json
{
  "workJournal": {
    "form": {
      "title": "Pridėti darbo žurnalo įrašą",
      "placeholder": "Ką tu veikei?",
      "whenLabel": "Kada tu tai veikei?",
      "skillsLabel": "Kokius įgūdžius tu panaudoji?"
    }
  }
}

// lv.json (Tier 2 placeholder)
{
  "workJournal": {
    "form": {
      "title": "[EN] Add Work Journal Entry",
      "placeholder": "[EN] What did you do?",
      "whenLabel": "[EN] When did you do it?",
      "skillsLabel": "[EN] What skills did you use?"
    }
  }
}
```

All 10 files must be present and valid JSON for each PR to merge (no sparse locale sets).

---

## SUMMARY

This handoff reorients labourmarket.ai from a narrow, profession-locked MVP to a universal, living labour market OS. It does so by:

1. **Rearchitecting the data model** to decouple profession from person, allowing one worker to manage many professions, each with independent skill verification trails.

2. **Making CV the system spine**, transforming it from a static form to a living trust signal showing readiness, verified vs. self-declared skills, and confirmation history.

3. **Enabling workers without companies** to build their profiles immediately, accepting company/manager confirmation as a secondary trust layer.

4. **Unifying the Work Journal form** across all professions (no hardcode per profession), while keeping confirmation entry-specific, not profession-wide.

5. **Bringing internal UI to landing quality**, using the Industrial Intelligence aesthetic and interactive signals to make the system feel alive.

6. **Executing safely in 5 PRs**, with clear rollback paths, doctrine alignment, and non-destructive migrations.

By PR #13 merge, labourmarket.ai transitions from "single-profession MVP" to "universal multi-profession labour market operating system" — ready to launch across construction and beyond.

---

**Handoff prepared by:** Architect Claude  
**Date:** May 22, 2026  
**Status:** Ready for DI review & approval  
**Next action:** DI approves → PR #9 (non-code architecture docs) → Claude Code execution
