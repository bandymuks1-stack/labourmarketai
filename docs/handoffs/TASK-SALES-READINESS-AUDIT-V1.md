# TASK: Sales-readiness auditas + PR seka — v1

**Author:** Claude Code (`claude/labourmarket-sales-readiness-b8cdb`)
**Date:** 2026-05-26
**Status:** Audit + plan only — no code in this PR
**Scope:** Užfiksuoti, ką realiai reiškia "pardavimo lygmuo" pagal `docs/PLATFORM_DOCTRINE.md`, kas dabar yra, ko trūksta, ir sudaryti konkrečią PR seką iki to lygmens.

> 📜 Susijusi doktrina: §1 (smaller party), §3 (legal proof), §4 (default-closed), §7 (AI-never-lies), §10 (Lego), §15 (skill trust). Auditas nepažeidžia nei vienos sekcijos — kur randa konfliktą su esama trajektorija, eksplicitiškai jį pažymi.

---

## 1. Ką šiame projekte reiškia "pardavimo lygmuo"

Pagal `docs/sales/README.md` ir `docs/policies/organization-profile-creation-policy-v1.md`, "pardavimo" ar "mokamo tier" lygmuo platformoje **nėra** įprastas SaaS launch. Jis turi konkrečius doktrininius reikalavimus:

