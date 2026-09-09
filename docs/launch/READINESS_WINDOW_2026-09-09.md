# Readiness window — 2026-09-09 · the first click after the promise

Owner directive: *"start from current reality and keep working until
labourmarket.ai is safe and coherent enough for real people and real companies
to be invited today."*

Everything below was **measured**, on production or on the real router, before
it was changed. Where something is only test-proven, it says so.

---

## 0. STATE RECOVERED FIRST

| | |
|---|---|
| `origin/main` | `e7acc283` — *"a person's years of experience are not a workforce offer (#1675)"* |
| Production migration ledger head | `20260908143925_accept_invitation_binds_org_membership_v1` |
| Local branch on entry | `feat/cc/person-page-real-work-and-services` @ `14c30f70` — **stale**, three commits behind; #1673 had already been squashed into main. Reset to `main` before any change. |
| Worktrees | 70+. None touched. `labourmarketai-wt/evid-subject-refusal` still holds the #1646/#1648 drafts and stays until they are merged or closed. |
| Owner-gated, verified still open | #1646, #1648, #1641, #1421 — **none applied**, none merged. |
| Production data | 56 profiles / 56 workers · 17 organizations / 14 companies · 10 submitted company needs + 2 agency offers · 40 journal entries · 1 programme · 2 active service offerings. |

`node .github/scripts/product-truth.mjs` run first, as the contract requires.

---

## 1. THE DEFECT CLASS THIS WINDOW WENT AFTER

**§33's release-defect class: the landing makes a claim and the very next
click cannot honour it.**

Not a theme chosen in advance — it is what an anonymous walk of the four doors
actually produced. Five of the six findings are the same shape, and three of
them are the same shape *twice*: **a capability the product genuinely has,
reachable in one language or through one door and not the others.**

That is worth naming, because it is invisible to the way this repo is normally
tested. Guards are written in Lithuanian, the owner reads Lithuanian, and every
one of these defects **works in Lithuanian**. A German employer, a Dutch agency
or an English-speaking welder hit a wall that no test and no manual check would
ever have shown.

---

## 2. WHAT WAS MEASURED, AND WHAT CHANGED

### 2.1 A welder could not say what they were — in four of five languages

Measured on the real router, one sentence per language:

| | office profession | manual trade |
|---|---|---|
| lt | `Esu buhalteris` → **profession-statement** | `Esu suvirintojas` → **profession-statement** |
| en | `I am an accountant` → **profession-statement** | `I am a welder` → **UNKNOWN** |
| de | `Ich bin Buchhalter` → **profession-statement** | `Ich bin Schweisser` → **UNKNOWN** |
| nl | `Ik ben boekhouder` → **profession-statement** | `Ik ben lasser` → **UNKNOWN** |
| ru | `Я бухгалтер` → **profession-statement** | `Я сварщик` → **UNKNOWN** |

The office professions were in `OCCUPATION_STEM_SOURCE`, which the
`profession-statement` rule read. The manual trades were in
`TRADE_STEM_SOURCE`, which it did not. **Lithuanian passed only by accident of
grammar** — "suvirintojas" ends in `-tojas`, matching the nominative suffix, so
no vocabulary was involved at all.

This is **#1669 exactly one layer up**. There the trades were readable by
DEMAND and not by SUPPLY. Here they are readable by both market directions and
not by a **person describing themselves** — and welder, electrician, plumber,
carpenter, painter, driver, cook, cleaner and scaffolder are who this product
is for. §5A's probe list opens with this sentence.

Fixed by reading the ONE shared list, not a second copy of it.

### 2.2 Saying WHERE broke saying WHEN

§5A's probe "I can work in Germany from Monday." — one sentence carrying both
facts §5B asks a person for.

