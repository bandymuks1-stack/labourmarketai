# OWNER REBUILD — FAKTINĖS BŪSENOS AUDITAS (2026-07-29)

Production SHA = `origin/main` = **`60c65244`** (patikrinta per GitHub deployments API).
Viskas, kas sulieta, jau yra production — klausimas tik, kas **matoma ir veikia**.

BEFORE įrodymai: `docs/audits/evidence/owner-rebuild-before/`.

## W1–W6 būsenos lentelė

| W | Kanoninė paskirtis | Main | Production | Vizualiai matoma | E2E veikia | Kas liko |
|---|---|---|---|---|---|---|
| W1 | Active workspace + tapatybė | ✅ (workspace chip, org accents, engagement spine) | ✅ | ⚠️ chip viršuje kairėje; **mobile persidengia su search** | ✅ switch veikia | mobile layout; perjungimo be refresh patikra; duomenų konteksto patikra |
| W2 | State-aware chat + realūs veiksmai | ⚠️ resume-kortelė mount'e YRA, bet **greeting + 6 chip'ų siena** dominuoja | ⚠️ | ❌ „Kuo šiandien galiu padėti?" + 6 mygtukai, nors dešinėje panelė RODO realų kontekstą | ✅ veiksmai veikia | atidarymo santrauka vietoj greeting; 1–3 kontekstiniai veiksmai; chip'ų sienos pašalinimas |
| W3 | Context Panel | ✅ | ✅ | ⚠️ desktop gerai; **mobile — collapse juosta apačioje, ne drawer** | ✅ | mobile bottom-sheet; ryšys su W6 žemėlapiu |
| W4 | AI workspace (7 workflows) | ✅ | ✅ | ✅ veikia per pokalbį | ✅ 9/9 | – (didelių spragų nerasta) |
| W5 | Live Profile Card | ✅ (#915) | ✅ | ✅ sekcija yra | ✅ 5/5 | completeness modelių DVIGUBUMAS: chat „5 esminės dalys" vs kortelės „pillars" — reikia vieno šaltinio |
| W6 | Map slice + context↔map | ❌ **NEPADARYTA** | ❌ | ❌ /market-map = pasaulio žemėlapis zoom 1, default OSM valdikliai, atskira navigacija | ❌ | VISKAS: context↔map ryšys, klasteriai, profesionalus vaizdas, waiver trynimas |

## Owner-visible problemos (patvirtintos ekranais)

| Problema | Įrodymas | Būsena |
|---|---|---|
| Google popup | `google-button.tsx:230` — `ux_mode: "popup"`; GIS aktyvus prod | ❌ P0 |
| Dubliuoti avatarai top bar'e | `auth-chat-1440.png` — „DW" circle (profile link) + „D" circle (AccountMenu) | ❌ |
| Perkrautas top bar | 5 apskritimai + platus „Išplėstinis valdymas" pill | ❌ |
| Mobile top bar persidengimas | `auth-chat-390.png` — workspace chip lenda ant search | ❌ |
| Mygtukų siena | 6 statiniai chip'ai po greeting, desktop + mobile | ❌ |
| Greeting ignoruoja realų kontekstą | panelė rodo „1 įsipareigojimai / projektas", chat — „Kuo galiu padėti?" | ❌ |
| Žemėlapis „siknalapis" | `auth-marketmap-1440.png` — pasaulis zoom 1, +/- OSM valdikliai, tuščias | ❌ |
| Antra navigacija /market-map | kita top nav („Mano erdvė / … / Ryšiai") nei chat'e | ❌ |
| Landing: milžiniškas statinis map blokas hero dešinėje | `prod-landing-hero-1440.png` | ❌ |
| Landing: 10+ sekcijų be pasakojimo | `prod-landing-full-1440.png` | ❌ |

## Stack auditas (motion/3D)

| Biblioteka | Būsena | Sprendimas |
|---|---|---|
| framer-motion | **^12.39 jau įdiegta** (= „Motion for React" linija) | naudoti; nediegti `motion` dublikato |
| GSAP + ScrollTrigger | nėra | **NEDIEGTI** — framer-motion `useScroll`/`whileInView` padengia landing scroll pasakojimą be antros animacijos paradigmos ir +60KB; sprendimas dokumentuotas |
| three / R3F / drei | nėra | **NEDIEGTI** — 3D bundle kaina mobile > vertė; hero sprendžiamas gyva produkto demonstracija (realus UI), ne dekoratyviu 3D; dokumentuotas sprendimas |

## OAuth faktai

- Registruotas redirect URI Google konsolėje: tik `https://gorgitwvdzxbnaxhrsrw.supabase.co/auth/v1/callback` (runbook).
- Consent screen branding: `labourmarket.ai` (Lever 1.5 — atlikta).
- GIS redirect režimui reikėtų NAUJO redirect URI konsolėje → tai vieno veiksmo blokatorius.
- **Legacy same-tab redirect srautas veikia su dabartine konfigūracija** → jis tampa vieninteliu srautu (popup šalinamas). Trumpas supabase.co host'o šmėstelėjimas URL juostoje — sąmoningas kompromisas pagal naują valdovo P0 (popup šalinimas > host kosmetika; consent ekranas jau brandintas).

## Pristatymo planas

1. **PR A — shell UX**: P0 OAuth redirect; top bar (vienas avataras, tooltips); mobile top bar be persidengimų; W2 state-aware atidarymas + kontekstiniai 1–3 veiksmai; W3 mobile drawer; W5 vieno completeness šaltinio pataisa; žurnalo chat-first spragos.
2. **PR B — W6 map slice**: panelės pasirinkimas ↔ žemėlapis; klasteriai; profesionalus stilius; waiver trynimas.
3. **PR C — landing rebuild**: nauja IA + hero + gyva demonstracija + motion.
4. Vizualinė QA (7 viewport × ekranai) → merge → deploy → post-deploy patikra.
