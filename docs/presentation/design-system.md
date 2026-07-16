# LabourMarket.ai — Prezentacijos dizaino sistema

> Vizualinė kalba „Europos daugiasektorei darbo rinkos operacinei sistemai".
> Registras: Apple Keynote · TED · McKinsey · Stripe · Linear · OpenAI.
> Premium, minimalu, elegantiška, be emoji, be clipart, be stock jausmo.
> Ši sistema realizuota faile `presentation.html` (kanoninis denis) ir
> `svg/*.svg` (pakartotinai naudojami grafikai). Perduodama dizaineriui į
> Figma / Keynote / PowerPoint / Canva be papildomo turinio darbo.

---

## 1. Prekės ženklo laikysena

Ne statybų platforma. Ne LT sprendimas. **Europos daugiasektorė darbo rinkos
operacinė sistema.** Vizualas turi jaustis kaip infrastruktūra, ne kaip skelbimų
portalas: ramus, tikslus, patikimas, „system of record". Vienas akcentas,
daug tylos.

---

## 2. Spalvų paletė

Neutralai su vėsiu (mėlynu) poslinkiu — pasirinkti, ne numatytieji. Vienas
akcentas („signalinė" kobalto mėlyna) = technologija + pasitikėjimas + Europa.
Verifikacijos žalia yra SEMANTINĖ (tik „✓ patvirtinta" būsenoms), ne akcentas.

### Šviesi tema (numatytoji pristatymui)
| Žetonas | HEX | Naudojimas |
|---|---|---|
| `--ink` | `#0F1319` | Pagrindinis tekstas, antraštės |
| `--paper` | `#F6F8FB` | Fonas |
| `--panel` | `#FFFFFF` | Kortelės, skaidrės paviršius |
| `--panel-2` | `#EEF2F7` | Antrinis paviršius, takeliai |
| `--line` | `#D5DCE6` | Plaukų linijos, rėmeliai |
| `--muted` | `#5A6676` | Antrinis tekstas, etiketės |
| `--accent` | `#2F55E6` | Vienintelis akcentas (kobaltas) |
| `--accent-deep` | `#1E3CC2` | Akcento tekstas ant šviesaus |
| `--steel` | `#41506A` | Antrinė struktūra diagramose |
| `--verify` | `#1C9A6A` | Semantinė: „✓ verifikuota / patvirtinta" |
| `--warn` | `#B7791F` | Semantinė: „vartai / laukia" |
| `--alert` | `#B0472F` | Semantinė: „spraga / rizika" |

### Tamsi tema (scenai / ekranui)
| Žetonas | HEX |
|---|---|
| `--ink` | `#EAEEF5` |
| `--paper` | `#0A0E14` |
| `--panel` | `#111722` |
| `--panel-2` | `#161E2B` |
| `--line` | `#232E3E` |
| `--muted` | `#8894A6` |
| `--accent` | `#5E82FF` |
| `--accent-deep` | `#7E9BFF` |
| `--steel` | `#7286A6` |
| `--verify` | `#3FBE8B` |
| `--warn` | `#D8A24A` |
| `--alert` | `#D06A52` |

**Taisyklė:** akcentą naudok vienoje vietoje skaidrėje (viena antraštės detalė,
viena diagramos linija, vienas CTA). Jei akcentas „kovoja" su fonu — mažink
sotumą, nekeisk atspalvio.

---

## 3. Tipografija

CDN šriftai uždrausti (CSP) — naudojami sisteminiai steką, be tylaus fallback.
Trys vaidmenys:

- **Display / antraštės** — sisteminis grotesque, sunkus svoris (700–800),
  ankštas tracking (`-0.02em`), `text-wrap: balance`.
  `-apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif`.
- **Tekstas** — tas pats stekas, 400–500 svoris, `line-height: 1.55`,
  eilutė ~60–65 simbolių.
- **Duomenys / etiketės / kickeriai / skaičiai** — monospace,
  `ui-monospace, "Cascadia Code", "SF Mono", Consolas, monospace`,
  `font-variant-numeric: tabular-nums`, `letter-spacing: 0.14em`, DIDŽIOSIOS.
  Tai „brėžinio anotacijos / system-of-record" balsas.

### Tipo skalė (16:9 skaidrė, bazė 1280×720)
| Rolė | Dydis | Svoris |
|---|---|---|
| Skaidrės antraštė (statement) | 60–76 px | 800 |
| Sekcijos antraštė | 40–52 px | 800 |
| Paantraštė | 24–30 px | 600 |
| Tekstas | 18–21 px | 400 |
| Etiketė / kickeris (mono) | 12–13 px | 600 |
| Duomenų skaičius | 40–64 px | 700 (mono) |

---

## 4. Tinklelis, tarpai, saugi zona

- Skaidrės drobė: **1280 × 720** (16:9). Saugi zona: 64 px paraštės.
- Tinklelis: 12 stulpelių, 24 px tarpas.
- Tarpų skalė (8pt): 4 · 8 · 12 · 16 · 24 · 32 · 48 · 64 · 96.
- Išdėstymui — flex/grid + `gap`, ne per-element margin.
- Platus turinys (lentelės, diagramos) — `overflow-x: auto` savo konteineryje;
  skaidrė niekada neslenka horizontaliai.

---

## 5. Komponentai (pakartotinai naudojami)

Visi realizuoti `presentation.html`; specifikacija dizaineriui:

1. **Title slide** — mono kickeris viršuje („PLATFORMOS MASTAS: EUROPA ·
   DAUGIASEKTORĖ"), didelė antraštė, vieno sakinio produkto apibrėžimas,
   plona akcento juosta.
2. **Section divider** — didelis sekcijos numeris (mono), sekcijos pavadinimas,
   viena eilutė konteksto. Tylus fonas.
3. **Statement slide** — viena drąsi mintis (≤12 žodžių), daug tylos.
4. **Metric row** — 3–4 „metric block": didelis mono skaičius/etiketė + parašas.
   Naudok TIK patvirtintus faktus (26/26, PII=0, 11–12 kalbų).
5. **Diagram slide** — pilno pločio SVG + trumpas antraštės/parašo blokas.
6. **Two-column** — kairė teiginys, dešinė iliustracija/sąrašas.
7. **Executive table** — plaukų linijų lentelė, mono skaičiai, be zebros.
8. **Journey / timeline** — horizontali/vertikali eiga su etapų taškais.
9. **Card grid** — 2–4 kortelės (funkcija/auditorija), statuso „chip".
10. **Quote / principle** — vienas principas (pvz., „Pasitikėjimas ateina iš
    „kodėl""), didelė kabutė, priskyrimas.
11. **Callout** — akcento kairė juosta + trumpas sąžiningumo/pastabos blokas.
12. **Status chip** — mono etiketė su tašku: GYVA (verify), PROD (accent/steel),
    VARTAI (warn), SPRAGA (alert).

### Būsenų žymos (chip) semantika
- `GYVA` — veikia vartotojams (verify žalia).
- `PROD` — kodas + migracija produkcijoje (steel/accent).
- `VARTAI` — paruošta, laukia sprendimo (warn).
- `KRYPTIS` — strateginė kryptis, ne prognozė (muted).

---

## 6. Grafikos gairės (SVG)

- Geometriška, plona: 1.5 px linijos, 10–12 px apvalinimas, daug baltos.
- Vienas akcentas per grafiką; struktūra — steel/line; „✓" — verify.
- Etiketės — monospace, DIDŽIOSIOS mažiems label'iams.
- Kiekvienas `svg/*.svg` yra savarankiškas, temos atžvilgiu adaptyvus
  (`@media (prefers-color-scheme: dark)` viduje) ir pakartotinai naudojamas.
- Jokių netikrų ekrano nuotraukų, jokio clipart, jokių dekoratyvių gradientų
  vien dėl grožio.
- Statybų/LT pavyzdžiai grafikuose — TIK aiškiai pažymėti „pirmasis pilotas".

---

## 7. Judesys ir perėjimai (rekomendacijos)

- Perėjimai tarp skaidrių: minkštas „fade + 8px slinktis aukštyn", 240–320 ms,
  `ease-out`. Jokio slide-spin, jokio 3D.
- Turinio pasirodymas skaidrėje: nuoseklus (kickeris → antraštė → tekstas →
  grafika), 60–90 ms žingsniai. „Orkestruotas momentas, ne pabiros efektai."
- Diagramų linijos gali „nusipiešti" (stroke-dashoffset) 600–900 ms — vieną
  kartą, ne kilpa.
- Gerbk `prefers-reduced-motion` — tuomet be judesio, tik matomumas.
- Denis: rodyklių klavišai (←/→), `F` viso ekrano, `D` temos perjungimas.

---

## 8. Sąžiningumo taisyklės vizualui

- Jokių išgalvotų statistikų, rinkos dydžių ar € kaip faktų.
- Pajamų skaičiai visada pažymėti „prielaidos, ne prognozė".
- Plėtros schema visada pažymėta „strateginė kryptis, ne patvirtinta prognozė".
- „Self-serve mokėjimai neįjungti" — niekada nevaizduoti kaip gyvo.
- Statyba/Lietuva — visada su „pirmasis pilotas / pavyzdys" žyma.
- ≥70 % skaidrių turinio — sektoriams neutralu.
