# Prezentacijos struktūra — kanoninis 24 skaidrių naratyvas

> Šaltinis: `docs/presentation/_FACTBASE.md` (vienintelis leistinas faktų
> šaltinis). Pozicionavimas privalomas: **LabourMarket.ai — Europos daugiasektorė
> darbo rinkos operacinė sistema.** Statyba = tik pirmas pilotinis vertikalas;
> Lietuva = tik viena startinė rinka. Įdarbinimas yra pamatinė funkcija.
> ≥70 % naratyvo — sektoriams neutralus. Plėtra = strateginė kryptis, ne
> patvirtinta prognozė. Pajamų skaičiai — pažymėtos prielaidos, ne prognozė.

## Naratyvo lankas

Prezentacija veda auditoriją nuo bendros **Europos darbo rinkos problemos** iki
konkretaus, jau veikiančio sprendimo. Pirma įvardijame, kodėl darbo rinka visoje
Europoje ir per visus sektorius lieka fragmentuota ir nepasitikinti savimi (1–2).
Tada pristatome viziją ir platformos branduolį — sektoriams neutralią operacinę
sistemą, kurios pamatas yra paaiškinamas pasitikėjimas (3–4). Toliau parodome, kad
ta pati sistema tarnauja keturioms auditorijoms — darbuotojui, darbdaviui,
įdarbinimo agentūrai ir mokymo įstaigai — plius valstybei (5–9). Viduryje
atskleidžiame, kas platformą daro unikalią: pasitikėjimo architektūra ir penkios
patvirtintos branduolio funkcijos (10–15). Paskui pereiname nuo produkto prie
realybės — pilotas, valdymo kambarys, komercinis modelis, pajamų strategija
(16–19). Užbaigiame strategine plėtros kryptimi, parengtimi ir konkrečiu kvietimu
veikti (20–24). Statyba ir Lietuva pasirodo tik kaip aiškiai pažymėti pirmojo
piloto pavyzdžiai, iliustruojantys realias funkcijas — niekada kaip visos istorijos
tema ar branduolio riba.

## 24 skaidrių struktūra