| | with the country | without it |
|---|---|---|
| lt | `Galiu dirbti Vokietijoje nuo pirmadienio` → **availability** | availability |
| en | `I can work in Germany from Monday` → **UNKNOWN** | availability |
| de | `Ich kann in Deutschland ab Montag arbeiten` → **find-work** | availability |
| nl | `Ik kan in Duitsland vanaf maandag werken` → **UNKNOWN** | availability |
| ru | `Могу работать в Германии с понедельника` → **UNKNOWN** | availability |

Every non-Lithuanian pattern required the time word **immediately** after the
verb; naming the country pushed it out of reach. German was the worst of the
five — it did not fall silent, it answered a person stating their availability
with a **job search** (§14: a fluent wrong answer is a failure).

`WHERE_GAP` admits a locative preposition and a token or two — deliberately a
**place phrase, not a wildcard**, because a bare `.{0,20}` reads "I can work
*with people* from Poland" as a stated availability.

Found on the way and also fixed: the **seek guard was on the Lithuanian
pattern only**, so "…, ieškau darbo" correctly ran the search while its four
translations answered with a bare acknowledgement of the availability. Applied
uniformly. A guard prefix can only narrow, so no sentence changed meaning.

### 2.3 The employer's first form knew ten of the seventeen markets

The landing's map band says *"the 17 markets LabourMarket.ai operates in
today"* and names Belgium, France, Spain, Austria, Switzerland, Georgia and the
United States. `/company-need` — the employer door, **one click later** —
offered `READINESS_COUNTRIES`, which answers a different question entirely:
where researched, source-backed document guidance exists.

The list stopped being "the current target markets" on 2026-07-17 (GE/BE/FR/ES/
AT/CH) and again in 2026-07 (US); only the comment above it still said so. A
company in seven of the markets we advertise **could not say where it needed
people**.

Now reads `MARKET_COUNTRIES` — whose own docblock already names this exact use,
and which the signed-in company workspace has read all along. Labels come from
the shared `labourMarket.countryNames` catalogue (all 17 × all 5 active
locales); `companyNeed.countries` carries only ten and would have printed raw
keys for the rest.

**No migration.** `customer_requests.country` is free text with no CHECK
constraint, and this public form persists nothing at all.

**The two lists stay different questions.** The guard pins
`READINESS_COUNTRIES` at ten and as a strict subset — widening the form must
never be done by inventing legal guidance for seven countries nobody
researched.

### 2.4 The agency door was the only one that did not name itself

Window 6 named the institution's door (gap G-C1) so a lecturer would not have
to guess which first-run card was theirs. The agency's door — and both CTAs on
`/for-agencies`, which read *"Create an **agency** account"* — pointed at a
bare `/auth/signup`. A staffing agency that had just told us what it was, by
choosing that door, had to say it again on the next screen; and the nearest
wrong answer there ("hire") makes a plain employer, **not** a
`company_type = 'staffing_agency'`. That is SEP-4 arriving through onboarding.

`AGENCY_DOOR_NEXT` is derived from `nextPathForIntents(["agency"])`, exactly as
the institution's is.

**No new machinery was needed, and that is the finding.**
`doorIntentsFromReturnPath` already inverts the router over *every*
company-intent subset, and `DOOR_WORDS_KEY` already carried `agency`. The
architecture had allowed this the whole time; only the door was unnamed. The
guard asserts the **round trip** — that the far end reads the path back as
`["agency"]` — not merely that a link changed.

### 2.5 The person page printed storage, not sentences

Read back from production: a real worker row carries
`current_location_country = 'LT'`, `preferred_countries = ['NL','DK','NO','SE']`
and `available_from = '2026-07-31'`, and the page rendered all three verbatim —
on the **one cross-person page an employer uses to judge somebody**. §24 bans
raw internal identifiers outright, and for a reader in Russian or Dutch a
two-letter code is not even a weak label.

Slice 4 of the person-presentation work (LOCATION / COUNTRIES, AVAILABILITY).
Nothing about what is READ changed — same columns, same RLS, same
`can_view_worker` gate. Only how the values are said.

