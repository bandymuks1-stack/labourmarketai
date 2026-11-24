# Context Intelligence Engine (CIE) v1 — architektūros auditas ir planas

**Data:** 2026-07-28 · **Šaka:** `feat/context-intelligence-engine-v1` · **Fazė:** rebuild 3
**Pamatas:** W1–W6 (#890, #891) — Workspace Context, Time Engine, chat-as-work-centre.

## 1. Kas CIE YRA (ir kas NĖRA)

CIE yra **deterministinis konteksto sudarymo sluoksnis** virš jau egzistuojančių
kanoninių skaitymų. Jis:

- NĖRA naujas AI — pokalbio sluoksnis lieka LLM-off (doktrina §7; guard'as
  `worker-journey-security.test.ts` draudžia `runAiAgent` conversation sluoksnyje).
  „AI supranta kontekstą" čia reiškia: DETERMINISTINIS orchestratorius
  automatiškai atskaito realią būseną iš kanoninių šaltinių — tiksliai tas pats
  principas, kuriuo jau veikia intent-router ir worklog-extract.
- NĖRA nauja DB, store ar modulis — nulis naujų lentelių, nulis migracijų.
- NĖRA antras chat/dashboard — jungiasi į vienintelį pokalbio langą.

## 2. Context Graph (loginis, ne DB)

CIE kontekstą sudaro KOMPOZICIJA iš jau egzistuojančių ryšių — kiekviena
rodyklė yra realus FK arba jau parašytas skaitymas:

```
Workspace  (getWorkspaceContext — engagement_contexts + owned orgs, W1)
   ↓ organization_id
Projektai  (getPlanning project/assigned šaltiniai — projects RLS, W2)
   ↓ project_id                       ↓ stage bands (project_stages, W2)
Darbo žurnalas (journal šaltinis — journal_entries per visible range)
   ↓ created day / work facts
Kalendorius (buildAgenda / itemsForDay / detectConflicts — planning-model)
   ↓ deadlines: task.due, finance.due, invitation.expiry, booking bands
Užduotys / Pirkimų-finansų įrašai / Kvietimai (tie patys planning šaltiniai)
   ↓ engagement label map
Komanda / klientas (engagement_contexts → organizations — worklog-engagements)
   ↓
Pokalbis (vienas readback + proaktyvūs siūlymai)
```

Grafas MATERIALIZUOJAMAS ne DB, o viename request'e: `getPlanning()` jau
grąžina 8 šaltinių datuotus įrašus; `getWorkspaceContext()` — aktyvų kontekstą.
CIE tik juos SUJUNGIA grynomis funkcijomis.

## 3. Nauji komponentai (tik 1 failas naujo kodo — pagrindimas)

| Komponentas | Kodėl būtinas | Kodėl ne dublikatas |
|---|---|---|
| `lib/conversation/context-intelligence.ts` (PURE) | Konteksto sudarymo ir „kito loginio žingsnio" taisyklės turi būti unit-testuojamos be IO (kaip planning-model) | Jokio skaitymo ir rašymo — tik jau grąžintų PlanningItem/Workspace duomenų projekcija |
| `loadContextBrief` (PLĖTINYS agenda-summary.ts) | Vienas readback vietoj dviejų: dienos planas + terminai + konfliktai + siūlymai viename atsakyme | PAKEIČIA loadAgendaSummary naudojimą (ne prideda šalia); guard'as toliau pin'ina šį failą kaip VIENINTELĮ buildAgenda vartotoją už kalendoriaus ribų |

## 4. Integracijos taškai (esami komponentai)

1. **Chat chip „Mano planas" + `calendar-view` intent** → `loadContextBrief`
   (vietoj gryno agenda readback — griežtas superset'as, nulis naujų įėjimo taškų).
2. **Intent-router** → `calendar-view` gauna „šiandien/ką šiandien turiu
   padaryti/dienos planas" šablonus (LT/EN/RU) — goal frazė veikia be mokymosi.
3. **Work-log engagement parinkimas** → `listWorkLogEngagements` rikiuoja
   AKTYVAUS WORKSPACE organizacijos engagement pirmu (workspace → default
   kontekstas; vienas engagement → jokio klausimo, kaip iki šiol).
4. **Siūlymų chips** → tik esami mechanizmai: `logwork` chip, `link:` chips į
   kanoninius maršrutus, `f:` formos.

## 5. Dviprasmybės taisyklė (kada NEklausti)

Ta pati „exactly one" logika kaip kanoninis `create_journal_entry_full`
auto-link'as: kontekstas laikomas AIŠKIU, kai kandidatas lygiai vienas
(vienas aktyvus engagement; vienas assigned projektas dengiantis šiandieną;
workspace'ą atitinkantis engagement). Keli kandidatai → klausiama/rodomas
pasirinkimas (niekada nespėjama tyliai — §7 jokio fake certainty).

## 6. Proaktyvūs siūlymai (deterministinės taisyklės, tik realūs įrašai)

| Taisyklė | Signalas (realūs duomenys) | Siūlymas |
|---|---|---|
| `conflict` | detectConflicts > 0 | įspėjimas + kalendorius (jau W2 kopija) |
| `overdue-tasks` | atvirų užduočių due < šiandien | „{n} užduočių terminas praėjęs" + link |
| `log-today` | accepted booking dengia šiandieną IR žurnale nėra šiandienos įrašo | „Užfiksuok darbą" + logwork chip |
| `reserve-tomorrow` | artimiausias terminas RYTOJ ir rytojaus apkrova ≤1 įrašas | „Rekomenduoju rezervuoti laiko rytoj" + dienos vaizdo link |

Viršutinė riba — 2 siūlymai (prioritetų tvarka aukščiau), kad chat neliktų
spam'u. Kiekvienas siūlymas kyla iš realios eilutės; tuščias kontekstas →
sąžiningas „nieko suplanuota", nulis išgalvotų rekomendacijų.

## 7. Dubliavimo šalinimas šioje fazėje

- `loadAgendaSummary` NEBELIEKA kaip atskiro kelio — brief jį apima (vienas
  readback kelias, guard'as atnaujinamas).
- Work-log engagement klausimas išnyksta, kai workspace kontekstas jį
  išsprendžia (default = aktyvios workspace engagement).

## 8. Kas SĄMONINGAI atidėta (owner gate / read-model slices)

- Aktyvaus projekto/objekto POINTER'IS (persistencija) — reikalauja owner-gated
  preferencijų saugyklos; iki tol aktyvus projektas vedamas iš realių
  assignment'ų („exactly one" taisyklė), ne iš spėjimo.
- Dokumentų galiojimo/pirkimų signalai brief'e — worker_documents/finance
  read-model praplėtimas atskiru PR (šaltiniai jau kalendoriuje, bet
  dokumentų expiry dar neprojektuojamas).
- LLM proposer virš action registry — atskiras sprendimas (registry kontraktas
  jam jau paruoštas).
