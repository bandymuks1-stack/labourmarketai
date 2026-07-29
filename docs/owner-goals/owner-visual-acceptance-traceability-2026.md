# Owner visual acceptance 2026 — atsekamumo lentelė

> Kanoninė specifikacija: [`owner-visual-acceptance-audit-2026.md`](owner-visual-acceptance-audit-2026.md)
> (savininko auditas, verbatim) **+ privaloma vykdymo politika**
> [`owner-visual-acceptance-addendum-2026.md`](owner-visual-acceptance-addendum-2026.md)
> (tos pačios galios addendum: architektūrą leidžiama perprojektuoti; jokių
> laikinų apėjimų; chat-first absoliutus; landing = produktas; premium
> standartas; kiekvienas taisymas užbaigia visą komponentą). Šis failas — vykdymo atsekamumas: kiekvienas
> savininko reikalavimas → faktinė production būsena → keistini failai →
> priėmimo veiksmas → statusas.
>
> Statusas atnaujinamas po kiekvieno etapo checkpoint commit'o.
> Dabartinis bendras statusas: **OWNER_VISUAL_ACCEPTANCE_NOT_COMPLETE_OAUTH_IDENTITY_GATE_AND_WORKSPACE_POINTER_GATE**
> — visi šeši vykdymo etapai (§7, §8, §5.2, §10, §12, §16) BAIGTI ir gyvi
> production; likę du punktai yra savininko gate'ai (žr.
> [`owner-gate-final-2026.md`](owner-gate-final-2026.md)).

## OWNER_REPORTED_REQUIREMENTS — savininko audito punktai