1. **Joks fake "verified" / "AI" / "matching".** Visi trust signalai turi turėti realią žmogaus arba registry-pagrįstą kilmę (§7, §15).
2. **Org Tier-2 rekvizitai.** Joks subjektas negali atlikti rimto veiksmo (paskelbti realios užduoties, susisiekti su realiu darbuotoju, sukurti įsipareigojimo) prieš tai pateikęs šalies, juridinio vardo, registracijos kodo, korespondencinio adreso, atstovo vaidmens (`docs/policies/organization-profile-creation-policy-v1.md` §Tier 2).
3. **Manager confirmation backbone.** Skills/journal entries kelias iki "išorinio patvirtinimo" turi būti realiai įgyvendintas (PR #18 blokuojamas; `TASKS.md` nuoroda).
4. **Contextual fit signals, ne OVR.** Jokio universalaus 0–99 score; signalai per-kontekstu (`docs/CONTEXTUAL_FIT_SIGNALS.md`).
5. **Pricing, kuris nemeluoja.** Pilot = nemokama. Mokamas tier reikalauja org Tier-2 + manager confirmation; jokio "free trial" be rekvizitų.
6. **Privacy + audit.** §3.4 audit_log ir §3.3 hash chain veikia visiems mokamo srauto rašymams.
7. **No mass outreach, no scraped lists** (`docs/sales/README.md` honesty rules).

Trumpai: **"pardavimo lygmuo" ≠ landing puslapis su "Subscribe Now".** Tai sluoksnių rinkinys, kurio pagrindas — Tier-2 rekvizitai + manager confirmation + sąžiningi signalai. Be jų pardavimas pažeistų doktriną.

---

## 2. Esama būklė — sąžiningas snapshot (2026-05-26)

Šaltiniai: `docs/owner/pilot_start_readiness_final_v1.md`, `TASKS.md`, migracijos `0001`–`0021`, `docs/audit/organization-profile-creation-gap-audit-v1.md`.

### Gyva produkte (pilot lygmuo)
- ✅ Google OAuth + PKCE stabilus (PR #66).
- ✅ Work Journal v4 (atomic save RPC, correction lifecycle 0017–0018).
- ✅ Profile skill claims su sąžiningu disclaimer'iu (0015).
- ✅ Admin pilot panel + agent-os + visibility guard (#74, #72).
- ✅ Communication v1 (conversations / participants / conversation_messages — 0021).
- ✅ Pilot drafts (org `company` / `agency` / `buyer` private drafts — 0016).
- ✅ Pilot telemetry + language feedback (0019, 0020).
- ✅ Sales packaging dokai (`docs/sales/`) — bet tik šaltų laiškų šablonai.

### Egzistuoja docs/handoffs, **dar nepasidarius kodu**
- ❌ PR #10b — `0014` security hardening delta (`TASK-PR10B-0014-HARDENING-SPEC.md`, *pending implementation review*).
- ❌ PR #11 — Universal Work Journal UI + API (blokuojama PR #10b).
- ❌ PR #12 — Living CV Hub + entry-level confirmation.
- ❌ PR #13 — Dashboard redesign.
- ❌ PR #18 — Manager confirmation backbone (*standing block*).

### Nepradėta net dokumentuotai
- ❌ **Org Tier-2 rekvizitai migracija + UI gate** (auditas `organization-profile-creation-gap-audit-v1.md` slices B + C — niekas neimplementuota).
- ❌ **Pricing puslapis** (jokio `/pricing` route).
- ❌ **Mokėjimų integracija** (jokios infrastruktūros, jokio provider sprendimo).
- ❌ **VAT / sąskaitų išrašymas / sutartys**.
- ❌ **Public posting surface** (joks darbdavys negali viešai paskelbti darbo užduoties).
- ❌ **OVR → contextual fit signals reframe** (`TASKS.md` *blocker before any scoring ships*).
- ❌ **Risk signal catalog implementation** (Workstream G — docs only first).
- ❌ **Multi-country per organisation** (`organization_countries` sibling table — `organization-profile-creation-gap-audit-v1.md` §Multi-country).

### Neaišku / dar nesvarstyta
- ❓ Subscription model vs. transaction fee vs. flat — sprendimas niekada nepriimtas formaliai.
- ❓ Kas pirmieji mokami klientai — įmonės, agentūros ar pirkėjai? Marketing teisus visiems trims, monetizacija reikalauja vieno fokuso.
- ❓ Apmokestinimo jurisdikcija — LT VAT vienąsyk, ar ES OSS / B2B reverse-charge nuo dienos pirmos? Tai blokuoja sąskaitų išrašymo dizainą.

---

## 3. Gap matrix — kas yra vs. ko reikia "pardavimui"

| Sluoksnis | Reikalavimas | Dabar | Trūksta |
|---|---|---|---|
| **Org identity** | Tier-2 rekvizitai (šalis, juridinis vardas, reg. kodas, adresas, atstovas) | Tik `organizations.legal_name/country/vat_number` (visi nullable) | `registration_code`, `correspondence_address` (jsonb), `representative_role`, `organization_countries` lentelė |
| **Org gate** | Niekas neatlieka "rimto" veiksmo be Tier-2 | Niekas — visi veiksmai pilot | UI gate'as visiems formaliems veiksmams + status banner |
| **Trust signals** | Manager confirmation realiai keičia entry būseną | Tik claim'ai be confirmation; PR #18 blokuotas | Confirmation RPC + audit_log row + RLS pakeitimai |
| **Scoring** | Contextual fit signals (Types 1–4) per-kontekstu | Jokio scoring; OVR marketing copy egzistuoja kaip "concept" | Reframe arba pilnas pašalinimas iki kol pasiruošta |
| **Pricing** | Sąžiningas /pricing puslapis | Nėra | Public page, kuriame pilot=free, paid=Tier-2 required, no fake features |
| **Mokėjimai** | Subscription/invoice infrastruktūra | Nėra | Decision doc + provider pick + reg. integration (out of scope sales-readiness audit'ui) |
| **Public posting** | Įmonė gali paskelbti realią užduotį | Nėra surface | Naujas modulis (didelis darbas, sąmoningai atidedame) |
| **Audit** | §3.4 audit_log + §3.3 hash chain | Schema egzistuoja journal/chat, audit_log nepilnai naudojamas | Audit_log writes ant org-state pokyčių (Tier-1→Tier-2 promotion) |
| **Risk signals** | Catalog implementation | Tik docs (`risk_signal_catalog_v1.md`) | DB lentelės + admin surface |
| **Pilot → real promotion** | Org tester gali pereiti iš pilot draft į real org profile | Tas pats `pilot_drafts` row stays private | Promotion RPC + įsipareigojimų stop banner |

---

## 4. Doktrinos kelias iki pardavimo — kas yra blokeris, kas yra preferable

### Blokeriai (be šių parduoti neteisėta / nesąžininga)
1. **Org Tier-2 rekvizitai** — be jų neaišku, kas perka. Pažeidžia `organization-profile-creation-policy-v1.md`.
2. **Manager confirmation backbone (PR #18)** — be jo "verified" / "patvirtinta" yra fake (§7).
3. **OVR copy reframe arba pašalinimas** — be jo bet koks scoring UI pažeidžia §10 ir `CONTEXTUAL_FIT_SIGNALS.md`.
4. **Sąžiningas /pricing puslapis** — be jo žmogus nežino, ką perka.
5. **Audit_log writes ant Tier-2 promotion** — §3.4 reikalavimas.

### Preferable (geriau iki, bet ne formaliai blokuoja)
6. **Public posting surface** — be jo įmonė neturi kur "rimtai" naudotis. Galima parduoti "early access", bet vertingumo kreivė plokščia.
7. **Risk signal catalog impl** — fraud risk kol kas bounded (mažas mastas), bet auga su masto didėjimu.
8. **Multi-country per org** — relevant LT+LV+PL kontekstui, ne LT-only piloto pradžiai.

### Out of scope sales-readiness auditui
9. Mokėjimų provider'is, VAT, sąskaitų išrašymas — atskiras decision doc reikalingas, neapsisprendžiama auditui einant.
10. Universal architecture sequence (PR #10b→#13) — vyksta lygiagrečiai; kai kurie sluoksniai (Living CV) ne mokamo tier reikalavimas, bet stipriai padidina vertę.

---

## 5. Pasiūloma PR seka iki "pardavimo lygmens" (6 PR)

Visi non-destructive. Kiekvienas PR turi savo testus, doctrine conflict check ir draft PR. Sequence numeracija atskira nuo egzistuojančios PR #10b–#13 (jie lygiagrečiai vyksta universal architecture trajektorijoje).

### PR SR-1 — Org Tier-2 schema (migration 0022)
**Scope:** Tik schema. Jokio UI. Visi laukai nullable, kad esamų rows nelaužytume.

Migracija `supabase/migrations/0022_organization_tier2.sql`:
- `organizations.registration_code text null`
- `organizations.correspondence_address jsonb null` (`{country, city, line, postcode}`)
- `organizations.tier text not null default 'pilot' check (tier in ('pilot','tier2'))`
- `organizations.tier2_submitted_at timestamptz null`
- `organizations.tier2_promoted_by uuid references profiles(id) null`
- Nauja lentelė `organization_representatives (id, organization_id fk, profile_id fk, role text, granted_at, revoked_at null)` — RLS default-closed, §4.
- Nauja lentelė `organization_countries (organization_id fk, country_code references countries(code), presence_kind text, primary key (organization_id, country_code))`.
- Indeksai: `idx_organizations_tier`, `idx_org_reps_org`, `idx_org_countries_org`.
- RLS:
  - `organizations` select policy lieka, įdedame `org_representatives_select_own` + `_write_owner`.
  - Tier promotion **negali** vykti direct UPDATE — tik per `promote_organization_to_tier2(org_id, rekvizitai_jsonb)` SECURITY DEFINER RPC, kuris rašo audit_log row.
- Audit_log entry types: `org_tier2_submit`, `org_tier2_promote`, `org_rep_add`, `org_rep_revoke`.

**Testai:** `apps/web/lib/guards/org-tier2.test.ts` — schema invariants (NOT NULL gates, RLS policies, RPC presence). Naudoja jau egzistuojančią SQL grep + assert pattern (`pilot-drafts.test.ts` šabloną).

**Doctrine alignment:** §3.4 (audit_log), §4 (default-closed), §10 (`tier` slug; reg presence kind slug).

### PR SR-2 — Pre-role-switch copy + pilot draft banner
**Scope:** Pure copy + UI. Jokios schemos.

- `RoleSwitcher` tooltip arba modal'as prieš switch'ą į `company`/`agency`/`customer` workspace'ą — LT + EN copy iš `organization-profile-creation-gap-audit-v1.md` Slice A.
- `pilot_drafts` form'os virš bordered note: "Bandomas juodraštis — niekam nesiunčiamas, jokios pasekmės. Rimtam naudojimui pereisite į Tier-2 (rekvizitai)."
- `i18n` raktai pridėti į visus 10 locale failų (§2.4) — Tier-1 EN/LT žmogiškai, kiti 8 placeholder.

**Testai:** Vitest snapshot ant role-switcher modal'o; vienas guard testas, kad tekstai egzistuoja visuose 10 locale failuose.

**Priklausomybės:** Nepriklauso nuo SR-1. Galima daryti pirmiau / lygiagrečiai.

### PR SR-3 — Tier-2 onboarding UI (lygiagrečiai su SR-1, merged po SR-1)
**Scope:** Naujas route `/[locale]/dashboard/<role>/tier2`, kur `<role>` = `company` | `agency` | `buyer`.

- Form'a: country (jau iš `countries` slug registry), legal_name, registration_code (validation per šaliai — LT 9-skaitm., LV 11-skaitm. ir t.t.), correspondence_address (struct), representative role select (slug registry: `director` / `authorised_representative` / `employee` / `contractor`).
- Submit'as kviečia `promote_organization_to_tier2` RPC (SR-1).
- Sėkmingas promotion'as:
  - `tier='tier2'`, `tier2_submitted_at=now()`,
  - audit_log row,
  - org workspace banner pakeičia į "Tier-2 — rekvizitai pateikti, peržiūra rankinė".
- **No automatic verification**. Promotion = "rekvizitai pateikti", ne "patvirtinta". Admin gali patvirtinti rankiniu būdu (SR-4).

**Testai:** Playwright route'as `/lt/dashboard/company/tier2`; LT/EN copy testas; RPC kviečiamas server action'e (ne klientas tiesiogiai).

**Doctrine alignment:** §7 (jokio fake "verified"), §3.4 (audit row), §10 (representative role slug).

### PR SR-4 — Admin Tier-2 review surface
**Scope:** Admin route `/[locale]/dashboard/admin/organizations`, RLS gated `is_admin()`.

- Lista visų Tier-2 organizacijų — submitted/verified state.
- Per-org inspect page: rodo rekvizitai, audit_log entries (read-only).
- Admin action: `verify_organization_tier2(org_id, decision, notes)` RPC — rašo audit_log row + `tier2_verified_at` + `tier2_verified_by`. Pridėti šiuos du stulpelius SR-1 migracijoje (kad SR-4 nereikėtų atskiros migracijos).
- **No public "verified" badge** kol kas — verification statusas matomas tik admin'ui + org savininkui own settings page. §7 reikalauja, kad bet koks viešas "verified" turėtų realią žmogaus kilmę; čia ji yra (admin), bet UI badge — tai vėliau, kai bus matchmaking surface.

**Testai:** RLS guard'as, kad ne-admin neatidaro route; audit_log row testas po verify.

### PR SR-5 — Sąžiningas `/pricing` puslapis
**Scope:** Public route `/[locale]/pricing`.

- Trys tier'ai (LT + EN copy, sąžiningas):
  - **Pilot — nemokama.** Eksploravimas, privačūs juodraščiai, work journal asmeniniam naudojimui.
  - **Tier-2 — nemokama betoje.** Rekvizitai privalomi; vis dar nemokama, kol nėra public posting / matchmaking surface. Aiškiai pažymėta: "kai surfaces atsiras, mokestis bus aiškiai paskelbtas iš anksto, nesileidžiame į auto-billing".
  - **Paid (TBD).** Eksplicitiškai "TBD — kai matchmaking + manager confirmation bus produkcijoje, dvi savaitės iš anksto paskelbsime kainodarą. Jokio fake free trial."
- `docs/sales/README.md` rules: jokio "verified", jokio "AI matching", jokio guarantee.
- 10 locale failai (§2.4).

**Testai:** Snapshot LT+EN copy; guard, kad jokio žodyno "verified" / "AI-powered" / "guaranteed" pricing copy'je (regex check).

**Doctrine alignment:** §1 (smaller-party honesty), §7 (no fake AI claims).

### PR SR-6 — OVR / scoring copy reframe (LIETUVIŠKAI: privalomas blokeris)
**Scope:** Marketing copy + landing copy + tooltip copy.

- Visus likučius "OVR — 0–99 rating", "profile strength", "verified skills + OVR" reformuluoti į contextual fit signals language (`docs/CONTEXTUAL_FIT_SIGNALS.md` §6).
- Jokio universal score niekur — tik per-kontekstu su evidence source.
- Skill chip badge'as: "Iš jūsų aprašymo" / "Iš darbų žurnalo" / "Patvirtino vadovas" (kai PR #18 atsiras). Nieko daugiau.

**Testai:** Guard regex test'ai apsaugo nuo `OVR` / `score 0-99` / `profile strength` / `verified skills + OVR` reintrodukcijos.

**Priklausomybės:** Nepriklauso nuo kitų SR-PRs. Galima daryti **pirmiau** — tai švariausias quick-win, mažiausia rizika.

---

## 6. Suggested order

```
SR-6 (copy reframe)         ─┐
SR-2 (role-switch warning)  ─┼─► non-coupled, paraleliai
                             │
SR-1 (Tier-2 migration 0022)─┤
                             ├─► SR-3 (Tier-2 onboarding UI) ─► SR-4 (admin review)
                             │
SR-5 (pricing page)         ─┘
```

Greičiausias kelias iki "galiu sąžiningai bandyti parduoti":
1. SR-6 (paralel — copy ne-lygina)
2. SR-2 (paralel — copy + warning)
3. SR-1 (foundation)
4. SR-3 (UI naudoja SR-1)
5. SR-4 (admin loop)
6. SR-5 (pricing)

Po visų šešių, sąžiningai galima sakyti potencialiam klientui:
> *"Jūs galite užregistruoti organizaciją Tier-2 lygmenyje (rekvizitai). Admin pereis ranka. Vis dar nemokama, nes mokamų funkcijų (public posting, matchmaking) dar nėra produkcijoje. Pranešime, kai atsiras."*

Tai NĖRA "pardavimas dabar". Tai **sąžinigos prielaidos pardavimui** — pardavimui patiems reikia (a) public posting surface, (b) matchmaking, (c) sutartas pricing modelis, (d) mokėjimų infra. Tie keturi yra **atskira sales-launch sekvencija**, kurią rekomenduoju kaip auditų B etapą po šios.

---

## 7. Ko šis auditas NEDARO

- **Nebando** pasakyti "viskas paruošta — siųsk laišką". Nepasiruošta.
- **Nesiūlo** sumokėti / iškart mokėti / Stripe / VAT — tie sprendimai turi būti atskirai padaryti DI'o.
- **Nepradeda** PR #18 (manager confirmation backbone) — tai standing block, atblokuoja DI.
- **Nepalieka** prielaidos, kad bus fake "verified" / "AI" / "matching" iki realios implementacijos.
- **Nesiūlo** mass outreach — `docs/sales/README.md` rules tebegalioja.

---

## 8. Konkretus kvietimas DI

Tarp SR-PRs prioritetas pasirinktinas. Mano rekomendacija (jei prašai kurį iš jų pradėti **šią sesiją**):

1. **SR-1 (Tier-2 migration 0022)** — didžiausias svorio centras "pardavimo" pasiruošime, ilgiausias kelias. Pradėti pagrindą.
2. Alternatyva — **SR-6 (OVR reframe)** — greitas docs PR, švari pergalė, pašalina doktrinos konfliktą su esama marketing copy.

Jei prašai abu — SR-6 + SR-1 vienoje sesijoje yra realu, nes jie ortogonal: copy paketas + schema migracija. Bet aš noriu DI sprendimo dėl prioriteto + scope prieš pradedant rašyti SQL.

---

## See also

- `docs/PLATFORM_DOCTRINE.md`
- `docs/policies/organization-profile-creation-policy-v1.md`
- `docs/audit/organization-profile-creation-gap-audit-v1.md`
- `docs/CONTEXTUAL_FIT_SIGNALS.md`
- `docs/sales/README.md`
- `TASKS.md` — esama universal architecture sekvencija
- `docs/handoffs/TASK-ARCH-LABOURMARKETAI-UNIVERSAL-DIRECTION.md`
