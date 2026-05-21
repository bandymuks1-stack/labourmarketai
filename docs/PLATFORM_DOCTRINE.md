# PLATFORM DOCTRINE — LABMA OS

> **Status:** Canonical. Permanent. Binding on all agents (Claude Code, Antigravity, Codex) and human contributors.
> **Location:** `docs/PLATFORM_DOCTRINE.md`
> **Last updated:** 2026-05-21
> **Owner:** DI (product owner)

This document captures architectural and product principles that outlive any single PR, task, or sprint. If a task spec contradicts this doctrine, **the doctrine wins** — flag the contradiction in the PR description and propose a reconciled approach.

`AGENTS.md` and `CLAUDE.md` govern HOW agents work day-to-day. This document governs WHAT the platform is, structurally and philosophically. Read this file before any change involving schema, user content, permissions, audit trails, translations, or chat-like features.

---

## Section 1 — Strategic framing (the WHY)

**Original intent (DI, in Lithuanian):**

> *"Žmonėms labai trūksta patikėjimo, kad galima apsiginti — ypač prieš didesnius rangovus, kurie gali sau leisti vilkinti procesus. Komunikacijos ir projekto palengvinimas sutaupys resursų visiems."*

**Translation & elaboration for engineers and agents:**

The platform exists to **level the playing field for the smaller party** in any work relationship — worker vs. company, subcontractor vs. main contractor, small company vs. enterprise customer, individual vs. institution.

Larger entities can afford to weaponize delays, process attrition, and legal cost. They win disputes not by being right but by outlasting the smaller side. The platform's job is to **make truth fast to find, evidence cheap to produce, and communication friction-free**, so the smaller party can defend themselves without hiring a lawyer to comb through a year of emails.

Every architectural decision passes this test:

> **Does this make it easier for the smaller party to defend themselves and prove what actually happened?**

Resource savings (time, money, stress) for both sides come from clarity — not from clever tricks. A platform where records are tamper-evident, communication is unambiguous, and responsibility is traceable is a platform where bad actors lose leverage and good actors get on with the work.

---

## Section 2 — Translation architecture

### 2.1 Two content layers, two storage methods

| Content type | Examples | Stored in DB | Translations live in |
|---|---|---|---|
| **Platform-curated** | Skill names, profession names, position names, document type names, UI labels, system event messages ("User joined"), status labels, category names | Stable slug only (e.g. `welding-mig`, `chat.event.user_joined`) | next-intl JSON files: `messages/{locale}/...json` |
| **User-authored** | Chat messages, journal entries, work proof descriptions, comments, custom position labels, file captions | `original_text` + `original_language` (ISO 639-1, e.g. 'lt') | **NEVER stored in DB.** Translated on read, cached in Redis/edge layer with TTL (typ. 30 days). |

### 2.2 Mandatory translation rules

1. **No translation columns on user-content tables.** Don't add `text_lt`, `text_en`, `body_translations`, etc. Use `original_text` + `original_language` only.
2. **No translation columns on platform taxonomy tables either.** Use slug → JSON file. Once shipped, **a slug is forever** — you may deprecate, never rename.
3. **System events are tokens, not text.** "User Jonas joined" is stored as `event_token='chat.event.user_joined'` + `params={"userName":"Jonas"}`. Renderer translates in viewer's locale.
4. **Construction / safety / legal glossaries translate 1:1.** No AI creativity in domain terms — manual or human-reviewed translations only. AI may suggest during seeding; human reviews before merge.
5. **Adding a new language = creating one new JSON file** with the same keys. No schema migration. No code change beyond locale registration.
6. **Fixing a translation = editing one line in one JSON file.** No SQL update. No migration.

### 2.3 Schema requirement for new user-content tables

If your migration creates a table where users write free-form text:

**REQUIRED columns from day 1:**
```sql
original_text       TEXT        NOT NULL,
original_language   CHAR(2)     NOT NULL,  -- ISO 639-1: 'lt','en','pl','de','nl','lv','et','da','no','sv'
```

**FORBIDDEN:** any column holding a translated copy (`text_en`, `body_translations`, etc.).

### 2.4 Locale set (binding)

> **§2.4 Locale set (binding).** The canonical locale set is 10: EN (source) + 9 launch markets (LT, LV, EE, NL, DE, DK, NO, SE, PL). All 10 JSON files must exist in the repo at all times. No PR may remove a locale. New i18n keys must be added to all 10 files in the same PR — placeholder values `[EN] <english>` are acceptable for non-Tier-1 locales until human or community translation lands. Translation completeness is tracked per-locale: Tier 1 = human-verified (EN, LT for M1); Tier 2 = baseline + moderation (the other 8). Tier promotion is independent of the locale set — the locale set never shrinks.

