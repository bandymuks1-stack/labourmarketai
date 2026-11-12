# LAUNCH EXECUTIVE STATUS — LabourMarket.ai (2026-11-12, 20:00 UTC)

Vadovui skirta paleidimo būsena. Faktai surinkti iš GitHub, CI, produkcijos ir oficialaus funkcijų registro
[`../FUNCTION_REGISTER.md`](../FUNCTION_REGISTER.md). Susiję failai:
[`FULL_FUNCTION_READINESS.md`](FULL_FUNCTION_READINESS.md) (visos 288 funkcijos),
[`LAUNCH_COMPLETION_ROADMAP.md`](LAUNCH_COMPLETION_ROADMAP.md) (likę darbai ir visų atvirų PR lentelė).

Būsenos: PASS, FAIL, NOT TESTED, NOT IMPLEMENTED, BLOCKED. NOT TESTED niekada nelaikoma PASS.
Automatinio testo PASS nereiškia, kad naudotojai patvirtino patogumą.

## 1. Kas veikia produkcijoje

Produkcijos versija 2026-11-12 19:30 UTC: `46b7d6e6`.

| Kas | Būsena | Įrodymas |
|---|---|---|
| Šiandien įdiegti pakeitimai: #3228, #3229, #3242, #3246, #3257, #3255 | įdiegta | `/api/health` rodo `46b7d6e6` |
| Klaidos ekranas užkoduotu skriptų adresu (#3257) | PASS | abi adreso rašybos grąžina 200, versija `a817d88`, 16:46 UTC |
| Maršrutų testas, 28 maršrutai × 5 vaidmenys | PASS versijai `a817d88` | automatinis produkcijos testas, baigtas 17:41 UTC |
| Naujos paskyros registracija ir aktyvavimas | PASS versijai `a817d88` | produkcijos testas `fresh-activation`, paleidimas 43276244659 |
| Profesijų darbo puslapiai (#3255) | PASS versijai `46b7d6e6` | `/en/jobs?profession=welder`: sava antraštė, savas kanoninis adresas, `index, follow` |
| Vieši puslapiai: nuorodos, mygtukai, perpildymas 320–1440 px, 6 kalbos | PASS versijai `01a5b22b` | viešų puslapių patikra, 329 puslapiai |
| Prieinamumo įvertis (Lighthouse) viešuose puslapiuose | PASS: 100 iš 100 | 10 puslapių × 2 kalbos, versija `01a5b22b` |
| Maršrutų testas versijai `46b7d6e6` | NOT TESTED | prasideda 120 min. po sujungimo |
| Navigacija ir pagrindinis puslapis | senas dizainas | V2 nesujungta |
| Švedų kalba | neįjungta | `/sv` nukreipia į `/en` |

## 2. Pirmasis viešas V2 leidimas (tikslas 2026-11-15)

Metodika: dešimt leidimo sąlygų, kiekviena PASS tik su įrodymu. Procentas neskaičiuojamas.

| Nr. | Sąlyga | Būsena | Kas liko |
|---|---|---|---|
| 1 | Vieša V2: pagrindinis puslapis ir navigacija (#3266, `3cb865ecf`) | parašyta, CI žalias, Codex ir nepriklausoma peržiūra be stabdančių radinių; nesujungta | sujungti artimiausiame patikros lange, patikrinti produkcijoje |
| 2 | Prisijungusio naudotojo pagrindinis ekranas ir prisegimas (#3270, `ef8195084`) | parašyta, CI žalias, Codex švarus, 27 iš 27 naršyklės testų; nesujungta | sujungti po #3266 |
| 3 | Vieša ir prisijungusio naudotojo dalis atrodo kaip vienas produktas | iš dalies | žr. 3 skyrių |
| 4 | Registracija ir prisijungimas | PASS produkcijoje (`a817d88`) | formų valdikliai lieka seni, vizualiai suderinti |
| 5 | Darbo ir darbuotojų paieška, poreikio pateikimas | PASS pagal 11-11 testus; šiai versijai NOT TESTED | pakartoti kelionių testus |
| 6 | Mobili sąsaja be perpildymo | PASS viešiems puslapiams; prisijungusiems NOT TESTED produkcijoje | testas po V2 diegimo |
| 7 | Klaidos ekrano gedimas | PASS | – |
| 8 | Greitaveika: LCP ≤ 2,5 s | FAIL | žr. 5 skyrių |
| 9 | Švedų kalba (#3261) | BLOCKED | peržiūros radiniai taisomi, laukiama galutinės versijos |
| 10 | 3 sekundžių testas su 40 žmonių | NOT TESTED | atliekamas tik su įdiegta V2 |

Išvada: 2 iš 10 sąlygų PASS, 2 parašytos ir peržiūrėtos, bet nesujungtos, 1 iš dalies, 2 su ankstesnių
versijų įrodymais, 1 FAIL, 1 BLOCKED, 1 NOT TESTED. Vieša V2 ir prisijungusio naudotojo ekranas gali būti
produkcijoje iki 2026-11-15, jei abu sujungimai ir jų produkcijos patikros praeis. Švedų kalba ir LCP ≤ 2,5 s
iki tos datos neužtikrinti. 3 sekundžių testas iki tos datos neįvyks, nebent dalyviai bus surinkti.

## 3. Ar vieša V2 ir prisijungusio naudotojo sąsaja yra vienas produktas

Patikrinta 2026-11-12 pagal tikros programos ekrano nuotraukas: vieša dalis iš #3266 šakos, prisijungusio
naudotojo dalis iš #3270 testų archyvo (48 nuotraukos, 4 vaidmenys, 375 ir 1440 px, šviesi ir tamsi tema).

| Kas | Rezultatas |
|---|---|
| Tikslų juosta, kortelės, piktogramų laukai, antraštė „What do you want to do?“ | vienodi abiejose dalyse |
| Viena dizaino žymenų sistema | taip |
| Viršutinė juosta | skiriasi: viešoje dalyje tikslų juosta, prisijungus sena programos juosta (My space, Work journal, Calendar, Messages) |
| Telefonas, prisijungus | tikslai prasideda maždaug nuo 520 px: virš jų sutikimo juosta, dvi antraštės eilutės, prisegimo eilutė ir dienos blokas |
| Kompiuteris, prisijungus | tikslų juosta siaurame stulpelyje su rodyklėmis, viešoje dalyje visi šeši vienoje eilutėje; žemiau antra kortelių juosta |
| Logotipas telefone, prisijungus | tik ženklas, be pavadinimo |
| Klaviatūra, prisijungus | PASS naršyklės teste: peršokimo nuoroda veikia, iki pirmos kortelės 2–4 „Tab“ paspaudimai |
| Prisegimas, atsegimas, perrikiavimas, išlikimas po atsijungimo ir antroje sesijoje | PASS naršyklės teste |

Išvada: komponentai bendri, bet V2 dar negalima vadinti užbaigta: prisijungusio naudotojo viršutinė juosta
ir telefono pirmas ekranas dar nesuderinti su vieša dalimi.

## 4. Pilnas LabourMarket.ai produktas: 288 funkcijos

Šaltinis: oficialus registras `main` šakoje (`46b7d6e69`). Skaičiai suskaičiuoti iš eilučių; registro
suvestinės lentelė atsilieka viena eilute (196 ir 6 vietoje 197 ir 5).

| Būsena | Funkcijų | Dalis |
|---|---|---|
| PASS su produkcijos įrodymu (ankstesnių versijų data ir versija įrašyta eilutėje) | 197 | 68 % |
| PASS tik CI | 5 | 2 % |
| FAIL | 8 | 3 % |
| BLOCKED (sukurta, laukia sprendimo, paskyros ar konfigūracijos) | 39 | 14 % |
| NOT TESTED | 16 | 6 % |
| NOT IMPLEMENTED | 22 | 8 % |
| Papildomas testas | 1 | – |

- Parašyta kode: 266 iš 288 (92 %), įskaitant neveikiančias, užblokuotas ir nepatikrintas.
- Patikrinta produkcijoje šiandienos versijai: tik tai, kas išvardyta 1 skyriuje.
- Atitiktis V2 dizainui: 8 funkcijos suvienodintos, 50 mišrios, 11 seno dizaino, 221 neįvertinta.
- Telefonu patikrinta: 1 funkcija turi mobilų produkcijos testą, 2 turi vietinių programėlių keliones;
  likusios NOT TESTED.
- Registre nėra eilučių septynioms komandų ir projektų funkcijoms, kurių kode nėra: komandos vadovas,
  vaidmenys komandoje, nario pašalinimas, vaidmuo projekte, projekto vadovo rodinys, priklausomybė įmonei,
  struktūros rodinys. Todėl komandų ir projektų struktūrų moduliai registre atrodo pilni, nors nėra.
- Planai: kodas FREE ir mokamą planą skiria tik aktyvių poreikių riba (1 ir be ribos); ribojimas veikia tik
  bandomosioms organizacijoms. Bandomasis laikotarpis kode yra 14 dienų. Kuri funkcija priklauso kuriam
  planui, nenuspręsta.

Modulių lentelė ir kiekviena funkcija: [`FULL_FUNCTION_READINESS.md`](FULL_FUNCTION_READINESS.md).

## 5. Greitaveika

| Matavimas | Rezultatas | Šaltinis |
|---|---|---|
| Laboratorinis, lėtinamas procesorius ir tinklas, 20 puslapių | LCP 5,0–6,2 s: FAIL | versija `01a5b22b` |
| Laboratorinis, kitas matavimas, vienas paleidimas | `/lt` 3,4 s, `/lt/jobs` 3,4 s, prisijungimo puslapis 6,4 s: FAIL | produkcija |
| Tikra naršyklė be lėtinimo | 1,2 s, 1,3 s, 1,6 s | produkcija |
| CLS prisijungimo puslapyje | 0,114: FAIL | produkcija |
| Realių naudotojų matavimas | NOT TESTED | programa jo nerenka |

Nustatytos priežastys: pagrindiniame puslapyje daug kliento pusėje atkuriamo turinio; prisijungimo forma
neatsiunčiama serverio HTML; 13 šriftų failų įkeliama kiekviename puslapyje; HTML neaptarnaujamas iš
tinklo krašto talpyklos. Paruoštos pataisos laukia peržiūros: #3296 (prisijungimo puslapis, vietiniame
matavime 6,9 s → 2,2 s), #3294 (šriftai). Ar produkcija pasieks ≤ 2,5 s iki 2026-11-15, neįrodyta.

## 6. Pagrindiniai blokavimai

1. V2 dar ne produkcijoje; po kiekvieno sujungimo produkcijos patikra trunka apie 2 val. 15 min.
2. LCP viršija tikslą.
3. Švedų kalba: #3261 laukia galutinės versijos ir naujos peržiūros.
4. 14 scenarijų šiai produkcijos versijai nepakartoti: vienas iš šešių kelionių testų atliktas.
5. Stripe pusės mokėjimų žingsniai neišbandyti: reikia atskiros Stripe testinės aplinkos raktų.
6. 61 atviras RED juodraštis laukia savininko sprendimų; šeši turi nepriklausomą peržiūrą be stabdančių
   radinių.
7. Planų ir funkcijų matrica nenuspręsta.
8. 3 sekundžių testui nėra dalyvių.

## 7. Reikalingi savininko sprendimai

| Nr. | Sprendimas | Ką blokuoja | Rekomendacija |
|---|---|---|---|
| 1 | RED #2946 (B2B: užklausos ir pasiūlymo susiejimas), versija `eb45557b3` | B2B kelionę | tvirtinti: CI žalias, Codex švarus, nepriklausoma peržiūra be stabdančių radinių, migracijos bandymas 48 iš 48 |
| 2 | RED #3252 (mokėjimų pataisa), #3250 (mokėjimų tekstai), #3284 (izoliuotas planų testas) | mokėjimų parengimą | tvirtinti visus tris; #3206 uždaryti kaip pakeistą |
| 3 | RED #3214, #3230 | įmonių paiešką, operatorių pranešimus | #3214 tvirtinti; #3230 po raudono testo išaiškinimo |
| 4 | Stripe testinės aplinkos raktai GitHub paslaptyse | 10–13 scenarijų Stripe pusę | sukurti atskirą Stripe testinę aplinką ir įrašyti raktus |
| 5 | Planų matrica ir bandomasis laikotarpis (14 dienų kode, tikslas 7) | Premium ir bandomosios funkcijas | spręsti pagal privačiai pateiktus pasiūlymus |
| 6 | Trys prieigos klausimai: komandos vadovo įgaliojimai; projekto vadovo prieiga prie savo projekto; ar klientas mato tiekėjo organizacijos pavadinimą | septynias trūkstamas komandų ir projektų funkcijas | vadovas kaip žyma be įgaliojimų; projekto vadovui tik skaitymas; klientui tik pavadinimas |
| 7 | Tinklo krašto nustatymai: HTML talpykla, PerplexityBot 403 | greitaveiką ir AI paieškų matomumą | įjungti talpyklą viešiems puslapiams, leisti PerplexityBot |
| 8 | „Search Console“ ir analitikos prieiga | SEO poveikio matavimą | suteikti skaitymo prieigą |
| 9 | 40 dalyvių 3 sekundžių testui | UX priėmimą | rinkti dabar, testuoti įdiegus V2 |
| 10 | Teisinė švediškų sutikimų tekstų peržiūra (#3232) | švediškus teisinius tekstus | pavesti kompetentingam asmeniui |
