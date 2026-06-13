# Release-Candidate QA — v1 (Step 10/10)

> Final human-reviewable QA for the maximum-completion sprint. Every check below
> was run against the live production deploy and the merged `main`. No code or
> schema changed in this step — it records the release-candidate state.

## QA matrix (all run this pass)

| QA check | Result |
|---|---|
| **Final unit + guard suite** | ✅ 232 files / 3662 tests |
| **Production build** | ✅ compiled successfully, 188 static pages |
| **Public route smoke** (`/{lt,en,ru}`, `/labour-market` index) | ✅ all 200 |
| **Country pages** (`/{locale}/labour-market/{lt,lv,ee,pl,de,nl}`) | ✅ all 200 |
| **Auth redirect smoke** (`/dashboard`, `/dashboard/company/scouting`, `/dashboard/player-card`) | ✅ 307 → `/{locale}/auth/login` |
| **Mobile viewport smoke** | ✅ `check:primary-route-smoke` reports `overflow=false` on all 22 routes |
| **i18n check** | ✅ `check:i18n-debt` within baseline (da=766, de=766, ru=0); en/lt/ru clean; lt↔en↔ru parity guard green |
| **Fake-claim scan** | ✅ `public-no-fake-claims` + `public-evidence-integrity` guards green |
| **Contact-leak scan** | ✅ scouting / communication / company surfaces render no phone/email/bio/profile_text (grep clean + guards) |
| **AI-active-claim scan** | ✅ no active-AI claim in en/lt/ru public copy; `ai-provider-boundary` guard green (AI inert/noop) |
| **No-secrets scan** | ✅ no hardcoded bot token / `sk-` / AWS key / private key in tracked source (Telegram reporter reads env only) |
| **migration-safety** | ✅ GREEN (no migration in the whole sprint) |

## Sprint deliverables (PRs merged to `main`)

| Step | PR | Merge SHA | What |
|---|---|---|---|
| 4A | #349 | fcb2128 | Gated in-app request-to-communicate (contacts hidden, server-resolved profileId) |
| 4B | #350 | deed56f | Booking persistence + RLS **decision packet** (inert; owner decision pending) |
| 5 | #351 | c487572 | Worker available-from surfaced on player-card |
| 6 | #352 | a47efb7 | Company → scouting bridge with honest expectations |
| 7 | #353 | 5ec8dd7 | "How matching works" trust explainer |
| 8 | #354 | 02d9ea0 | PL/DE/NL country evidence pages (source-backed) |
| 9 | #355 | 5c382ca | Public launch readiness v2 audit |
| 10 | (this) | — | Release-candidate QA |

(3A #347 / 3B #348 were merged in the prior sprint and underpin 4A–7.)

## Final human reviewer checklist

**Public site (each of LT / EN / RU)**
- [ ] Homepage loads, states the value plainly, has a worker path and a company path with clear CTAs.
- [ ] Evidence module + country pages: every figure links an official source (EURES / Cedefop / Eurostat) with date + region; nothing invented.
- [ ] No "AI is matching/verifying", no guaranteed price, no fake users/clients/matches.
- [ ] 360–430px: no horizontal scroll; CTAs reachable.
- [ ] LT and RU bodies: no English (only official names/acronyms — EURES, Cedefop, EU, IT).

**Worker (test login)**
- [ ] Profile hub: skills, journal, CV link, completeness pillars (no fake %).
- [ ] CV: identity, professional summary (own text), skills by honest tier (self-declared / journal-supported / manager-confirmed), confirmed work proof. Nothing shows "verified" without a real confirmation.
- [ ] Player-card: availability **and** available-from date, real evidence counts; no fake OVR/score.

**Company (test login)**
- [ ] Demand flow → scouting bridge explains: matches are signals (not guaranteed), contacts hidden, estimate non-binding.
- [ ] Scouting: candidates are anonymized, profile-safe (no name/contact); "how matching works" explainer present; status + skill-fit + why/gaps shown.
- [ ] Request-to-communicate appears only when a worker is contactable; opening it starts an in-app conversation (no contact revealed, no fake acceptance).
- [ ] Estimate Builder: deterministic, "preliminary, not a binding quote".

## What is launch-ready now
- Public marketing + evidence + 6 country pages (LT/LV/EE/PL/DE/NL), LT/EN/RU, mobile-safe, source-backed.
- Worker side: living CV, honest skill tiers, player-card with availability + available-from.
- Company side: demand flow, deterministic estimate, anonymized scouting/shortlist, transparent matching, gated in-app communication request — contacts never exposed.

## Still needs owner / business decision (not done — by design)
- **Booking** (4B): table + RLS + worker-acceptance consent model.
- **Country pages** DK/NO/SE/FI: add the same source-backed way.
- **AI activation**: provider/key/budget + privacy/audit (AI is inert today).
- **Paid contact unlock**: not implemented; contacts stay hidden.

## Intentionally NOT done (out of safe autonomous scope)
No prod DB migration applied; no Supabase prod writes; no env/secret/DNS/Vercel-setting/billing changes; no real LLM/API/SDK; no external outreach. Telegram reporting is owner-internal only.

## Announcement readiness
**READY_WITH_LIMITATIONS** — the platform can be shown to real users: the public
site is honest, localized, mobile-safe and source-backed; the authenticated
worker and company flows are safe and transparent (contacts hidden, deterministic
matching, in-app communication). Announce with the limitations disclosed above
(booking not live, four country pages pending, AI inert, no paid contact unlock).