Implementation note (ISO 639-1 locale codes): `en, lt, lv, et, nl, de, da, no, sv, pl` (market → code: EE→et, DK→da, NO→no, SE→sv). The set lives in `apps/web/lib/i18n/config.ts`; routing + middleware derive from it; per-locale files are `messages/{locale}.json` plus the taxonomy layers `messages/{locale}/professions.json` and `messages/{locale}/skill-names.json`.

### 2.5 Why this matters

- Translations stored in DB = N× storage cost per record (1 message → 6 language copies).
- Translations in DB = stale when translation engine improves.
- Translations in DB = not the legal record; **original text is the legal record**.
- Translations in JSON files = version-controlled, reviewable in PRs, instantly editable.

---

## Section 3 — Legal proof & audit principles

Lithuanian construction-warranty law allows hidden-defect claims up to **10 years** after completion. EU consumer-protection and B2B contract disputes routinely surface years after the work. Every author-content record on this platform may need to function as **admissible evidence** in a future dispute. Build accordingly.

### 3.1 Append-only by default

For author-content tables (`chat_messages`, `journal_entries`, `work_proofs`, `comments`, `manager_confirmations`):

- **No UPDATE via API.** If editing is product-required, use a separate `edits` table with full history; never overwrite the original row.
- **No DELETE via API.** Soft-hide with `hidden_at`, `hidden_by`, `hidden_reason`; the original row stays forever.
- **RLS enforces this at the policy level** — UPDATE and DELETE blocked for all roles, including `platform_admin`. Admin actions go through audit-logged stored procedures, not direct table writes.

### 3.2 Server-side timestamps

- `created_at`, `sent_at` etc. always set by `DEFAULT now()` or trigger.
- Never accept client-supplied timestamps for legal-relevant records.
- Use `timestamptz` (with timezone), never `timestamp`.

### 3.3 Hash chain for chat & journal (schema requirement from day 1, even if verification is M2+)

For `chat_messages` and `journal_entries`:

```sql
prev_hash       TEXT,       -- content_hash of previous record in same conversation/journal
content_hash    TEXT NOT NULL  -- SHA-256(sender_id || sent_at || original_text || prev_hash)
```

Computed server-side on insert (trigger or RPC). If anyone tampers with a historic row, the chain breaks at that point and all subsequent rows fail verification — tampering is provably detectable.

The hash chain doesn't need verification UI in M1. The columns must exist **and be populated correctly** in M1 so the historical record is intact when verification ships in M3+.

### 3.4 Audit log

Sensitive actions write to `audit_log`:

```sql
audit_log:
  id, actor_id, action_type, target_table, target_id,
  before_state JSONB, after_state JSONB,
  ip_address INET, user_agent_hash TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
```

Actions that MUST be audited: permission grants/revocations, position assignments/changes, manager confirmations, work proof acceptances, document approvals, role changes, organization membership changes.

---

## Section 4 — Default-closed visibility

### 4.1 The rule

**Conversations, journal entries, work proofs, and any sensitive author content are CLOSED by default.** Access requires an explicit grant row.

- No "public to org" shortcuts.
- No "everyone in this project sees everything" shortcuts.
- Workers see only conversations/entries/proofs they are explicitly part of.
- Outsiders (clients, customers) see only what's explicitly shared with them.

### 4.2 Per-participant scope

Each membership/grant row includes a scope:

- `full` — sees all content in the conversation/journal/project
- `reports_only` — sees only manager-curated reports (typical for clients/customers in M1–M2)
- `custom` (M4+) — manager picks which messages/entries the participant can see

### 4.3 Grants are records, not flags

Permission grants are rows with:
```
granted_by, granted_at, scope, revoked_by NULL, revoked_at NULL, reason TEXT
```

Revocation = setting `revoked_at`, not deleting the row. The history of who could see what, when, is itself legal evidence.

---

## Section 5 — Positions vs. roles

These are different concepts. Do not conflate them.

- **Platform role** (`worker`, `manager`, `organization_owner`, `client`, etc.) — what the user can do in the SaaS. Fixed list, RBAC-controlled.
- **Position** (`brigadininkas`, `darbų vadovas`, `vyr. specialistas`, custom names) — what the user does inside their own organization on the ground. Mixed model: platform-seeded defaults + custom names per organization.

