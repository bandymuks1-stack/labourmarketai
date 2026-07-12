# User Interaction Inventory v1

Companion to `user-journey-root-cause-audit-v1.md` (branch
`feat/user-journey-root-cause-repair-v1`, 2026-07-12). Status values:
**OK** (already honoured the contract), **REPAIRED** (fixed in this branch),
**CONTAINED** (unreachable preview surface, guard-pinned), **DEFERRED**.

## 1. Actionable / card-like surfaces

| Surface | File | Contract | Status |
|---|---|---|---|
| ActionCard primitive (all dashboard module grids) | `components/app/action-card.tsx` | always a real link, min-h-11, focus ring | OK (reference pattern) |
| Hub person card: header + skills/supported/entries tiles | `premium-hub/premium-hub-person-card.tsx` | header → profile; tiles deep-link `#profile-edit` / `#capabilities` / `journal#journal-entries` | REPAIRED (RC8) |
| Hub person completeness bar | same | informational progressbar (checklist lives in MyZone) | OK (deliberately passive) |
| Hub company card: header + team/projects/invitations tiles | `premium-hub/premium-hub-company-card.tsx` | header → company space; tiles → `#company-team` / `/dashboard/projects` / `#company-invitations` | REPAIRED (RC8) |
| Hub project card: title, image block, team/photos tiles | `premium-hub/premium-hub-project-card.tsx` | title/image → project (+`#project-gallery`); team → operations; photos → gallery anchor | REPAIRED (RC8) |
| Hub project readiness bar | same | informational progressbar | OK (deliberately passive) |
| Hub market-map preview + signal tiles | `premium-hub/premium-hub-market-map.tsx` | ONE full-zone link → `/dashboard/market-map` | REPAIRED (RC8) |
| HubStat primitive | `premium-hub/premium-hub-primitives.tsx` | href → full-surface link; no href → affordance-free statistic | REPAIRED (RC8, shared primitive) |
| Operation counter cards ×8 | `components/app/project-operations-board.tsx` | full-surface button/link, aria-pressed, filter or navigate, scroll-to-list | REPAIRED (RC1) |
| Worker filter chips | same | aria-pressed buttons | OK |
| Worker ops card footer links (Kortelė / Nurodymai / Įgūdžiai) | same | real links | OK |
| Ops-centre attention rows | `operations/page.tsx` | real links/anchors | OK |
| MyZone incomplete status | `components/app/my-zone.tsx` | actionable checklist with deep links | REPAIRED (RC2) |
| MyZone ready status | same | informational chip (allowed: truly informational) | OK |
| Dashboard module grid | `dashboard-module-grid.tsx` + registry | ActionCard links | OK |
| StatusChip primitive | `components/app/status-chip.tsx` | presentation-only by doc contract | OK (kept for truly informational states) |
| visual/worker-card | `components/visual/worker-card.tsx` | presentational — hover affordance removed | REPAIRED (RC7) + CONTAINED |
| visual/job-demand-card | `components/visual/job-demand-card.tsx` | same | REPAIRED (RC7) + CONTAINED |
| ReadinessRing / Stat / Badge / Card primitives | `components/ui/*` | passive, no button styling | OK |

## 2. Warnings / statuses (status-to-action contract)

| State | Title/copy | Next action | Status |
|---|---|---|---|
| "Jūsų informacija dar nepilna" | myZone.incompleteStatus | exact missing items deep-link (profession → `#profile-edit`, first entry → `#journal-composer`), progress line | REPAIRED |
| "Jūsų profilis paruoštas" | myZone.readyStatus | none (informational, styled as such) | OK |
| Skills review banner | `SkillsReviewBanner` | CTA to review | OK |
| Ops "needs migration" save errors | projectOps.needsMigration | generic retry copy, no tech terms | OK |
| Journal deleteBlocked (confirmed entry) | entry.deleteBlocked | points to correction request | OK |
| Geolocation failure states ×6 | marketMapBase.geo* | manual selection always; retry only when it can succeed; open-in-browser guidance in webviews | REPAIRED (RC4) |
| Composer attachment failure states | communication.composer.attachments.* | per-file retry/remove; text never lost | REPAIRED (RC6) |

## 3. Destructive actions

