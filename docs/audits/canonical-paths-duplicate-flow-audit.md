# Canonical Paths + Duplicate-Flow Audit — Account / Roles / Profile / CV / Dashboard

**Date:** 2026-06-02
**Branch:** `fix/cc/canonical-paths-duplicate-flow-audit`
**Doctrine:** "one clear output point, many hidden inputs" — one canonical human-facing
place per function; no parallel/duplicate flows; no `Ruošiama` on things that are
already accessible; no built-but-unreachable functionality.

---

## 1. Account / roles

### Finding A — **BUG (fixed): admin shown as "Ruošiama" while the admin UI toggle is rendered**

| | |
|---|---|
| Route | `/lt/dashboard/account`, `/en/dashboard/account` |
| Surface | `app/[locale]/dashboard/account/page.tsx` role list (`rolesRows.map`) |
| Current action (before) | Every role whose catalogue `availability !== "active"` got the blanket `account.preview_workspace` = **"Ruošiama"** tag. `admin` has **no** catalogue row → fell through to "Ruošiama". The same page renders `AdminUiToggle` ("Rodyti admin sąsają") for admins. |
| Classification | **Contradiction / parallel status model** — admin is accessible but labelled as not-yet-existing. |
| Fix decision | Route the role-list chip through the single source `roleStatusChipKey` (the same chips the role catalogue below renders). Special-case `admin` as a **permission grant** (not a workspace role): it is never tagged "Ruošiama" and reads as active access. |
| Files touched | `app/[locale]/dashboard/account/page.tsx` |

### Finding B — **BUG (fixed): two status vocabularies for the same role on one page**

| | |
|---|---|
| Route | `/dashboard/account` |
| Surface | Role list (top) vs the "Mano erdvės / My spaces" `RoleCatalogueGrid` (bottom) |
| Current action (before) | The role list tagged company/agency/customer **"Ruošiama"**, while the catalogue grid on the *same page* tagged them **"Pradėti"** (their real `start-available` status). |
| Classification | **Duplicate/contradictory status surface.** |
| Fix decision | Unify on `roleStatusChipKey` so both surfaces read the one catalogue vocabulary (Aktyvu / Pradėti / Dalinis / Ruošiama). company/agency/customer now read **"Pradėti"** in both places. |
| Files touched | `app/[locale]/dashboard/account/page.tsx` |

### Finding C — Role switcher (header dropdown) — **already correct, no change**

| | |
|---|---|
| Surface | `components/app/role-switcher.tsx` |
| Current action | Reads status from `roleStatusChipKey`; shows "Pradėti"/"Dalinis" for start/partial and only falls back to `preview_workspace` ("Ruošiama") for genuinely `preparing` roles. Admin is rendered as a **badge outside** the workspace switcher, never as a workspace chip. |
| Classification | **Canonical** — single source already; admin correctly excluded. |
| Fix decision | None. `preview_workspace` ("Ruošiama") label is retained because this surface legitimately owns it for preparing roles. |

### Role-card reachability

`worker` = active (links to `/dashboard`). `company`/`agency`/`customer` = `start-available`, each linking to its real setup route (`/dashboard/start/{company,agency,buyer}`) — **not dead placeholders**. `admin` = permission, surfaced via `AdminUiToggle` + the header admin badge → `/dashboard/admin`. No role card is a dead end.

---

## 2. Profile / CV — **canonical, no duplicates found**

| Surface | File | Classification |
|---|---|---|
| Canonical profile/CV page | `app/[locale]/dashboard/profile/page.tsx` | **CANONICAL** — the single editing surface (text-first flow + manual picker + read models). |
| Text-first composer | `components/app/profile-text-first-flow.tsx` | Canonical (prod). Also mounted in the **dev-only** `design/text-first/preview.tsx` (no-op actions, screenshot catalogue — not user-reachable). |
| Manual picker | `components/app/worker-trade-profile.tsx` → `profession-skills-picker.tsx` | Single mount, secondary path inside the text-first flow. |
| Read models | `cv-preview.tsx`, `profile-cv-clarity-card.tsx`, `capability-profile-section.tsx` | Read-only, mounted once on the profile page. |
| CV upload primitive | `components/app/cv-import-upload.tsx` | **PLACEHOLDER (M2 scaffold)** — stores nothing; single render site (`profession-skills-picker.tsx`). |
| CV input panel | `components/app/cv-input-panel.tsx` | Paste→parse; file-pick "coming soon". Mounted in the text-first flow (canonical) + dev preview. |
| CV/profile API | `api/professions/[id]/skills`, `api/workers/[id]/skills`, profile-text/skill-claims/worker server actions | One endpoint per operation. **No duplicate endpoints.** |
| Inbound links | first-use panel, dashboard overview (×2), account, agency, company, buyer dashboards | All converge on `/dashboard/profile`. **No orphan profile surface.** |

**Verdict:** CV/profile is already "one canonical place". The risk is *future* drift (a second upload surface). Pinned by the new guard (see below). No CV runtime change needed.

---

## 3. Dashboard entry points

| Dashboard | Route | Profile/CV link | Status |
|---|---|---|---|
| Worker overview | `/dashboard` | → `/dashboard/profile` (Profession, Skills) | Canonical; read-only counts, edits live on the profile page. |
| Company | `/dashboard/company` | → `/dashboard/profile` | Canonical. |
| Agency | `/dashboard/agency` | → `/dashboard/profile` | Canonical. |
| Buyer | `/dashboard/buyer` | → `/dashboard/profile` | Canonical. |
| Admin | `/dashboard/admin` (+ `AdminUiToggle`, header badge) | n/a | Reachable; honesty fixed (Finding A). |
| Account | `/dashboard/account` | → `/dashboard/profile` | Canonical entry hub; status model fixed (Findings A+B). |

No dashboard owns a parallel profile/CV editor — they all link out to the single canonical page.

---

## Fixes applied in this PR

1. `account/page.tsx` role list now reads its status chip from the single source
   `roleStatusChipKey`; `admin` is special-cased and **never** labelled "Ruošiama";
   company/agency/customer now read "Pradėti" consistently with the catalogue.
2. `product-readiness.test.ts` §5 updated (it pinned the old blanket-tag behavior —
   the "guard codified the bug" pattern).
3. New guard `canonical-paths-integrity.test.ts` pins: one account status source +
   admin-not-preparing; exactly one canonical CV upload surface (allowlisted
   primitives + mounts, with a no-op floor); canonical profile route reachable from
   account. Includes negative controls.

## Intentionally deferred (no change this PR)

- **CV upload activation (M2)** — `cv-import-upload.tsx` remains an honest "coming
  soon" scaffold (stores nothing). Activating real CV import is out of scope and
  forbidden (no new CV storage). The single-surface guard keeps it from being
  duplicated meanwhile.
- **`/design/*` dev catalogue** — reuses production components with mock data for
  screenshots; not user-reachable, intentionally allowlisted, left as-is.
- **Role-list vs catalogue overlap on the account page** — held roles appear both in
  "Mano vaidmenys" and the "My spaces" catalogue. Their status now agrees; merging
  the two sections would be a redesign and is out of scope.
