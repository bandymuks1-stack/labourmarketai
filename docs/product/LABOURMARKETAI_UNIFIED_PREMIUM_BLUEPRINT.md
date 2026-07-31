# LABOURMARKET.AI — UNIFIED PREMIUM BLUEPRINT

**Statusas:** `UNIFIED_PREMIUM_BLUEPRINT_READY`
**Data:** 2026-07-30
**Šaka:** `feat/cc/premium-unified-product-v1` · **Bazė:** `main` @ `752f8b19`
**Production pakeista:** **NE**

---

## 1. CENTRINĖ IŠVADA

> Produktas turi **teisingą šerdį ir neteisingą topologiją.**

`/dashboard` JAU yra pokalbis (`dashboard/page.tsx:57`). Trūksta **rezultato
skydelio**. Todėl kiekvienas rezultatas tapo maršrutu, iš 72 maršrutų išaugo
antras dashboardas (`/advanced`, 916 eil.), o navigacija suskilo į 3 tapatybes.

**FAZĖ B nėra redizainas. Tai rezultato skydelio įvedimas.** Po jo maršrutai
virsta rezultatais, o ne ekranais.

---

## 2. DESKTOP BLUEPRINT

```text
┌──────────────────────────────────────────────────────────────┐
│ Kontekstas · Dabartinis tikslas · Būsena · Profilis          │  ← plona juosta
├─────────────────────────────────┬────────────────────────────┤
│                                 │                            │
│  AI POKALBIS                    │  DINAMINIS REZULTATAS      │
│  (ConversationChat)             │  (ResultPanel)             │
│                                 │                            │
│  · klausimai                    │  · Player Card             │
│  · komandos                     │  · kalendorius             │
│  · atsakymai                    │  · projektas               │
│  · rezultatų kortelės ──────────┼─▶ grafikai                 │
│    (kilmė + santrauka)          │  · dokumentas              │
│                                 │  · sąskaita                │
│  ┌───────────────────────────┐  │  · pasiūlymas              │
│  │ Kontekstas: Asmeninis  ▾  │  │                            │
│  │ [composer]                │  │                            │
│  └───────────────────────────┘  │                            │
├─────────────────────────────────┴────────────────────────────┤
│ Kontekstiniai greiti veiksmai — TIK kai jie reikalingi        │
└──────────────────────────────────────────────────────────────┘
```

**Proporcijos:** ≥1280 px — chat ~42 %, rezultatas ~58 % (rezultate gyvena
grafikai ir lentelės). Be rezultato chat centruojasi (max ~760 px), **neišsitempia
per visą plotį**.

**Konteksto jungiklis yra prie composer'io**, ne viršutinėje navigacijoje (§3.2).

---

## 3. MOBILE BLUEPRINT

```text
┌───────────────────────────────┐
│ Kontekstas · būsena · profilis│
├───────────────────────────────┤
│                               │
│  POKALBIS                     │
│  (pilnas aukštis)             │
│                               │
│  [rezultato kortelė] ─────┐   │
│                           │   │
├───────────────────────────┼───┤
│ [Kontekstas ▾] [composer] │   │
└───────────────────────────┼───┘
                            ▼
┌───────────────────────────────┐
│ ═══  (drag handle)            │  ← REZULTATAS: drawer iš apačios
│ Player Card            [×]    │
│ ─────────────────────────────  │
│  hero · rodikliai · katalogai │
└───────────────────────────────┘
```

**Taisyklės:** drawer = full-height card, ne siaura kolona (MB2) · composer visada
pasiekiamas (MB3) · uždarius drawer'į pokalbyje **lieka** santrauka (motion §2.2) ·
`env(safe-area-inset-bottom)` privalomas.

---

## 4. PLAYER CARD BLUEPRINT

```text
┌────────────────────────────────────────────────────────────┐
│  ┌────────┐   Jonas Petraitis                    [KONTAKTAS]│
│  │        │   Santechnikas                       [Dalintis] │
│  │ avatar │   📍 Vilnius, Lietuva                           │  ← HERO
│  │        │   ● Laisvas darbui · Asmeninis kontekstas       │
│  └────────┘   ✓ patvirtinti dokumentai                      │
├────────────────────────────────────────────────────────────┤
│    23              8              7                         │
│  DARBO ĮRAŠAI   ĮGŪDŽIAI    METAI PATIRTIES                 │  ← 3–4 RODIKLIAI
├────────────────────────────────────────────────────────────┤
│  [ PAŽANGA ]   [ PATIRTIS ]   [ ĮRODYMAI ]                  │  ← KATALOGAI
│  ────────────────────────────────────────────────           │
│  12 mėn. aktyvumas · įgūdžių augimas · nauji įgūdžiai       │
└────────────────────────────────────────────────────────────┘
```

