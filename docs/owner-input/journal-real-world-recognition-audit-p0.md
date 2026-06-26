# Work Journal — Real-World Recognition Audit (P0)

**Goal:** test whether the journal recognizer works on realistic, messy entries —
not only on clean owner examples — and fix only the *safe, deterministic* gaps.

**Method:** 50 blind entries were written the way real workers type — typos, no
diacritics, mixed LT/RU/EN, names, places, numbers, slang, generic filler — and
deliberately **not** optimised to match the dictionary. Each was run through the
three recognizers exactly as the composer uses them:

- `recognizeSkills` (lib/structuring/skill-recognition.ts) → skill chips,
- `extractProfileSkillClaims` (lib/profile/skill-claim-extractor.ts) → capabilities,
- `extractJournalSuggestions` (lib/structuring/extract-journal-suggestions.ts) →
  per-fragment activity labels + time/quantity/work-direction,
- `localizeCapabilityLabel` (lib/structuring/capability-labels.ts) → EN/RU display.

This audit is **audit-first**: no merge, no deploy, no DB/schema/RLS/RPC/Supabase/
env/DNS/billing/payment/auth-core change, no production mutation, no fake skills,
no public test route. The only code changes are deterministic recognizer fixes +
tests, described in §4.

---

## 1. Score summary (50 entries)

| Score | Count | Meaning |
|---|---|---|
| **GOOD** | 32 | Correct signal(s), no false positive |
| **PARTIAL** | 3 | Right where it fired, but missed or loosely-labelled part of the entry |
| **SAFE EMPTY** | 15 | Nothing recognised — and that is the honest, correct outcome (no hallucination) |
| **BAD** | 0 | A wrong/misleading signal (worse than nothing) |
| **DUPLICATE / RAW** | 0 | No raw-slug leak; no duplicate concept on screen |