| # | LT antraštė | Paskirtis (viena eilutė) | Grafikas (§10 slug) | Kam svarbiausia |
|---|---|---|---|---|
| 1 | Europos darbo rinkos problema | Įvardyti fragmentaciją ir laiko/pasitikėjimo praradimą per visus sektorius ir rinkas | `multi-sector-grid` | Investuotojai, ministerijos, darbdaviai |
| 2 | Kodėl esamos sistemos neveikia | Parodyti, kad skelbimų portalai ir „juodos dėžės" balai neatsako į klausimą „kodėl" | `matching-engine` | Darbdaviai, agentūros, investuotojai |
| 3 | LabourMarket.ai vizija | Pristatyti gyvą, universalią darbo rinkos operacinę sistemą su pasitikėjimo flywheel | `flywheel` | Visi; ypač investuotojai ir partneriai |
| 4 | Kaip veikia platforma | Paaiškinti sektoriams neutralų branduolį: profiliai → įrodymai → atitikimas → AI → auditas | `platform-architecture` | Darbdaviai, partneriai, investuotojai |
| 5 | Darbuotojo kelias | Vienas žmogus, daug kontekstų, augantis gyvas CV per darbo įrodymus | `worker-lifecycle` | Darbuotojai, mokymo įstaigos |
| 6 | Darbdavio kelias | Greičiau rasti tinkamus žmones ir komandas su sprendimais „su kodėl" | `employer-lifecycle` | Darbdaviai / įmonės |
| 7 | Įdarbinimo agentūros kelias | Operacinis sluoksnis kandidatų srautui — įdarbinimas kaip branduolio funkcija | `agency-lifecycle` | Įdarbinimo agentūros |
| 8 | Profesinės mokyklos / universiteto kelias | Perkeliamas realių gebėjimų įrodymas — tiltas mokymas → darbas | `verification-model` | Profesinės mokyklos, universitetai |
| 9 | Vertė valstybei / ministerijoms | Ne-PII darbo rinkos ir įgūdžių paklausos įžvalgos; auditojama infrastruktūra | `market-intelligence` | Ministerijos, valstybė, partneriai |
| 10 | Pasitikėjimo architektūra | Default-closed, sutikimas, append-only auditas, PII = 0 — kodėl duomenimis galima pasitikėti | `trust-model` | Visi; ypač valstybė ir investuotojai |
| 11 | Verifikuoti įgūdžiai | Deklaruota → dienoraštis → vadovo patvirtinimas → verifikuota; ne savideklaracija | `verification-model` | Darbdaviai, darbuotojai, agentūros |
| 12 | Darbo dienoraštis | Kasdienis darbo įrodymas maitina įgūdžius ir gyvą CV, append-only | `data-flow` | Darbuotojai, darbdaviai, mokymo įstaigos |
| 13 | Paaiškinamas atitikimas | Deterministinis variklis: privaloma / pageidautina / nežinoma / konfliktas + priežastys | `matching-engine` | Darbdaviai, agentūros, investuotojai |
| 14 | Trust Connect — komandos | Komandų/brigadų narystė per sutikimą; auditojama būsenų mašina; be kontaktų nutekėjimo | `trust-model` | Darbdaviai, agentūros |
| 15 | AI žvalgybos sluoksnis | AI pagalba su privalomu žmogaus patvirtinimu — niekada nesiunčia žmogaus vardu | `ai-architecture` | Darbdaviai, investuotojai, partneriai |
| 16 | Piloto sistema | Kontroliuojamas realių vartotojų pilotas: dalyviai, rezultatai, laikas-iki-vertės | `pilot-funnel` | Investuotojai, founding-pilotai |
| 17 | Operacinis valdymo kambarys | Veikla, užduotys, planavimas, CRM, projektai, dokumentai, finansai vienoje vietoje | `platform-architecture` | Darbdaviai, agentūros, partneriai |
| 18 | Komercinis modelis | Kelių auditorijų kainodara; self-serve mokėjimai dar neįjungti, rankinės sąskaitos pilotui | `revenue-funnel` | Investuotojai, founding-pilotai |
| 19 | Pajamų strategija | Iliustraciniai scenarijai (prielaidos), priklausantys nuo pasiūlos likvidumo ir pardavimo | `flywheel` | Investuotojai |
| 20 | Rinkų ir sektorių plėtra | Pirmasis vertikalas → keli sektoriai → kelios Europos rinkos (strateginė kryptis) | `expansion-roadmap` | Investuotojai, partneriai, valstybė |
| 21 | Kelio žemėlapis | Fazių laiko juosta: nuo piloto iki daugiasektorės Europos infrastruktūros | `timeline` | Investuotojai, partneriai |
| 22 | Dabartinė parengtis | Sąžiningas statusas: techniškai gyva produkcijoje; 26/26 testų; piloto parengtis | `readiness-dashboard` | Investuotojai, founding-pilotai |
| 23 | Artimiausi žingsniai | Įjungti pilotą; imti pajamas rankine sąskaita; užpildyti pasiūlą; 1 case study | `pilot-funnel` | Investuotojai, founding-pilotai, partneriai |
| 24 | Kvietimas veikti | Konkretus kvietimas: founding-pilotas, partnerystė arba investicija; kontaktai | `flywheel` | Visi sprendimų priėmėjai |

## Pozicionavimo patikra (mapping į faktų bazės §0 validacijos vartus)

Prieš pateikiant prezentaciją, kiekviena skaidrė turi praeiti šiuos vartus:

- [ ] **Produkto apibrėžimas** — visur apibrėžta kaip „Europos daugiasektorė
  darbo rinkos operacinė sistema"; niekur kaip LT sprendimas, statybų platforma,
  darbuotojų siuntimo sistema ar vien skelbimų portalas (§0).
- [ ] **Įdarbinimas = branduolys** — įdarbinimas ir agentūros pristatyti kaip
  pamatinė funkcija (skaidrės 2, 7, 13); niekur nepozicionuota „prieš įdarbinimą".
- [ ] **Statyba = pažymėtas pilotas** — kiekvienas statybos paminėjimas turi
  aiškų „pirmasis pilotas / pavyzdys" ženklą; niekada kaip prezentacijos tema.
- [ ] **Lietuva = pažymėta startinė rinka** — kiekvienas LT paminėjimas pažymėtas
  kaip viena startinė rinka / pilotavimo vieta.
- [ ] **≥70 % sektoriams neutralu** — strateginės skaidrės (1–4, 9–22) laikomos
  neutraliomis; vertikalūs pavyzdžiai tik kaip pažymėtos iliustracijos.
- [ ] **Plėtra = kryptis, ne prognozė** — skaidrės 20–21 aiškiai pažymi
  „strateginė kryptis, ne patvirtinta prognozė".
- [ ] **Pajamos = prielaidos** — skaidrės 18–19 kiekvieną € sumą žymi kaip
  iliustracinę prielaidą, ne prognozę; nurodo priklausomybes.
- [ ] **Jokių išgalvotų faktų** — visi skaičiai kilę tik iš faktų bazės;
  nėra išgalvotų rinkos dydžių, vartotojų skaičių ar prognozių.
- [ ] **Forma** — profesionali lietuvių kalba; jokių emoji, clipart,
  placeholder'ių, „coming soon" ar TODO.