Both helpers degrade **to the truth, never to nothing**: a country outside the
catalogue keeps its code, a date that will not parse keeps its stored string.
Dropping either would turn a fact the person *did* state into an absence a
reader would fairly take as "not given" — SEP-7 on the surface where it costs
someone an opportunity.

### 2.6 The map's last line, per §15

Removed: *"…we do not publish that data, so there is not a single guessed dot
on this map. Signed in, you see your market's real state."*
Replaced with: *"Prisijunkite ir plėskite savo galimybes darbo rinkoje."*

**The honesty did not move with it.** The negation a visitor needs — that the
markers are markets and *not* today's activity — has always lived in the
`shows` line above, and that line is byte-identical in all five locales. The
guard was **re-anchored onto `shows`, not relaxed**: it now asserts the
negation word itself per locale, with a control proving a caption that lost the
negation fails.

And **no map data changed to match the shorter copy**: `publicCoverageView()`
still emits no `weight` on any anchor, so no per-place quantity is published.
The new line is additionally pinned to contain no digit at all.

---

### 2.7 The fix broke three unrelated tests, and the reason was worth keeping

Applying the seek guard to twelve more patterns timed out
`conversation-goal`, `intent-sanity` and `education-intents` — **timeouts, not
wrong classifications.** The inline form
`^(?![^]*(?:SEEK_GUARD_SOURCE))[^]*?…` makes a sentence with **no** seek verb
walk the whole alternation at every position and fail everywhere, and
`SEEK_GUARD_SOURCE` contains `\b`, which `p()` expands into the long
`UNICODE_WORD_BOUNDARY` group.

Hoisted into a `Pattern.noSeek` flag, asked once per `classifyIntent` call and
answered in O(1) per pattern — the same meaning, and it also removes the cost
from the three rules that already carried it inline.

**The first reading of this measurement was wrong, and the correction matters
more than the fix.** 1663 ms looked like a production latency defect. It is
not: the *same* sentences measured **46 / 0.3 / 0.6 ms** on the second call and
**1.1 / 0.3 / 0.5 ms** on the third. It is cold-start regex compilation and
JIT, paid once per process — which is why only test processes noticed. `main`
measures 1857 ms for the first sentence too, so this window neither introduced
nor inherited a latency problem, and none is claimed. **Steady-state
classification is under a millisecond and always was.**

The rule to keep: *before calling a router slow, time round two.*

---

## 3. A TRAP WORTH KEEPING

Writing the re-anchored guard, `/\bне\b/` **never matched Russian** — on a
string that plainly reads "а не сегодняшняя активность". JavaScript's `\b` is
defined over ASCII `\w`, so it cannot bound a Cyrillic word. The guard failed
on its first run and the fix is a Unicode look-around:
`new RegExp("(?<!\\p{L})" + w + "(?!\\p{L})", "iu")`.

Same family as the known `\w`-is-ASCII-only trap in the intent router. It is
worth stating as one rule: **any word-boundary assertion over non-ASCII text
must use `\p{L}` look-arounds, never `\b`.**

---

## 4. THE LANDING FREEZE

Regenerated under §15/§32 authority. **Exactly four hashes moved** —
`lib/marketing/public-doors.ts` and the three frozen `*.landing` namespaces —
verified by diffing the baseline against `HEAD`, not asserted. The page, the
hero, the market-proof band and every other frozen artefact are untouched,
which is the proof this stayed two named corrections and did not become a
landing edit. Recorded in `landing-freeze.ts`, per the convention.

---

## 5. FOUND AND **NOT** FIXED — reported, not hidden

