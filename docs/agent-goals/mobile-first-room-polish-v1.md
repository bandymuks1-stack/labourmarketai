# Mobile-first room polish v1

> Spec restored from the `/goal` directive (the original file was missing on
> disk when the task ran; PR #205 review required adding it).

## Goal
Polish the mobile experience after the room-based IA reset (PR #204). Each page
must feel like one clear room, not a compressed desktop dashboard. On mobile,
show the current space, the primary action, and only the cards that belong to
that space.

## Rooms / routes
- `/[locale]/dashboard` — current active space (worker→personal, company→work,
  agency→supply, customer→buyer). No all-roles catalogue, no future-module grid.
- `/[locale]/dashboard/account` — "Mano erdvės / My spaces" switcher room:
  current space, available spaces, add/switch space, modules coming later
  (secondary + inactive-looking). The ONLY cross-space catalogue/switcher surface.
- `/[locale]/dashboard/buyer` — buyer/request only (Sukurti užklausą / Mano
  užklausos / Paskyros duomenys if needed). No CV/company/agency/hiring blocks.
  No "darbuotojo" / worker-purchase wording.
- `/[locale]/dashboard/company` — company work management (Projektai / Komandos /
  Darbuotojų paieška / Sukurti darbo pasiūlymą / Sukurti projekto kontekstą). No
  buyer request UI.
- `/[locale]/dashboard/profile` — personal profile (Avataras / CV / Įgūdžiai /
  Darbo statusas). No buyer/company/agency cards except a compact switch-space link.

## Mobile-first requirements
- Journey labels hidden on mobile + a single current-step line.
- Primary action full-width on phones.
- Each room names its current space + offers a compact "My spaces" switch path.
- Only the current space's cards render; no cross-space blocks by default.

## Hard boundaries
No DB changes. No migrations. No auth/env/billing/payment/outbound. No new
matching. No AI. No new business logic. No fake/demo data. No broad redesign.
Open PR only — do not merge, do not deploy.
