# HANDOFF — S5: Agency Worker Pool v1 + senų RED draft'ų auditas

**Repo:** `bandymuks1-stack/labourmarketai` · **Branch:** `feat/cc/s5-agency-pool`
**Tier:** kodas/docs GREEN; DB = DRAFT iki vartų (standartinis protokolas). Galioja OWNER DEFAULT DECISIONS vokas.
**Vieta programoje:** S5. DESIGN_SOUL privalomas; TASK 07 estetika (tokenai, kortelės, ramybės testas) — galutinis lygis iškart, be preview žymų.

## GALUTINIS TIKSLAS
Agentūra — pilnavertis žaidėjas su savo komanda, bet be galios apeiti pasitikėjimo sluoksnį (kanono §7 agentūros kelias): mato TIK savo pool, valdo jo parengtį, pozicionuoja žmones į paklausą — viskas per default-closed taisykles. Recruitment = core pillar su kontroliuojamu matomumu, ne galinės durys.

## ŽINGSNIS 0 — standartiniai šaltiniai + PRIVALOMA esamų primityvų inventorizacija: agency RPC grandinė JAU EGZISTUOJA (invite_agency_worker, accept_agency_worker_invitation, assign_agency_worker_role, agency_worker_engagement_links, provision_agency_worker_engagement_context, set_agency_worker_journal_review) — S5 yra UI ir sujungimo sprintas ant šito, ne naujo modelio kūrimas. Tikėtina, kad migracijų NEREIKĖS apskritai; jei kas netelpa — draft + gate.

## PRIORITETINĖ DALIS — DOKTRINOS PAPILDYMAS: Atitikties principas (daryti PIRMIAUSIA)

Owner tekstas (2026-06-11), įrašyti 1:1 kaip privalomą principą:
> „Žmonių mes niekada nereitinguojame. Reitingas atsiranda tik atitikties perspektyvoje: darbas X reikalauja įgūdžių Y; žmogus ar įmonė Z turi įgūdžius C, kurie atitinka N% Y — čia ir gaunasi reitingavimas. Termometras tik rodo išraišką, kiek atitinka paieškos kriterijus, numatytus darbus ar kainas."

1. Įrašyk į `docs/PLATFORM_DOCTRINE.md` naują skyrių **„Atitikties principas (Fit, ne reitingas)"** — owner tekstas 1:1 + techninės pasekmės: (a) jokio globalaus asmens/įmonės balo jokioje lentelėje, API ar UI; (b) bet koks % visada pririštas prie konkretaus poreikio konteksto ir rodomas su pagrindu („atitinka 95% šio darbo įgūdžių: 19 iš 20, iš jų 14 patvirtinti"); (c) patvirtintų vs deklaruotų įgūdžių dalis atitiktyje visada atskirta; (d) tas pats subjektas skirtinguose kontekstuose turi skirtingus % — tai principo esmė, ne klaida. **Doktrinos failą keisti LEIDŽIAMA šiuo vieninteliu atveju — tai owner patvirtintas pakeitimas, tekstas 1:1.**
2. Guard testas `fit-not-rating`: draudžia global score laukus/raktus (rating, score be konteksto nuorodos), pina kontekstinio % formą su pagrindu.
3. `docs/product/` S6 matching spec pastaba: atitiktis skaičiuojama per ESCO kanoninius ID (poreikio Y aibė vs subjekto C aibė, overlap %), visada kontekstinė, visada su patvirtintų dalimi.

## SCOPE
1. **Pool vaizdas** `/dashboard/agency/pool`: agentūros darbuotojai kaip TASK 07 kortelės — profesijos, patvirtinti įgūdžiai (gold tik už realius), readiness signalai iš S3 (dokumentų statusų agregatai — NE patys dokumentai: agentūra mato „pasiruošęs į NL: taip/ne/ko trūksta kategorijos lygiu", niekada konkrečių dokumentų turinio be darbuotojo sutikimo logikos), availability, termometro laukas (S4 taisyklės). Kvietimų srautas per esamus RPC.
2. **Parengties apžvalga:** pool readiness suvestinė pagal šalį — kiek žmonių paruošta kuriai rinkai, kur didžiausios spragos. Tik agregatai, sąžiningos tuščios būsenos.
3. **Pozicionavimas į paklausą:** agentūra mato atviras `customer_requests` (submitted), atitinkančias jos pool profesijas — ir gali pažymėti „galim pasiūlyti" (per esamą modelį: jei nėra kur dėti žymos be naujos lentelės — payload/esamas kelias arba draft+gate; jokio savavališko parallel'o). Match sprendimas LIEKA workbench/draft board pusėje pas žmogų — agentūros žyma yra pasiūlymas, ne match.
4. **Visibility control:** darbuotojo kortelės matomumas paklausos pusei — tik per esamą engagement/default-closed logiką; jokio broad grant. Jei matomumo taisyklei reikia naujo jungiklio — draft + gate + owner.
5. **HIGIENA — senų RED draft'ų auditas (#240, #183, #172, #171, #168):** kiekvienam nustatyk: (a) ar dar aktualus po S1–S4/T07 (daug kas galėjo būti suvalgyta), (b) jei pasenęs — uždaryk PR su aiškia pastaba kas jį pakeitė, (c) jei gyvas — atnaujink prieš dabartinį main ir įtrauk į VIENĄ review failą C:\Users\Mano\Downloads\old_drafts_for_review.sql su antraštėm ir rekomendacija owner'iui prie kiekvieno. Nieko netaikyk.

## NELEIDŽIAMA — standartai + vokas, plius: agentūra niekada nemato svetimo pool ar darbuotojų dokumentų turinio; jokio agentūros „auto-match"; bulk upload lieka vision only; jokių naujų lentelių be gate; jokio globalaus asmens/įmonės balo (Atitikties principas) — visi % tik kontekstiniai su pagrindu.

## VALIDACIJA — standartinė + guard'ai: pool matomumo riba (svetimas pool = tuščia), readiness tik agregatai, „galim pasiūlyti" ≠ match, fit-not-rating žalias.

## FINAL REPORT — standartinė forma + doktrinos papildymo patvirtinimas (skyriaus pavadinimas, guard būsena), inventorizacijos išvada (kiek perpanaudota, ar prireikė draft'ų), senų PR audito lentelė (uždaryta/atnaujinta/kodėl), kas liko S6.
