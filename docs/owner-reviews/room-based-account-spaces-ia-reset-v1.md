# Owner review — Room-based account spaces IA reset v1

**Provisional owner review before deploy. Final verdict after deploy.**

## Problem summary
The dashboard risked feeling like "role soup": although content is already
scoped to the account's active role, the current space was never explicitly
named, and buyer copy could imply buying *workers*. The room principle — one
account, several separated spaces, one clear current space at a time — was not
visible in the IA.

## Room / space principle (applied)
Each space now opens with a **current-space header**: the space name + one short
purpose sentence + a compact **"Mano erdvės / My spaces"** link to reach other
spaces — without loading other spaces' content into the current page.

Role → space mapping (`CurrentSpaceHeader`):
| Active role | Space |
|---|---|
| worker | **Asmeninis profilis / Personal profile** |
| company | **Įmonės darbo erdvė / Company workspace** |
| agency | **Agentūros erdvė / Agency space** |
| customer | **Pirkėjo erdvė / Buyer space** |

## Before → after
- **Personal profile (worker):** before — role chip only. After — "Asmeninis profilis · Tvarkykite avatarą, CV, įgūdžius ir darbo statusą." + My spaces link.
- **Buyer space:** before — chain-action subtitle said *"…prekės, paslaugos, **darbuotojo** ar komandos"* (implied buying a worker). After — *"…prekės, paslaugos, **specialisto, meistro, rangovo, tiekėjo** ar komandos"*; current-space header *"Pirkėjo erdvė · Kurkite ir valdykite užklausas…"*. **A buyer no longer buys workers** (guard-enforced).
- **Company workspace:** current-space header *"Įmonės darbo erdvė · Valdykite projektus, komandas ir darbuotojų paiešką."* — hiring language, kept separate from buyer.
- **Company-as-buyer:** copy defined as a distinct concept; it is a **sub-mode of the company space, not a separate role yet** (see limitations).
- **Agency space:** *"Agentūros erdvė · Siūlykite kandidatus ar komandas…"* — guard asserts it is not labelled as a buyer.
- **Space switcher:** the all-roles catalogue intro reframed role→space ("Jūsų pradinė erdvė nėra apribojimas… kitas erdves pridėti"); `Mano erdvės / Keisti erdvę / Pridėti erdvę` labels added. The switcher remains the existing role switch surface (`/dashboard/account`).

## What was hidden / removed from wrong spaces
This v1 is an **additive IA correction** (the dashboard composition is heavily
guarded). It does **not** remove the existing all-roles catalogue or future-
module grid (both already sit at the bottom and are honesty-gated). Instead it
makes the **current space obvious at the top** and reframes the catalogue as the
"add space" surface. No cross-space content was added to any page.

## Known limitations / missing model
- A full per-space **route separation** (e.g. distinct space URLs) and an
  **account-space persistence model** beyond `active_role` are not built here —
  that needs a larger IA + data pass. Flagged, not faked.
- **Company-as-buyer** has no dedicated role/route yet; it is described in copy
  as a company sub-mode. A real split needs an owner decision on the model.
- Demoting/relocating the all-roles catalogue and future-module grid into the
  switcher is deferred to avoid destabilising the guarded dashboard composition.

## Routes affected (copy/UI only)
- `/[locale]/dashboard` (current-space header on worker + non-worker branches; buyer chain-action subtitle)

## Validation
typecheck ✓ · lint ✓ (pre-existing warning only) · build ✓ · full vitest
**1368 passed / 99 files** ✓ · migration-safety **GREEN** · `git diff --check` clean.

## Identifiers
- Branch: `feat/cc/room-based-account-spaces-ia-reset-v1`
- Base main SHA: `a4b0563`
- Head SHA: see the PR (open, **not merged**, **not deployed**)
