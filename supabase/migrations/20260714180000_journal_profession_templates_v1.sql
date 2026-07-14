-- ============================================================================
-- DRAFT — needs-human-gate — DO NOT APPLY automatically.
-- Apply ONLY via Supabase MCP apply_migration after explicit owner approval.
-- Never `db push`.
--
-- 20260714180000 — journal profession templates v1 (Journal Proof Engine,
-- Sprint v2 §3 "future profession templates").
--
-- PROBLEM: the journal composer's structured entry has no per-profession
-- scaffolding — a tiler, a driver and a cleaner all start from the same blank
-- textarea. The owner requirement names profession templates as a journal
-- mode; doctrine §10 forbids hardcoding them as UI enums.
--
-- SOLUTION: ONE §10 slug registry table `journal_profession_templates`.
-- Templates are DATA (slug + optional profession scope + a bounded
-- field_schema jsonb the composer interprets), so new professions get
-- templates without a code deploy. Every seed ships `active = false` — the
-- OWNER activates a template deliberately; until then the composer shows
-- NOTHING for it (honest absence, §18 — no RUOŠIAMA banner needed because an
-- inactive template is simply not offered).
--
-- field_schema contract (interpreted by
-- apps/web/lib/journal/journal-templates-model.ts — parse errors degrade to
-- "template ignored", never a crash):
--   {
--     "default_unit_slug": "<productivity_units slug>",
--     "scaffold": { "<locale>": ["line 1", "line 2", ...], ... }
--   }
-- The scaffold lines prefill the composer's TEXT (worker edits them freely —
-- user-authored content stays user-authored); the default unit preselects the
-- quantity unit in review. No new metric kinds, no second write path.
--
-- RLS: authenticated users read ACTIVE rows only (+ admin reads all);
-- writes are admin-only (owner activates via admin tooling / SQL).
--
-- ABUSE BOUNDS: slug format CHECK, field_schema size CHECK (≤ 8 KB),
-- profession_slug references professions(slug) when present.
--
-- COMPATIBILITY / BACKFILL: none — new table, no existing readers. The
-- consumer layer lands repo-safe and degrades honestly via 42P01 until this
-- is applied. No existing rows are touched.
--
-- ROLLBACK: paired supabase/rollbacks/20260714180000_journal_profession_templates_v1.down.sql
--
-- POST-APPLY VERIFICATION:
--   select slug, active from journal_profession_templates;      -- 3 rows, all false
--   -- as a normal authenticated user:
--   select count(*) from journal_profession_templates;          -- 0 (none active)
--   update journal_profession_templates set active = true;      -- permission denied
--   + APPLIED_LEDGER.md row.
--
-- @human-gate-approved — TIER: owner-gated (new table + RLS + grants =
-- RED-class by the migration-safety classifier; the OWNER applies manually).
-- ============================================================================

begin;

