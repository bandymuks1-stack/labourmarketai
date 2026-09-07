# Window report — the walk found six things, and all six were the same thing

**Date:** 2026-09-07 · **Branch:** `feat/cc/window-11-human-journey` · **PR:** #1606
**Base:** `main` @ `481b03c5` · **Class:** GREEN (no migration, no schema, no
production write, no auth-core change)

---

## The sentence this window is about

The owner typed **"noriu pamatyti savo CV"** into the production conversation.
The product opened **"Įkelk savo CV."**

Every other observation in the walk turned out to have that shape. Not one of
them was a missing capability. In each case the capability existed, was built,
was tested and was reachable — and the sentence, the label, or the paint order
sent the person somewhere else. SEP-8 in six instances:

> DATA EXISTS ≠ REACHABLE ≠ VISIBLE ≠ ACTIONABLE ≠ CORRECTLY INTERPRETED

---

## 1. Product-truth result

`node .github/scripts/product-truth.mjs --check` → **PASS**, before and after:
105 capabilities, 24 graph nodes, 6 journeys, both register halves agreeing.

| | before | after |
|---|---|---|
| BUILT_AND_USABLE | 29 | 29 |
| PARTIAL | 51 | 51 |
| BUILT_NOT_CONNECTED | 10 | 10 |
| BLOCKED | 5 | 5 |
| ARCHITECTURE_ONLY | 2 | 2 |
| MISSING | 8 | 8 |
| journey links live | 22 | 22 |
| HUMAN_UI_PROVEN | 18 | 18 |

**The numbers are identical on purpose.** This window added no capability. It
connected what existed and repaired how it is reached. Claiming a register
movement for that would be the SEP-7 failure the register exists to catch.

## 2. What the owner observed

Eight defects across the landing → login → dashboard → chat journey (§16–§30),
listed with their root causes in §4. Two more (§22, §17) are owner gates.

## 3. What I discovered independently

Four, none of them reported, all found by putting the owner's own §18 example
sentences through the router **in five languages** rather than one:

1. **`Ieškau brigados objektui` → `find-work`.** A team wanted FOR A SITE read
   as a person looking for a job. SEP-4 (DEMAND ≠ SUPPLY) — the same class the
   register warns about, this time in the router, on the landing.
2. **`Wir haben 7 Elektriker ab Montag frei` → unrecognised.** The SUPPLY
   direction — the whole point of window 7 — was reachable in Lithuanian and
   dead in EN/RU/NL/DE, because the "free" list held `verfügbar` and
   `beschikbaar` and not `frei`, `vrij`, plain `free`, or the Russian `у нас`.
   The formal register only. Nobody speaks that way.
3. **`Vandaag heb ik 8 uur op de Green TOWER gewerkt` → `who-available`.**
   `wer` sits inside "to**wer**"; `werkt` sits inside "ge**werkt**". A worker
   recording their own day was read as a company asking who is free. The rule's
   own comment already promised that past tense keeps the journal route — it
   did not deliver for the two languages whose past tense is a prefix.
4. **`Noriu pasiūlyti savo paslaugas` → unknown.** The owner's own §18 example.
   Only the present-tense `siūlau` was matched, never the infinitive.

And one false claim in the repository: `GOOGLE_OAUTH_BRANDING_RUNBOOK.md` said
the flow that hides `supabase.co` was **implemented**. It was deleted by an
owner ruling on 2026-07-29. The doc had been wrong for seven weeks, and §22 is
precisely the consequence.

## 4. Root causes