1. **A person importing their own history is turned into a COMPANY.** This is
   the biggest thing this window found and did **not** fix. Traced end to end
   through the real modules, in both languages:

   ```
   SENTENCE  I want to upload my old work history
   SENTENCE  Noriu įkelti savo seną darbo istoriją
     intent    hours-import          ← #1670's rule, deliberate
     family    hire                  ← timesheetImport ∈ HIRE_HANDLERS
     pretick   ["hire"]
     identity  ["company"]
     lands on  /dashboard/start/company

   SENTENCE  I want to upload my CV
     identity  ["worker"]            ← correct, for comparison
   ```

   So a person who says **"MY old work history"** on the landing is signed up
   as an organisation and asked to set a company up — and the chip they are
   offered points at `/dashboard/hours?import=1`, the **timesheet** screen,
   not `/dashboard/profile`, where CV and experience import actually lives.
   Both halves are wrong for the actor, and it is SEP-5 (IDENTITY ≠ ROLE) plus
   §7, on the journey §7 calls foundational.

   **Why it is reported and not patched.** `familyOfIntent` maps per-INTENT,
   and `hours-import` is honestly used by both actors — a company
   representative might type "import our old timesheets" on the same box, and
   flipping the constant to `work` would simply move the error. There *is* a
   principled signal available (the sentence's first-person possessive, the
   same structural cue the `profession-statement` anchors already rely on),
   but using it means `familyOfIntent` must see the sentence rather than only
   the intent — a signature change to a mapping that is two days old and was
   made deliberately. Changing that on the last hour of a window, and merging
   it on unit tests alone, is exactly how #1669 became the #1675 regression.

   **FIXED in the follow-up slice** (`fix/cc/a-person-is-not-a-company-on-import`)
   — see §8 below. The resolution was neither of the two options above: the
   sentence decides, by grammatical person, inside `readPublicEntry`, which
   already holds it. `familyOfIntent` keeps its meaning and its signature.
2. **`"I can work on cars"` → `availability`.** Pre-existing: `on` is in the
   from-word list for "on Monday" and is also an ordinary preposition. Not
   touched by this window (verified: the new gap does not widen it), and
   fixing it needs a temporal-token rule, not a bigger word list.
3. **`/for-agencies` says "Baltic + Nordic clients and workers"** — the same
   drift as 2.3, understating coverage rather than overstating it. Copy only.
4. **The employer form's work types are the 43 trades**; the landing's own
   "most in demand" list includes *Teacher* and *Sales assistant*, which an
   employer can only reach as "Other / general work". #1577 is the RED draft
   for exactly this and stays owner-gated.
5. **`PageHero` hard-codes `audience="workers"`** on every signup CTA, so
   agency and company hero CTAs are attributed to the worker funnel.
   Analytics only.

---

## 6. HONEST PROOF LEVELS

| change | level |
|---|---|
| the four router/vocabulary fixes | **BEHAVIOUR_PROVEN** — asserted against the real `classifyIntent`, both directions |
| the door round trip | **BEHAVIOUR_PROVEN** — the path is read back through the real inverse |
| the market list, the person-page labels, the map copy | **CODE_PROVEN** + catalogue-proven |
| the defects themselves | **PRODUCTION_PROVEN** — every one was measured on the live site or against live rows before it was touched |
| any of it after deploy | **NOT HUMAN_UI_PROVEN.** No authenticated browser walk was run in this window. |

The person page in particular is behind `can_view_worker`, so its rendering
after deploy is **unproven by a human** and is named in the owner report as
such.

---

## 7. WHAT NOTHING HERE TOUCHED

No migration. No RLS. No grant. No production write. No data change. No
permission widened. No owner-gated PR merged or applied. `#1646`, `#1648`,
`#1641` and `#1421` are exactly where they were.

---

## 8. FOLLOW-UP SLICE — a person is not a company

Branch `fix/cc/a-person-is-not-a-company-on-import`, stacked on the above.

§5.1's defect, resolved. The two obvious options were both wrong:

* **Flip `timesheetImport` out of `HIRE_HANDLERS`.** Moves the error onto the
  employer who types "import our old timesheets" into the same box.
