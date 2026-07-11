# Non-Landing Launch Repair — Final Report v1 (2026-07-11)

Goal source: `labourmarketai-non-landing-launch-repair-goal-v1.md` (owner
file). Executed autonomously as a 6-PR train, each PR from the latest
`origin/main`, all squash-merged green, branches deleted.

```text
STATUS: GREEN (with documented owner actions — none of them GREEN-blockers)
BASE: main @ c616306 (before the train)
FINAL MAIN COMMIT: da2e523 (PR #697 merge) + PR #698 (this docs PR) on top
PRS:
  #693 fix(domain): production truth v1 — app-host auth CTAs, landing freeze guard, CI wiring
  #694 fix(public): non-landing product truth v1 — honest copy, labelled example previews
  #695 feat(pricing): concierge-first commercial page — no technical billing surface in public
  #696 feat(i18n): activate NL and DE — full-parity catalogs, routing, SEO, guards
  #697 feat(admin): operator launch-readiness view — real supply/demand counts only
  #698 docs(repo): repository production state v1 (README/DEPLOYMENT truth, SEO owner actions, this report)
PRODUCTION URLS CHECKED:
  https://labourmarket.ai (+ /lt /en /ru /nl /de and public paths)
  https://www.labourmarket.ai   → 308 → apex (verified)
  https://app.labourmarket.ai   → serves deployment; canonicals point to apex
  https://labourmarket-ai.vercel.app → LEGACY gated build (owner action)
DOMAIN RESULT: apex = public canonical ✅ · www→apex 308 ✅ · app = auth/dashboard
  host ✅ (also serves marketing by deployment topology — SEO-safe, documented)
  · robots/sitemap/canonical/og all apex ✅ · hreflang lt/en/ru/nl/de/x-default
  live ✅ · no Labma/Construction OS in the new system ✅ · non-landing auth
  CTAs cross to app host ✅ (landing's own CTAs frozen, documented exception)
PUBLIC COPY RESULT: real-time/guaranteed/matching over-claims removed from
  /for-* pages, agencies bullets, PAGE_SEO and inline pages; canonical CTA
  set honoured (worker → profile/intake; company → /company-need; agency →
  account) ✅ · fictional preview cards now carry an always-visible
  "Example" chip + note (no hover/tooltip) ✅ · regression guards added ✅
PRICING RESULT: public /pricing is a commercial concierge-first page —
  free need submission, human review, manually checked shortlist, no fee
  without a suitable shortlist, fixed success fee, coordination fee only
  when delivered, final price confirmed before paid work; CTA →
  /company-need ✅ · no public Stripe test checkout / billing states —
  test checkout lives only on superadmin /dashboard/admin/billing ✅ ·
  Stripe live remains hard-blocked; payment provider untouched ✅
NL RESULT: ACTIVE. Full-parity catalog (5,097 leaves incl. later keys) + 6
  taxonomy files; routing/static-params/selector/canonical/hreflang/
  sitemap/SEO; preview-tagged (AI-seeded pending §7.4 human review);
  production smoke: /nl pages 200, zero MISSING_MESSAGE/[EN], zero
  horizontal overflow at 390px (local run: 60 page loads)
DE RESULT: ACTIVE. Same scope and proof as NL.
COMPANY-NEED RESULT: chain verified — anonymous submit persists via
  SECURITY DEFINER RPC into RLS-deny-all table; success state ONLY after
  real persistence (honest error/prepared fallbacks); contact data
  operator-only (service-role + isSuperadmin, triple-gated); admin queue
  shows all fields with closed status set new/contacted/qualified/rejected;
  owner alert is best-effort and cannot break the insert ✅ · alert env NOT
  configured in production (owner action below) — documented, not called active
OPERATOR READINESS RESULT: /dashboard/admin/launch-readiness live —
  real counts only (measured 2026-07-11: 20 workers, 2 with profession,
  2 with location, 2 available, 3 with pay expectation, 4 with journal
  evidence, 0 ready docs, 0 consented profiles vs 15–25 target, 4
  companies, 0 public intakes, 10 submitted requests, 0 teams); no
  percentages, no fake ready flags; gap doc:
  docs/launch/real-supply-readiness-gap-v1.md
README RESULT: rewritten to current truth (domains, 5 locales, live
  deployment model, real branch flow, human-gated migrations, landing
  freeze, operator-coordinated matching, payments not active); broken doc
  references removed; DEPLOYMENT.md M0/preview-only header superseded;
  domain policy doc rewritten to v2; guarded by readme-truth.test.ts
SEO RESULT: non-landing canonical/hreflang/title/description/OG/robots/
  sitemap verified live; app/dashboard/admin/auth indexing blocked by
  robots + apex canonicals; no Labma/preview-only/coming-soon/matching
  signals; check:public-seo-indexing + check:i18n-debt wired into CI;
  owner actions: docs/launch/search-index-owner-actions-v1.md
LANDING UNCHANGED PROOF: landing-freeze guard (SHA-256 baseline over the
  landing page, 16-file render tree, placeholders feed, 8 i18n namespaces
  × lt/en/ru) added in PR #693 and green through every subsequent PR and
  on main; /nl /de landing routes are NEW surfaces from new translations,
  lt/en/ru landing output byte-identical
TESTS: typecheck ✅ lint ✅ vitest 8,22x tests / 52x files ✅ (grew each PR)
  placeholders:check ✅ check:primary-route-smoke (35 routes) ✅
  check:public-seo-indexing ✅ check:i18n-debt (da=839, de=0, nl=0, ru=0) ✅
  SR-2/SR-5/SR-6 honesty guards ✅ check:constitution ✅ migration-safety
  self-test ✅ (CI, every PR) · build ✅ · local browser smoke 60 page
  loads (1280+390px) ✅
PRODUCTION SMOKE (2026-07-11, after #697 deploy): nl/de pages 200 without
  markers ✅ · pricing shows concierge surface, no test-checkout/billing
  banner testids ✅ · hreflang 5 locales + x-default ✅ · sitemap 130 urls
  incl. nl/de ✅ · example frames render ✅ · landing lt 200, no banned
  brand ✅ · www 308 ✅ · "Real-time supply signals" gone ✅
  (note: the full i18n catalog is serialized into the page payload, so
  admin/billing STRINGS exist in the HTML source as data — no test-checkout
  UI renders; optimizing message-payload scoping is a future nicety)
OWNER ACTIONS STILL REQUIRED:
  1. Vercel: retire/detach the legacy project serving
     labourmarket-ai.vercel.app (old "Labour Market Operating System" build).
  2. Vercel env (production) to activate the company-need owner alert —
     EITHER Agentai OS bridge: AGENTAI_OS_ALERTS_ENABLED=true,
     AGENTAI_OS_ALERT_ENDPOINT=<https endpoint>, AGENTAI_OS_ALERT_TOKEN=<token>
     OR Telegram: OWNER_TELEGRAM_ALERTS_ENABLED=true,
     OWNER_TELEGRAM_BOT_TOKEN=<token>, OWNER_TELEGRAM_CHAT_ID=<id>.
     Until set, new public intakes appear ONLY in the admin queue.
  3. Search Console: verify domain property, submit sitemap, request
     removal of stale URLs (docs/launch/search-index-owner-actions-v1.md).
  4. Real data: collect 15–25 consented worker profiles + fresh
     availability confirmations + first real company needs
     (docs/launch/real-supply-readiness-gap-v1.md).
  5. Human review (§7.4) of the AI-seeded NL/DE (and RU) catalogs when
     native speakers are available — locales are live and preview-tagged.
BLOCKED ITEMS (cannot be fixed from the repo):
  - Legacy Vercel alias content (external project) — action 1.
  - Owner alert delivery (secrets) — action 2.
  - Google index refresh (Search Console) — action 3.
  - Supply-side real data + consent (real humans) — action 4.
ROLLBACK: each PR is an independent squash commit on main — revert in
  reverse order (git revert <sha>); no migrations, no env, no external
  state was changed by any PR.
NEXT RECOMMENDED ACTION: owner performs actions 1–3 (≈15 min total), then
  starts real-data collection (action 4) while the operator uses
  /dashboard/admin/launch-readiness to track the 15–25 consent target.
```

## Classification of every finding (fully fixed / code-fixed awaiting deploy / external)

- **Fully fixed and verified in production**: domain surface, auth CTA
  host routing (non-landing), public copy honesty, example labelling,
  pricing public surface, NL/DE activation, launch-readiness view,
  company-need chain honesty, CI guard wiring.
- **Fixed in code, no deploy dependency left**: none outstanding — PR #697
  deploy was verified live; PR #698 is docs-only.
- **Needs Vercel action**: legacy alias retirement; alert env variables.
- **Needs Search Console action**: sitemap submit + stale URL removal.
- **Needs real people / consent**: supply readiness target (15–25).
- **Cannot be fixed programmatically**: all four above by definition.
