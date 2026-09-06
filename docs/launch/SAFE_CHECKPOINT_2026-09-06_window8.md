# SAFE CHECKPOINT — window 8, 2026-09-06

> Continuation state for the next agent. **Do not re-audit the repository.**
> Read this, then §7 NEXT ACTION.
>
> Previous: `docs/launch/SAFE_CHECKPOINT_2026-09-06_window7.md` (#1590).

---

## 1. What this window was about

One theme, found three more times than expected:

> **The market has two directions, and a surface that cannot tell them apart
> gets it wrong in exactly the same way every time.**

`customer_requests.kind` is not a category — it is the DIRECTION of a market
intent. "Reikia 8 elektrikų" is DEMAND; "turime 20 suvirintojų" is SUPPLY. Both
carry a role, a count, a country and a date, so any surface reading only those
four columns reads supply as demand.

The same shape then turned up in the conversation router, where a question
about **other people** was answered as a personal action by the asker.

---

## 2. Served production

| | |
|---|---|
| SHA at window start | `273bf208` |
| SHA after the direction fix | `6ba74343` (proven by walk) |
| SHA at window end | `10dee91e` (proven by walk) |
| Region | `dub1` · health OK |

---

## 3. Merged this window

| PR | What |
|---|---|
| **#1591** | `market-direction.ts` — the ONE closed-set direction rule; the own-rows reads select `kind`; the company read-back splits into needs vs offered capacity; `loadCanonicalDemand` stops mapping supply to `actionable` demand; 11 locales; guards. **No migration.** |
| **#1593** | the router stops answering a company's coordination question as a personal action; the two production walks that found it. **No migration.** |

## 4. Open — owner gates only

| PR | Class | The one owner action |
|---|---|---|
| **#1588** | RED | **"Apply worker board excludes supply 2026-09-06"** — the worker board still serves 2 agency OFFERS as open jobs. Rebased clean this window: the diff is now exactly the migration, its rollback, and 3 ratchet bumps. |
| **#1594** | RED | **"Apply open needs counts demand only"** — or decide the other way, **"Meter supply separately"**. See §6. |

#1592 was closed and replaced by #1594 (same change, rebuilt on `main` so the
diff is the two billing files only).

---

## 5. What is PROVEN on production, and how

Walks live in `docs/launch/pilot-feedback/walks-2026-09-06/`, with their logs.

### `walk-supply-direction-prod.cjs` — on `6ba74343`, 15 read assertions PASS

An agency says *"Turime 20 suvirintojų, kuriems ieškome darbo Nyderlanduose."*
and then opens its dashboard:

* the offer is read back under **"Jūsų pasiūlyti pajėgumai"** (real Lithuanian,
  not a key);
