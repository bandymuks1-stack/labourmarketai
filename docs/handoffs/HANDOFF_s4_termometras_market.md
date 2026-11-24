# HANDOFF — S4: Termometras + Rinkos analizė v1

**Repo:** `bandymuks1-stack/labourmarketai` · **Branch:** `feat/cc/s4-termometras-market`
**Tier:** kodas/docs GREEN; DB = migracijų DRAFT iki vartų (standartinis protokolas). Galioja OWNER DEFAULT DECISIONS vokas.
**Vieta programoje:** S4 (pervardintas iš Trust/Visibility — tas turinys dalim įeina čia, dalim į TASK 07). Vykdyti po ESCO importo + flag flip žingsnio. T07.4 (lyga+draftas) priklauso nuo šio sprinto.

## GALUTINIS TIKSLAS
Termometras — owner užrakinta formulė: **score = (pozicijos vidurkis projekte + admin įvestas rinkos vidurkis) / 2.** Plius admin „kokia situacija rinkoje" vaizdas. Geležinė riba (doktrinos §7): termometras rodomas TIK kai egzistuoja ABU dėmenys; kur duomenų nėra — sąžininga būsena „nepakanka rinkos duomenų", niekada ne išgalvotas skaičius, niekada ne tylus nulis.

## ŽINGSNIS 0 — standartiniai šaltiniai + inventorizacija: kur realiai gyvena įkainių duomenys (worker card salary_min/max? projektų laukai? customer_requests payload?), `journal_entries.project_id` būsena, esamos admin struktūros. Dizainas remiasi TIK rastais faktais — jei pozicijos vidurkiui trūksta duomenų šaltinio, tai įvardijama atvirai ir formulės dėmuo žymimas „laukia duomenų", ne imituojamas.

## SCOPE
1. **project_id rašymo flow pataisymas (GREEN, pirmas):** žurnalo įrašo kūrimas susieja įrašą su projektu, kai darbuotojas priskirtas (esamas stulpelis, trūksta tik flow). Be šito nėra „pozicijos vidurkio projekte" ir nėra T07.3 stadiono pulso. Seniems įrašams — jokio backfill išgalvojimo; jie lieka be projekto.
2. **Admin rinkos vidurkiai:** struktūra profesija × šalis × įkainio vidurkis + įvedimo data + šaltinio pastaba (admin įveda ranka iš realių šaltinių; `needs_source` žyma kaip country requirements šablone). Migracijos DRAFT → vartai.
3. **Termometro skaičiavimas:** servisas/funkcija, kuri grąžina score TIK kai abu dėmenys yra; kitaip — `insufficient_data` su paaiškinimu, kurio dėmens trūksta. Rodymas: rezervuota vieta player kortelėje (T07.1) atgyja.
4. **Rinkos analizės admin vaizdas v1:** pasiūla (darbuotojai pagal profesiją×šalį×readiness), paklausa (customer_requests pagal profesiją×šalį), admin vidurkiai šalia platformos duomenų, spragos („NL elektrikams paklausa 3, pasiūla 0"). Tik realūs skaičiai; mažos imties įspėjimas kai n<5.
5. **Trust→visibility užuomazga (iš senojo S4):** readiness (S3) + verified proof skaičius tampa matomumo signalais marketplace filtruose — be skaitinio „trust score" išradimo; tik faktiniai, paaiškinami signalai.

## NELEIDŽIAMA — standartai + vokas, plius: jokio score be abiejų dėmenų; jokio backfill seniems įrašams; jokių „apytikslių" rinkos vidurkių be admin įvesto šaltinio; mažos imtys be įspėjimo; migracijos tik draft.

## VALIDACIJA — standartinė + guard testas: termometras niekada negrąžina skaičiaus su trūkstamu dėmeniu; project_id flow smoke.

## FINAL REPORT — standartinė forma + įkainių duomenų šaltinių inventorizacijos išvada, migracijų draft sąrašas, kas laukia vartų, kas atrakina T07.4.
