# Profile / CV / Evidence Hub Audit + Integration v1

**Date:** 2026-06-02
**Branch:** `feat/cc/profile-cv-evidence-hub-v1`
**Builds on:** PR #223 (loading/error guard) + PR #224 (canonical paths; `/dashboard/profile` confirmed canonical)
**Doctrine:** one human-facing profile = "professional passport" (who I am, what I can do, what evidence supports it, what's missing, what's next). No fake verification, no parallel CV/profile route, no new backend.

---

## 1. Current route / component map

| Surface | File | Role |
|---|---|---|
| Canonical profile route | `app/[locale]/dashboard/profile/page.tsx` | The single profile/CV editing + viewing page. |
| Profile completion clarity | `components/app/profile-cv-clarity-card.tsx` | Honest step checklist (about / skills / journal / self-declared), no %/score. |
| Evidence view | `components/app/worker-evidence-card.tsx` | Manager-confirmed vs self-declared skills + journal entry count. |
| Text-first composer | `components/app/profile-text-first-flow.tsx` | Universal narrative → self-declared claims. |
| Manual picker | `components/app/worker-trade-profile.tsx` → `profession-skills-picker.tsx` | Worker profession + curated skills (secondary path). |
| CV upload primitives | `components/app/cv-import-upload.tsx`, `cv-input-panel.tsx` | The ONLY CV file-pick UI; import is an honest "coming soon" scaffold (stores nothing). |
| Capability surface | `components/app/capability-profile-section.tsx` | Self-declared claims + work history. |
| Work journal | `app/[locale]/dashboard/journal/page.tsx` | Evidence loop; entries become facts only after a real human confirms. |

## 2. Canonical route decision
`/dashboard/profile` **remains the single canonical Profile/CV/Evidence hub.** No new route created. The account page links into it; dashboards link into it.

## 3. Audit findings (duplicate / island / honesty)

| Audit question | Finding | Action |
|---|---|---|
| Does the user understand CV + skills + journal evidence are ONE profile? | **No** — the page was a stack of technically-separate cards with no unifying statement. | **Fixed:** added `ProfileHubOverview` lead card stating "CV, skills and work evidence in one place" + 3 pillar statuses. |
| One primary next action, or many competing CTAs? | **Many/none** — no single clear next step at the top. | **Fixed:** one primary action **"Papildyti profilį / Complete profile"** → anchors to the in-page editor `#profile-edit`. (Primary-CTA guard invariant ≤1 respected — the CTA lives in the component, page-level count unchanged.) |
| CV & skills shown as disconnected blocks? | Partially — now framed together by the hub overview pillars. | **Fixed (framing).** |
| Does the journal connect to profile evidence? | **No bridge** — journal appeared only as a count; the journal room was an unreachable island from the profile. | **Fixed:** hub shows a **Work journal →** link to `/dashboard/journal` (workers only; "being prepared" when no engagement). |
| Anything claiming verified/confirmed when only self-declared? | No — `worker-evidence-card` already maps real `worker_skills.source`/`verified`; `cv-engagement-cards` renders 3 honest provenance states. The new hub explicitly says **"Not yet human-verified or document-verified."** | **Held + pinned.** |
| Duplicate upload / edit / skill actions? | **No** — one CV upload primitive set; one editor. Confirmed by `canonical-paths-integrity` + this guard. | **No change.** |
| Hidden useful features unreachable from profile/account? | The Work Journal was reachable only from the sidebar, not from the profile evidence context. | **Fixed** via the journal bridge. |

## 4. Runtime UI changes made
- **New** `components/app/profile-hub-overview.tsx` — pure server component (no client JS, no `onClick`, no fake state). Renders eyebrow/lead/explainer, 3 honest pillar chips (CV provided/not, self-declared count, journal evidence available/not-yet-linked/being-prepared), the single not-verified disclaimer, one primary action (`#profile-edit`), and the journal bridge.
- **Wired** into `profile/page.tsx` under the header, fed entirely by data already fetched (`savedProfileText`, `savedSkillClaims`, `savedSkills`, `journalCount`, `workerId`). Added `id="profile-edit"` anchor on the editor.
- **i18n** `profileHub` namespace added to `messages/lt.json` + `messages/en.json` (LT/EN parity pinned).

No backend, no new reads, no new route, no second CV flow, no fake counts (honest "being prepared" when no worker engagement).

## 5. Deferred (intentional)
- **Real CV document import (M2)** — `cv-import-upload` stays a "coming soon" scaffold; the hub's CV pillar reflects the saved text-first CV input, not a document. Activating document storage is forbidden/out of scope.
- **Evidence confidence scoring / journal→skill auto-linking** — no fake confidence. The hub only states the honest connection; deeper "this entry supports this skill" linkage is a future train.
- **Header reframe to "Profesinis profilis"** — kept the existing page `h1` (it backs the account→profile link label `skills.pageTitle`); the passport framing lives in the hub card to avoid cross-surface label churn.

## 6. Guard coverage
`lib/guards/profile-cv-evidence-hub.test.ts` (18 assertions) pins: profile page renders `ProfileHubOverview` fed by all three pillars + `#profile-edit` anchor; hub names CV+skills+journal and bridges to `/dashboard/journal`; the not-verified disclaimer is an honest negation in LT+EN; **no profileHub value (except the negated `notVerified`) claims verified/confirmed/patvirtinta/patikrinta**; LT/EN key parity; single CV upload surface; account links the canonical profile. Negative controls verify the detectors bite (red on a removed journal bridge, green on restore).

## 7. Visual evidence path
Authenticated screenshots not possible (dashboard is auth-gated → 307; no session/credentials in this environment). Route + build + test evidence saved (gitignored):
`runtime/review-evidence/labourmarketai/feat-cc-profile-cv-evidence-hub-v1/EVIDENCE.md`