### 4.1 Kas keičiasi ir kas NE

| Elementas | Sprendimas |
|---|---|
| Hero | **NAUJAS** — stipriausias vizualinis blokas, ne administracinė forma |
| Rodiklių juosta | **NAUJAS** — 3–4, viena eilė |
| 3 katalogai | **NAUJAS** apvalkalas |
| `skill-evidence-chart` | **NELIESTI** (tik G5 skalės taisymas) |
| `evidence-timeline-chart` | **NELIESTI** |
| `work-history-timeline` | **NELIESTI** |

### 4.2 Draudžiami rodikliai

❌ bendras žmogaus balas · ❌ žvaigždutės · ❌ pseudo „4.9" · ❌ procentai, kurie
gali atrodyti kaip kompetencijos balas · ❌ medaliai

Leidžiama: darbais pagrįsti įgūdžiai · darbo įrašai · realios patirtys ·
teigiami/neigiami atsiliepimai pagal kanoninį reputacijos modelį.

### 4.3 G5 defekto sprendimas (privalomas)

Dabar: normalizacija į maksimumą → pilna juosta skaitoma kaip 100 % kompetencija.

Pasirinktas modelis: **absoliutus įrašų skaičius su fiksuota skale** + privalomas
užrašas:

> *„Tai darbo įrašų skaičius, o ne įgūdžio balas."*

---

## 5. CHAT → RESULT SRAUTAS

```
vartotojas: „Parodyk mano kortelę"
      │
      ▼
 intent resolver ──▶ ResultRegistry.resolve("player-card")
      │
      ▼
 pokalbyje: rezultato kortelė (kilmė)
      │  MESSAGE TO RESULT (motion §2.1, 240ms)
      ▼
 ResultPanel: <WorkerPlayerCard>          desktop: dešinė kolona
                                          mobile:  drawer iš apačios
      │
      │  vartotojas uždaro
      ▼  RESULT TO SUMMARY (motion §2.2)
 pokalbyje LIEKA kompaktiška kortelė  ← rezultatas niekada nedingsta be pėdsako
```

**Deep-link:** `?result=player-card` → shell atkuria rezultatą po reload.
URL yra rezultato būsenos šaltinis (§12 FAZĖ B reikalavimas).

**Fallback:** jei intent neatpažintas — pokalbis atsako **tekstu + siūlomu
veiksmu**, niekada tyliai nieko nedaro.

---

## 6. CONTEXT SWITCH SRAUTAS

```
[Kontekstas: Asmeninis ▾]  ← prie composer'io, NE header'yje
      │  vartotojas: „Perjunk į Rexora" ARBA paspaudžia jungiklį
      ▼
 CONTEXT SWITCH (motion §2.3, 240ms)
      │
      ├─ akcento spalva pereina        (matomas signalas)
      ├─ turinys persitvarko (stagger ≤3 × 40ms)
      ├─ IŠDĖSTYMAS NESIKEIČIA         ← kritinis reikalavimas
      └─ puslapis NEPERKRAUNAMAS
      ▼
 keičiasi: duomenys · CTA · kalendorius · dokumentai · projektai ·
           rekomendacijos · rinkos info
```

**Šaltinis:** `AuthProvider` initial state (`layout.tsx:201-218`) jau turi
`workspaces` + `activeWorkspaceId`. `ContextSwitcher` juos **naudoja**, neperrašo
(rizika R7).

---

## 7. MIGRACIJOS SEKA

Kiekvienas žingsnis — atskiras commit, atstatomas, be production poveikio.

