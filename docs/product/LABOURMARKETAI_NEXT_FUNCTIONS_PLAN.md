# LABOURMARKET.AI — NEXT FUNCTIONS PLAN

**Statusas:** FAZĖ A — prioritetų planas
**Data:** 2026-07-30

> **Sąlyga (§15).** Šie prioritetai vykdomi **tik po** šiandienos vieningos
> architektūros įgyvendinimo arba patikimo techninio paruošimo. Kol nėra
> `ResultPanel`, kiekvienas iš P1–P6 taptų dar vienu atskiru ekranu — t. y.
> pablogintų būtent tą problemą, kurią sprendžiame.
>
> **Priklausomybė:** P1–P6 blokuojami `FAZĖ B` (rezultato skydelio).

---

## P1 — PATENTUOTO ĮGŪDŽIŲ CIKLO PAAIŠKINAMUMAS

**Tikslas.** Vartotojas aiškiai mato grandinę:

```
darbo įrašas → aptiktas įgūdis → įrodymas → Player Card → matching → geresnė galimybė
```

| Aspektas | |
|---|---|
| Kanoninis paviršius | Player Card katalogas „ĮRODYMAI" |
| Reikalavimas | kiekvienas įgūdis turi **spustelimą ryšį** į jį pagrindžiančius įrašus |
| Draudimas | įgūdis be įrodymo grandinės; „AI patvirtinta" be realaus pagrindo |
| Priklauso nuo | FAZĖ C (Player Card v2) |
| Duomenys | **yra** — `work_log` + įrodymų rows |

**Kodėl pirmas.** Tai vienintelis produkto elementas, kurio konkurentai neturi. Jis
jau turi duomenis ir grafikus — trūksta tik matomo **ryšio**.

---

## P2 — MATCHING ENGINE EXPERIENCE

| Kryptis | žmogus↔darbas · žmogus↔projektas · įmonė↔darbuotojas · įmonė↔komanda |
|---|---|
| Privaloma | paaiškinimas, **kodėl** atitikmuo pasiūlytas |
| Privaloma | trūkstami įgūdžiai (kiek trūksta iki šito darbo) |
| Privaloma | geografiniai ir laiko apribojimai |
| Kanoninis paviršius | `MarketResult` → katalogas „Atitikmenys" |
| Priklauso nuo | FAZĖ E |

**Vartotojo klausimai, į kuriuos privalo atsakyti:** „Rask man tinkamą darbą" ·
„Kodėl šitas darbas man tinka?" · „Kiek man trūksta iki šito darbo?" ·
„Parodyk geriausius atitikmenis".

---

## P3 — REPUTACIJOS SISTEMA

Pagal **kanoninį** modelį:

| Leidžiama | Draudžiama |
|---|---|
| vienas teigiamas atsiliepimas | ❌ žvaigždutės |
| vienas neigiamas atsiliepimas | ❌ vienas bendras žmogaus balas |
| kontekstas | ❌ pseudo „4.9" |
| ryšys su realiu darbu | ❌ medaliai, procentai kaip kompetencija |

| Aspektas | |
|---|---|
| Kanoninis paviršius | `ReputationResult` → Player Card katalogas |
| Priklauso nuo | FAZĖ E |
| ⚠️ Neverifikuota | ar reputacijos duomenų modelis jau egzistuoja realiais rows |

---

## P4 — SĄSKAITŲ REZULTATAS

**Ne atskiras apskaitos dashboardas.** Per pokalbį:

pasirinkti laikotarpį → pasirinkti projektą → parodyti darbo įrašus →
apskaičiuoti sumas → sugeneruoti peržiūrą → eksportuoti → **pažymėti trūkstamus
duomenis**

| Aspektas | |
|---|---|
| Kanoninis paviršius | `InvoiceResult` |
| Duomenų šaltinis | `work_log` agregacija — **jau yra** |
| Priklauso nuo | FAZĖ D (žurnalas kaip variklis) |

> 🔒 **OWNER GATE.** Jokių mokėjimų, Stripe ar billing pakeitimų. Šis darbas yra
> **tik** darbo įrašų agregacija ir peržiūra/eksportas. Bet koks mokėjimo srautas
> — atskiras savininko sprendimas (§16).

---

## P5 — PROJEKTO PROGRESO BLOKAS

etapas · darbai · žmonės · laikas · rizikos · įrodymai · **kitas veiksmas**

| Aspektas | |
|---|---|
| Kanoninis paviršius | `ProjectResult` |
| Priklauso nuo | FAZĖ E |
| Reikalavimas | „kitas veiksmas" privalomas — projektas be next action yra ataskaita, ne valdymas |

---

## P6 — RINKOS SIGNALAI

paklausos pokyčiai · atlygio pokyčiai · regionai · trūkstami įgūdžiai · nauji
atitikmenys · **paaiškinami** perspėjimai

| Aspektas | |
|---|---|
| Kanoninis paviršius | `MarketResult` katalogai |
| Priklauso nuo | **E1** — 8 orphaned komponentų duomenų šaltinio patikra |
| Reikalavimas | perspėjimas be paaiškinimo = triukšmas; kiekvienas signalas paaiškinamas |

> ⚠️ **Didžiausia neaiškumo zona.** Kol E1 patikra neatlikta, nežinoma, kiek iš
> `MarketPulse` / `SupplyDemandChart` / `RegionalHeatmap` / `SkillsDemandList` /
> `RecentMatchesFeed` turi realius duomenų šaltinius. P6 apimtis paaiškės tik po E1.

---

## PRIORITETŲ SEKA

```
FAZĖ B (ResultPanel)  ──┬─▶ FAZĖ C ──▶ P1  (įgūdžių ciklas)   ← didžiausia vertė
                        ├─▶ FAZĖ D ──▶ P4  (sąskaitos)
                        └─▶ FAZĖ E ──┬─▶ P2 (matching)
                                     ├─▶ P3 (reputacija)
                                     ├─▶ P5 (projektai)
                                     └─▶ P6 (rinkos signalai, po E1)
```

**Rekomendacija:** P1 pirmas. Jis remiasi jau egzistuojančiais duomenimis ir ką tik
atkurtais grafikais, ir jis vienintelis daro matomą tai, kas produkte unikalu.
