# LabourMarket.ai — Vykdomosios prezentacijos sistema

Kanoninė prezentacija kiekvienam svarbiam susitikimui: ministerijoms,
profesinėms mokykloms, universitetams, darbdaviams, įdarbinimo agentūroms,
investuotojams ir strateginiams partneriams.

**Ne marketingo brošiūra.** Vykdomosios kokybės pasakojimo sistema
(Apple Keynote · TED · McKinsey · Stripe · Linear · OpenAI registras),
paremta TIK patvirtintais repo faktais.

## Pozicionavimas (privaloma)

LabourMarket.ai = **Europos daugiasektorė darbo rinkos operacinė sistema**.
Statyba ir Lietuva — tik pirmasis pilotinis vertikalas / startinė rinka,
visada aiškiai pažymėti. ≥70 % naratyvo sektoriams neutralu. Įdarbinimas —
pamatinė funkcija. Jokių išgalvotų statistikų; pajamos — pažymėtos prielaidos;
plėtra — strateginė kryptis, ne prognozė. Šaltinis ir taisyklės:
[`_FACTBASE.md`](_FACTBASE.md).

## Kas šiame pakete

| Failas | Turinys |
|---|---|
| [`presentation.html`](presentation.html) | **Kanoninis denis** — 25 skaidrės (0–24), klaviatūros navigacija (← →), tema (D), visas ekranas (F). Realizuoja dizaino sistemą ir įterpia grafiką. |
| [`presentation-outline.md`](presentation-outline.md) | 24 skaidrių pasakojimo lankas + pozicionavimo patikra. |
| [`slide-by-slide-script.md`](slide-by-slide-script.md) | Pilnas kiekvienos skaidrės turinys dizaineriui (antraštės, tekstai, grafikos slug). |
| [`speaker-notes.md`](speaker-notes.md) | Kalbėtojo tekstas, perėjimai, laikas kiekvienai skaidrei. |
| [`timing-and-versions.md`](timing-and-versions.md) | 5 / 15 / 30 / 60 min versijos · 5 auditorijų versijos · anglų plano metmenys. |
| [`design-system.md`](design-system.md) | Spalvos, tipografija, tinklelis, komponentai, judesys, šviesi/tamsi tema. |
| [`executive-dashboard.md`](executive-dashboard.md) | Vadovo parengties suvestinė (kokybinė, be išgalvotos statistikos). |
| [`svg/`](svg/) | Pakartotinai naudojami premium SVG grafikai (temos atžvilgiu adaptyvūs). |
| [`assets/`](assets/) | Logotipo lockup ir kiti ženklo turtai. |
| [`diagrams/`](diagrams/) | Redaguojami Mermaid diagramų šaltiniai (atitinka SVG). |
| [`graphics/README.md`](graphics/README.md) | Grafikų inventorius: kur gyvena kiekvienas reikalaujamas grafikas. |

## Kaip naudoti

1. **Pristatymui:** atverk `presentation.html` naršyklėje, `F` — visas ekranas,
   rodyklės — skaidrės, `D` — perjungti šviesią/tamsią temą scenai.
2. **Dizaineriui (Figma / Keynote / PowerPoint / Canva):** `design-system.md`
   (žetonai + komponentai) + `slide-by-slide-script.md` (turinys) +
   `svg/` (grafikai). Turinys paruoštas — beveik nereikia papildomo rašymo.
3. **Kalbėtojui:** `speaker-notes.md` + pasirink trukmę/auditoriją iš
   `timing-and-versions.md`.

## Validacijos vartai (iš „Strateginė pozicija")

- Lietuva NĖRA pateikta kaip galutinė rinka.
- Statyba NĖRA pateikta kaip visas produktas.
- ≥70 % naratyvo — sektoriams neutralu.
- Branduolio funkcijos paaiškintos nepriklausomai nuo profesijos.
- Parodytas Europos mastas ir daugiasektorė plėtra.
- Statybų pavyzdžiai pažymėti kaip pirmasis naudojimo atvejis.

## Sąžiningumo riba

Visi teiginiai — iš repo ir produkcijos faktų. Pajamų scenarijai — prielaidos
planavimui, ne garantija. Self-serve mokėjimai NEĮJUNGTI. Plėtros schema —
strateginė kryptis, ne patvirtinta prognozė.
