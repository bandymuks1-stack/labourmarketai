# Demo-to-Real Data Transition Policy

> **Status:** Binding. Complements `docs/PRODUCT_CONSTITUTION.md` §5 ("No fake
> anything") and §9 ("Demo-to-Real Data Transition"), and operationalises the
> existing **Placeholder Content Governance** (`docs/PLACEHOLDERS.md`,
> `apps/web/content/placeholders.ts`). Where this policy and a UX request
> conflict, this policy wins — flag the conflict in the PR.

This policy answers one question precisely: **when is a demo/concept/sample
visualization allowed, and what has to be true before it may be shown as real?**

It exists because the product ships *before* it has real customers, real
matching output, real verified skills, or real platform statistics — yet an
empty landing/product surface would damage first impression and fail to
communicate the WOW product direction. Premium concept visuals are therefore
allowed, under strict honesty rules.

---

## 1. Principle (non-negotiable)

- **Demo / concept / sample visualizations are allowed** in landing and
  product-vision UI when real data is not available yet.
- They are allowed **only** if they support **first impression, product
  explanation, or visual direction**.
- They **must not** be presented as: real production achievements, real active
  users, real verified matching results, real customer metrics, or real
  platform statistics.
- **Real data may replace demo data only when** it is backed by real records,
  real user / company / pilot activity, or a clear, named data source.
- **Matching / scoring / verification visuals may become real only when** the
  actual matching / scoring / verification *logic* exists **and** the source is
  traceable to real records.
- Until then, the visualization may remain as **product-vision UI**, but the
  **surrounding copy must avoid false real-world claims.**

This policy never requires deleting a concept visual. An honest, clearly
classified concept visual is preferred over an empty surface.

---

## 2. Signal classification (the four classes)

Every demo-like signal — a number, chart, map, card, score, ring, feed row,
ticker, badge, or metric — is classified as exactly one of:

| Class | Meaning | May it look "finished"? | Honesty requirement |
| --- | --- | --- | --- |
| **concept** | Pure product-vision UI. The capability is *designed*, not built. (e.g. live match lines, OVR/score rings, "matches today".) | Yes — it shows the direction. | Must sit under a visible product-stage / preview signal; copy must not assert it is happening now. |
| **sample** | Illustrative example values standing in for a real shape of data that *will* exist. (e.g. example worker card, example demand row.) | Yes. | Labelled `Sample` / `Example` where a reviewer could mistake it for a specific real record. |
| **preview** | A real surface wired to **governed placeholder** values, animated/representative, ahead of real data. (e.g. hero counters cycling governed values.) | Yes. | Region carries a product-stage signal (e.g. `PRE-ALPHA · Activity preview`); copy frames it as forthcoming, not achieved. |
| **real** | Backed by real records / real activity / a named source. | Yes. | Must be true. No fabrication, no padding, no inflation. Source must be traceable. |

**Mapping to existing Placeholder Governance** (`docs/PLACEHOLDERS.md`):

- A registered `<Placeholder>` whose `status` is `placeholder` → **concept** or
  **sample** (per its `type` and how it reads in context).
- A `<Placeholder>` whose `status` is `pending-real` → **preview** (real data is
  identified via `replacementSource` but not yet wired).
- A `<Placeholder>` whose `status` is `replaced` → **real**.
- `concept`/`sample`/`preview` are the *reader-facing* honesty classes; the
  registry `status` is the *engineering* lifecycle. They are two views of the
  same governance and must stay consistent.

---

## 3. Transition rules (demo → real)

A signal moves toward **real** only through the existing, friction-ful
promotion flow (`docs/PLACEHOLDERS.md` §Promotion). This policy adds the
**eligibility conditions** that must hold *before* promotion is even allowed:

1. **Records exist.** The value is computed from real rows (users, companies,
   pilots, journal entries, engagements) — not seeded, not hand-entered, not
   estimated.
2. **Source is traceable.** The query / table / activity feed behind the value
   is named and auditable (a `replacementSource` that resolves to real data).
3. **Logic exists (for derived signals).** A matching score, ranking, OVR,
   verification badge, or "matches today" counter may become **real** only when
   the actual matching / scoring / verification *algorithm* is implemented and
   its output is reproducible from real records. A visual is **never** promoted
   to real by relabeling alone.
4. **Consent, where applicable.** Persons / logos / testimonials still require
   the consent step and `docs/CONSENT_LOG.md` entry (unchanged).
5. **Owner approval.** Promotion is owner-authorised via
   `pnpm placeholders:promote <id>`; code never self-authorises a class change.

If conditions 1–3 do not hold, the signal **stays** `concept`/`sample`/`preview`
— that is allowed and expected. Do not fake the data to reach `real` faster.

---

## 4. Copy rules — what must never be claimed until real data exists

While a signal is `concept`/`sample`/`preview`, the surrounding copy MUST NOT:

- state or imply a count of **real active users / workers / companies**;
- present **matches, rankings, or scores** as outcomes that actually happened;
- present **skills, companies, or identities as verified** when no verification
  ran;
- present **customer metrics, revenue, growth, or platform statistics** as
  achieved;
- use **"trusted by", "used by", "X jobs filled", "X matches made"** or
  equivalent achievement claims;
- attach a real brand/person name to a placeholder value.

Allowed framing while pre-real: product-stage labels (`PRE-ALPHA`,
`Activity preview`, `Concept`, `Sample`, `Early access`, "the platform is being
built"), capability/vision language ("live demand and matching, by design"),
and example framing ("example profile").

---

## 5. Current inventory — WOW beta / PR #20

Classification of the visualizations live today. "Condition → real" is the gate
from §3; "Never claim until real" is the §4 line for that signal.

### Landing / product-vision (marketing) — **keep; do not delete**

| Visualization | Class | Condition → real | Never claim until real |
| --- | --- | --- | --- |
| Hero counters (Active workers / Open demand / Matches today / Avg profile strength) — `MarketCounters`, governed `counters.*` cycle | **preview** | Counts computed from real `profiles` / engagement / journal rows with a named query | "We have N active workers / N matches today" |
| LiveMap mission-control (`live.map.*`, geo payloads) | **concept** | Real geo activity from real records | "This shows real workers/projects/matches right now" |
| Player / worker OVR cards, score rings (`card`, `CompanyScoreData`) | **concept** | Real scoring logic exists + reproducible from records | "This worker/company scored N" as a real rating |
| Match lines / "rankedMatches" / recent-match events | **concept** | Real matching algorithm exists + traceable output | "N real matches were made" |
| Market Pulse panels, Draft Board, sparklines (`market.*.series`) | **sample** | Real aggregates from real activity | "These are real market statistics" |
| Partner logos (`partners.logo.*`) | **sample** | Signed partner + consent in `CONSENT_LOG.md` | "Trusted by / used by <brand>" |
| DemoChip `PRE-ALPHA · Activity preview` + `EU-N MARKET · LIVE` badge | honesty signal | n/a | (this is the label that keeps the above honest) |

### App interior (PR #20 dashboard surfaces) — **honest by construction**

| Visualization | Class | Note |
| --- | --- | --- |
| Worker hub next-steps Done/To-do counts (`{n} skills added`, `{n} entries logged`, profession set) | **real** | Computed from the signed-in user's own `worker_skills` / `journal_entries` / `worker_professions` rows. 0 renders as "To do", never padded. |
| Worker "work identity" / "work journal" cards + CTAs | **real** | Static honest copy; links resolve to real routes. |
| Company/agency "Start your activity space" + "Request a pilot" | **real** | Pilot button posts the real signed-in email to the existing `/api/leads`; success is a real lead row, no fabricated state. |

**Why the interior needs no demo labels:** every dashboard signal is derived
from the user's own real records or is honest static copy. There are no
concept/sample/preview signals on the authenticated surfaces in PR #20.

---

## 6. Watch-items (documented, not changed here)

- **`MarketCounters` has no *local* preview label.** In production
  (`NEXT_PUBLIC_SHOW_PLACEHOLDER_MARKERS='false'`) the placeholder outline is
  off, so the four counters rely on the hero-level `DemoChip`
  (`PRE-ALPHA · Activity preview`) and the subcopy "the platform is being built;
  this is the M0 foundation" for honesty. That page-level framing keeps it from
  *clearly* asserting a real achievement, so no copy change is made in this PR.
  A future tiny hardening could attach a per-region `preview` caption to the
  counters. Owner decision; out of PR #20 scope.

## 7. Change control

This policy is amended only by explicit owner/DI decision (same rule as the
Product Constitution). Reclassifying any signal toward `real` always goes
through `pnpm placeholders:promote` + owner approval. No code path may
self-promote a `concept`/`sample`/`preview` signal to `real`.
