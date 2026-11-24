# Public Launch Readiness — v2 (Step 9/10)

> Fresh launch-readiness pass reflecting the maximum-completion sprint
> (Steps 3A → 8). Supersedes v1 as the current snapshot. Public surface verified
> against the live production deploy; no broad redesign, no schema change.

## Scope checked
Public homepage (LT/EN/RU) · worker CTA · company CTA · value explanation
(living CV / skill evidence / demand / estimate / scouting) · labour-market
evidence + country pages · auth redirect for gated routes · mobile overflow ·
no technical jargon · no old-project references · no fake active-AI claim · no
English body text on LT/RU public pages.

## Automated results (this pass)

| Check | Result |
|---|---|
| Public routes `/{lt,en,ru}` (live) | ✅ 200 |
| Public `/{lt,en,ru}/labour-market` index (live) | ✅ 200 |
| Country pages `/{lt,en,ru}/labour-market/{lt,lv,ee,pl,de,nl}` (live) | ✅ 200 (PL/DE/NL added in Step 8) |
| Public `/{lt}/pricing`, `/{lt}/vision` (live) | ✅ 200 |
| Auth-gated `/{locale}/dashboard*` without login | ✅ 307 → `/{locale}/auth/login` |
| Full unit + guard suite | ✅ 232 files / 3662 tests |
| Launch-relevant guards (fake-claims, evidence-integrity, ai-boundary, country-evidence, scouting-visibility, communication-request-safety, matching-trust, scouting-bridge, lt/en/ru parity) | ✅ 9 files / 102 tests |
| `check:primary-route-smoke` (overflow + status) | ✅ 22 routes, 0 blocking; `overflow=false` on all captures |
| `check:i18n-debt` | ✅ within baseline (da=766, de=766, ru=0); en/lt/ru clean |
| `migration-safety` | ✅ GREEN (no migration this sprint) |

## Launch criteria

| Criterion | Status | Evidence |
|---|---|---|
| Clear worker CTA | ✅ | Homepage two-path "worker-first" section + CTA (`workerPathCta`) |
| Clear company CTA | ✅ | Homepage hero `ctaPrimary` + employer path; dashboard scouting bridge (Step 6) |
| Explains living CV / skill evidence | ✅ | Worker profile hub + CV (honest tiers); player-card shows real evidence counts + available-from (Step 5) |
| Explains demand / estimate | ✅ | Company demand flow + deterministic Estimate Builder (non-binding, labelled) |
| Explains scouting / matching | ✅ | Scouting "how matching works" explainer (Step 7) + company scouting bridge (Step 6) |
| No technical jargon (public) | ✅ | Marketing copy is plain-language; product terms explained |
| No old-project references | ✅ | "Labour Market AI" branding; no LABMA/Agentai/etc. in public copy |
| No fake active-AI claim | ✅ | AI layer inert (noop); `ai-provider-boundary` guard; no "AI is matching/verifying" copy |
| No fake scale / guarantee | ✅ | `public-no-fake-claims` + `public-evidence-integrity` guards; matching framed as signals, never guaranteed |
| Contacts never exposed | ✅ | Scouting anonymized (3A/3B); communication is in-app, server-resolved profileId (4A); guards pin it |
| No horizontal mobile overflow | ✅ | route-smoke `overflow=false`; new sections use wrapping/flex grids |
| No English body on LT/RU public pages | ✅ | i18n parity + country no-English-leak guards; en/lt/ru fully localized |

## What's new since v1 (this sprint)
- **3A** worker visibility/consent foundation (contacts hard-hidden, profile-safe previews).
- **3B** company scouting/shortlist UI on anonymized safe previews.
- **4A** gated in-app request-to-communicate (no contact exposure, no external send).
- **4B** booking persistence **decision packet** (inert; owner decision pending — not live).
- **5** worker available-from surfaced on the player-card.
- **6** company → scouting bridge with honest expectations.
- **7** "how matching works" trust explainer (deterministic, no fake score).
- **8** PL/DE/NL country evidence pages (source-backed, LT/EN/RU).

## Plain-language human reviewer checklist
**Public homepage (each of LT / EN / RU)**
- [ ] Hero states what the platform is, in plain language, with a primary CTA.
- [ ] A worker can see a clear "for workers" path; a company a clear "find workers" path.
- [ ] Evidence module: each figure links an official source with date + region.
- [ ] No "AI is matching/verifying", no guaranteed price, no fake users/clients/matches.
- [ ] 360–430px: no horizontal scroll; CTAs reachable.
- [ ] LT and RU bodies show no English (only official names/acronyms — EURES, Cedefop, EU, IT).

**Country pages** (`/{locale}/labour-market/{lt,lv,ee,pl,de,nl}`)
- [ ] Each signal card links its source; figures are qualitative + sourced, none invented.
- [ ] LT/RU fully localized.

**Authenticated surfaces (spot-check with a test login)**
- [ ] Worker: profile hub + CV honest tiers; player-card shows availability + available-from.
- [ ] Company: demand flow → scouting bridge → scouting (anonymized candidates, contacts hidden) → request-to-communicate when a worker is available.

## Owner / business decisions still pending
- **Booking (4B)**: table + RLS + consent model — owner decision needed before persistence ships.
- **Country pages**: DK/NO/SE/FI still "coming soon" (add the same source-backed way).
- **AI activation**: the AI layer is inert; activation needs provider/key/budget + privacy/audit (separate owner-approved slice).
- **Paid contact unlock**: not implemented; contacts stay hidden until a separately approved slice.

## Intentionally NOT done (out of safe autonomous scope)
- No DB migration applied to production; no Supabase prod writes.
- No env/secret/DNS/Vercel-setting/billing changes.
- No real LLM/API provider; no AI SDK installed.
- No external outreach/customer messages.

## Recommendation
**READY_WITH_LIMITATIONS** — the public site is honest, localized (LT/EN/RU),
mobile-safe, and explains the worker + company value with source-backed
evidence; the authenticated worker/company flows are safe (contacts hidden,
deterministic matching, in-app communication). Limitations to disclose: booking
is not live (owner decision), four priority country pages are still "coming
soon", AI is inert, and paid contact unlock is not implemented.
