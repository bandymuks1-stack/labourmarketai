# W7-S5 — WORKER PROFILE COPY CONSISTENCY

Makes the strings a worker reads about themselves, while editing their own
profile, speak with one voice. Copy only: no behaviour, no data model, no
route, no migration, no new key.

## 1. Starting state

| | |
|---|---|
| Starting `origin/main` | `d5f3f9a539992d05b450e1af28dde7a8f52bf703` (W7-S4, merged as #1054) |
| Worktree | `C:/Users/Mano/Documents/claud darbai/labourmarketai-wt/w7-s5` — new, isolated, own `node_modules`, own dev server `:3471`, own local-stack `.env.local` |
| Branch | `feat/cc/w7-s5-worker-copy-consistency` |
| Evidence | `docs/audits/evidence/w7-s5/` — 12 screenshots + 2 measurement JSONs |
| Capture tool | `apps/web/scripts/w7-s5-copy-proof.mjs` (refuses any non-loopback base URL) |

## 2. The defect was larger than the brief recorded

The matrix recorded this as *"v1 preferences use first person 'Galiu…', v2 uses
third person 'Gali…'"* — a Lithuanian v1-vs-v2 mismatch. Reading all five
shipped locales shows that was one symptom of a wider problem.

**The mix is in every locale, and it is inside v1 as well as between v1 and v2:**

| locale | v1 | v2 |
|---|---|---|
| lt | `Galiu persikelti` / `Turiu…` (1st) + `Reikalingas apgyvendinimas` (impersonal) | `Gali dirbti…` / `Turi nuosavą…` (**3rd**) |
| en | `Willing to relocate` + `Can work in a team` + **`Has own transport`** / **`Needs accommodation`** | `Willing to work…` + **`Has own vehicle`** / **`Has own tools`** |
| de | `Kann im Team arbeiten` + `Eigenes Fahrzeug vorhanden` + **`Benötigt gestellte Unterkunft`** | **`Hat eigenes Fahrzeug`** / **`Hat eigenes Werkzeug`** |
| nl | **`Heeft eigen vervoer`** / **`Heeft huisvesting nodig`** + `Kan zelfstandig werken` | **`Heeft eigen voertuig`** / **`Heeft eigen gereedschap`** |
| ru | `Могу работать в бригаде` (1st) + `Есть собственный транспорт` (impersonal) | `Готов(а) работать…` (1st) + `Есть собственный автомобиль` |

And a **third** surface the same worker reaches a few sections away carried the
record voice throughout — `cvImport.availabilityKeys`, the chips in
`cv-import-section-review.tsx` where a worker confirms what was parsed from
**their own CV**: `Has own transport`, `Gali persikelti`, `Может работать в
ночные смены`.

So the honest statement of the defect is not "v1 and v2 disagree". It is:

> **A person filling in their own profile was reading a dossier about
> themselves.** Some strings were written by the worker, others about the
> worker by an absent third party.

### Two gender defects found in the same pass

| locale | string | problem |
|---|---|---|
| lt | `Galiu dirbti vienas` | `vienas` is masculine — every woman using the product read a male-only sentence as her own claim |
| ru | `Готов переехать ради работы` | masculine-only, while v2 already used the inclusive `Готов(а)` two fields below |

These were not in the brief. They are fixed here because they are the same
defect class — a self-description that does not fit the person making it — and
because leaving them while rewriting the sentences around them would have been
a deliberate choice not to.

## 3. The rule

> On the worker's own profile, **every statement the worker makes about
> themselves is in the first person, and no string assumes their gender.**

Two things are explicitly **not** covered, because they are correct as they are:

- **Instructions still address the worker in the second person.** `hint` reads
  "State only what actually applies to you". A form that instructs in the
  second person and records claims in the first person is a normal, coherent
  convention — not the inconsistency this slice removes.
- **Chat questions stay in the second person.** `conversation.forms.fields`
  asks "Have your own transport?". A question addressed to someone is correctly
  second person. Pinned by the guard so a later voice sweep does not "fix" it.

**Meaning is never changed.** "Willing to" stays willingness, "can" stays
capability. Only the grammatical person moves:

- `Willing to relocate for work` → `I am willing to relocate for work` (not
  "I can relocate", which would have quietly turned a willingness field into a
  capability field);
- `Can work in a team` → `I can work in a team`.

## 4. What changed

**63 strings, 5 locales, 2 namespaces. No key added, renamed or removed.**

| namespace | strings/locale | surface |
|---|---|---|
| `workerPrefs` (5) + `workerPrefs.v2` (5) | 10 | preference form on `/dashboard/profile` |
| `cvImport.availabilityKeys` (4) | 4 | CV-import review chips, same worker, own CV |

Sample (lt / en / ru):

| key | before | after |
|---|---|---|
| `v2.ownTools` (lt) | `Turi nuosavus įrankius` | `Turiu nuosavus įrankius` |
| `soloAvailable` (lt) | `Galiu dirbti vienas` | `Galiu dirbti savarankiškai` |
| `hasTransport` (en) | `Has own transport` | `I have my own transport` |
| `v2.ownVehicle` (en) | `Has own vehicle` | `I have my own vehicle` |
| `willingToRelocate` (ru) | `Готов переехать ради работы` | `Готов(а) переехать ради работы` |
| `availabilityKeys.nightShiftsOk` (ru) | `Может работать в ночные смены` | `Могу работать в ночные смены` |

The diff is exactly **63 insertions / 63 deletions** — the edit was applied by
scoped string replacement inside each namespace's own brace range, so no
unrelated line, key order or formatting moved.

### Safety check performed before choosing first person

`workerPrefs` is consumed by **exactly one page** — `/dashboard/profile`, the
worker's own self-edit surface. `cvImport.availabilityKeys` is consumed by
exactly one component — `cv-import-section-review.tsx`, the worker reviewing
their own parsed CV. **No employer, agency or admin surface renders either
namespace.** First person would have been wrong if a recruiter could see
"I have my own vehicle" on a candidate card; verified by grep that none can.

## 5. Guard

`lib/guards/w7-s5-worker-self-declaration-voice.test.ts` — 19 assertions:

- per locale, no self-declaration opens in the record voice (`Has`, `Needs`,
  `Hat`, `Heeft`, `Gali`, `Turi`, `Может`, `Есть`, bare `Can`/`Kann`/`Kan`…);
- per locale, every self-declaration opens in the first person;
- the statement set is **14 strings per locale** — so the two rules above can
  never pass vacuously by a key silently disappearing;
- `lt` contains no masculine-only `vienas`; every `ru` `Готов` is the inclusive
  `Готов(а)`;
- the two deliberate exclusions (chat questions; the form's own instructions)
  are pinned as second person, so the scope boundary is defended in both
  directions.

One implementation note recorded in the guard: `\b` is ASCII-only in JavaScript
regex and does **not** match after a Cyrillic letter, so the Russian rules end
with an explicit space-or-end instead. The first version of the guard failed
for exactly this reason, not because the copy was wrong.

## 6. Browser proof

A voice change is cheap to assert in JSON and easy to get wrong on screen:
first-person labels are **longer** than the record-voice ones they replace, and
they sit in a tri-state radio grid. The proof therefore reads the **rendered**
form, in three shipped locales, at both widths.

| locale @ vp | form height before | after | Δ | overflow in form | page overflow |
|---|---|---|---|---|---|
| lt @1440 | 1028 | 1028 | 0 | 0 | none |
| en @1440 | 1028 | 1028 | 0 | 0 | none |
| ru @1440 | 1028 | 1028 | 0 | 0 | none |
| lt @375 | 1642 | 1642 | 0 | 0 | none |
| en @375 | 1610 | 1626 | **+16** | 0 | none |
| ru @375 | 1683 | 1715 | **+32** | 0 | none |

**Cost: +16 px (en) and +32 px (ru) on mobile only** — one and two labels
wrapping to a second line. Desktop is unchanged. **Zero clipped or overflowing
labels, zero horizontal page overflow, zero console errors, zero hydration
warnings** in every locale at both widths.

Rendered text confirmed from the live DOM, not the JSON:

| locale | before (rendered) | after (rendered) |
|---|---|---|
| lt | `Galiu dirbti vienas`, `Turi nuosavus įrankius` | `Galiu dirbti savarankiškai`, `Turiu nuosavus įrankius` |
| en | `Has own tools` | `I have my own tools` |
| ru | `Готов переехать…`, `Есть собственные инструменты` | `Готов(а) переехать…`, `У меня есть собственные инструменты` |

Screenshots: `{before,after}-prefs-{lt,en,ru}-{1440,375}.png`.

## 7. Verification

| check | result |
|---|---|
| `tsc --noEmit` | clean |
| `vitest run` | **860 files / 13993 tests pass** (`--testTimeout=30000`; the 5 s default flakes on tree-scanning guards — same known issue recorded in W7-S4 §9) |
| `check:i18n-debt` | within baseline, **unchanged** (`da=1301, de=0, nl=0, ru=0`) — no key added or removed |
| `check:worker-plain-language` | PASS (en, lt) |
| `check:constitution` | 5 probes pass |
| `check:pilot-honesty-copy` | clean |
| migration | **none** |

## 8. Honest limitations

- **DE and NL were not reviewed by a native speaker.** The changes are
  mechanical person agreement on existing sentences (`Hat eigenes Werkzeug` →
  `Ich habe eigenes Werkzeug`), not new copy, and both locales already carry
  translation debt tracked by `check:i18n-debt` rather than being gated. A
  native pass on the whole DE/NL catalogue remains worth doing and is not
  claimed here.
- **The CV-import review chips were proven by guard and by grep of their single
  consumer, not by a screenshot.** Reaching them requires driving a real CV
  upload and parse; the preference form — 10 of the 14 strings — is
  screenshot-proven. Stated rather than implied.
- **A real content duplication was found and deliberately NOT fixed.**
  `workerPrefs.hasTransport` and `workerPrefs.v2.ownVehicle` are near-duplicates
  in every locale, and in German they were *identical* before this slice
  (`Eigenes Fahrzeug vorhanden` / `Hat eigenes Fahrzeug`, both now
  `Ich habe ein eigenes Fahrzeug`). Whether those are one field or two is a
  data-model question, not a copy question — resolving it here would have
  changed business semantics. Recorded as W7 debt.

## 9. Remaining W7 debt after this slice

| id | debt |
|---|---|
| W7-S5b | a pure company/agency identity silently loses 12 of 21 profile sections with no copy acknowledging it (the other half of the original S5 scope — a rendering/empty-state question, not a voice one) |
| W7 P1-3 | conversation memory — SQL still in `docs/proposals/`, never a migration |
| W7 P2-1 | open-ended bookings skip the overlap guard |
| content | `hasTransport` vs `v2.ownVehicle` are the same claim in two fields (§8) |
| a11y A-2 | 28–29 sub-44 px targets remain on the profile |
| copy | the `marketplaceHub` namespace name is a misnomer after W7-S4 |

## 10. Verdict

**`W7_S5_WORKER_PROFILE_COPY_CONSISTENT`**

Sixty-three strings across five locales and two self-declaration surfaces now
speak with one voice: the worker's own. Two gender defects — a masculine-only
Lithuanian adjective and a masculine-only Russian participle — were found in
the same pass and fixed. The scope boundary is deliberate and pinned in both
directions: instructions and chat questions stay in the second person because
that is correct for them.

The v1-vs-v2 mismatch the matrix recorded was real but was **one symptom of a
three-surface, five-locale problem**, and the correction is stated as such
rather than reported as the narrow fix that was asked for.

**W7 is NOT done.** Six items remain in §9.
