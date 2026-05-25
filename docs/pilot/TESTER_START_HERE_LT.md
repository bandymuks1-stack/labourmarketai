# Sveiki, testuotojai

Tai yra **bandomoji** labourmarket.ai versija. Ne marketingo demo, ne galutinis produktas. Jūs padedate mums pamatyti, kas neaišku, kas neveikia, ką reikia perrašyti.

## Kaip prisijungti

1. Eikite į https://app.labourmarket.ai
2. Spauskite **Tęsti su Google**.
3. Jei nenukreipia atgal po 10 sekundžių — pabandykite dar kartą inkognito lange. Praneškite tai mums (žr. žemiau).

## Ką testuoti

Suskirstyta nuo svarbiausio:

1. **Prisijungimas** — ar pavyksta, ar viskas atrodo aišku, ar nukreipia į teisingą vietą.
2. **Profilis / CV** — `/lt/dashboard/profile`. Aprašykite save laisvai. Patikrinkite, ar pasiūlyti įgūdžiai turi prasmę. Patvirtinkite / atmeskite / pridėkite.
3. **Darbo dienoraštis** — `/lt/dashboard/journal`. Įrašykite vakar / šiandien atliktą darbą paprastais žodžiais. Patikrinkite, ar pasiūlyta struktūra (laikas, kryptis) atrodo teisingai. Pasirinkite tai, kas tiesa. Išsaugokite.
4. **Tekstų raportas** — ten, kur jums kas nors painu / klaidinga / blogai išversta, **pažymėkite tekstą puslapyje** ir spauskite plūduriuojantį mygtuką **Pranešti apie tekstą** (apatiniame dešiniame kampe).
5. **Įmonės / agentūros / pirkėjo juodraščiai** (jei matote tokias roles savo paskyroje) — bandykite suvesti pirmą juodraštį, žiūrėkite, kas nesueina.
6. **Atsijungimas → prisijungimas iš naujo** — patikrinkite, ar viskas išlieka.

## Ko nebijokite

- **Pateikę įrašą gaunate klaidą.** Mes tai pamatome. Praneškite trumpą paaiškinimą — kas darėte, ką gavote.
- **Painios formuluotės.** Tai dažna problema. Tam ir yra teksto pranešimo forma.
- **Profilio duomenys.** Jie šiame etape **privatūs** — kol mes neįjungiame manager / kliento patvirtinimo sluoksnio (PR #18, dar ruošiamas), jūsų įrašų niekas iš išorės nemato.
- **Nebijokite klysti.** Galite redaguoti / ištrinti įrašus, kol jų išoriškai nepatvirtino joks vadovas / klientas.

## Kaip pranešti

| Kas | Kur |
|---|---|
| Painus / netaisyklingas tekstas vietoje | Pažymėkite žodžius/sakinį → mygtukas **Pranešti apie tekstą** apatiniame dešiniame kampe |
| Klaida (kas nors neveikia) | Tas pats mygtukas — parašykite "BUG:" pradžioje, trumpai aprašykite ką darėte |
| Jautrus klausimas (asmens duomenys, abejojate, ar saugu išsaugoti) | Susisiekite su pilot savininku tiesiogiai (jei buvote pakviesti — jau turite jo kontaktą) |

## Ko šiuo metu **nėra**

- Realaus atitikimo tarp darbuotojo ir darbo siūlymo (matching).
- "Patvirtinta vadovo" žymeklių (manager confirmation backbone dar ruošiamas).
- Real-time pranešimų.
- Mobiliosios aplikacijos.
- Mokėjimų / sąskaitų / atlyginimų sluoksnio.

Tai sąmoningas pasirinkimas. Pilotas pirmiausia tikrina pamatą — patikimą trust loop iš laisvo teksto į patvirtintus įrodymus. Visa kita statome po to.

## Privatumas

- Tekstinis turinys (CV, darbo dienoraštis, komentarai) saugomas **tik jūsų sąskaitoje** ir matomas tik jums + administratoriui.
- Telemetrija (kiek užtruko užduotis, kas paspaudėte) **neturi jūsų teksto**. Saugomi tik skaitliukai + maršrutas + sesijos žymeklis (per-tab pseudonimas).
- Niekada nesirenkame klavišų paspaudimų, ekrano nuotraukų, neatliekame slapto sekimo.

## Ačiū

Jūs darote produktą realiu. Nebijokite rašyti tiesos — net jei tai "viskas baisu, perrašyt visą puslapį". Tas yra ko mums labiausiai reikia.
