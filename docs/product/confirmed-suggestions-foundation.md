# Confirmed Suggestions Foundation

> Status: foundation note (no code, no migration). Scope D of the post-merge
> sprint following PR #30. Documents the model the platform follows today
> and the safe direction for the next approved sprint.

## The pipeline

```
user text or CV
  └─▶ detected suggestion       (system proposed it; not a fact)
        └─▶ user-confirmed fact (user chose to keep it; private to them)
              └─▶ externally-confirmed fact (manager / client / company /
                  certificate confirmed it later; this is what counts as
                  PROOF on the platform)
```

Every transition between these states requires an **explicit human action**.
There is no quiet promotion at any step. A suggestion that the user ignores
stays a suggestion forever; a user-confirmed fact that no manager ever
counter-signs stays "self-declared" forever. This is the universal rule the
platform is built around (PLATFORM_DOCTRINE §7).

## Definitions

### Suggestion

A piece of structure produced by the **rule-based parser**
(`apps/web/lib/structuring/`) from user text or pasted CV. Today the parser
matches:

- duration words (hours / days / minutes),
- a quantity + unit (`m²`, `m`, `vnt.`, `kg`, `pakuotės`),
- skill keywords from `messages/*/skill-names.json`,
- profession / work-direction keywords,
- years of experience and team size,
- candidate sentences that look like CV entries.

A suggestion:

- is rendered with the "Sistema rado / What we found" eyebrow,
- is honestly labelled as rule-based, not AI,
- is shown next to `Patvirtinti` / `Pataisyti` / `Neįtraukti` actions,
- is **never stored** unless the user confirms it.

### User-confirmed fact

A suggestion the user accepted (or edited and then accepted). This is:

- saved through the existing server actions
  (`/api/workers/:id/skills`, `createJournalEntry`) and the existing
  `journal_entries` / `worker_skills` schema,
- treated as a worker's **self-declared** record — visible in the CV
  preview, counted in self-progress, but never displayed with a `verified`
  badge.
- still under the worker's control: they can remove, edit, or unconfirm it
  at any time.

### Externally-confirmed fact

A user-confirmed fact that a second party with the right relationship has
also signed off on — usually a manager, an external manager, a client, or a
verified credential. Today this lives in the journal confirmation pipeline
(`journal_entry_confirmations`, `journal/confirm-actions.ts`) for journal
entries; skills inherit the same logic from confirmed entries.

External confirmation:

- is the only state in which the platform shows a "Patvirtinta" badge,
- never happens automatically — there is no AI auto-approval, no scoring
  threshold, no time-based decay,
- is what makes a record load-bearing in matching, scouting, or any future
  cross-party signal.

## Why parser output must not be saved as truth

If we promoted suggestions silently, we would:

1. **Lie to the worker.** Their profile would suddenly claim skills they
   never agreed to.
2. **Lie to companies / agencies.** They'd believe profiles are richer than
   the worker actually declared.
3. **Lie to regulators and ourselves.** PLATFORM_DOCTRINE §7 — no fake AI,
   no fake verification.
4. **Break trust irreversibly.** Once a platform is caught inflating
   profiles, it's seen as a CV-mill. labourmarket.ai's whole positioning
   ("honest profiles, real evidence") depends on never crossing that line.

The cost is one extra tap per suggestion. That cost is the product.

## Why this is universal — not just construction

PR #30 ships under a construction-leaning copy palette (drywall, tiling,
m²) because that's the launch vertical, but the **model itself has no
construction assumption**:

- The parser dictionary lives in
  `apps/web/lib/structuring/keywords.ts` — adding new verticals means
  extending the lexicon, not changing the pipeline.
- The composer fields (text → suggestion → confirm → save) work identically
  for any worker that talks about their job in natural language: cleaners,
  cooks, drivers, designers, accountants.
- The units list (`messages/*/productivity-units.json`) already includes
  the universal primitives: hours, days, minutes, m², m, vnt., kg,
  pakuotės. Vertical-specific units land there too.
- The journal's free-text field accepts any narrative; metric extraction is
  optional and the form saves even when nothing was extracted.

Future verticals reuse the same surface — they add taxonomy + dictionary,
not a new flow.

## Privacy posture

- User text and CV text are **input the worker controls**. They are not
  shared with other roles unless the worker explicitly publishes them.
- Confirmed facts inherit the worker's existing visibility scope on
  `journal_entries` (default `closed`) and `worker_skills`. Nothing in this
  model changes that.
- The platform never trains an AI model on user CV text. The parser does
  not require remote inference; it runs in the same process as the page.
- A worker can delete a confirmed fact and the underlying text without
  asking anyone (M1 owner-only). External-confirmation removal still flows
  through the existing append-only / audit machinery — a separate concern
  documented in `docs/PLATFORM_DOCTRINE.md` §3.

## Possible future data model (documentation only)

This is a sketch for the next approved sprint. **No migration in this
sprint.** Schema names are placeholders.

```
suggestion_proposals               -- ephemeral, deleted on confirm/discard
  id            uuid
  worker_id     uuid       -> workers.id
  source        text       -- 'profile_text' | 'profile_cv' | 'journal_text'
  source_text   text       -- the raw input the parser ran on
  parser_kind   text       -- 'rule-based-v1' (honest)
  payload       jsonb      -- the suggestion buckets the user saw
  created_at    timestamptz
  expires_at    timestamptz -- short TTL; suggestions don't linger

suggestion_confirmations           -- one row per Patvirtinti tap
  id              uuid
  proposal_id     uuid     -> suggestion_proposals.id
  worker_id       uuid     -> workers.id (denormalised, RLS)
  kind            text     -- 'skill' | 'work_direction' | 'cv_entry' | …
  payload         jsonb    -- the user's confirmed (possibly edited) value
  applied_to      jsonb    -- pointers into worker_skills / journal_entries
                            --  rows that the confirmation produced
  confirmed_at    timestamptz
  confirmed_by    uuid     -- the same worker; left as a column for the
                            --  future "manager-confirmed-on-behalf" branch
```

Two practical reasons to keep `proposals` and `confirmations` separate from
the live tables (`worker_skills`, `journal_entries`):

1. **Auditability.** When a worker later asks "why is this skill on my
   CV?", we can show the exact text + parser version that produced it.
2. **Reversibility.** Discarding a suggestion never touches the live table;
   confirming it writes to the live table AND records the proposal trail.

External confirmation already has a home
(`journal_entry_confirmations`); the new tables don't change that.

## What we explicitly do not do in this sprint

- No migration files.
- No schema changes.
- No server action signature changes (`createJournalEntry`,
  `setPrimaryProfession`, `addWorkerDirection`, skills POST all stay as
  they are).
- No new persistence layer for suggestions — current flow already stays
  honest because the parser output lives in client state only until the
  user submits a confirmed result.
- No AI integration, even behind a flag.
- No matching, scoring, or trust score derived from confirmed facts —
  those are governed by PRODUCT_CONSTITUTION §10 and remain out of scope.

## What this enables next

When DI approves the next sprint, the safe order is:

1. Land the migrations sketched above behind explicit DI approval.
2. Wire the confirm tap to also write to `suggestion_confirmations` so the
   audit trail starts collecting.
3. Add a per-suggestion `Pataisyti` flow that captures the user's edit
   alongside the original parser proposal.
4. Only then explore whether to call out to a real LLM as a SECOND parser
   alongside the rules — gated by an explicit "AI suggestion" label and
   never as an auto-approval path.

Until those steps are explicitly approved, the rule-based pipeline + the
user-confirmation tap are the entire model.