| defect | root cause |
|---|---|
| CV read → import | the IMPORT rule owned the bare `\bcv\b` noun at weight 3; **no rule claimed a read at all** |
| language menu behind the map | the switcher renders an `absolute z-50` panel inside a `backdrop-blur` header; the map card is a later sibling at the same root level |
| only two languages visible | *the same defect* — five render, the map covers three |
| "Viskas… jau nurodyta" | an unbounded quantifier over a bounded set (six pillars) |
| "Trūksta 9 dokumentų" | the brief read a derivation carrying names, countries and requirement levels and printed `.length` |
| two identical notifications | `created_at` and `metadata` reached the component; only `/dashboard/activity` rendered them |
| login loses the story | the sentence travelled in `?next=`; nothing on the page said so |
| "Administravimas" | correctly gated, ambiguously named |

## 5. What was fixed

**§30 · The CV is five requests, not one.** `cv-view` (open what exists),
`cv-choose` (the noun alone → ask, never write), `cv` (import — an explicit
write verb, always), `cv-export` (take it out). Measured across 22 sentences in
LT/EN/RU:

```
before   11 → cv (IMPORT)   3 → cv-export   0 → any view
after    11 → cv-view       3 → cv          4 → cv-choose (asks)
```

**§25/§27 · The language menu escapes the header.** Moved to `AnchoredOverlay`,
the portal its three header neighbours already use. One `inline` opt-out, for
the account menu, which renders it inside its own portal.

**§24 · The dashboard stops contradicting itself.** The readiness line counts
the six pillars and says documents and requests are a separate tally. The
document line names the documents and their countries, through the SAME
`groupMissingDocumentsByType` the workflow layer uses.

**§28 · A notification says when and where.** Both facts were already on the
row. The bell now renders what the activity page has rendered since completion
v1. A derived signal, which carries `created_at: ""` on purpose, still prints
no time — UNKNOWN stays out of the zero bucket.

**§21 · The auth doors show the carried request.** `AuthCarriedIntent` reads the
`?next=` value the page already received and shows the visitor their own
sentence. Nothing when there is none.

**§29 · "Platformos administravimas".** The entry was right; the word was not.

**§16/§18 · The landing's examples span the graph.** Six sentences that were all
one side of the market looking for the other → **ten across nine intents**:
spare capacity, a team for a site, real work recorded, who can verify it. Plus
the four router repairs above, so each new example actually resolves in all five
active locales.

Measured at 375 px, the ten sentences stacked **523 px** — 64% of the viewport,
pushing the entry card's bottom to y=999, below the fold. Below `sm` the strip
now scrolls sideways on one line: **48 px**, card bottom at 524, nothing hidden,
nothing removed, and better than the six-chip state it replaced (314 px).

## 6. What was connected rather than rebuilt

- `/cv` — the CV page and its account-menu entry existed the whole time.
- `groupMissingDocumentsByType` — built for the chat answer, unused by the brief.
- `AnchoredOverlay` — built for exactly this defect, applied to three of four.
- `created_at` / `metadata` on notification rows — carried, unrendered.
- `?next=/dashboard?say=…` — the whole auth-continuity mechanism already worked.
- `MarketMap`'s `"landing"` mode — exists, has no consumer, and cannot get one
  without an owner decision (§9).

**Nothing new was built.** Two new intents and one 20-line component, all of
which route to surfaces that already existed.

## 7. What remains broken

Found this window and deliberately NOT fixed, because each would mean inventing
a door rather than connecting one:

| sentence | classifies as | why it is left |
|---|---|---|
| `Sukelk mano senus darbus` | `find-work` (weight 2) | Historical work import beyond a CV file is `J-IMPORT-HISTORY`, mostly `NOT_BUILT`. Routing it anywhere would fake a door. **Clearly wrong today** — job adverts for a request about past work. |
| `Kas vėluoja?` | unknown | `project-risk` exists but is company-scoped; the worker reading is overdue tasks. Two readings, no disambiguation built. |
| `Ko mums trūks spalį?` | unknown | FUTURE DEMAND is `unrealized` in the graph. Correct to stay unknown. |
| `Ieškau brigados` (no object) | `find-work` | Genuinely ambiguous — a worker seeking a team to join says the same words. Left alone on purpose. |

## 8–24. Status per the owner's checklist