* every row in that section carries `data-direction="supply"`;
* **no scouting link** stands over an offer (scouting answers "who could fill
  this need" — meaningless over capacity);
* the needs list holds **only** `data-direction="demand"`;
* the honest gap is stated: employers cannot search offered capacity yet, so
  nobody has been contacted;
* no raw translation key anywhere on the screen.

### `walk-operations-report-prod.cjs` — on `10dee91e`, 17 checks, 0 failures

The owner's §31 sentences, verbatim, one live session, read-only:

| | sentence | result |
|---|---|---|
| O1 | "Kas rytoj dirba objekte X?" | **fixed in #1593, re-proven on `10dee91e`** — now answers *"Komanda 2026-09-06 – 2026-09-12 (1 žm.): E2E Worker Two — laisvas"*. Was: *"Kurią dieną ir kiek laiko dirbai?"* |
| O2 | "Kur turime laisvų žmonių kitą savaitę?" | already good — a real roster with availability |
| O3 | "Kokie darbai vėluoja?" | **fixed in #1593, re-proven on `10dee91e`** — now answers *"Projektų būklė (2 aktyv.): … užduočių atvirų 1, vėluoja 0; blokuotų etapų 0; parengtis 0/7"*. Was: *"Darbo paieška yra tavo asmeninis veiksmas."* |
| O4 | "Kiek žmonių trūksta projektui?" | already good — a project picker for readiness |
| R1 | "Šiandien 8 valandas montavome pastolius objekte Kaune." | **proven** — site, date and verbatim evidence all kept; nothing asked twice |
| R2 | "Kam pateikti atliktą darbą?" | **NOT FIXED — see §6** |

---

## 6. What still prevents tomorrow's real use

### 6.1 An agency on the free plan cannot state its capacity at all — #1594

Measured, not inferred. The offer form opens correctly and the save is refused:

> *"Šios organizacijos nemokamas planas leidžia 1 aktyvią poziciją."*

`countActiveOpenNeeds` counted **every** kind, so an `agency_offer` consumed the
employer's active-**need** allowance. The supply door shipped in #1587 answers
the sentence with an upgrade prompt.

The fix changes **which rows are counted**, not any price, plan or limit. Its
consequence is stated rather than hidden: **offered capacity becomes unmetered**.
If supply is to be metered it needs its own limit and its own unit — thirty
offered workers are not thirty paid market intents (§24) — not a borrowed seat
in the demand ceiling. **That is the owner's call, and #1594 does not make it.**

### 6.2 The worker board still serves supply as open jobs — #1588

2 of the 9 rows every worker sees are agency partnership OFFERS with no role, no
country and no headcount. A worker can express interest in them. Cannot be fixed
above the database: `list_open_demand_for_workers`'s closed column whitelist
does not return `kind`.

### 6.3 Nothing reads supply except its owner

#1591 closed the READBACK — an agency can see what it offered. **No employer
can discover it.** That needs a cross-tenant SECURITY DEFINER read (a sibling of
`list_open_demand_for_workers`), which is a RED migration. **Not built this
window** — deliberately: there are already 15+ unapplied RED PRs open, and a
16th sitting unapplied would have added no reachable value tonight.

### 6.4 "Kam pateikti atliktą darbą?" returns job adverts

The worker asks who receives their completed work and gets *"Skydelyje yra 5
viešų darbo skelbimų"* — `find-work` matched the bare noun `darbą`.

**Deliberately NOT fixed.** There is no worker-side "who confirms my work"
intent: `confirm-work` is the employer's side of that loop. Routing it somewhere
plausible would be a guess, and guessing the direction is the whole defect class
this window closed. It needs a product decision about what the honest answer is,
then one intent.

### 6.5 A walk that writes cannot clean up after itself

`service_role` gets **"permission denied for table customer_requests"** (the
revoked-default-privileges class behind #1566) and `customer_requests_delete` is
`is_admin()`. The walk now FAILS loudly and prints the exact statement.

**Both rows this window created were removed** via Supabase MCP `execute_sql`
and the table verified back at its pre-walk shape: **20 rows, 3 `agency_offer`**.

---

## 7. NEXT ACTION for the next agent

In order, and none of them needs a repository audit:

1. **If the owner has approved either gate**, apply it via Supabase MCP
   `apply_migration` (never `supabase db push`), then re-probe:
   * #1588 → the board read returns **7** rows, none `agency_offer`;
   * #1594 → re-run `walk-supply-direction-prod.cjs`; S2 must SAVE as a human
     and the RPC seed must not fire.
2. **§6.4** — decide the honest answer to "kam pateikti atliktą darbą?", then
   one intent. Do not guess a route.
3. **§6.3** — employer-facing supply discovery. One RED migration, sibling of
   `list_open_demand_for_workers`, gated on `kind IN ('agency_offer')`. Compose
   it into the existing scouting surface; **do not build a second matching
   engine or a second supply table.**
4. Keep running the two walks in this folder. They are enforcing, not
   measure-only, and they found every defect this window shipped.

---

## 8. Do NOT re-investigate

* **The direction rule.** It is `apps/web/lib/demand/market-direction.ts`, one
  closed allow-list per direction, `"other"` for anything unrecognised. Never
  re-derive it per surface and never write a deny-list — the guard
  `lib/guards/market-direction-surfaces.test.ts` fails on both.
* **The work-log site extraction.** It works. `SITE_RE` requires two
  characters, so the owner's shorthand "objekte X" is correctly not captured; a
  real name ("Kaune", "Roterdame") is. This was mis-reported as a gap once, in
  the first commit of #1593, and corrected in the second.
* **`opportunity-type-internship`** — 2 tests fail on Windows locally and pass
  in CI (CRLF artifact). They also fail on `main`. Not yours.
