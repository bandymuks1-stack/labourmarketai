# Programėlių būsena (M2) — 2026-10-14

Tęsia [`STORE_RELEASE_READINESS_2026-09-13.md`](STORE_RELEASE_READINESS_2026-09-13.md)
(jo §4 savininko vartai lieka galioti) ir
[`../design/DESIGN_MOBILE_COMPLETION_AUDIT_2026-10-14.md`](../design/DESIGN_MOBILE_COMPLETION_AUDIT_2026-10-14.md) §6.
Savininko nurodymas (2026-10-14): parduotuvių paskyros (Apple / Play) atidedamos
iki publikavimo etapo; programėlių **techninis** užbaigimas ir testavimas — dabar.
Nepridedama: Capacitor/TWA, antra kodo bazė. Nekeičiami savininko sprendimai:
prisijungimas tik slaptažodžiu, be push, be kameros, be offline.

Programėlė — esama Expo / React Native `apps/mobile` + bendras
`packages/client-core`; duomenys tik per `/api/mcp`.

---

## 1. Būsenos lentelė

| Sritis | Būsena | Kuo įrodyta |
|---|---|---|
| Android testuojamas APK (release, debug parašas, NE parduotuvei) | **VEIKIA** | `android.yml` → `ANDROID_RELEASE_APK_BUILT` (main run [38556402419](https://github.com/bandymuks1-stack/labourmarketai/actions/runs/38556402419)) |
| Android emuliatorius: paleidimas + prisijungimo nesėkmės kelionė | **VEIKIA** | `ANDROID_EMU_LAUNCH_PROVEN`, `ANDROID_RUNTIME_JOURNEY_PROVEN` (API 34, Maestro `auth-failure-journey.yaml`) |
| Android silpnas ryšys (lėktuvo režimas) | **VEIKIA** (naujas šiame PR) | `ANDROID_OFFLINE_JOURNEY_PROVEN`: prisijungimas be ryšio rodo „could not reach the server", ne „wrong password", forma lieka veikianti (`offline-sign-in-journey.yaml`) |
| iOS simuliatoriaus build + kelionė | **VEIKIA** | `ios.yml` → `IOS_NATIVE_BUILD_PROVEN`, `IOS_SIM_LAUNCH_PROVEN`, `IOS_RUNTIME_JOURNEY_PROVEN` |
| JS paketas (Metro + Hermes) abiem platformoms, client-core testai, typecheck | **VEIKIA** | `mobile.yml` |
| Ikona + adaptive ikona + splash | **VEIKIA** (techniškai) / **savininko patvirtinimas** | `apps/mobile/assets/*` sugeneruota iš esamo ženklo `apps/web/public/app-icon.svg` skriptu `apps/mobile/scripts/generate-app-assets.mjs`; prijungta `app.json` (`icon`, `android.adaptiveIcon`, `expo-splash-screen` įskiepis); prebuild patikrintas (Android `mipmap-*` + `splashscreen_logo`). Guard: `mobile-release-config.test.ts`. **Tai esamas prekės ženklas, ne nauja grafika; galutinę parduotuvių grafiką savininkas tvirtina publikavimo etape (readiness §4.1).** |
| Silpnas ryšys `/api/mcp` skaitymams ir rašymams | **VEIKIA** (logika) / **NEUŽBAIGTA** (įrenginyje prisijungus) | Defektas ištaisytas: RN `fetch` neturi laiko ribos, todėl ekranas galėjo suktis be galo. Dabar kiekvienas mainas turi 30 s ribą (`DOMAIN_REQUEST_TIMEOUT_MS`) → `unreachable` → nesėkmės sakinys + „Try again". Įrodyta `transport.test.ts` „weak network" (8 testai); laidai prisegti `mobile-weak-network.test.ts`. Įrenginyje prisijungus — neįrodyta (žr. §3). |
| Prisijungimas silpname ryšyje | **VEIKIA** | tas pats terminas `supabase-js` klientui (`fetchWithDeadline`); prisijungimas nebekabo be galo |
| Prisijungusio naudotojo kelionė CI (Today / Journal / Profile, rašymas) | **NĖRA** | Reikia savininko veiksmo — §3 |
| Žodynas (sakinio raidžių dydis, UNKNOWN ≠ 0, vienas pagrindinis veiksmas) | **VEIKIA**, su 3 pataisymais | §4 |
| Įgūdžių pavadinimai vietine kalba | **REIKIA PATOBULINTI** | programėlė neturi įgūdžių katalogo; dabar rodomas sutvarkytas serverio žodis („Tile installation"), ne `tile_installation`. Svetainė rodo lokalizuotą pavadinimą. |
| Parašas, Play Internal Testing, TestFlight, EAS projektas | **NĖRA** (savininko etapas) | readiness §4.2–4.3; Apple / Play paskyros atidėtos savininko |
| App Links / Universal Links patvirtinimas | **NEUŽBAIGTA** | kodas yra; laukia `ANDROID_CERT_FINGERPRINTS`, `APPLE_TEAM_ID` (parašo raktų) |
| Push, kamera, offline eilė, Google prisijungimas | **NĖRA** (sąmoningai) | savininko sprendimai, nekeičiami |

---

## 2. Ką CI įrodo ir ko ne

**Įrodo (žalia = tiesa):** Android release APK susikompiliuoja ir įsidiegia; procesas
gyvas 15 s; prisijungimo ekranas tikrai atvaizduojamas; tikras prisijungimo bandymas
vyksta ir nesėkmė parodoma sąžiningai; **be ryšio** rodoma „negalėjome pasiekti
serverio", ne „neteisingas slaptažodis"; iOS — tas pats simuliatoriuje; JS paketas
abiem platformoms; transporto taisyklės (įskaitant laiko ribą) — vienetų testais.

**Neįrodo:** prisijungusios sesijos įrenginyje; Today / Journal / Profile skaitymų
realiame įrenginyje; žurnalo rašymo iš telefono prieš gamybą; fizinio įrenginio
elgsenos; parduotuvių parašo; App Links patvirtinimo; iOS ikonos atvaizdavimo
(iOS prebuild neveikia Windows — įrodoma tik `ios.yml` build'u).

---

## 3. Prisijungusio naudotojo kelionė — kodėl sustota ir ko reikia

Patikrinta 2026-10-14 (tik pavadinimai, jokios reikšmės):

- Repo secrets: `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_DB_URL`,
  `SUPABASE_SERVICE_ROLE_KEY`, `VACANCY_SOURCE_NAV_API_TOKEN`. Variables:
  `PROD_QA_ANON_KEY` (+ vakansijų jungikliai). Aplinka `production-qa` savų
  secrets / variables neturi.
- `prod-qa-walk.yml` sintetines QA tapatybes (`qa.worker+goal3@…`, `qa.owner+multiw@…`
  ir kt.) prisijungia **be slaptažodžio**: `scripts/prod-qa-mint-session.ts`
  naudoja magic-link OTP per service-role raktą. Tų paskyrų slaptažodis
  **neegzistuoja** — tai sąmoningas saugumo sprendimas.
- Programėlė prisijungia **tik slaptažodžiu** (savininko sprendimas), ir neturi
  jokio kelio priimti iš anksto išduotą sesiją (nėra deep-link sesijos
  perdavimo; `detectSessionInUrl: false`).

Todėl saugaus kelio be savininko veiksmo nėra. Atmesti keliai: slaptažodžio
sukūrimas QA paskyrai (kredencialų kūrimas — draudžiama agentui); service-role
rakto naudojimas `android.yml` (veikia ant kiekvieno PR — gamybos raktas PR
darbe); testinė sesijos įterpimo anga programėlėje (naujas auth paviršius —
RED, auth-core).

**Ko reikia iš savininko (vienas iš dviejų):**

1. **Rekomenduojama.** Savininkas nustato slaptažodį VIENAI sintetinei QA
   tapatybei iš `apps/web/lib/testing/prod-qa-guard.ts` allowlist (pvz.
   `qa.worker+goal3@labourmarket.ai`, kurią `prod-qa-walk.yml` jau naudoja kaip
   darbuotoją) ir įrašo jį kaip **aplinkos** secret
   `MOBILE_QA_PASSWORD` aplinkoje `production-qa` (su privalomu peržiūrėtoju),
   o ne repo secret. Tada agentas gali pridėti `workflow_dispatch`-only darbą
   `android.yml`, kuris naudoja `environment: production-qa`, įveda
   `MOBILE_QA_EMAIL` / `MOBILE_QA_PASSWORD` per Maestro `-e` kintamuosius
   (niekada ne į repo, ne į ekrano nuotraukas — viešas repo) ir eina
   Today → Journal → Profile → Settings. PR darbai šio secret negauna.
2. Arba savininkas patvirtina, kad mobilioji programėlė gali priimti magic-link
   prisijungimą (deep-link sesijos perdavimas) — tai produkto / auth sprendimas,
   keičiantis „tik slaptažodis" kryptį, todėl agentas jo nedaro.

---

## 4. Žodyno pataisymai šiame PR (`apps/mobile` tik)

- **Sakinio raidžių dydis (EN):** „Work Journal" sakinio viduryje → „work journal"
  (7 eilutės); kitos penkios kalbos jau buvo sakinio dydžio, navigacija — „Work journal".
- **Mašininis žodis ekrane:** įgūdžio `slug` (`tile_installation`) rodomas kaip
  „Tile installation" (Today dominuojantis įgūdis, Profile sąrašas). Nieko
  neišgalvoja — tik perrašo serverio žodį.
- **Nesėkmė be veiksmo:** Settings „We could not read your workspaces … Try again
  in a moment" neturėjo mygtuko — pridėtas „Try again". Vaidmenų sąrašas, kai
  `profile.get` nepavyko, rodė pasenusį sakinį „this client simply cannot ask
  yet" (netiesa nuo #1737) — dabar rodo nepavykusio skaitymo sakinį + „Try again".

UNKNOWN ≠ 0 ir vienas pagrindinis veiksmas ekrane — peržiūrėta, pažeidimų nerasta
(Today / Journal / Profile / Settings / Log work: `periodMissing`, `figuresNotRead`
yra; po vieną `primary` mygtuką).

---

## 5. Kaip pergeneruoti ikonas

```bash
pnpm install                                         # sharp ateina iš apps/web
node apps/mobile/scripts/generate-app-assets.mjs     # rašo apps/mobile/assets/*.png
node apps/mobile/scripts/generate-app-assets.mjs --check   # nepakeista? (exit 1, jei pasenę)
```

Skriptas paima ženklo `<g>` iš `app-icon.svg` pažodžiui ir tik perdėlioja jį
platformų geometrijai (iOS: nepermatoma, kvadratiniai kampai; Android adaptive:
66 % saugi zona; splash: tas pats, fonas = programėlės fonas `#0B0E14`).

---

## 6. M3 techninis parduotuvių paruošimas (2026-10-14, techninio užbaigimo agentas)

| Pakeitimas | Kodėl (parduotuvės reikalavimas) | Įrodymas |
|---|---|---|
| Prisijungimo ekrane — „Pamiršai slaptažodį?" → web `/auth/forgot-password` | Naudotojas, sukūręs paskyrą programėlėje, turi galėti ją atkurti; viena atkūrimo eiga (web) | `mobile-account-controls.test.ts` |
| Registracijos ekrane — sąlygų ir privatumo politikos sakinys + nuorodos | Apple 5.1.1 / GDPR 13 str.: informuoti prieš kuriant paskyrą | tas pats guard |
| Nustatymuose — viešas `/legal/data-deletion` (be prisijungimo) ir privatumo politika | Google Play Data safety: ištrynimo URL turi veikti be prisijungimo; web privatumo puslapis reikalauja web sesijos, kurios programėlė neperduoda | tas pats guard; `submit_privacy_request_v1` gamyboje veikia (patikrinta 2026-10-14) |
| `ios.config.usesNonExemptEncryption: false` | App Store Connect eksporto atitikties klausimas — tik OS HTTPS (atleista) | `mobile-release-config.test.ts` |
| `ios.supportsTablet: false` | iPad ekranai niekada netikrinti; iPad ekrano nuotraukos nebebus privalomos. Įjungti tik kartu su iPad QA | tas pats guard |
| `android.yml`: targetSdk ir leidimai skaitomi iš **sukurto APK** (`aapt2 dump badging`); targetSdk < 35 arba nenaudojamas leidimas (saugykla, kamera, mikrofonas, vieta, kontaktai, AD_ID) → CI raudonas | Google Play target API riba; RN 0.86 / Expo 57 generuoja 36 | `ANDROID_STORE_POLICY_FACTS_OK` |
| `android.yml`: `bundleRelease` — AAB build įrodymas (debug parašas, NEįkeliamas) | Play priima tik AAB | `ANDROID_RELEASE_AAB_BUILT` |
| Offline Maestro kelionė — vienas pakartojimas | main run 38579167208: Maestro nukrito per 0,2 s prieš pirmą komandą (draiverio ryšys), tas pats commit PR'e praėjo du kartus. Pakartojimas iš naujo tikrina VISAS sąlygas | `android-emulator-journey.sh` |

`SYSTEM_ALERT_WINDOW` paliktas (RN kūrimo perdanga) — CI suvestinė dabar rodo tikrą leidimų sąrašą, kad sprendimas būtų matomas.