| # | Area | Status | Evidence level |
|---|---|---|---|
| 8 | Landing product understanding | **improved, not solved** — ten sentences across nine intents; the six-step chain and card density (§19) untouched | `TEST_PROVEN` + browser-measured layout |
| 9 | Public market map | **NOT BUILT** — owner gate `HG-2026-09-07` | n/a |
| 10 | Natural-language front door | **BUILT_AND_USABLE**, and four sentences that failed now work | `TEST_PROVEN`, browser-verified on the served landing |
| 11 | Auth continuity | **fixed** — the sentence travelled before; now it is visible | browser-verified on the served login page |
| 12 | Google OAuth trust | **OPEN — owner-only.** The runbook's false "implemented" claim is corrected | code-verified absence |
| 13 | Dashboard actionability | **partially** — the contradiction is gone; the record-completion feel (§23) is untouched | `TEST_PROVEN` |
| 14 | Context switching | **unchanged** — not audited this window | — |
| 15 | Dashboard-map semantics | **unchanged** — the layering defect is fixed; §26's title/marker semantics are not | — |
| 16 | Language + overlays | **fixed**, and the overlay class is now derived, not listed | browser-measured, negative control run |
| 17 | Notifications | **improved** — when + market. WHICH need and WHICH worker still need an authorized entity read | `TEST_PROVEN` |
| 18 | Profile/card/CV coherence | **partially** — the CV's five actions are separated; the Profilis/Kortelė/CV/Žurnalas relationship (§7) is not | `TEST_PROVEN` |
| 19 | "noriu pamatyti savo CV" | → **`cv-view`**, which opens `/cv` with read framing and writes nothing | `TEST_PROVEN` + both negative controls |
| 20 | Chat → existing capability | **improved** — 4 new correct routes, 1 read/write separation, 3 boundary repairs | `TEST_PROVEN` |
| 21 | Search / reachability | **BUILT_AND_USABLE, honest** — curated command registry + the caller's own RLS-scoped objects, people search explicitly excluded and said so. **No change needed** | audited |
| 22 | Calendar / freedom / conflicts | **unchanged** — `J-TIME-FREEDOM` still has DETECT → WARN and five `NOT_BUILT` links | — |
| 23 | Mobile / responsive | **improved** — the landing strip measured at 375 px, before and after | browser-measured |
| 24 | Data preservation / security | **unchanged** — no migration, no schema, no policy, no new read scope | — |

**25. Full quality suite.** `tsc --noEmit` clean · `eslint` 0 errors (39
pre-existing warnings) · `next build` succeeds · `vitest run` **20,542 passed,
3 failed**, all three explained:

- `opportunity-type-internship` ×2 — **pre-existing, Windows-only.** The guard
  compares an embedded `\n` against a working copy checked out CRLF. The files
  are untouched by this branch; it passes in CI.
- `intent-sanity` ×1 — 5 s timeout under full-suite CPU saturation; passes in
  isolation in 2 s. The known local flake class.

**26. Owner gates still required.**

| gate | the one action |
|---|---|
| **§22 Google OAuth** | Google Cloud Console → OAuth consent screen: app name, logo, home page, privacy/terms, authorized domain `labourmarket.ai` (free, biggest win). Optionally restore the GIS flow (reverses the 2026-07-29 ruling) or buy the custom domain (~$35/mo, previously declined). |
| **§17 public market map** | `docs/human-gates/HG-2026-09-07-public-market-map.md` — approve (A) a RED migration for a k-anonymised anonymous geographic aggregate, (B) country-level counts only, or (C) leave it out. |
| the twelve pre-existing owner decisions | unchanged; none touched. |

**27. Evidence level for every material claim.** Stated per row in the table
above. Nothing here is `HUMAN_UI_PROVEN` — no production walk was possible from
this session. The strongest evidence in this window is **browser-measured on a
served build** (the stacking geometry, the locale panel, the landing strip at
two widths, the auth continuity line), which is stronger than a unit test and
weaker than a person using production.