| # | Audito reikalavimas | Faktinė production būsena (2026-07-29 patikra) | Keistini failai | Priėmimo veiksmas | Statusas |
|---|---|---|---|---|---|
| P0.1 | Workspace realiai persijungia; jokių tuščių punktų / „neįjungta" tekstų | Meniu rodo „Asmeninė erdvė" + įmonę, tušti punktai su brūkšniais, perjungimas nevyksta (savininko pastebėjimas) | `components/app/conversation/chat/workspace-chip.tsx`, `components/app/role-switcher.tsx`, erdvės kontekso reads | Paspaudus įmonės erdvę pasikeičia kontekstas, duomenys, CTA, kalendorius, žemėlapis, santrauka | KODAS LIVE (sesijos pointer; patvarus DB pointer = savininko gate 20260714210000) |
| P0.2 | Profilis / Nustatymai paspaudžiami; meniu nelenda po žemėlapiu | Patvirtinta: Leaflet panes (z-400+) root kontekste dengė header dropdown'us | `app/globals.css` (`.wsmap` isolation), `components/app/account-menu.tsx` | Profilis/Nustatymai atsidaro desktop + mobile, niekas nedengia | LIVE |
| P0.3 | Overlay sistema: z-skalė, escape, click-outside, focus, mobile sheet, QA | Patvirtinta: varpelio popover po žemėlapiu; paieškos backdrop nepridengė dešinės panelės | `app/globals.css`, `notification-panel.tsx` (z-60), `header-search.tsx` (z-70), `account-menu.tsx` | Visi overlay virš turinio, escape/click-outside veikia, vizualinė regresija visais viewport | LIVE |
| P0.4 | Google OAuth rodo LabourMarket identitetą; read-only auditas; jokių Console keitimų be savininko | Google lange matoma `...supabase.co` (savininko pastebėjimas) | Docs: OAuth/custom-domain auditas (`docs/owner-goals/…oauth-identity-audit`) | Auditas + taisymo planas savininkui; Console veiksmai — tik savininkas | AUDITAS ATLIKTAS — SAVININKO GATE |
| P0.5 | „Ieškau darbo" pirmiausia klausia kriterijų, tik tada ieško | Patvirtinta netiesiogiai: `jobs` chip iškart vykdo paiešką; tuščias rezultatas → „nerasta" | `conversation-chat.tsx`, `lib/conversation/find-work.ts`, criteria dialog | Paspaudus „Ieškau darbo" prasideda dialogas (rolė, vieta, laikas, grafikas), tik tada paieška | LIVE |
| P0.6 | Pilnas profilis (6/6) → jokio „Užbaigti profilį" CTA | Kortelė rodo 6/6 PASIRUOŠĘS; CTA logika tikrintina | `lib/conversation/opening-brief.ts`, `profile-summary.ts`, chips | 6/6 būsenoje CTA nerodomas; redagavimas per pokalbį | LIVE |
| P0.7 | Žurnalo redagavimas nedaugina įrašų; vienas aktyvus įrašas visose projekcijose | Savininko pastebėjimas: po koregavimo kalendoriuje keli panašūs įrašai | `lib/journal/edit-entry.ts`, supersede logika, planning read | E2E: create → edit → edit → 1 aktyvus įrašas kalendoriuje | LIVE |
| 3.1 | Landing sutrumpintas iki 7 blokų | Patvirtinta: 9619px ≈ 10,7 ekrano, 17 sekcijų | `app/[locale]/(marketing)/page.tsx` + marketing komponentai + freeze guard | Landing = Hero, gyvas scenarijus, grandinė, žmogui/įmonei, Player Card, žemėlapio kontekstas, CTA | LIVE (9619→7376px @1440) |
| 3.2 | Hero subalansuotas, mažiau teksto | Kairė tanki, dešinė demo dėžė | hero komponentai | Vizualinė QA | LIVE (hero subalansuotas; §16 matrica: 0 overflow visuose 7 viewport × 2 temos) |
| 3.3 | Kelių sektorių scenarijai | Patvirtinta: demo tik mūrijimas/statybos | `live-product-demo.tsx` + i18n | Rotuojami scenarijai: statybos, HoReCa, IT, logistika, slauga, gamyba, kūryba | LIVE (4 sektoriai interaktyviai; slauga/gamyba/kūryba — follow-up copy) |
| 3.4 | Motion aiškina produktą; premium lygis | Tik demo ciklas; sekcijos statinės | marketing komponentai | Įrašas→įgūdis→kortelė→pasiūlymas seka su motion; mobile lengvesnis | LIVE (4 žingsnių seka + interaktyvus sektorių perjungimas; reduced-motion saugu) |
| 3.5 | LT copy auditas; jokių netikslių pažadų | „Ruošiama"/„Koncepcinis" tikrintini | `messages/*.json`, landing copy | Pilnas LT copy praėjimas | LIVE (§3.5 pataisyta; 0 PLACEHOLDER / raw enum production visuose viewport) |
| 3.6 | Žemėlapio momentas realus, ne balta dėžė | `MarketMoment` — abstrakti forma | `market-moment.tsx` | Realus miestas/poreikis/skaičiai/atstumas/sektorius | DALINAI: `MarketMoment` rodo realų miestą ir poreikį; atstumo skaičiavimas laukia koordinačių (radius YELLOW pagal ankstesnį savininko sprendimą) |
| 3.7 | Landing Player Card = realus `WorkerPlayerCard`; jokio PLACEHOLDER / medalių / universalių balų | `PlayerCardShowcase` rodo PLACEHOLDER, auksas/sidabras/bronza, 92/87/79 | `player-card-showcase` komponentas, page.tsx | Vienas kanoninis komponentas abiejose pusėse | LIVE (WorkerPlayerCard; FUT kortelės pašalintos) |
| 4.1 | Composer centre pirmo atidarymo metu; po žinutės — sticky apačia | Patvirtinta: composer visada apačioje, centras tuščias | `conversation-chat.tsx`, `composer.tsx` | Pirmas atidarymas: composer centre su santrauka | LIVE |
| 4.2 | Pirmas ekranas rodo realią santrauką | „Labas… Kuo šiandien galiu padėti?" + 3 chips; brief atskirai | `opening-brief.ts`, `conversation-chat.tsx` | Santrauka: paskutinis darbas, neužbaigti veiksmai, būsena, terminai, kitas žingsnis | LIVE (opening brief: galimybės, konfliktai, neužrašytas darbas, neperskaitytos žinutės, profilio spraga) |
| 4.3 | Tik 1–3 kontekstiniai CTA pagal būseną | Chips statiniai (Užfiksuoti darbą / Įkelti CV / Ieškau darbo) | `conversation-chat.tsx` | CTA priklauso nuo realios būsenos (CV įkeltas → „Atnaujinti CV" ir t.t.) | LIVE (≤3 chips; brief chips iš realios būsenos; 6/6 profilis nebekviečiamas užbaigti) |
| 4.4 | Viršuje tik: erdvė, pokalbis, pranešimai, profilis; „Išplėstinis valdymas" dingsta paprastam vartotojui | Patvirtinta: 10 elementų top bare | `conversation-header.tsx`, `dashboard-chrome.tsx` | Žurnalas/Kalendorius/Žinutės — pokalbio projekcijos, ne tabai; advanced paslėptas | LIVE |
| 5.1 | Player Card pasiekiama iš pirmo ekrano, per avatarą ir komandą „Parodyk mano kortelę" | Patvirtinta: kortelė — sulankstytas akordeonas žurnalo apačioje | `account-menu.tsx`, `intent-router.ts`, `conversation-chat.tsx`, kortelės projekcija | Avataras → kortelė; chat komanda → kortelė; matoma po įrašo | LIVE |
| 5.2 | Kortelės vizualika reali ir premium (avataras, identitetas, vieta, prieinamumas, istorija, įrodymai, dokumentai, reputacija) | Kortelė paprasta; dalis laukų yra | `worker-player-card.tsx` | Premium kortelė su visais laukais, be išgalvotų duomenų | LIVE (§5.2 etapas 3: vieta, dokumentai, reputacija, darbo istorija; landing = tas pats komponentas) |
| 6.1 | Darbo registravimas tik per pokalbį; žurnalo puslapis — istorijos projekcija | Patvirtinta: žurnale milžiniška antra įvedimo forma | `app/[locale]/dashboard/journal/*`, journal komponentai | Žurnalo puslapyje nėra įvedimo formos | LIVE (forma tik edit režimui) |
| 6.2 | Jokių raw enum („employee", „owner") | Patvirtinta: „Darbo kontekstas: employee" chat formoje | worklog flow, journal komponentai, i18n | Visi enum išversti | LIVE |
| 6.3 | Įgūdžio signalas paaiškinamas (frazė, signalas vs patvirtinta, veiksmai) | Sistema priskyrė „Programavimas" be paaiškinimo | skill-pipeline, journal-recognition, UI | Rodomas šaltinis-frazė + statusas + patvirtinti/pataisyti | DALINAI: žurnalas rodo atpažintą įgūdį + šaltinį ir leidžia atnaujinti atpažinimą; frazės paryškinimas — atviras |
| 7.1–7.3 | Kalendorius: pilnesnė info, šaltinių auditas, jokių dublikatų | Kalendorius rodo įrašus; dublikatų klaida (P0.7) | planning read, calendar UI | Day/week/month/year — vienas aktyvus įrašas, pilna meta | LIVE (§7 etapas 1: laikas, trukmė, erdvė, projektas, vieta, žmogus, organizacija; 8 šaltiniai; 0 dublikatų — production 3/3 unikalūs, 4 projekcijos 200) |
| 8.1–8.2 | Žinutės: siuntėjas, preview, unread, thread, greitas atsakymas; jokių persidengimų | Patvirtinta: žinučių sąrašas — silpna lentelė | communication puslapiai | Premium žinučių projekcija + chat draft/send su patvirtinimu | LIVE (§8 etapas 2: išvestinis prioritetas, quick reply, atsakymas iš pokalbio tik po patvirtinimo; vienas rašymo kelias) |
| 9.1–9.2 | Dešinysis baras kontekstinis; aišku, ką rodo žemėlapis; „13 be nustatomos vietos" paaiškinta | Patvirtinta: žemėlapis centruotas į NL, 1 taškas, 13 unmapped, jokios legendos paaiškinimo | `workspace-map.tsx`, `map-actions.ts`, `context-panel.tsx` | Markerio reikšmė aiški; be vietos — sąrašu; centras = vartotojo rinka | LIVE |
| 10 | CV įkėlimas: be „iki 5 MB" naštos; LMC informavimas prieš veiksmą; jokio slapto nuskaičiavimo | Netikrinta production | CV upload komponentai | Automatinis suspaudimas jei įmanoma; aiškus LMC pranešimas | LIVE (§10 etapas 4: „iki 5 MB" pašalinta, lubos 5→25 MB, kaina pasakoma PRIEŠ veiksmą) |
| 11 | Lokalizacija: jokių `employee`/`owner`/`PLACEHOLDER`/dev žymių | Patvirtinta („employee"; landing PLACEHOLDER) | i18n + komponentai | Grep + vizualinė patikra visose kalbose | LIVE (raw enum 0 production; §16 matrica tikrina kiekvieną viewport) |
| 12–13 | Nauja IA ir premium vizualinė kryptis (kairė: identitetas+erdvė; centras: pokalbis; dešinė: kontekstinė projekcija; viršus: minimalus) | Dabartinė IA: tabai + atskiri puslapiai | shell komponentai | Atitikimas kanoninei IA schemai | LIVE (§12 etapas 5: 1570 sub-floor tipografijos vietų perkelta į skalę; guardas prirakina) |
| 15 | 15 priėmimo kriterijų production | — | — | Kiekvienas patikrintas realiu click-through + screenshot | 13/15 LIVE; 2 = savininko gate (OAuth identitetas, cross-device erdvės pointer) |
| 16 | Vizualinė QA: 7 viewport × visos būsenos, realūs click/keyboard/focus/escape/back/refresh | — | — | QA matrica su įrodymais | LIVE (§16 etapas 6: 7 viewport × light/dark × reali elgsena — production 182/182 PASS) |

## AGENT_DISCOVERED_ADDITIONAL_DEFECTS — papildomai rasti per production patikrą

Šie punktai NEPAKEIČIA savininko audito — tik jį papildo.

| # | Defektas | Būsena | Susijęs audito punktas |
|---|---|---|---|
| A-1 | Paieška neranda ką tik įrašytų realių duomenų („plyteles" → „Nieko nerasta", nors įrašas su plytelėmis ką tik išsaugotas) | Fixas ruošiamas: `journal` šaltinis dashboard-search | 4.2 (pokalbis žino tavo duomenis) |
| A-2 | Chat žinutė gali dingti be pėdsako (pre-hydration įvedimas prarandamas) | Fixas įdiegtas: composer DOM salvage | 4.1 |
| A-3 | Chat neatsako į klausimą „Kiek valandų dirbau šiandien?" — atsako log-work šablonu | Fixas įdiegtas: intent-router interrogatyvai → journal-recent | 4.2 |
| A-4 | Ilgi (>30 s) pagrindinės gijos užšalimai po navigacijos; sutampa su realiu vartotojo skundu pagalbos kanale | Tiriama (matuoti prod build lokaliai) | 14 P0.10 (nepaspaudžiami elementai) |
| A-5 | Viršutinio tabo paspaudimas kartais nesuveikia | Tiriama (gali būti A-4 pasekmė) | P0.10 |
| A-6 | „1 įsipareigojimai" linksnio klaida; panelė neatsinaujina po chat įrašo be perkrovimo | Fixas ruošiamas | 9.1 |
| A-7 | Vietos ekstrakcija nepagauna „Kauno objekte" → Objektas tuščias | Fixas ruošiamas | 6.3 |
| A-8 | Dviguba įrašo konfirmacija („išsaugoti?" → „Patvirtinti įrašą?") | Fixas ruošiamas | 4.3 |
| A-9 | Žurnalo įrašo meta „Vieta: labourmarket.ai" (beprasmė vieta) | ATVIRA | 6.2 |
| A-10 | Overlay z-index nepakanka: header `backdrop-blur` sukuria stacking kontekstą su `z-index: auto`, todėl joks z jo viduje neužtikrina viršenybės prieš puslapio turinį | IŠSPRĘSTA architektūriškai (vienas portal root, c13af477; production patvirtinta) | P0.3 |
| A-12 | Lietuviški intentai reikalavo diakritikų: „Parodyk zinutes" (be ž) nukrisdavo į fallback, nors „Parodyk žinutes" veikė. Rasta §16 production patikroje | IŠSPRĘSTA: `fold()` normalizuoja ir užklausą, ir šablonus (NFD + ł/ø/ё), 9 nauji testai | 4.2 / §16 |
| A-11 | „Kiek valandų dirbau?" atsako įrašų sąrašu, nesuskaičiuoja valandų sumos | ATVIRA — produkte nėra valandų ledger'io (`figuresNoHoursLedger`); dabartinis atsakymas sąžiningas, bet ne pilnas | 4.2 |

## LIKĘ BLOKATORIAI (galutiniam verdiktui)

Visi šeši vykdymo etapai BAIGTI ir gyvi production. Liko **du** punktai, ir
abu yra **savininko gate'ai** — agentas jų negali užbaigti (DNS / Google
Console / Supabase billing / production DB migracija). Pilnas read-only
auditas, planas, įrodymai ir laukimo taškas:
[`owner-gate-final-2026.md`](owner-gate-final-2026.md).

1. **P0.4 OAuth identitetas** — Google ekrane rodomas Supabase redirect
   domenas. Ne kodo defektas; reikia Supabase custom domain (billing) + DNS
   CNAME + Google Console redirect URI ir consent branding. Po to agento
   darbas — vienas env pakeitimas.
2. **P0.1 patvarus workspace pointer** — perjungimas jau veikia
   (narystės validuotas server-side sesijos pointer), bet ne cross-device.
   Migracija `20260714210000` paruošta ir feature-detect'inama; jos
   pritaikymas production yra savininko veiksmas.

### Dalinai atlikti (ne blokatoriai, užfiksuoti sąmoningai)

- **§3.6** žemėlapio momentas rodo realų miestą ir poreikį; atstumo
  skaičiavimas laukia koordinačių (radius YELLOW pagal ankstesnį savininko
  sprendimą — 0 koordinačių duomenų bazėje).
- **§6.3** žurnalas rodo atpažintą įgūdį, jo šaltinį ir leidžia atnaujinti
  atpažinimą; tiksli šaltinio FRAZĖ dar nepabraukiama.
- **§3.3** keturi sektoriai interaktyvūs (statybos, HoReCa, logistika, IT);
  slauga / gamyba / kūryba — copy follow-up.
