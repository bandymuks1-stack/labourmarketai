-- ============================================================================
-- APPLIED 2026-09-27 via Supabase MCP apply_migration, ledger 20260927060325,
-- after the owner's final RED approval. Never `db push`. Readback and the
-- rolled-back behavioural probe are recorded in docs/APPLIED_LEDGER.md.
--
-- 20260927053000 — a person's own words for what they do, kept (owner
-- direction 2026-09-27, approved in principle; final diff awaiting approval).
--
-- PROBLEM, measured while walking the real onboarding as a new person.
-- `worker_professions.profession_id` is a NOT NULL foreign key into the 49-row
-- `public.professions` registry, and no person-scoped free-text occupation
-- column exists anywhere in the schema. So the registry was, in practice, the
-- list of permitted answers to "what do you do": a scaffolder — the owner's
-- own example, and not a rare trade — could not record their profession at
-- all. The classifier is not allowed to be the list of allowed human answers.
--
-- SOLUTION (smallest coherent change): the SAME table gains the person's
-- words. One row of `worker_professions` is now any one of three things:
--
--   registry profession   profession_id set, label null       (all 26 today)
--   own words + a match   profession_id null, label set, esco_occupation_id set
--   own words alone       profession_id null, label set
--
-- The verbatim text and the standardized link are SEPARATE COLUMNS ON ONE
-- ROW — the shape `public_vacancies` already uses for the same problem on the
-- demand side (`occupation_raw` + `occupation_concept_id`), and the
-- `label` + `normalized_label` pair `profile_skill_claims` and
-- `skill_candidate_clarifications` already use for a person's free text. A
-- match never replaces the words; no match never invalidates them.
--
-- WHY THIS TABLE AND NOT A NEW ONE. `profile_skill_claims` chose a separate
-- table for the opposite reason, stated in its own header: `worker_skills` is
-- employer-readable and those claims had to stay closed. Here the requirement
-- is the reverse — a self-declared profession is professional information and
-- is shown in the profile and the Living CV under the SAME visibility as the
-- rest, which is exactly what `worker_professions_select` already grants
-- (owner / employer / admin). A second table would make it invisible where it
-- needs to be seen, and would be the second profession system this must not
-- become.
--
-- NOT A PRODUCT RULE (owner, 2026-09-27): `is_primary` and its partial unique
-- index are the existing technical model. This migration adds NO constraint
-- around them, gives self-declared rows no special status, and makes no rule
-- out of "one real profession" — a person may hold 0, 1 or N, and nothing here
-- derives a profession from skills or from anything else.
--
-- EXISTING DATA: untouched. No update, no delete, no backfill. The 26 rows
-- (15 of 65 workers, production 2026-09-27) keep `profession_id` and take the
-- new columns as NULL.
--
-- EXISTING READERS: 20 read sites in 15 files were checked one by one before
-- this was written; every one already null-guards the embedded profession
-- (`r.professions?.slug`, `p ? … : null` + filter, `.filter(id => id !== null)`),
-- so a self-declared row cannot break a query. Such a row is simply not
-- surfaced until a surface is taught to read `label` — the onboarding →
-- profile → Living CV chain being the first, in its own change.
--
-- ROLLBACK: paired supabase/rollbacks/20260927053000_worker_self_declared_profession_v1.down.sql
-- It REFUSES while any self-declared row exists, because dropping the column
-- would delete what people wrote about their own work.
--
-- POST-APPLY VERIFICATION:
--   select count(*) from public.worker_professions;                 -- 26, unchanged
--   select count(*) from public.worker_professions where label is not null;  -- 0
--   -- as a signed-in worker, their own worker_id:
--   insert into public.worker_professions (worker_id, label) values (<own>, ' Pastolininkas ');
--   select label, normalized_label from public.worker_professions where label is not null;
--                                                                   -- ' Pastolininkas ' / 'pastolininkas'
--   insert into public.worker_professions (worker_id, label) values (<own>, 'PASTOLININKAS');
--                                                                   -- refused: worker_professions_one_label
--   insert into public.worker_professions (worker_id) values (<own>);
--                                                                   -- refused: worker_professions_names_something
--   + APPLIED_LEDGER.md row.
--
-- TRANSACTION: none declared here. `apply_migration` runs the file inside its
-- own transaction, which is how every recently applied RED migration in this
-- repository is shaped (20260924130000 / 140000 / 150000 carry no begin/commit
-- either). An inner `commit` would end that transaction early and take this
-- file's atomicity with it.
--
-- @human-gate-approved — TIER: owner-gated. `alter column ... drop not null`
-- is RED by the migration-safety classifier (rule (l), a loosened column
-- guarantee). The annotation lets CI pass; it is an acknowledgement, NOT an
-- auto-merge pass. No auto-merge is enabled on the PR.
-- ============================================================================