| # | Žingsnis | Rizika | Vartai į kitą |
|---|---|---|---|
| **B1** | `ResultRegistry` + `ResultPanel` (tuščias) | Žema | Shell renderina, chat nepakitęs |
| **B2** | `WorkspaceShell` — chat + tuščias rezultatas | **Aukšta** (R2) | 360/390/412 composer pasiekiamas |
| **B3** | Deep-link `?result=` | Žema | Reload atkuria rezultatą |
| **B4** | `ContextSwitcher` prie composer'io | Vidutinė (R7) | 3 kontekstai perjungiami |
| **C1** | Player Card konsolidacija (apvalkalas) | **Aukšta** (R3) | 3 grafikai nepakitę |
| **C2** | Hero + rodiklių juosta + 3 katalogai | Vidutinė | Abi temos, 7 viewportai |
| **C3** | G5 skalės taisymas + užrašas | Žema | Juosta neskaitoma kaip balas |
| **D1** | `JournalResult` apvalkalas | Vidutinė | `/journal` funkcijos pasiekiamos per rezultatą |
| **D2** | Žurnalo chat srautai | Vidutinė | Įrašas sukuriamas per pokalbį |
| **E1** | 8 orphaned komponentų **duomenų šaltinio patikra** | — | Sąrašas: realūs / demo / nėra |
| **E2** | `CalendarResult` | Vidutinė (R6) | Viena laiko tiesa |
| **E3** | `MarketResult` 5 katalogai | Vidutinė (R4) | Tik realūs duomenys |
| **E4** | `ProjectResult`, `EvidenceResult`, `InvoiceResult` | Vidutinė | — |
| **F1** | Landing pertvarkymas | Vidutinė | Trumpas, 7 blokai |
| **G** | `/advanced` + `/assist` paslėpimas | **Aukšta** (R1) | **Tik po savininko priėmimo** |

**Žingsnis G yra paskutinis ir savininko gate'as.** Nė vienas maršrutas
neslepiamas, kol kiekvienam moduliui nėra chat komandos + rezultato.

---

## 8. TIKSLUS KEIČIAMŲ FAILŲ SĄRAŠAS (FAZĖ B)

### Nauji
```
components/app/workspace/workspace-shell.tsx
components/app/workspace/result-panel.tsx
components/app/workspace/result-registry.ts
components/app/workspace/context-switcher.tsx
components/app/workspace/result-summary-card.tsx
```

### Keičiami
```
app/[locale]/dashboard/layout.tsx        → WorkspaceShell vietoj DashboardChrome
app/[locale]/dashboard/page.tsx          → chat + rezultato slot
components/app/dashboard-chrome.tsx      → pereinamasis adapteris (R5: pinamas testų)
components/app/conversation/chat/conversation-chat.tsx → aukščio valdymas shell'ui (R2)
apps/web/messages/*.json                 → nauji raktai (10 kalbų)
```

### Neliečiami
```
components/app/player-card/*.tsx     (3 grafikai — R3)
app/[locale]/dashboard/admin/**      (20 maršrutų)
app/[locale]/(marketing)/legal/**    (§16)
supabase/**                          (jokių migracijų — §16)
middleware.ts, i18n konfigūracija
```

**Jokių naujų bibliotekų. Jokių DB migracijų. Jokių env pakeitimų.**

---

## 9. REGRESIJŲ RIZIKOS

| # | Rizika | Sunkumas | Švelninimas |
|---|---|---|---|
| R1 | `/advanced` paslėpimas atima prieigą prie modulių | **Aukšta** | Žingsnis G paskutinis, po savininko priėmimo |
| R2 | Chat `h-[100dvh]` × shell → mobile composer nustumtas | **Aukšta** | B2 vartai: 360/390/412 |
| R3 | Player Card konsolidacija kartoja A-13 | **Aukšta** | Grafikai neliečiami; atskiras commit |
| R4 | Orphaned komponentų atkūrimas įneša placeholder | **Aukšta** | E1 patikra **prieš** E3 |
| R5 | Chrome vienodinimas lūžta guard testuose | Vidutinė | Keisti kartu su testais |
| R6 | Kalendoriaus vienodinimas paliečia booking semantiką | Vidutinė | Kalendorius = projekcija; veiksmai lieka |
| R7 | `ContextSwitcher` lūžta `AuthProvider` sinchronizacijoje | Vidutinė | Naudoti initial state, neperrašyti |

---

## 10. KO ŠIS BLUEPRINT **NEĮRODO**

- ❌ Nė vienas komponentas dar **neįgyvendintas**
- ❌ Nėra screenshotų — nei prieš, nei po
- ❌ Nė vienas iš §14 21 priėmimo scenarijaus **nepaleistas**
- ❌ Motion ir vizualinės sistemos kriterijai **nepatikrinti**
- ❌ 8 orphaned komponentų duomenų šaltiniai **nepatikrinti** (E1)
- ❌ Tai **nėra** savininko vizualinis priėmimas

**Šis dokumentas yra kryptis ir seka — ne rezultatas.**

---

## 11. STATUSAS

```
UNIFIED_PREMIUM_BLUEPRINT_READY
```

**Kitas žingsnis:** B1 — `ResultRegistry` + `ResultPanel`, žemos rizikos, be
production UI pakeitimo.
