# OWNER GATE — canonical message-language set (one consolidated CHECK widening)

> **RESOLVED / APPLIED 2026-09-17 (CORRECTED).** The owner APPROVED RED-1
> (add `uk` + `ka`). The single consolidated migration
> `supabase/migrations/20260917140000_widen_original_language_uk_ka.sql` was
> applied to production `gorgitwvdzxbnaxhrsrw` via Supabase MCP `apply_migration`
> (ledger `20260917112002`); all four `original_language` CHECKs are validated
> with `uk`+`ka`. See `docs/APPLIED_LEDGER.md`. The UI≠communication separation
> lives in `apps/web/lib/i18n/config.ts` `communicationLocales`. Everything
> below is the original decision packet (history), and its "NOT applied" wording
> is superseded by this banner.

Date: 2026-09-17 · Class: **RED (schema change)** · Status: **APPROVED + APPLIED 2026-09-17 (was: awaiting owner decision, NOT applied)**

The multilingual communication capability (#1753) is language-agnostic in code:
any author locale is preserved, any viewer renders in their own locale through
the egress-gated runtime, with the original always kept. The ONE internal limit
left is the database: the `original_language` CHECK admits only today's declared
product set, so any language outside it is stamped `NULL` on write (the language
is lost) rather than preserved.

This packet asks for ONE decision — the complete canonical set — realised by ONE
migration across every table that carries the constraint. It is deliberately not
one migration per language.

## The drift is already closed in code (GREEN, this PR)

- `sendMessage` no longer hardcodes a locale list; it derives the accepted set
  from `lib/i18n/config.ts` `locales` (the product's declared set).
- `lib/guards/message-language-set.test.ts` fails if `locales`, the send path,
  or the live CHECK on any of the four tables ever diverge again. So widening
  the set is now: add the locales to `locales`, apply this migration — and the
  guard keeps them in lockstep.

## CURRENT state (verified on the local stack, 2026-09-17)

CURRENT CHECK (identical on all four tables):

```
original_language IS NULL OR original_language IN
  ('en','lt','lv','et','nl','de','da','no','sv','pl','ru')   -- 11 locales
```

Tables carrying it: `conversation_messages`, `journal_entries`,
`organization_evidence_records`, `candidate_skills`. (`customer_requests` also
has an `original_language` column but no CHECK.) All columns are `char(2)` or
`text` — a two-letter `ka`/`uk` fits with no type change.

| Layer | Set | Notes |
|---|---|---|
| Product locales (`lib/i18n/config.ts` `locales`) | 11: en,lt,lv,et,nl,de,da,no,sv,pl,ru | declared set |
| Reachable UI (`activeLocales`) | 5: lt,en,ru,nl,de | routed; owner P0 override 2026-05-28 |
| Author message language (route locale) | = activeLocales (5) in practice | you can only author in a routed locale |
| DB `original_language` CHECK (×4 tables) | 11 = `locales` | aligned, no drift |
| Translation resolver / DeepL target map | language-agnostic | any 2-letter locale |
| Providers (`translate_message`) | DeepL → Gemini/Anthropic LLM tiers | all EXTERNAL, egress-grant gated |

**Georgian `ka` / Ukrainian `uk`:** not in `locales`, not routed, not in the
CHECK → an author in those languages is stamped `NULL`. They are **not product
locales today**; making them supported is this decision.

## PROPOSED CHECK (one migration, all four tables)

```
original_language IS NULL OR original_language IN
  ('en','lt','lv','et','nl','de','da','no','sv','pl','ru','uk','ka')
```

**Languages added:** `uk` (Ukrainian), `ka` (Georgian) — the two workforce
languages named by the owner. The exact final set is the owner's to confirm; add
or remove codes in the one list below and `locales` together.

- **Backward compatibility:** additive only. Every value valid today stays
  valid; no existing row changes; `NULL` still allowed. Writes that previously
  degraded to `NULL` for `ka`/`uk` will preserve the language once the code set
  (`locales`) also includes them.
- **RLS impact:** none. No policy is created, dropped or altered.
- **Authority impact:** none. Participant-only visibility is unchanged; nothing
  about who may read/write a message changes.
- **Data-migration impact:** none. A CHECK widening rewrites no rows; the
  constraint is added `NOT VALID` then `VALIDATE`d (the existing repo pattern,
  see `20260612130000_widen_original_language_ru.sql`), which does not lock the
  table against writes.
- **Rollback:** drop the widened constraint and restore the 11-locale one
  (safe only while no row uses `ka`/`uk`; the rollback block asserts this).
- **Provider coverage per added language:** `uk` — DeepL supports Ukrainian
  directly; `ka` — DeepL does not, so the chain falls through to the LLM tier
  (Gemini/Anthropic), which translates it. Both are EXTERNAL: nothing is
  produced without the owner egress grant for `translate_message` + a provider
  key (the separate gate in `OWNER_GATE_MULTILINGUAL_COMMUNICATION_2026-09-17.md`).
  Until then every message shows the original + a language badge — which is why
  adding `ka`/`uk` to the CHECK is safe and useful on its own: it preserves the
  ORIGINAL correctly even before any translation is switched on.

## The migration (DRAFT — do not apply; owner-gated)

Naming: `YYYYMMDDHHMMSS_widen_original_language_uk_ka.sql`. One statement per
table, each `NOT VALID` then `VALIDATE`, plus a rollback block. Apply via
Supabase MCP `apply_migration` after approval — never `db push`.

```sql
-- @human-gate-approved  (RED: schema change; owner approval required before apply)
-- Widen the canonical message-language set to the approved locale set in ONE
-- operation across every table that carries the original_language CHECK.
-- Additive, reversible, no row rewrite, no RLS/authority change.

do $$
declare t text;
begin
  foreach t in array array[
    'conversation_messages','journal_entries',
    'organization_evidence_records','candidate_skills'
  ] loop
    execute format('alter table public.%I drop constraint if exists %I', t, t||'_original_language_chk');
    execute format('alter table public.%I drop constraint if exists %I', t, t||'_original_language_check');
    execute format($f$alter table public.%I add constraint %I
      check (original_language is null or original_language in
        ('en','lt','lv','et','nl','de','da','no','sv','pl','ru','uk','ka')) not valid$f$,
      t, t||'_original_language_chk');
    execute format('alter table public.%I validate constraint %I', t, t||'_original_language_chk');
  end loop;
end $$;

-- ROLLBACK (safe only while no row uses 'uk'/'ka'):
-- do $$
-- declare t text; n bigint;
-- begin
--   foreach t in array array['conversation_messages','journal_entries',
--     'organization_evidence_records','candidate_skills'] loop
--     execute format('select count(*) from public.%I where original_language in (''uk'',''ka'')', t) into n;
--     if n > 0 then raise exception 'rollback blocked: %.original_language has % uk/ka rows', t, n; end if;
--     execute format('alter table public.%I drop constraint if exists %I', t, t||'_original_language_chk');
--     execute format($f$alter table public.%I add constraint %I
--       check (original_language is null or original_language in
--         ('en','lt','lv','et','nl','de','da','no','sv','pl','ru')) not valid$f$, t, t||'_original_language_chk');
--     execute format('alter table public.%I validate constraint %I', t, t||'_original_language_chk');
--   end loop;
-- end $$;
```

## After approval (the coherent, non-repeating path)

1. Owner confirms the final set (this proposal: +`uk`,+`ka`).
2. Add the same codes to `lib/i18n/config.ts` `locales` (GREEN) — the drift
   guard then requires the CHECK to match, so both move together.
3. Apply this ONE migration via MCP `apply_migration`.
4. A new UI locale additionally needs its `messages/<locale>.json` and, to be
   *reachable*, an entry in `activeLocales` — those are separate GREEN content
   changes, independent of this constraint.

## Extensibility note (report only — not part of this decision)

A CHECK constraint means each future set-change is a migration. A lower-churn
alternative is a `supported_message_languages` reference table with an FK from
`original_language`, so adding a locale becomes one INSERT (still owner-gated by
who may write that table). That is a larger schema change and is **not proposed
here** — flagged for a future owner decision, not implemented.
