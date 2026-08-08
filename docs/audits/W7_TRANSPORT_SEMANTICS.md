# W7 — `has_transport` vs `own_vehicle` reconciliation

> Status: **W7_TRANSPORT_SEMANTICS_RECONCILED** — copy-only, no migration.

## 1. Audit

| | `workers.has_transport` (v1) | `workers.own_vehicle` (v2) |
|---|---|---|
| migration | `20260613100000_worker_availability_preferences.sql` | `20260711270000_worker_preference_columns_v2.sql` |
| writers | `save_worker_availability_prefs` RPC (profile prefs form), chat intake (`worker-executors.ts:119`), CV import (`cv-section-import-actions.ts`) | `save_worker_availability_prefs_v2` RPC (v2 fieldset of the same form) |
| readers | canonical worker read (`worker-core.ts:42`), CV export private details (`verified-cv.ts:243`), `/cv` page display | canonical worker read; the worker-side mirror of the structured demand criterion `transport.own_vehicle_required` (`structured-demand-v2.ts:126`) |
| declared semantics | mobility — the v2 migration's own comment: own_vehicle is *"distinct from has_transport, which conflates 'can get to work' with ownership"* | ownership |
| copy before this change | **ownership** — en "I have my own transport", lt "Turiu nuosavą transportą", de literally "Ich habe ein eigenes Fahrzeug" (identical to ownVehicle's claim) | ownership — "I have my own vehicle" |

Note: `lib/staffing/fit.ts`'s `w.transport` is a separate staffing-intake
enum (`has_transport` / `needs_pickup` / …), not the `workers` column — it
was checked and left alone.

**Classification: A — legitimate distinct concepts** (the schema doctrine is
explicit and matching depends on the distinction), with a **copy defect**
that collapsed them into the same user-facing claim. In German the two
labels were literally synonymous.

## 2. Fix (no schema change)

All three user-visible surfaces of `has_transport` now state the mobility
claim, first-person and gender-neutral where the W7-S5 voice guard applies:

| key | en after |
|---|---|
| `workerPrefs.hasTransport` | "I can get to work on my own" |
| `conversation.forms.fields.hasTransport` | "Can you get to work on your own?" |
| `cvExport.privateDetails.transport` | "Can get to work independently" |

Real translations in lt/en/ru/nl/de + da (DA `[EN]` debt −1); `[EN]` shells
refreshed in no/sv/lv/et/pl. `workerPrefs.v2.ownVehicle` untouched.

Guard `lib/guards/w7-transport-semantics.test.ts` pins both directions per
active locale: has_transport copy must match the locale's mobility pattern
and must NOT match its ownership pattern; ownVehicle the inverse; and the v2
migration's doctrine comment must stay on record. The W7-S5 voice boundary
test was updated to keep asserting "second-person question" against the
corrected sentence.

## 3. Honest caveat — stored answers

Answers recorded under the old label answered "do you OWN transport". Under
the corrected label a stored `false` now reads as "cannot get to work on my
own", which may understate a transit user's mobility. Every surface is
tri-state ("not stated" is honest), the field is worker-editable on the
profile at any time, and the platform is pre-pilot with a handful of real
worker rows — so no backfill is warranted. If the owner ever wants one, the
only defensible backfill is `false → NULL` ("not stated"), never a guess.
