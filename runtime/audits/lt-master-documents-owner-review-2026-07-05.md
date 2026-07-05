# LT MASTER — dokumentų gairių savininko peržiūros indeksas (2026-07-05)

CR traukinio WAGON 9 (sritis 17). Savininko taisyklė: visi teisiniai /
dokumentų tekstai pirmiausia ruošiami TIK lietuviškai; kitos kalbos rodo tik
trumpą "ruošiama iš lietuviško pagrindinio teksto" pranešimą, kol savininkas
nepatvirtino LT teksto.

## Kur skaityti juodraštį

- Programoje: **/lt/dashboard/documents** → sekcija „Dokumentų gairės pagal
  šalį (juodraštis)" (inkaras `#guidance`). LT kalba rodo visą registrą;
  EN/RU — tik pranešimą apie ruošimą.
- Kode (vienintelis turinio šaltinis):
  `apps/web/lib/documents/lt-master-guidance.ts`

## Kaip patvirtinti / redaguoti

1. Redaguokite įrašo `titleLt` / `bodyLt` / `whoUsuallyProvidesLt` tekstą
   faile `lt-master-guidance.ts` (arba pažymėkite `status: "OWNER_EDITING"`,
   kol tvarkote).
2. Kai LT tekstas galutinis ir teisininkas peržiūrėjo — pakeiskite
   `status: "OWNER_APPROVED_LT"` ir `needsLegalReview: false`.
3. Tik po to įrašas gali judėti į `TRANSLATION_READY` → `TRANSLATED`
   (vertimai iki tol draudžiami — saugiklis
   `lib/guards/lt-master-document-guidance.test.ts` tai tikrina).

## Būsenos (visų įrašų suvestinė)

| Būsena | Įrašų |
|---|---|
| LT_DRAFT_READY | 17 |
| OWNER_EDITING | 0 |
| OWNER_APPROVED_LT | 0 |
| TRANSLATION_READY | 0 |
| TRANSLATED | 0 |

**Visi 17 įrašų laukia teisininko peržiūros (`needsLegalReview: true`).**

## Įrašų sąrašas

| id | Šalis | Pavadinimas | Būsena |
|---|---|---|---|
| all-identity-document | Visos | Asmens tapatybės dokumentas | LT_DRAFT_READY |
| all-a1-certificate | Visos | A1 pažymėjimas (socialinis draudimas) | LT_DRAFT_READY |
| all-work-contract | Visos | Darbo arba paslaugų sutartis | LT_DRAFT_READY |
| all-qualification-safety | Visos | Kvalifikacijos ir darbų saugos pažymėjimai | LT_DRAFT_READY |
| all-posting-notification | Visos | Komandiravimo pranešimas priimančiojoje šalyje | LT_DRAFT_READY |
| all-health-check | Visos | Sveikatos patikros pažyma | LT_DRAFT_READY |
| lt-local-work | LT | Darbas Lietuvoje — registracijos pagrindai | LT_DRAFT_READY |
| lv-posted-basics | LV | Latvija — komandiravimo pagrindai | LT_DRAFT_READY |
| ee-posted-basics | EE | Estija — komandiravimo pagrindai | LT_DRAFT_READY |
| nl-bsn-registration | NL | Nyderlandai — BSN numeris ir registracija | LT_DRAFT_READY |
| nl-posted-notification | NL | Nyderlandai — komandiruotų darbuotojų pranešimas | LT_DRAFT_READY |
| de-posting-construction | DE | Vokietija — komandiravimo pranešimas ir statybų sektorius | LT_DRAFT_READY |
| de-self-employed-trade | DE | Vokietija — savarankiška veikla ir amatų registracija | LT_DRAFT_READY |
| dk-rut-registration | DK | Danija — RUT registracija | LT_DRAFT_READY |
| no-hms-id-card | NO | Norvegija — HMS kortelė statybvietėse | LT_DRAFT_READY |
| se-id06-card | SE | Švedija — ID06 kortelė statybvietėse | LT_DRAFT_READY |
| pl-posted-basics | PL | Lenkija — komandiravimo pagrindai | LT_DRAFT_READY |

## Sąžiningumo taisyklės (užfiksuotos saugiklyje)

- Konservatyvi kalba: „gali reikėti", „reikia pasitikrinti", „informacinio
  pobūdžio" — jokių garantijų, jokios teisinės konsultacijos.
- Kiekvienas nepatvirtintas įrašas turi `needsLegalReview: true`.
- EN/RU kataloguose LT gairių tekstų NĖRA (saugiklis tikrina nutekėjimą).
- Pagalbos užklausų CTA nėra — tik informacinė eilutė (WAGON 10 sukurs
  tikrą užklausų srautą).
- DB registras `country_document_requirements` liko tuščias ir nepaliestas
  (jokios migracijos šiame vagone).