Positions carry assignable **responsibilities** from an extensible registry: `approve_work_scope`, `distribute_tasks`, `give_instructions`, `confirm_hours`, `schedule_changes`, etc. Workers see their position + chain of command + who distributes tasks to them.

A position is not a role. A role is not a position. Schema reflects both as separate concerns.

---

## Section 6 — Storage minimalism

### 6.1 Principles

- **Never store derived data** that can be recomputed (counts, sums, formatted strings, translations) unless explicitly cached with a TTL and invalidation strategy.
- **PostgreSQL TOAST handles compression automatically** for large `TEXT` columns — no app-level compression needed.
- **Files go to Supabase Storage**, not DB. DB stores file reference + metadata only.

### 6.2 Anti-bloat patterns

- Don't denormalize `sender_name`, `conversation_title` into chat messages — JOIN at read time.
- Don't pre-translate, don't pre-format. Render at read time. Cache in Redis/edge with TTL.
- Old data → partition tables by month → ready for cold-tier migration at scale.

### 6.3 Schema review checklist (before any migration merge)

- Is every column necessary?
- Is any column storing derivable data?
- Is any column duplicating data in another table?
- Does any author-content column duplicate a translation? (FORBIDDEN — see §2)

Failing any check → revise before merging.

---

## Section 7 — AI-never-lies

1. **AI drafts; humans approve.** AI never sends, approves, changes records, or commits actions without explicit human confirmation in the chat interface.
2. **AI-generated content shown to a customer must be reviewed by the manager first.** No direct AI-to-customer path.
3. **Verification decisions are human.** Skill verification, manager confirmations, work proof acceptance — AI can suggest, humans decide.
4. **Platform translations are curated, not AI-generated, in shipped builds.** AI may help during seeding; DI/admin reviews before merge.

---

## Section 8 — How agents apply this doctrine

When Claude Code, Antigravity, or Codex picks up any task involving schema, content, permissions, audit trails, translations, or chat-like features:

1. **Read this file first.** If your task touches any of the above areas and you didn't read this, stop and read it.
2. **If the task spec contradicts this doctrine** → do not silently override. Stop, document the contradiction in your PR description under a `## Doctrine conflict` heading, propose a reconciled approach, and ask DI to confirm before proceeding.
3. **If your task adds a new user-content table** → apply §2.3 + §3 requirements without being asked. They are not optional.
4. **If your task adds a chat-like, journal-like, or proof-like table** → apply §4 (default-closed) without being asked.
5. **If you are unsure whether content is "platform-curated" or "user-authored"** → ask in the PR description. Default assumption when ambiguous: user-authored (apply the stricter rules).

---

## Section 10 — Lego architecture

> **§10 Lego architecture (binding).** Any platform taxonomy (roles, professions, skills, positions, responsibilities, document types, notification types, work proof types, journal entry types, rating criteria, and any future taxonomy that may extend or be modified without a code deploy) must be stored as slugs in the database with a separate JSON label layer per locale. Hardcoded TypeScript enums or string constants in UI components are forbidden for any extensible taxonomy. A PR introducing a fixed list without a slug registry cannot be merged. Existing enums identified post-hoc must be migrated to slug registries before any feature using them ships.

**Boundary note.** §5 platform roles are a *fixed, RBAC-controlled* set (not extensible without a code deploy), so the `Role` union type is permitted — but role *labels* still follow the slug→JSON rule (`profile_roles.role` / `active_role` store slugs; labels resolve via `auth.signup.role.*` JSON). Genuinely extensible taxonomies (professions, skills, document types, …) must use the slug-registry shape.

---

## Section 9 — Changelog (doctrine evolution)

| Date | Section(s) | Change | Author |
|---|---|---|---|
| 2026-05-21 | All | Initial doctrine established from DI architecture conversation (translation tokens, legal proof, append-only, default-closed, storage minimalism, AI-never-lies). | DI + Chat Claude |
| 2026-05-21 | §2.4, §2.5, §10 | Add §2.4 Locale set (binding, 10-locale canonical set; existing "Why this matters" renumbered §2.5). Promote §10 Lego architecture (slug→JSON for all extensible taxonomy) from v1.1 pending to active. (PR #8 architect review B4/B6.) | DI + Architect (Chat Claude) |

---

*End of doctrine. Amendments require DI's explicit approval and a row in §9.*
