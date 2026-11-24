# LABOURMARKET.AI — PREMIUM VISUAL SYSTEM

**Statusas:** FAZĖ A — specifikacija
**Data:** 2026-07-30
**Bazė:** `apps/web/tokens/*` (colors, gradients, radii, shadows, typography,
motion) — JAU EGZISTUOJA. Ši sistema juos **taiko**, nekuria naujų.

> Susiję: `docs/DESIGN_TOKENS.md`, `docs/DESIGN_SOUL.md`. Esant konfliktui dėl
> **produkto UX krypties** galioja `LABOURMARKETAI_PREMIUM_UNIFIED_PRODUCT_GOAL.md`.

---

## 1. VIZUALINĖS KOKYBĖS TAISYKLĖS (§10.1)

Šios taisyklės yra **atmetimo kriterijai** — jei ekranas jų neatitinka, jis
nepateikiamas savininko peržiūrai.

| # | Taisyklė |
|---|---|
| V1 | Ne kiekvienas faktas turi savo rėmelį |
| V2 | Ne daugiau kaip **vienas** pagrindinis vizualinis akcentas viename bloke |
| V3 | Dideli skaičiai — tik svarbiausiems rodikliams |
| V4 | Mažesni faktai grupuojami |
| V5 | Vienodo svorio kortelių tinklas **negali** pakeisti informacijos hierarchijos |
| V6 | Grafikai perskaitomi be paaiškinimo instrukcijos |
| V7 | Empty state padeda atlikti **kitą veiksmą** |
| V8 | Mobile **nėra** suspausta desktop versija |
| V9 | Landing ir autentikuotas produktas — ta pati dizaino šeima |
| V10 | Autentikuotas produktas **negali** atrodyti prasčiau už landing |

> **V5 yra dabartinė pagrindinė yda.** `/dashboard/advanced` (916 eil.) yra būtent
> lygiaverčių kortelių tinklas be hierarchijos. Žr. auditą §3.1.

---

## 2. TIPOGRAFIJOS HIERARCHIJA

Naudojami `tokens/typography.ts` dydžiai. Hierarchija **rolėmis**, ne dydžiais:

| Rolė | Naudojimas | Kiek viename ekrane |
|---|---|---|
| `identity` | Player Card hero vardas | **1** |
| `metric` | pagrindinių rodiklių skaičiai | **3–4** |
| `section` | katalogo / bloko antraštė | pagal blokus |
| `body` | turinys, sąrašai | — |
| `meta` | datos, vietos, būsenos | — |
| `label` | mygtukai, chip'ai | — |

**Taisyklė.** Jei ekrane daugiau nei viena `identity` — hierarchija sulaužyta.
Jei daugiau nei 4 `metric` — rodikliai nustojo būti pagrindiniai (§4.2).

---

## 3. PAVIRŠIŲ LYGIAI

| Lygis | Naudojimas | Gylis |
|---|---|---|
| L0 | app fonas | — |
| L1 | shell kolonos (chat, result) | be border |
| L2 | kortelė / katalogo blokas | subtilus border |
| L3 | iškilęs elementas (drawer, popover) | shadow iš `tokens/shadows.ts` |
| L4 | modalas | shadow + backdrop |

**Draudžiama:** L2 kortelė L2 kortelėje. Įdėtos vienodo lygio kortelės yra
pagrindinė „mokinio projekto" žymė.

### 3.1 Border ir shadow

- Border — **struktūrai**, ne dekoracijai
- Shadow — **tik** L3/L4 (kas iškyla virš turinio)
- Glow — **tik** akcentui ir „uždirbtiems" momentams; niekada ne fonui
- L2 blokui — arba border, **arba** shadow; ne abu

---

## 4. KONTEKSTO SPALVOS

Kontekstas turi **matomą** akcentą (motion §2.3).

| Kontekstas | Akcento rolė |
|---|---|
| Asmeninis | bazinis akcentas |
| Organizacija | org akcentas |
| Projektas | projekto akcentas |

**Taisyklės:**
- Akcentas keičia **akcentą**, ne visą paletę — išdėstymas ir paviršiai lieka tie patys
- Kontrastas privalo išlikti WCAG AA **visuose** kontekstuose ir **abiejose** temose
- Spalva **niekada** nėra vienintelis konteksto signalas — būtinas ir tekstinis
  konteksto vardas (a11y)

