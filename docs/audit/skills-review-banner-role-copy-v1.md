# Skills review banner + role-noun copy sweep v1

**Branch:** `fix/cc/skills-review-banner-role-copy-v1`
**Date:** 2026-06-15
**Builds on:** #413 (core-UX; merge `d3dcd1e` in main). No-schema follow-up.
**Constraints:** no DB migration / Supabase apply / auth / billing / payments /
DNS / env / secrets / Vercel settings; no fake data; SEO (#410/#411/#412) untouched.

## 1 — Skills review banner (honest "needs review")
- `components/app/skills-review-banner.tsx` — warning-tone banner, **hidden when
  count ≤ 0**. Says "needs review" (never "verified"); shows the REAL count from
  `deriveSkillEvidence().unsupported` (declared skills not yet backed by work
  evidence, incl. unmapped free-label claims) — no fabricated numbers. CTA →
  `/dashboard/profile#profile-edit`.
- `app/[locale]/dashboard/profile/page.tsx` renders it after `ProfileHubOverview`
  when `workerId && unsupported > 0`.
- i18n `skills.reviewBanner.{title,body,cta}` in en/lt/ru (top-level `skills`
  namespace the profile page consumes).

Copy:
- **LT:** "Dalis įgūdžių laukia peržiūros" / "Kai kurie įrašai dar nėra aiškiai
  suklasifikuoti. Papildykite informaciją arba peržiūrėkite įgūdžius…" / "Peržiūrėti įgūdžius"
- **EN:** "Some skills need review" / "Some entries are not clearly classified yet.
  Review or add more information…" / "Review skills"
- **RU:** "Часть навыков ожидает проверки" / "Некоторые записи ещё не классифицированы
  чётко…" / "Просмотреть навыки"

## 2 — Role-noun copy sweep (agency/buyer are not separate products)
Reframed silo "space/erdvė/пространство/workspace" labels → action/capability framing
(copy only — NO backend enum / DB / role-key change):

| Key | Before (lt / en / ru) | After (lt / en / ru) |
|-----|------|------|
| `spaces.agency.name` | Agentūros erdvė / Agency space / Пространство агентства | Partnerio paslaugos / Partner services / Партнёрские услуги |
| `spaces.buyer.name` | Pirkėjo erdvė / Buyer space / Пространство покупателя | Mano užklausos / My requests / Мои запросы |
| `roleDashboards.agency.eyebrow`+`title` | AGENTŪROS ERDVĖ / "Agentūros darbo erdvė" (+en/ru) | PARTNERIO PASLAUGOS / "Partnerio paslaugos — siūlykite darbuotojus ir komandas" (+en/ru) |
| `roleDashboards.buyer.eyebrow`+`title` | PIRKĖJO ERDVĖ / "Pirkėjo darbo erdvė" (+en/ru) | MANO UŽKLAUSOS / "Mano užklausos" (+en/ru) |

Subtitles updated to state plainly these are an **entry point / action, not a
separate product**. The `staffing_agency` company type + the existing copy
"Personalo agentūra — tai veikimo modelis, ne atskiras pasaulis" stay as-is.

## 3 — Guard / test
- `lib/guards/role-no-silo-framing.test.ts` — for lt/en/ru: `spaces.{agency,buyer}.name`
  and `roleDashboards.{agency,buyer}.title` carry NO silo framing; `skills.reviewBanner`
  exists and is honest ("needs review", not "verified"); banner is wired into the profile
  page and self-hides at count 0.
- `lib/guards/room-based-account-spaces.test.ts` — updated the one pinned
  `spaces.agency.name` assertion to the new framing (intent preserved: agency ≠ buyer).

## 4 — Validation
`typecheck` ✅ · `lint` ✅ · `test` ✅ (277 files / 4011 tests) · `build` ✅ ·
`check:public-seo-indexing` ✅ (SEO intact). i18n active-locale parity preserved (lt/en/ru).

## Left for next PR
Company legal-change RED draft (additive migration + RLS + admin verification queue);
localization NL/DE/DA/NO/SV/FI.