**28. Updated P0 list.**

1. §22 Google OAuth branding — owner-only, one console visit.
2. §17 public market map — owner decision, three costed options.
3. `Sukelk mano senus darbus` → job adverts (historical import has no door).
4. §26 dashboard-map semantics — the map's title does not describe its content.
5. §23 the dashboard still reads as a record to complete.
6. §7 Profilis / Mano kortelė / Mano CV / Darbo žurnalas — four versions of one
   person, relationship still unexplained.

---

## Can a new person now enter, understand, tell it what they want, reach the
## right capability, understand what happened, and continue?

# PARTIALLY.

**What now works end to end.** A visitor lands, reads ten sentences that span
nine directions of the graph rather than one edge of it, types their own words,
sees what was understood, signs in — and the login screen shows them their own
sentence and says it is coming with them. Signed in, "noriu pamatyti savo CV"
opens their CV. The language menu opens in front of the map, with all five
languages. The dashboard no longer tells them everything is done and three
things are outstanding in the same breath, and when documents are missing it
names them and their countries.

**Where it still breaks.**

1. **The landing still explains the product mostly as a market.** The examples
   now span the graph, but the nav is still `Darbo skelbimai · Darbuotojams ·
   Įmonėms · Agentūroms`, the headline is still worker/job-search shaped, and
   the market map that would show the labour market as a *place* is an owner
   gate. §16 is improved, not answered.
2. **The Google screen still says `supabase.co`.** The first thing a new person
   sees at the moment they are asked to trust the product. No code closes it.
3. **The dashboard still reads as a record to complete** (§23). "Ką moku / Ko
   ieškau / Kada galiu dirbti…" before "what matters to you now".
4. **A notification still cannot say WHICH need or WHICH worker.** It says what
   happened, when, and in which market — an improvement, not the answer.
5. **"Sukelk mano senus darbus" still returns job adverts.** Historical import
   beyond a CV file has no door.
6. **Four versions of one person** — Profilis, Mano kortelė, Mano CV, Darbo
   žurnalas — with their relationship still unexplained (§7).

---

## Did any change narrow, hide, duplicate, or contradict the vision?

# NO — and here is the machinery saying so, not me.

**`product-truth.mjs --check` passes identically before and after:** 105
capabilities, 24 graph nodes, 6 journeys, both register halves agreeing. No
capability id was removed, no graph node emptied, no journey link marked
greener than the capability under it.

**No capability was narrowed.** The one change that could have narrowed
something is the CV import losing the bare noun. It did not lose the
*capability*: `cv-read-is-not-a-write.test.ts` asserts that eleven explicit
import sentences across five locales still reach `cvChip`, and that `cv` remains
the ONLY intent pointing at that handler. The chip is untouched.

**No capability was hidden.** The landing gained four examples and lost none.
The ten chips are all present at every width — measured, not assumed: 10 chips
present at 375 px, the strip scrolling rather than truncating, the page not
scrolling sideways.

**No capability was duplicated.** `cv-view` and `cv-export` route to the SAME
existing `/cv` page. `cv-choose` offers the three doors that already exist. The
brief's document line calls the grouping helper the workflow layer already
called, specifically so the two cannot disagree. No new map, no new search, no
second CV surface, no parallel register.

**Question (B) — was anything made impossible that the architecture allowed?**
The one candidate is the `inline` opt-out on `LocaleSwitcher`, which could have
become a second, drifting overlay pattern. It is pinned to exactly one caller
by a guard that names the file, and the guard *derives* which components must
use the portal from the header's own imports — so the extension point (add a
dropdown to the header) is preserved and now enforced, rather than closed.

**And one contradiction was removed rather than added:** the Google OAuth
runbook asserted a capability the product does not have. That is the exact
failure mode this repository's register machinery exists to prevent, and it was
sitting in a document the machinery does not read.