-- ── 1. The registry link becomes optional ───────────────────────────────────
-- The ONLY change to an existing column. Rows are not touched; a row that has
-- a `profession_id` today still has it after this.
alter table public.worker_professions
  alter column profession_id drop not null;

-- ── 2. The person's own words ───────────────────────────────────────────────
alter table public.worker_professions
  add column if not exists label text;

-- Dedupe key. GENERATED, so it can never drift from `label` — both precedents
-- normalize in application code and carry that risk; there is no reason to
-- inherit it. Case and surrounding space only: nothing about the person's
-- text is interpreted here.
alter table public.worker_professions
  add column if not exists normalized_label text
    generated always as (lower(btrim(label))) stored;

-- ── 3. The standardized link, SEPARATE from the words ───────────────────────
-- `esco_occupations` is the existing ESCO catalogue (3 039 occupations, whose
-- 401 811 localized labels live in `esco_labels` and already serve the wired
-- `EscoTypeahead`). Nullable, and set ONLY from what the person picked.
-- `on delete set null`: if a concept ever leaves the catalogue, the person's
-- words survive it.
alter table public.worker_professions
  add column if not exists esco_occupation_id uuid
    references public.esco_occupations(id) on delete set null;

-- ── 4. A row names something ────────────────────────────────────────────────
-- Either the registry profession, or the person's words, or both. Validated
-- against 26 existing rows, all of which satisfy it via `profession_id`.
alter table public.worker_professions
  add constraint worker_professions_names_something
  check (profession_id is not null or nullif(btrim(label), '') is not null);

-- Bounded like the other free text a person writes about their own work
-- (`save_self_declared_work_history_v1` bounds its title 3..200).
alter table public.worker_professions
  add constraint worker_professions_label_len
  check (label is null or char_length(btrim(label)) between 2 and 200);

-- ── 5. The same words are not stored twice ──────────────────────────────────
-- Mirrors `unique (profile_id, normalized_label)` in both precedents.
-- The existing `unique (worker_id, profession_id)` is NOT touched: NULLs are
-- distinct in Postgres, so it still forbids a duplicated registry profession
-- and does not stand in the way of several self-declared rows.
create unique index if not exists worker_professions_one_label
  on public.worker_professions (worker_id, normalized_label)
  where normalized_label is not null;

create index if not exists worker_professions_esco_occupation_idx
  on public.worker_professions (esco_occupation_id)
  where esco_occupation_id is not null;

-- ── 6. What these columns mean, at the source ───────────────────────────────
comment on column public.worker_professions.label is
  'The person''s own words for the profession or activity, stored verbatim and shown as typed. Present when they named something the registry does not carry. NEVER overwritten or displaced by a standardized match; a row with no match is a valid statement of what this person does.';

comment on column public.worker_professions.normalized_label is
  'Lowercased, trimmed `label` — a dedupe key only. Generated, never written by hand, never shown, and never a catalogue slug.';

comment on column public.worker_professions.esco_occupation_id is
  'The ESCO occupation the person themselves picked, when they picked one. A SEPARATE, additional link: it does not replace `label` and is never derived from skills, work history or anything else the person did not choose.';


-- ROLLBACK: see supabase/rollbacks/20260927053000_worker_self_declared_profession_v1.down.sql