**Before the fixes in this PR there were 4 BAD entries** (false accounting from
roof tiles, false earthworks from "rašiau", false concrete-worker from a crane,
and cleaning→flooring). **All four are now fixed.** The first three were simple
narrowings; the cleaning→flooring case (#23) is fixed with a deterministic
cleaning-context blocker that suppresses the flooring trade for washed-floor
phrases and maps the exact phrases to the existing cleaning signal (§4.6).
**BAD is now 0.**

---

## 2. Per-entry results

Legend: ✅ GOOD · 🟡 PARTIAL · ⚪ SAFE EMPTY · 🔴 BAD

| # | Entry (abridged) | Detected | Note | Score |
|---|---|---|---|---|
| 1 | mūrijau pamatų sieną, betoną, armatūrą 8h | bricklaying, rebar, concrete + 2 frags | trailing "8h" shows as an unknown time card (minor noise) | ✅ |
| 2 | dazem siena ir glaistem, klijavom plyteles | painting, skim-coating, tiling | typos w/o diacritics handled (fold, not fuzzy) | ✅ |
| 3 | Klojau laminata svetainej ir montavau plintusus | flooring (fuzzy, correct) | skirting ("plintusus") missed; "svetainej" correctly NOT web | 🟡 |
| 4 | tinkavau lubas, 35 kvadratai | plastering, ceiling, qty 35 m² | | ✅ |
| 5 | keitem langus ir duris, dejom gipsa | carpentry, drywall, window/door frags | | ✅ |
| 6 | pjoviau metala, suvirinau remus 6 val | welding, time 6h | | ✅ |
| 7 | kasiau tranšeją vandentiekiui, 20 m | earthworks skill + frag "Santechnika" | trench dug *for* water supply labelled plumbing — borderline | 🟡 |
| 8 | Montavau stogo karkasą ir dengiau čerpėmis | **timber-framing, roofing; cap "Stogų dengimas"** | **FIXED** — was false "Apskaitos sistemos" (accounting) via "erp" ⊂ "čerpėmis" | ✅ |
| 9 | svetainės dizaino, CSS, React 7h | web design + programming, **no construction** | key safeguard holds | ✅ |
| 10 | kuriau logotipą, maketavau bukletą | — | graphic design not in dictionary | ⚪ |
| 11 | Programavau backend API, fixinau bug'us | programming | near-duplicate label note (§5) | ✅ |
| 12 | Testavau aplikaciją, radau klaidas | — | QA/testing not in dictionary | ⚪ |
| 13 | Vairavau furą į Vokietiją, iškroviau | driving | | ✅ |
| 14 | veziau keleivius su bolt | driving (ride-hail) | | ✅ |
| 15 | Pristačiau siuntas po miestą | — | courier not in dictionary (handover guard correctly avoided) | ⚪ |
| 16 | Kroviau paletes, dirbau su krautuvu 8h | warehouse + **heavy equipment** | **FIXED** — bare forklift "krautuv" now recognised | ✅ |
| 17 | rinkau uzsakymus, pakavau, etiketavau | — | order-picking not in dictionary | ⚪ |
| 18 | pjoviau veją, geneju krumus | gardening | | ✅ |
| 19 | Sodinau gėles, ravėjau lysves | gardening | | ✅ |
| 20 | valiau sniega nuo taku, bariau druska | — | winter service missed; importantly NOT mis-read as cleaning-floor | ⚪ |
| 21 | Gaminau pietus, kepiau ir viriau sriubą | **cooking** (3 frags) | **FIXED** — cooking verbs added | ✅ |
| 22 | dirbau virtuvej, pjausčiau daržoves | cooking/kitchen | | ✅ |
| 23 | Valiau biuro patalpas, ploviau grindis | **cleaning ("Valymo darbai"); NO flooring** | **FIXED** — washed-floor phrase no longer read as floor-laying; mapped to cleaning signal | ✅ |
| 24 | tvarkiau kambarius viesbuty, patalyne | — | hotel housekeeping not in dictionary | ⚪ |
| 25 | pristačiau atliktus darbus klientui | client handover | | ✅ |
| 26 | Vedžiau derybas su tiekėju | communication | | ✅ |
| 27 | paaiškinau klientui…, apmokiau komandą | handover + team-coordination | both plausible | ✅ |
| 28 | Dirbau su ekskavatoriumi, kasiau pamatus 10h | earthworks + heavy equipment | trailing "kasiau pamatus 10h" unknown card (minor) | ✅ |
| 29 | valdžiau kraną, kėliau konstrukcijas | **heavy equipment; dir = null** | **FIXED** — was false work-direction "concrete_worker" via "konstruk" | ✅ |
| 30 | pjuklu pjoviau lentas, gręžtuvą, šlifuoklį | — | power-tool carpentry missed (safe — no hallucination) | ⚪ |
| 31 | Prižiūrėjau senelius, daviau vaistus | — | elderly care not in dictionary | ⚪ |
| 32 | auklejau vaikus, vedziau i darzeli | — | childcare not in dictionary | ⚪ |
| 33 | dirbau kasoj, aptarnavau klientus | customer service | cashier "kasoj" missed (no "e") | ✅ |
| 34 | Pardaviau 15 telefonų, konsultavau | sales | | ✅ |
| 35 | tvarkiau dokumentus, rasiau saskaitas, apskaita Rivile | **document handling, accounting, Rivilė** | **FIXED** — was false "earthworks/fuzzy" (rašiau→kasiau) | ✅ |
| 36 | dirbau visa diena, pavargau | — | generic filler | ⚪ |
| 37 | buvo daug darbo, padariau ka reikejo | — | generic filler | ⚪ |
| 38 | tvarkiau reikalus | — | generic filler | ⚪ |
| 39 | 9h | time 9h only | bare time → unknown card (minor) | ⚪ |
| 40 | objektas Vilniuje, Kalvarijų g. 125 | — | place only; correctly no skill | ⚪ |
| 41 | mūrijau | bricklaying | one-word entry | ✅ |
| 42 | vairavau | driving | one-word entry | ✅ |
| 43 | valiau | — | too generic alone; correctly empty | ⚪ |
| 44 | Укладывал плитку, затирал швы, 6 часов | tiling, time 6h | RU | ✅ |
| 45 | Возил груз в Каунас, разгрузил на складе | driving + warehouse | RU multi-task | ✅ |
| 46 | Косил газон, подстригал кусты | gardening | RU | ✅ |
| 47 | Сдал работу клиенту и обсудил | client handover | RU | ✅ |
| 48 | Fixed bugs in the React app | programming | EN | ✅ |
| 49 | Drove the truck to the warehouse, unloaded | warehouse only | EN "and" not split → "Drove" (driving) missed | 🟡 |
| 50 | Laid bricks and plastered the wall 7h | bricklaying + plastering | EN | ✅ |

---

## 3. What works vs what fails (honest)

**Works well (deterministic, no hallucination):**
- Core construction (masonry, tiling, plastering, drywall, welding, concrete,
  rebar, roofing, earthworks) across clean + typo + no-diacritic forms.
- Cross-sector capabilities: IT/web/programming, driving/ride-hail, warehouse,
  gardening, sales, accounting/documents, communication, client handover, cooking.
- Mixed RU and EN entries.
- **Cleaning vs floor-laying:** a floor named with a washing verb ("ploviau
  grindis", "valiau grindis", RU "мыл полы", EN "mopped the floor") is recognised
  as cleaning, not as the flooring trade — while real installation ("klojau
  grindis", "dėjau laminatą", "klojau parketą", "montavau grindis") still
  triggers flooring.
- **Safe-empty discipline:** generic filler, place-only, and unknown sectors
  produce **nothing** rather than a guessed chip. This is the single most
  important property and it holds (15/50).
- **No raw-slug or LT-leak:** every label-only signal in the pack carries a real
  human label and localizes to EN/RU (proper-noun product names like "Rivilė"
  stay as-is by design).

**Fails / limited (documented, not silently hidden):**
- **🟡 #7 trench-for-water-supply → "Santechnika"** — earthworks skill is correct;
  the fragment label leans plumbing because of "vandentiekiui". Borderline, not
  misleading enough to suppress; left as-is.
- **🟡 #49 EN "and"** — the fragment splitter splits on LT "ir"/"bei" and RU "и",
  but not EN "and", so EN multi-task entries stay one fragment and a second verb
  ("Drove") can be missed. Low impact (LT/RU are the enforced locales); noted.
- **Missed sectors (SAFE EMPTY, not wrong):** graphic design, QA/testing,
  courier, order-picking, winter service, hotel housekeeping, power-tool
  carpentry, elderly care, childcare. These are honest gaps — the system shows
  nothing rather than a wrong guess. Adding them is **safe future dictionary
  work** but each needs careful, non-overbroad needles; deferred to avoid
  scope-creep in an audit PR.
- **Minor:** a trailing bare-time fragment ("8h", "9h", "6 часов") renders as an
  "unknown / patikslinkite" card even though the time was captured at entry
  level. Cosmetic; not addressed here.

---

## 4. Fixes applied in this PR (safe, deterministic only)

All are **narrowing or precise additions** — none widens fuzzy matching.

1. **Fuzzy leading-character guard** (`skill-recognition.ts`). The light-fuzzy
   tier required only edit-distance ≤1 on the leading slice, so a 1-edit *first
   letter* swap turned common verbs into trade matches: **"rašiau" (I wrote) →
   "kasiau" (I dug) → earthworks** (#35). Fix: require the first character to
   match before accepting a fuzzy hit. Kills the leading-swap hallucination,
   **keeps real typos** that preserve the first letter ("laminata"→"laminate",
   #3, still matches).

2. **Accounting "erp" needle tightened** (`skill-claim-extractor.ts`). Bare
   `"erp"` is a substring of unrelated LT words — **"čerpėmis" (roof tiles) →
   "Apskaitos sistemos" (accounting)** (#8). Fix: replace bare `"erp"` with
   `"erp sistem"` / `"erp program"`; `"apskait"`/`"buhalter"`/`"rivilė"` already
   cover genuine accounting.

3. **Concrete-worker direction narrowed** (`keywords.ts`). `"konstruk"`
   (konstrukcijas = generic structures/components) mislabelled crane/steel/timber
   work as a concrete worker — **"valdžiau kraną, kėliau konstrukcijas" →
   concrete_worker** (#29). Fix: drop `"konstruk"`; keep the unambiguous
   concreting needles (`betonav`, `betonuot`, RU forms).

4. **Two safe recognition additions** (turn SAFE-EMPTY → GOOD, no false-positive
   risk):
   - **Forklift / crane** (`skill-claim-extractor.ts`, "Sunkiosios technikos"):
     added bare `"krautuv"` (forklift/loader) and **operator-anchored** crane
     needles (`valdžiau/valdziau/dirbau su kran…`, `kraninink`, `bokštinis kran`).
     `"kran"` alone is intentionally **excluded** (RU «кран» = water tap).
   - **Cooking verbs** (`keywords.ts`, ACTIVITY "Maisto gaminimas / virtuvė"):
     added `gaminau piet/vakar`, `kepiau`, `viriau`, `sriub` — cooking-specific
     stems (welding is "suvirinau", distinct from "viriau").

5. **Capability i18n leak fixes** (`capability-labels.ts`). Labels that surfaced
   from the pack were leaking their LT string into EN/RU. Added EN/RU for exactly
   the labels that occur: Santechnika, Apskaitos sistemos, Stogų dengimas,
   Pardavimai, Dokumentų tvarkymas, Maisto gaminimas / virtuvė, Klientų
   aptarnavimas, Programavimas / kodo pataisymai. (Full capability i18n for every
   possible label remains a separate RED — see §5.)

6. **Cleaning-context flooring blocker** (`skill-recognition.ts` +
   `keywords.ts` + `capability-labels.ts`) — the remaining BAD (#23). The
   flooring needle `"grind"` is the one ambiguous floor noun (shared by *laying*
   and *washing* a floor); EN `"floor"` and RU `"пол"` are the same. The blocker
   logic, on folded text:
   - **suppress** the `flooring` slug only when a floor noun appears with a
     **washing/cleaning verb** (`plov`/`valiau`/`siurb`/`sutvark`/`švei`/`мыл`/
     `убра`/`wash`/`mop`/`vacuum`/…) **and** there is **no** floor-laying verb or
     unambiguous material (`kloj`/`dej`/`montav`/`укладыв`/`laid`/`laminat`/
     `parket`/`parquet`/…). So "ploviau grindis" → no flooring; "klojau grindis",
     "dėjau laminatą", "klojau parketą", "montavau grindis", and even the mixed
     "klojau grindis ir paskui valiau dulkes" → flooring kept (laying verb wins).
   - **map** the exact floor-washing phrases ("ploviau/išploviau/valiau grind…",
     RU "мыл polы", EN "washed/mopped the floor") to the **existing** label-only
     cleaning signal **"Valymo darbai"** (no fake slug; `Cleaning`/`Уборка` added
     to the i18n map so it does not leak LT). Ambiguous maintenance phrasing
     ("sutvarkiau grindis") yields **SAFE EMPTY** — honest, not wrong.
   - Also added LT material stems `"laminat"`/`"parket"` to the flooring needles
     so "klojau parketą" / "dėjau laminatą" recognise **deterministically**
     rather than relying on fuzzy.

**Tests added** — `lib/guards/journal-realworld-recognition.test.ts` (33 tests,
25-entry pack + a dedicated cleaning-floor block), covering: the four fixed false
positives stay fixed; the fuzzy guard keeps real typos; **washing a floor is
never floor-laying (LT/RU/EN) while real installation still triggers flooring**;
floor-washing maps to the cleaning signal with no raw slug / no duplicate / no
cert wording; web/design → no construction; generic/unknown stays safe-empty;
RU + EN + safe-typo handling; **no LT leak in EN/RU across the whole pack**;
cooking + forklift additions surface; ≥20 entries run without throwing.

---

## 5. RED — owner-gated, NOT started

These need design decisions or non-deterministic/DB work and are deliberately
left out of this audit PR:

- **General verb-sense parsing** — the #23 floor-wash case is now handled
  deterministically (§4.6), but the same verb-vs-noun ambiguity exists elsewhere
  and a general solution still needs a structured parser / NLP model, not
  substring matching. Other ambiguous trade nouns are not yet guarded.
- **Cleaning as a first-class recognised sector** — only the exact floor-washing
  phrases are mapped today; full cleaning recognition (all surfaces, equipment,
  RU/EN breadth) is a separate dictionary slice.
- **Full capability-label i18n** — translate *every* possible LT capability/
  activity label (this PR only translates the ones the pack exercised).
- **EN "and" fragment splitting + EN driving verbs** — broaden the splitter and
  EN lexicon (low priority; LT/RU are the enforced locales).
- **New sectors** (graphic design, QA, courier, order-picking, winter service,
  hospitality housekeeping, power tools, care, childcare) — safe dictionary
  growth, but each needs vetted non-overbroad needles; batch as a separate slice.
- **Real NLP extraction / structured multi-clause parser / stale-link DB
  backfill / first-class approval workflow / language expansion** — unchanged
  from the PR #513 RED list.

---

## 6. Deliverable status

- **Branch:** `audit/journal-real-world-recognition-p0` (off `main` @ a376300).
- **Draft PR only — NOT merged, NOT deployed.**
- **No** DB/schema/RLS/RPC/Supabase/env/DNS/billing/payment/auth-core change; no
  production mutation; no fake skill; no public test route; no auth bypass.
- **Validation:** `pnpm -F web typecheck` ✅ · `pnpm -F web lint` ✅ ·
  `pnpm -F web build` ✅ · full `vitest` 395 files / 5666 tests ✅.
- **Entries tested:** 50 · GOOD 32 · PARTIAL 3 · SAFE EMPTY 15 · **BAD 0** ·
  DUPLICATE/RAW 0.
