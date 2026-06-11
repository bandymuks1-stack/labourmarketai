# HANDOFF — TASK 07: Living-Arena UI (vizualinis užraktas: FUT prototipas)

**Repo:** `bandymuks1-stack/labourmarketai` · **Tier:** GREEN (UI/dizainas, JOKIŲ migracijų). Galioja OWNER DEFAULT DECISIONS vokas.
**VIZUALINIS UŽRAKTAS (owner, 2026-06-10):** FUT (FIFA Ultimate Team) kortelių prototipas = galutinė kryptis. Papildomai galioja kanoninio produkto dokumento §16: premium sports/scouting/draft energija, tamsus navy/graphite/black pagrindas, santūrūs neon/electric akcentai, gold/silver/blue/green statusų hierarchija, esami typefaces (Bricolage Grotesque, Instrument Serif, JetBrains Mono) ir design token sistema. No generic SaaS, no boring admin tables kaip primary experience.
**Vykdymas:** po S3.5 pabaigos. Sluoksniai eilės tvarka, kiekvienas = atskiras branch `feat/cc/task07-slice-N` + atskiras PR.

## GALUTINIS TIKSLAS
Living-arena: darbuotojas — savo karjeros protagonistas kosminio laivo kabinoje, vadovas — superlygos treneris. Visi iki šiol „low-fidelity preview, bus pakeista TASK 07" pažymėti komponentai pakeliami į galutinį lygį, žymos nuimamos. Funkcija jau pastatyta S1–S3.5 — TASK 07 ją aprengia.

## ŽINGSNIS 0 — standartiniai šaltiniai + premium design map + VISŲ esamų preview komponentų inventorizacija (FIFA player card, worker player card, live map, dashboard cockpit, S3.5 confirm flow, workbench) + FUT prototipo radimas repo/docs (jei repo jo nėra — owner atsiųs failą; iki tol dirbti pagal §16 + esamą FIFA kortelės preview kaip bazinę kryptį, pažymint reporte).

## SLUOKSNIS T07.1 — Dizaino sistema + Kortelės + Worker Cockpit
- Galutinė FUT kortelė: avataras, profesija, šalys, kalbos, įgūdžiai su declared/evidence/confirmed vizualine hierarchija (confirmed = aukso lygis TIK su tikru patvirtinimu), Work Proof skaičius, availability. Termometro vieta kortelėje REZERVUOJAMA su sąžininga tuščia būsena („skaičiuojama, kai bus rinkos duomenys") — reikšmės atsiras po S4.
- Worker cockpit: ikona → vieta → laiko ratukas → reward ritmas; mano kortelė, mano dokumentai (S3 flag), mano žurnalas, kitas veiksmas. Mobile = pilnas app feel, bottom nav.
- Design tokens papildomi TASK 07 sluoksniu (motion, glow, kortelių gradientai) — token-first, jokio hardcoded.

## SLUOKSNIS T07.2 — Manager: MAP → ARENA → DRAFT + atidėti vadovo vaizdai
- Vadovo kelias: MAP (projektų/komandų žemėlapis) → ARENA (gyvas projekto vaizdas) → DRAFT (darbuotojų parinkimas iš workbench duomenų — tai S1 workbench galutinis rūbas, žmogaus sprendimas išlieka).
- Atidėti vadovo vaizdai pagaliau statomi ČIA: komandos, darbuotojų priskyrimas, užduočių skirstymas — ant esamo kanoninio modelio, be naujų lentelių.
- One-tap confirm (S3.5) integruojamas į ARENA ritmą.

## SLUOKSNIS T07.3 — Stadionas (gyvas projekto vizualizavimas)
- Projektas kaip arena: kas šiandien aikštėje (priskirti darbuotojai), pozicijos, dienos žurnalo pulsas, patvirtinimų būsena, dokumentų readiness signalai (S3 flag), trūkstamos pozicijos.
- TIK REALŪS DUOMENYS arba sąžiningos tuščios būsenos („projektas dar be komandos — pradėk draftą"). Jokio fake gyvumo, jokių fake judesių.

## SLUOKSNIS T07.4 — Šalies lyga + Draftas (PRIKLAUSO NUO S4)
- Lyga: įmonių/darbuotojų lentelės pagal šalį su termometro reikšmėm — STATOMA TIK po S4 (termometras + rinkos vidurkiai), nes be jų lyga būtų fake reitingas, o tai pažeistų doktrinos §7.
- Draftas: samdančių įmonių ir laisvų darbuotojų suvedimas FUT draft estetika ant marketplace v1 duomenų.
- Jei S4 dar nebaigtas atėjus eilei — T07.4 laukia, T07.1–3 merge'inami nepriklausomai.

## NELEIDŽIAMA — standartiniai sąrašai + vokas, plius: jokių migracijų (duomenų poreikiai → S4 arba vartai, ne savavališkos lentelės); jokio fake score/fake gyvumo/fake lygos; „bus pakeista TASK 07" žymos nuimamos TIK tose vietose, kur sluoksnis realiai užbaigtas; visa copy slug→JSON 10 locale; performance — mobile pirmiausia (kortelių animacijos negali žudyti silpno telefono).

## VALIDACIJA — standartinė kiekvienam sluoksniui + mobile smoke + lighthouse/perf patikra kortelių ekranams + guard testas: confirmed vizualinis lygis niekada be tikro patvirtinimo.

## FINAL REPORT po KIEKVIENO sluoksnio atskirai — standartinė forma + ekranų sąrašas su būsena (final / dar preview) + kas laukia S4.
