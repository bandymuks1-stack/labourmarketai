# Piloto feedback peržiūros procesas (LT)

Skirta savininkui / adminams. Trumpas vaikščiojimo planas — ką žiūrėti, kuria seka, kaip nepasimesti, kai pirmieji 5–10 testuotojų pradės gauti įrašus.

## Kiekvieną dieną — 15 min

### 1. Language feedback inbox (3 min)
**Kur:** `/lt/dashboard/admin/language-feedback`

Skaitykite chronologiškai (naujausi viršuje). Grupuokite mintyse pagal:
- **Tas pats pažymėtas tekstas iš skirtingų testuotojų** → realus signalas. Į PR.
- **Vienkartinis painumas** → palaukti dar 1–2 raportų.

Veiksmas:
- Atidarykite naują PR `fix(copy): <route>` su konkrečiu LT/EN pakeitimu.
- Status flips (`open` → `reviewed` / `fixed`) v1 dar nepalaikoma — tiesiog susižymėkite mintyse / Linear.

### 2. Pilot telemetry (5 min)
**Kur:** `/lt/dashboard/admin/pilot-telemetry`

Žiūrėkite tris paneles ta tvarka:

**A. Top error codes** — jei kurio nors `error_code` count > 3 ir tas kodas nėra žinomas (`unit_slug_unknown`, `not_owner`, ...) — atidarykite tyrimą. Kiekvienas kodas tiesiogiai nurodo failą:
- `unit_slug_unknown` → `productivity_units` seedas (jau apsaugotas 0017).
- `entry_insert_failed` → schema constraint arba RLS.
- `metrics_insert_failed` → metric row pre-validation arba atomic RPC (0017).
- `exchange_failed` → Google PKCE race (PR #59 + #66 jau apsaugo).

**B. Task summary** — kokią užduotį testuotojai pradeda + nebaigia (`started` >> `success`)? Tai yra tikras "kur nusivilia" signalas. Atidarykite tos užduoties UI ir bandykite atkurti.

**C. Recent events** — paskutiniai 200. Skenuokite akimi į `error_code` stulpelį.

### 3. Work Journal unknown phrases (3 min)
**Kur:** prod DB tiesiogiai (admin SELECT per RLS) — kol kas neturi atskiros UI lapo.

SQL (paleisti per MCP `execute_sql` arba Supabase SQL editor):

```sql
select value_text, count(*) as n
from public.journal_entry_metrics
where metric_slug = 'unknown_phrase'
group by value_text
order by n desc
limit 30;
```

Reading the result:
- `value_text` formatas: `<fragment_idx>|<raw phrase>|<user's clarification label>`.
- Jei tas pats raw phrase pasikartoja ≥3 kartų su panašiomis etiketėmis — kandidatas į naują `ACTIVITY_HINTS_LT` įrašą (kitam PR).
- **Niekada auto-promote.** Kiekvienas naujas activity entry per žmogaus sprendimą + PR.

### 4. Company/agency/buyer draft signals (2 min)
**Kur:** `/lt/dashboard/admin` (drafts panel) + `/lt/dashboard/admin/pilot-telemetry` paieška pagal `*_draft_saved` event_name.

Žiūrėkite:
- Kiek juodraščių saugomi vs kiek pradedami (jei `task_start` instrumented future v2).
- Top `draft_type` — kuri rolė turi daugiau aktyvių testuotojų.

### 5. Top issues — savaitės gale (2 min)
Sudėkite į vieną `docs/owner/pilot_weekly_brief_YYYY-MM-DD.md`:
- Top 3 raportuoti tekstai.
- Top 3 task error codes.
- Top 3 unknown phrase clusters.
- Savaitės naujų testuotojų prisijungimų skaičius.
- Vienas konkretus next-step PR kandidatas.

## Eskalacija

| Signalas | Veiksmas |
|---|---|
| `exchange_failed` count > 5 / dieną | Tikrinkite Supabase auth dashboard + Google OAuth client allowlist (PR #66 audit doc) |
| `unit_slug_unknown` count > 0 po 0017 apply | Patikrinkite, ar 0017 tikrai pritaikytas (`mcp__claude_ai_Supabase__list_migrations`) |
| Kokia nors RLS klaida (`new row violates row-level security`) | Atidarykite incident; tikrinkite, ar koks PR nepratempė į prod be migration |
| Privatumo pranešimas iš testuotojo ("kodėl jūs matote mano CV?") | Atsiliepti per 24h. Ne per "Pranešti apie tekstą" — tiesiogiai. |

## Ko neperžiūrėti

- **Vartotojų asmeniniai tekstai** (`journal_entries.original_text`, `profiles.profile_text`) — admin RLS leidžia, bet jūs **neskaitykite** jų be pateikto klausimo. Privatumo kontraktas.
- **Telemetrijos metadata kaip kalbinis signalas** — ten yra tik skaitliukai, ne tekstas. Tikras tekstas yra `language_feedback.selected_text + comment`.
- **PR #18 nepaliesti.**
