# OWNER GATE — structured problem reports on `language_feedback`

**Status:** proposal only. **Nothing in this document has been applied**, to any
environment. No migration file has been added to `supabase/migrations/`.

**Why it stops here:** the requested capability (report categories, device /
viewport context, screenshots) needs new columns. Adding columns is a schema
change, and schema changes are an owner gate.

---

## What already works (shipped, no migration)

`public.language_feedback` exists and is canonical:

| column | note |
|---|---|
| `id`, `created_at` | |
| `route` | captured automatically |
| `locale` | captured automatically |
| `selected_text` | the text the tester highlighted, ≤240 chars |
| `comment` | the tester's sentence |
| `user_id` | nullable — anonymous reporting is already permitted by RLS |
| `status` | `open` / `reviewed` / `fixed` / `dismissed` |

Admin inbox: `/[locale]/dashboard/admin/language-feedback`. RLS: insert for
self-or-anonymous, select `is_admin()` only.

Two defects were repaired without touching the schema (PR #1081): the trigger is
now findable and tappable, and the write no longer depends on an admin-only
read-back. **A tester can report a problem today** — as free text, with route and
locale attached.

## What is missing, and why it needs columns

The owner asked for reports that can later be **grouped**: which pages generate
most reports, which locale has most translation problems, mobile vs desktop,
worker vs employer. Free text cannot answer those questions reliably. That
requires real columns — encoding a category as a prefix inside `comment` would
be exactly the decorative implementation the brief warns against.

### Proposed forward migration

```sql
-- supabase/migrations/<timestamp>_language_feedback_structured_reports.sql

-- 1. Report category. Nullable + no default: existing rows are honestly
--    "uncategorised", never silently relabelled as something they were not.
alter table public.language_feedback
  add column if not exists category text;

alter table public.language_feedback
  add constraint language_feedback_category_check
  check (category is null or category in (
    'broken',        -- Neveikia / klaida
    'unclear',       -- Neaišku / nepatogu
    'wrong_info',    -- Neteisinga informacija
    'translation',   -- Vertimo / kalbos klaida
    'layout',        -- Vaizdo / mobiliojo išdėstymo problema
    'other'          -- Kita
  ));

-- 2. What the tester expected (optional free text).
alter table public.language_feedback
  add column if not exists expected_result text;

-- 3. Safe diagnostic context. ONE jsonb column rather than a column per
--    field, so adding a diagnostic later is not another owner gate.
--    Whitelisted server-side; see "Privacy" below.
alter table public.language_feedback
  add column if not exists context jsonb not null default '{}'::jsonb;

-- 4. Grouping indexes for the questions this exists to answer.
create index if not exists idx_language_feedback_category_created
  on public.language_feedback (category, created_at desc);
create index if not exists idx_language_feedback_locale_category
  on public.language_feedback (locale, category);
```

### Rollback

```sql
drop index if exists public.idx_language_feedback_locale_category;
drop index if exists public.idx_language_feedback_category_created;
alter table public.language_feedback drop constraint if exists language_feedback_category_check;
alter table public.language_feedback drop column if exists context;
alter table public.language_feedback drop column if exists expected_result;
alter table public.language_feedback drop column if exists category;
```

### Data impact

- **Additive only.** No column is dropped, renamed, retyped, or backfilled.
- Existing rows keep `category = NULL` (uncategorised) and `context = '{}'`.
- No RLS change: the existing insert/select policies cover the new columns.
- No lock of consequence — `ADD COLUMN` with a constant default is metadata-only
  on modern Postgres; the table is small in any case.
- Reversible with no data loss for rows written before it.

## Privacy — what `context` may and may not hold

**Whitelisted server-side**, so a client cannot widen it:

`viewport` (`{w,h}`) · `device_class` (`mobile`/`tablet`/`desktop`) ·
`ua_class` (browser family + major version, not the full UA string) ·
`workspace_kind` (`personal`/`organization` — the *kind*, never the org id) ·
`surface` (feature key) · `build` (commit sha) · `previous_route`.

**Never stored:** passwords, auth tokens, cookies, `Authorization` headers, API
keys, organisation or user identifiers beyond the existing `user_id` FK, message
contents, or any page data not explicitly listed above. The server builds
`context` from an allowlist and ignores everything else — the same shape as
`sanitizeDemandDraftPayload`, and it must be tested the same way (assert the
surviving object, not that a key appears in source).

## Screenshots — recommendation: not in v1

The brief allows skipping this if it would be fragile or privacy-risky. It
would be both: an in-page capture pulls in whatever is on screen, including
another party's data, and there is no existing image pipeline this can reuse
safely for arbitrary screen content. **Recommendation:** ship categories +
context first; revisit attachments only if real reports show they are needed.

## What is needed from the owner

1. Approve (or amend) the six categories and the `context` allowlist above.
2. Approve applying the migration — local first, then production.
3. Decide **D-10**: whether reporting should also be available on public /
   signup / login surfaces. RLS already permits anonymous inserts, so this is a
   mounting decision, not a schema one.

Once approved the UI work is small: a six-option selector, an optional
"what did you expect" field, and the server-side `context` builder — all inside
the existing widget and action.