* **Split the intent.** `hours-import` is genuinely both actors' surface —
  §7 lists timesheets among what a PERSON brings *and* among what an
  ORGANISATION brings — and #1670's routing was right.

**The sentence carries the answer.** Grammatical person is the same structural
signal the router already trusts for `profession-statement`, and
`readPublicEntry` — the only consumer of `familyOfIntent` — already holds the
sentence. So `familyOfIntent(intent)` keeps its meaning and its signature, and
`familyForSentence(intent, sentence)` refines it for the handlers listed in
`ACTOR_AMBIGUOUS_HANDLERS` (today: exactly one).

### The result, measured in all five locales

| | person's sentence | organisation's sentence |
|---|---|---|
| intent | `hours-import` (unchanged) | `hours-import` (unchanged) |
| family | **`work`** | `hire` |
| identity | **`["worker"]`** | `["company"]` |
| lands on | worker default | `/dashboard/start/company` |

### Two things this got right only because both directions were probed

1. **`savo` is REFLEXIVE.** Lithuanian "savo" means *one's own* and belongs to
   whoever the subject is, so it appears in a company's sentence too —
   "mūsų komanda nori įkelti **savo** senus darbo duomenis". A one-sided
   "mine" test reads that as a person. An explicit organisational possessive
   (`our` / `mūsų` / `unsere` / `onze` / `наши`) therefore **always wins**.
2. **A script bug in the first draft.** The Cyrillic branch was written
   `mo(?:…)` with a **Latin** `mo`, so "хочу загрузить **мои** старые данные о
   работе" still came out as an employer. Four of five locales passed and
   Russian did not — caught only by probing all five, which is the whole
   lesson of §2.1 arriving a second time in one window.

### A guard refused this slice's first draft, and was right

`public-entry-real-intent.test.ts` asserts that the entry module **owns no
regex vocabulary** — it must classify through the one router. The first draft
put both possessive patterns straight into `lib/marketing/public-entry.ts`,
which is precisely the second keyword table that guard exists to stop, and
precisely the drift that produced #1669.

They now live beside `PROFESSION_STATEMENT_ANCHOR_SOURCE` in
`lib/structuring/role-label.ts`. That constant answers *who is speaking*;
`speaksOfOwnWork` answers *whose thing is being spoken about* — the same kind
of fact, so the same home. The entry module holds no `.test(`, `.match(`,
`matchAll(` or `new RegExp(`, asserted explicitly.

**The guard was not stale and was not bumped.** That is twice in this window
that a guard nobody here wrote caught a real mistake in this window's own work
— the other being `ctaNext` exclusivity, where the guard's comment named a rule
this window had satisfied without noticing. Neither needed its baseline
raised; §28's warning held both times.

### Freeze, second regeneration

`lib/marketing/public-entry.ts` is in the frozen set, so this slice carries its
own recorded regeneration: **exactly one file hash, ZERO namespaces**, verified
by diffing the baseline against `HEAD`. No copy, no layout, no data and no
vocabulary entered the frozen set.

**Silence is not a claim.** A sentence with no possessive at all keeps the
registry's own answer, asserted directly against `familyOfIntent`. And the
refinement cannot reach anything else: `need-workers`, `find-workers` and
`create-project` stay `hire` even when the sentence says "my workers", and the
`agency` / `student` / `education` families are returned untouched.

Nothing about the intent, the chip, the destination or any signed-in surface
changed — a signed-in employer's timesheet import never calls this module.

**Still true and worth saying:** the person's chip still points at
`/dashboard/hours?import=1`. That surface has a real import mode (read
client-side in `work-hours-quick-entry.tsx`), but its page reaches `kind: "ok"`
only with a company and work objects. **Whether a person importing their own
history belongs there or on `/dashboard/profile` is a product question this
slice deliberately did not answer** — it fixed the identity, which is wrong
under every answer to that question.