| Action | Label ↔ behaviour ↔ copy | Undo | Status |
|---|---|---|---|
| Journal entry delete | "Pašalinti įrašą" → hidden from list (row preserved for audit) — copy now says exactly that | Atkurti (restore RPC, draft migration) | REPAIRED (RC3) |
| Journal edit (supersede) | pre-confirmation replace, post-confirmation correction request | versioned by design | OK |
| Location reset ("Pašalinti vietą") | clears local selection only | re-pick anytime | OK |
| Buyer attachment remove | removes blob + metadata | re-upload | OK |
| Conversation participant revocation (admin) | revoked_at record, never deletes rows | admin re-add | OK |
| Composer attachment remove (pre-send) | removes tray item + blob | re-pick | NEW (RC6) |

No user-facing copy anywhere contains soft-delete/implementation vocabulary
(guard-enforced across every message catalog).

## 4. Location flows

| Flow | Source of truth | Status |
|---|---|---|
| Device location (map) | localStorage only (`lm.search-location.v1`); never sent to DB | OK |
| Manual country/city/radius | localStorage; structured; no geocoding provider | OK |
| Map tap coordinate | localStorage | OK |
| Journal entry location | per-entry `site_name` metric snapshot; NEVER derived from profile; missing → "Vieta nenurodyta" | REPAIRED (RC5 gap) |
| Profile location | `workers.current_location_country` (country-level only) | OK |
| Project location | `projects.country/city` | OK |
| Public exposure of exact coordinates | structurally impossible (no lat/lng columns; own-marker-only map) | OK |

## 5. Empty / zero states

| Surface | Behaviour | Status |
|---|---|---|
| Ops filter with 0 results | explained per-filter empty copy + "Rodyti visus" | REPAIRED |
| Ops board with 0 workers | copy + assign action | REPAIRED |
| Zero-count counter cards | still activatable; land on the explained empty state | REPAIRED |
| Conversation with no messages | noMessages copy + composer | OK |
| Map with no selection | honest empty map + guidance | OK |
| Journal with no entries | first-use composer flow | OK |

## 6. Messages & attachments

| Requirement | Where | Status |
|---|---|---|
| Text-only / attachment-only / mixed sends | `canSendMessage` (pure) + send action rule + body CHECK 0..10000 (draft migration) | REPAIRED |
| Preview + remove before send | composer tray | REPAIRED |
| Progress / retry / recoverable errors | per-file states | REPAIRED |
| Draft text preserved on failure | composer keeps body + tray on every error path (guard-pinned) | REPAIRED |
| Type/size limits client + server + DB | model constants ↔ RPC ↔ bucket limits | REPAIRED |
| Filename sanitization | `safeAttachmentFileName` (storage key); original kept in metadata | REPAIRED |
| Private storage, participant-only | private bucket + `is_conversation_participant_path` policies + signed URLs (5 min) | REPAIRED |
| No public bucket / URL reuse | no `getPublicUrl` (guard-pinned); signed URLs expire | REPAIRED |
| Orphan-upload minimization | uploader DELETE policy + client cleanup on remove; sweeper deferred | PARTIAL (deferred #1) |
| Mobile camera/photo picker | `accept="...,image/*"` multiple | REPAIRED |
| Accessible labels / keyboard | labelled buttons, focus rings, aria-labels on icon buttons | REPAIRED |
| Duplicate send | send disabled while pending (single transition) | OK |
| Long messages | 10 000-char cap client+server+DB | OK |
| Unread / delivery honesty | last_read_at only; no fake indicators (guard-pinned) | OK |

## 7. Dead ends audited

| Dead end | Recovery now | Status |
|---|---|---|
| In-app browser geolocation block | detected; plain-language copy + open-in-browser steps + manual city selection above the map | REPAIRED |
| Permission permanently denied | settings guidance + manual selection (no useless retry) | REPAIRED |
| Geolocation timeout / no fix | retry (can succeed) + manual selection | REPAIRED |
| "Informacija nepilna" with no path | deep-linked checklist | REPAIRED |
| Counter card tap with no effect | real filter/navigation | REPAIRED |
| Deleted entry regret | inline restore | REPAIRED (gated migration) |
| Attachment upload failure mid-message | retry/remove, text kept | REPAIRED |
| Attachment feature pre-migration | honest "not enabled yet" errors; thread unchanged | REPAIRED (honest degradation) |

## 8. Mobile notes

- Counter activation scrolls the worker list into view (`scroll-mt-4`) so a
  filter tap is never a silent below-the-fold change.
- Map recovery controls render above the map; the map no longer buries the
  manual form.
- All new controls are `min-h-11` (≥44 px) with `focus-visible` rings.
- Bottom navigation overlap: existing pages use padded layouts
  (`pb-*` on the dashboard shell); no new fixed-position elements were added
  by this branch.