---

## 5. ŠVIESI IR TAMSI TEMOS

Abi temos yra **pilnavertės**, ne viena kitos variantas.

| Reikalavimas | |
|---|---|
| Kiekvienas naujas komponentas | tikrinamas abiejose temose |
| Grafikai | duomenų spalvos perskaitomos abiejose |
| Glow / gradientai | šviesioje temoje **redukuojami**, ne perkeliami tiesiogiai |
| Kontrastas | AA abiejose |

---

## 6. GRAFIKAI

| Taisyklė | |
|---|---|
| G1 | Grafikas turi atsakyti į **vieną** klausimą |
| G2 | Ašys ir vienetai pažymėti — arba nereikalingi |
| G3 | **Jokių dekoratyvinių grafikų** (§2.5 REAL DATA ONLY) |
| G4 | Tuščias grafikas → empty state, **ne** pavyzdiniai duomenys |
| G5 | Normalizuota juosta, kuri gali būti perskaityta kaip įvertinimas — **draudžiama** be aiškaus užrašo |

> **G5 yra atviras defektas.** `player-card/skill-evidence-chart.tsx`
> normalizuoja į maksimumą → daugiausiai įrašų turintis įgūdis visada rodo pilną
> juostą, kas skaitoma kaip 100 % kompetencija. Sprendimas — §4.4 GOAL dokumente:
> absoliuti skalė arba suskaičiuojami įrodymų ženklai, **plius** privalomas
> užrašas: *„Tai darbo įrašų skaičius, o ne įgūdžio balas."*

---

## 7. IKONOGRAFIJA

- Viena ikonų šeima visame produkte
- Ikona **niekada** nėra vienintelis reikšmės nešėjas (a11y)
- Mastelis per `conversation/chat/icon-scale.ts` (jau egzistuoja)

---

## 8. MOBILE TAISYKLĖS

| # | Taisyklė |
|---|---|
| MB1 | Mobile — **specialiai suprojektuotas**, ne suspaustas desktop (V8) |
| MB2 | Rezultatas — drawer iš apačios, ne siaura kolona |
| MB3 | Composer visada pasiekiamas; `env(safe-area-inset-bottom)` privalomas |
| MB4 | Lietimo taikinys ≥ 44×44 px |
| MB5 | Horizontalus scroll — **tik** sąmoningai (katalogų juosta, plati lentelė savo konteineryje) |
| MB6 | Testuojami viewportai: **360, 390, 412, 768** |

> **Rizika R2.** `ConversationChat` naudoja `h-[100dvh]` ir savo bottom nav.
> Įvedus shell'ą aukščio valdymas pereina shell'ui — tai tiksliai ta vieta, kur
> mobile composer gali būti nustumtas už ekrano. Privalomas testas 360/390/412.

---

## 9. BŪSENOS

Kiekvienas rezultatas privalo turėti **visas keturias**:

| Būsena | Reikalavimas |
|---|---|
| **Empty** | paaiškina, kodėl tuščia, **ir** siūlo kitą veiksmą (V7). Niekada — pavyzdiniai duomenys |
| **Loading** | išlaiko galutinį layout'ą (skeleton), kad nebūtų šuolio |
| **Error** | paaiškina žmogaus kalba + veiksmas (kartoti / grįžti į pokalbį). Niekada — techninis stack |
| **Success** | matomas per LIVE DATA motion (§2.5), vieną kartą |

**Dead-end draudimas.** Iš kiekvienos būsenos privalo būti kelias atgal į pokalbį.

---

## 10. PRIĖMIMO KRITERIJAI

| # | Kriterijus |
|---|---|
| VS1 | Nė vienas ekranas nelaužo V1–V10 |
| VS2 | Kiekvienas naujas rezultatas turi 4 būsenas |
| VS3 | Abi temos × 7 viewportai (360/390/412/768/1280/1440/1920) |
| VS4 | Jokių placeholder duomenų autentikuotame produkte |
| VS5 | Kontrastas AA abiejose temose, visuose kontekstuose |
| VS6 | G5 defektas ištaisytas su privalomu užrašu |

> **Šie kriterijai dar NEPATIKRINTI.** Tai specifikacija; patikra reikalauja
> autentikuoto preview ir priklauso FAZEI B+.