create table if not exists public.journal_profession_templates (
  slug            text primary key
    check (slug ~ '^[a-z0-9_]{3,60}$'),
  profession_slug text references public.professions(slug),
  field_schema    jsonb not null default '{}'::jsonb
    check (pg_column_size(field_schema) <= 8192),
  active          boolean not null default false,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists journal_profession_templates_profession_idx
  on public.journal_profession_templates (profession_slug)
  where active;

alter table public.journal_profession_templates enable row level security;

-- Authenticated read of ACTIVE templates only; admin sees drafts too.
drop policy if exists journal_profession_templates_select
  on public.journal_profession_templates;
create policy journal_profession_templates_select
  on public.journal_profession_templates for select
  using (active or public.is_admin());

-- Owner-only (admin) writes — activation is a deliberate owner action.
drop policy if exists journal_profession_templates_write
  on public.journal_profession_templates;
create policy journal_profession_templates_write
  on public.journal_profession_templates for all
  using (public.is_admin()) with check (public.is_admin());

grant select on public.journal_profession_templates to authenticated;
grant insert, update, delete on public.journal_profession_templates to authenticated;

-- ── Seeds — 3 REAL daily-report templates, ALL inactive (owner activates) ───
-- Unit slugs come from the applied productivity_units registry (0017):
-- square_meters / pieces / hours. Scaffold locales mirror the launch set.

insert into public.journal_profession_templates (slug, profession_slug, field_schema, active) values
  (
    'construction_daily',
    null,
    '{
      "default_unit_slug": "square_meters",
      "scaffold": {
        "lt": ["Objektas / aikštelė: ", "Atlikti darbai: ", "Kiekis (m2 / vnt.): ", "Valandos: ", "Medžiagos / įrankiai: ", "Pastabos / sauga: "],
        "en": ["Site / object: ", "Work performed: ", "Quantity (m2 / pcs): ", "Hours: ", "Materials / tools: ", "Notes / safety: "],
        "ru": ["Объект / площадка: ", "Выполненные работы: ", "Количество (м2 / шт.): ", "Часы: ", "Материалы / инструменты: ", "Замечания / безопасность: "],
        "nl": ["Locatie / object: ", "Uitgevoerd werk: ", "Hoeveelheid (m2 / st.): ", "Uren: ", "Materialen / gereedschap: ", "Opmerkingen / veiligheid: "],
        "de": ["Baustelle / Objekt: ", "Ausgeführte Arbeiten: ", "Menge (m2 / Stk.): ", "Stunden: ", "Material / Werkzeug: ", "Anmerkungen / Sicherheit: "]
      }
    }'::jsonb,
    false
  ),
  (
    'transport_daily',
    null,
    '{
      "default_unit_slug": "hours",
      "scaffold": {
        "lt": ["Maršrutas (iš – į): ", "Krovinys / užduotis: ", "Reisai (vnt.): ", "Valandos: ", "Pastabos (technika, laukimas): "],
        "en": ["Route (from – to): ", "Load / task: ", "Trips (count): ", "Hours: ", "Notes (vehicle, waiting): "],
        "ru": ["Маршрут (от – до): ", "Груз / задание: ", "Рейсы (шт.): ", "Часы: ", "Замечания (техника, ожидание): "],
        "nl": ["Route (van – naar): ", "Lading / taak: ", "Ritten (aantal): ", "Uren: ", "Opmerkingen (voertuig, wachttijd): "],
        "de": ["Route (von – nach): ", "Ladung / Aufgabe: ", "Fahrten (Anzahl): ", "Stunden: ", "Anmerkungen (Fahrzeug, Wartezeit): "]
      }
    }'::jsonb,
    false
  ),
  (
    'cleaning_daily',
    null,
    '{
      "default_unit_slug": "square_meters",
      "scaffold": {
        "lt": ["Objektas / patalpos: ", "Atlikti darbai: ", "Plotas (m2): ", "Valandos: ", "Priemonės: ", "Pastabos: "],
        "en": ["Site / premises: ", "Work performed: ", "Area (m2): ", "Hours: ", "Supplies used: ", "Notes: "],
        "ru": ["Объект / помещения: ", "Выполненные работы: ", "Площадь (м2): ", "Часы: ", "Средства: ", "Замечания: "],
        "nl": ["Locatie / ruimtes: ", "Uitgevoerd werk: ", "Oppervlakte (m2): ", "Uren: ", "Middelen: ", "Opmerkingen: "],
        "de": ["Objekt / Räume: ", "Ausgeführte Arbeiten: ", "Fläche (m2): ", "Stunden: ", "Mittel: ", "Anmerkungen: "]
      }
    }'::jsonb,
    false
  )
on conflict (slug) do nothing;

commit;

-- ════════════════════════════════════════════════════════════════════════════
-- DOWN (manual rollback — run by hand or via
-- supabase/rollbacks/20260714180000_journal_profession_templates_v1.down.sql):
--   drop table if exists public.journal_profession_templates;
-- ════════════════════════════════════════════════════════════════════════════
