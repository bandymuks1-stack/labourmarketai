# Brand purity + repo hygiene audit — 2026-08-18 (TRAIN L)

**Scope:** classification only. No deletions, no edits, no migration touch. This file is the
only artefact written.

| Field | Value |
|---|---|
| Repo root | `C:/Users/Mano/Documents/labourmarketai-wt/truth-audit-0818` |
| Remote | `https://github.com/bandymuks1-stack/labourmarketai.git` |
| Branch / SHA | `docs/cc/full-project-truth-2026-08-18` @ `cb078ff3` |
| Tracked files | 4,541 |
| Tracked bytes at HEAD | 261.4 MB |
| Pack size | 436.09 MiB |

## Headline

**USER-VISIBLE `ACCIDENTAL_CONTAMINATION`: 0.**

Every brand term that reaches a rendered surface is `REQUIRED_LEGAL`, and every one of them is
already pinned by a guard test. Nothing in the user-visible category needs removing. Two
prior classifications in `docs/audits/full-project-truth-2026-08-18.md` are **corrected** below
(`vecticum`, `wavi`).

One genuine finding did surface, and it is the inverse of contamination: six locale catalogs
carry the third-party **Rexora** credit but not the **operator/controller identity**. Those six
are not routed today, so it is a **latent promotion-gate risk, not a live defect** (§1.6).

---

# PART 1 — BRAND PURITY

## 1.1 Classification summary

| Term | Raw hit files | Verdict | User-visible contamination |
|---|---|---|---|
| `labma` / `LABMA` | 60 | `SOURCE_PROVENANCE` + load-bearing guard strings | 0 |
| `nonstop` | 57 | `REQUIRED_LEGAL` (the actual operator entity) | 0 |
| `agentai` | 45 | `REQUIRED_TECHNICAL` + `SOURCE_PROVENANCE` | 0 |
| `rexora` | 29 | `REQUIRED_LEGAL` (owner-approved attribution) | 0 |
| `vismantas` | 16 | `SOURCE_PROVENANCE` (cross-project scope guard) | 0 |
| `wavi` | 13 | 11 `SOURCE_PROVENANCE` + **2 false positives** | 0 |
| `vecticum` | 3 | `SOURCE_PROVENANCE` (competitor research) | 0 |

## 1.2 USER-VISIBLE surfaces — the only urgent category

Renderable surfaces only: locale JSON, UI copy, SEO metadata, page titles.

| File(s) | Term | Classification | Visibility | Safe remedy | Risk if changed |
|---|---|---|---|---|---|
| `apps/web/messages/{da,de,en,et,lt,lv,nl,no,pl,ru,sv}.json` → `footer.rexora` (11 lines, 1/locale) | `rexora` | `REQUIRED_LEGAL` | **USER-VISIBLE** (footer credit, all 11 catalogs) | **NONE — do not touch.** Owner directive 2026-07-14, "Created by Rexora" attribution | Breaks 3 guards: `public-product-copy.test.ts:112`, `public-trust-positioning.test.ts:73`, `legal-entity-truth.test.ts:77`. Removing an owner-approved attribution is an owner-only act |
| `apps/web/messages/{de,en,lt,nl,ru}.json` → `footer.operatedBy`, `footer.ipNotice`, `terms.*`, `privacy.*`, `auth.legalNotice.controller`, `companyNeed.partnerRouteBody` (45 lines, 9/locale × 5) | `nonstop` | `REQUIRED_LEGAL` | **USER-VISIBLE** (terms, privacy, footer, signup notice) | **NONE — do not touch.** UAB „Nonstop Group" is the real operator, seller, contracting party and GDPR controller (code 302676973, VAT LT100010790613) | Removing it makes the platform's mandatory controller/seller disclosure false. Breaks `legal-entity-truth.test.ts`, `auth-legal-notice.test.ts`, `company-need-partner-route.test.ts`, `compliance-explanation-pack.test.ts` |
| `apps/web/lib/privacy/consent-definitions.ts:112,127,142,157,172,201,216,231,246,261` | `nonstop` | `REQUIRED_LEGAL` | **USER-VISIBLE** (consent dialog body, 5 languages) | None | Consent text without a named controller is not a valid GDPR Art. 13 notice. Pinned by `consent-definitions.test.ts:88` |
| `apps/web/lib/legal/entity-identity.ts:42,44,53` | `nonstop` | `REQUIRED_LEGAL` | **USER-VISIBLE** (single source of the rendered entity name + `info@nonstopgroup.lt`) | None | This is the canonical entity record the whole legal surface reads from |
| `apps/web/app/[locale]/dashboard/layout.tsx:235-245`, `apps/web/components/layouts/site-footer.tsx:160-170`, `apps/web/components/app/dashboard-chrome.tsx:60-109` | `rexora` | `REQUIRED_LEGAL` | **USER-VISIBLE** (renders `t("rexora")`) | None | Same guards as row 1 |
| `apps/web/app/[locale]/(marketing)/legal/terms/page.tsx:7` | `nonstop` | `REQUIRED_LEGAL` | Internal (header comment) — the page itself renders from `messages/*.json` | None | Comment documents why the entity is named |

**SEO / metadata surfaces:** swept `app/**/layout.tsx`, `sitemap*`, `robots*`, `opengraph*`,
`lib/seo/`. The only hit is `lib/seo/seo-indexing-audit.ts` (§1.3) — a *banned-brand detector*,
not brand copy. **No brand term is present in any title, description, OG tag, sitemap or
robots output.**

## 1.3 `labma` — 60 files, per-file (NEVER blanket-replace)

### 1.3a Load-bearing guard strings — `REQUIRED_TECHNICAL`, remedy = NONE

These files exist *because* the string must be detectable. Replacing the literal silently
disarms the guard while leaving a green test.

| File | Line(s) | Why load-bearing |
|---|---|---|
| `apps/web/lib/guards/public-no-fake-claims.test.ts` | 12, 114 | `{ re: /\bLABMA\b/, why: "old LABMA wording on the Labourmarket.ai public surface" }` — the banned-token table |
| `apps/web/lib/guards/product-readiness.test.ts` | 46 | `/\bLABMA(\s+OS)?\b/i` in the legacy-naming banned list |
| `apps/web/lib/guards/public-copy-honesty-nonlanding.test.ts` | 101 | `/Labma\b/` banned pattern |
| `apps/web/lib/guards/activation-funnel-telemetry.test.ts` | 20, 402, 413-414 | `const banned = [/\bdemo\b/i, /\blabma\b/i, /labourmarket\.ai/i]` |
| `apps/web/lib/guards/sales-intake.test.ts` | 182 | `expect(src).not.toMatch(/LABMA/)` |
| `apps/web/lib/seo/seo-indexing-audit.ts` | 11, 40, 42 | `/labma\s*[—–-]\s*construction\s*os/i`, `/\blabma\s+os\b/i` — detects the stale SERP brand |
| `apps/web/lib/guards/readme.md` | 15 | Documents the rule the guards enforce |

**Risk if changed:** a repo-wide `s/labma//` removes the detector, not the problem. The
anti-pattern would become re-introducible with zero test failure. This is the single most
dangerous edit available in this repo.

### 1.3b Documentation — `SOURCE_PROVENANCE`, remedy = leave as-is

The remaining 53 files are `docs/`. Sampling confirms they are historical records that are
already self-labelling, e.g. `docs/PLATFORM_DOCTRINE.md`: *"LABMA / LABMA OS" is historical /
product-family context only — never the active name.* Others record concrete facts
(`docs/launch/search-index-owner-actions-v1.md` — the stale Google result to be reindexed;
`docs/legal/ip-chain-of-title-audit-v1.md` — chain of title through the predecessor;
`docs/quality/*` — per-PR "no old LABMA naming" attestations).

Two files carry `LABMA OS` in a **title position** and are the only `STALE_REFERENCE`
candidates: `docs/PLATFORM_DOCTRINE.md` (`# PLATFORM DOCTRINE — LABMA OS`) and
`docs/PROJECT_VISION.md` (`# LABMA OS — Projekto vizija`). Both are internal-only.
**Safe remedy:** add a one-line "historical name" banner — *do not rename the heading*, since
several audit docs cite these titles. **Risk:** renaming breaks inbound doc cross-references
and rewrites a dated record.

## 1.4 `agentai` — 45 hits

| File(s) | Classification | Visibility | Remedy | Risk if changed |
|---|---|---|---|---|
| `apps/web/lib/env.ts:135-146,206-208` — `AGENTAI_OS_ALERTS_ENABLED/_ALERT_ENDPOINT/_ALERT_TOKEN` | `REQUIRED_TECHNICAL` | Internal | **NONE** | Env-var contract with a deployed bridge. Renaming breaks owner alerting silently (vars default off → no error) |
| `apps/web/lib/notifications/telegram-owner-alerts.ts` (13 hits incl. `agentaiBridgeConfigured()`, `sendViaAgentaiBridge()`) | `REQUIRED_TECHNICAL` | Internal | NONE | Named integration target. Pinned by `control-command-safety.test.ts:331` (`/Agentai OS bridge \(PREFERRED\)/`) |
| `apps/web/lib/ops/control-commands.ts` — `answeredBy: "agentai_os"` (5×) | `REQUIRED_TECHNICAL` | Internal | NONE | A **safety value**: marks commands this app must refuse to answer. `control-command-safety.test.ts:363` asserts it. Changing it could let the app fabricate CI/PR status |
| `apps/web/lib/intelligence/import-boundary.ts:3,9,26` + `.test.ts:12` (`snapshotRef: "agentai-crawl-snapshot-0001"`) | `SOURCE_PROVENANCE` | Internal | NONE | Provenance id for imported crawl observations — the traceability contract |
| `apps/web/lib/ai/runtime/providers/adapter-contract.ts:6` | `SOURCE_PROVENANCE` | Internal | NONE | Comment naming the intended shared-gateway consumer |
| `apps/web/app/[locale]/dashboard/talent/page.tsx:11`, `components/visual/job-demand-card.tsx:30`, `components/visual/worker-card.tsx:6`, `lib/visual/tokens.ts:7` | `SOURCE_PROVENANCE` | Internal (comments only — **no rendered string**) | Optional: none needed | Comments cite the design artefact the visuals came from |
| `scripts/telegram-report.mjs:15,16,61` — `AGENTAI_TELEGRAM_BOT_TOKEN` fallback | `REQUIRED_TECHNICAL` | Internal | NONE | Env fallback chain |
| 22 `docs/` files | `SOURCE_PROVENANCE` | Internal | NONE | Integration plans + cross-project scope records |

## 1.5 `vismantas` (16), `wavi` (13), `vecticum` (3)

| File(s) | Term | Classification | Visibility | Remedy | Risk if changed |
|---|---|---|---|---|---|
| `docs/goals/*` (6), `docs/quality/*` (5), `docs/owner-goals/owner-visible-rebuild.md`, `docs/audits/evidence/premium-rebuild-w1/README.md` — all read `Vismantas / wavi repo` or `touch Vismantas/wavi` | `vismantas`, `wavi` | `SOURCE_PROVENANCE` | Internal | **NONE** | These are the **cross-project scope guard** ("do not touch Vismantas/wavi"). Deleting them deletes the rule that keeps the repos separate |
| `docs/policies/feature-definition-of-done-v1.md:37` — "hand-**wavi**ng" | `wavi` | **FALSE POSITIVE** | Internal | None | Ordinary English |
| `supabase/migrations/20260720190000_lmc_ledger_foundation_v1.sql:1581` — "**wavi**ng the actor through" | `wavi` | **FALSE POSITIVE** | Internal | None | Ordinary English, inside a migration — untouchable regardless |
| `supabase/migrations/20260817130000_workflow_engine_v1.sql:25` — `-- competitors (Work-OS/Vecticum audit 2026-08-17).` | `vecticum` | `SOURCE_PROVENANCE` | Internal | **DOCUMENTATION ONLY.** Applied migration — **must never be edited.** Record the rationale in this audit; the comment stays verbatim | Editing an applied migration desynchronises the local file from the applied database state. Zero benefit: a competitor name in a design-rationale comment is legitimate research provenance |
| `docs/audits/vecticum-capability-matrix-2026-08-17.md`, `docs/audits/full-reality-audit-2026-08-17.md:170` | `vecticum` | `SOURCE_PROVENANCE` | Internal | NONE | Competitive research is a legitimate factual record. Sourced from `vecticum.lt` / `docs.vecticum.lt` and used to justify a build decision |

> **Correction to `docs/audits/full-project-truth-2026-08-18.md:321`.** That file classified
> `vecticum` as *"ACCIDENTAL_CONTAMINATION (probable)"* and singled out the migration hit as
> *"the one that matters"*. That is wrong on both counts. The comment cites the audit that
> justified the workflow-engine design — textbook `SOURCE_PROVENANCE`. It is also inside an
> applied migration and therefore not editable. Line 320 likewise flagged `wavi` as
> `NEEDS_OWNER_REVIEW`; 11 of 13 hits are the cross-project scope guard and 2 are the English
> word "waving". No owner review is required for either term.

## 1.6 OWNER_REVIEW — the one real finding

Measured across all 11 locale catalogs:

| Locale | `footer.rexora` (3rd-party credit) | `footer.operatedBy` (operator identity) | `footer.ipNotice` | Routed? |
|---|---|---|---|---|
| `lt`, `en`, `ru`, `nl`, `de` | present | **present** | **present** | **ACTIVE** |
| `da`, `et`, `lv`, `no`, `pl`, `sv` | present | **MISSING** | **MISSING** | not routed |

The six thin catalogs (79 namespaces vs 184) ship the Rexora attribution but not the operator
and IP disclosure. **This is not live:** `apps/web/lib/i18n/config.ts:38` sets
`activeLocales = ["lt","en","ru","nl","de"]`, and those five are exactly the complete ones. The
URL resolver rejects non-active codes and the language selector hides them.

- **Classification:** `OWNER_REVIEW` — latent, not a live defect.
- **Safe remedy:** add `footer.operatedBy` + `footer.ipNotice` to the locale-promotion
  checklist in `apps/web/lib/i18n/launch-language-scope.ts`, so promoting a code to
  `activeLocales` cannot ship a third-party credit without the operator identity beside it.
- **Risk if ignored:** promoting `pl` or `sv` to active would render "Stworzone przez Rexora" /
  "Skapad av Rexora" on a page with no named seller or GDPR controller.

---

# PART 2 — REPO HYGIENE

## 2.1 Where the weight is

| Extension | Files | Bytes | Share of tracked |
|---|---|---|---|
| `.png` | 512 | **224.22 MB** | **85.8%** |
| `.ts` | 1,993 | 13.92 MB | 5.3% |
| `.md` | 843 | 7.37 MB | 2.8% |
| `.json` | 118 | 7.00 MB | 2.7% |
| `.tsx` | 486 | 4.27 MB | 1.6% |
| `.sql` | 444 | 3.19 MB | 1.2% |
| all others | 245 | ~1.4 MB | 0.5% |

`docs/` is 231.7 MB, of which only 6.7 MB is markdown. **The repo is a screenshot archive with
a codebase attached.** The 774-markdown / 512-PNG framing understates it: markdown is 2.8% of
bytes and is not a hygiene problem at all.

> **Honest constraint on every number below.** Deleting a tracked file shrinks the *working
> tree*, not the 436 MiB pack — git retains every historical blob. Shrinking the pack requires
> a history rewrite, which is destructive, breaks every existing clone and worktree, and needs
> a force-push. **Not proposed.** All figures are checkout-size recovery.

## 2.2 PNG evidence by directory (top 20 of 512 files / 224.22 MB)

| MB | Files | Directory | Class |
|---|---|---|---|
| 14.53 | 38 | `docs/audits/screenshots` | ARCHIVE (32 orphan / 9.27 MB) |
| 14.37 | 4 | `docs/evidence/premium-unified-product-v1/before` | ARCHIVE (all orphan) |
| 14.31 | 14 | `docs/audits/evidence/w7-s1` | ARCHIVE (all orphan) |
| 13.52 | 14 | `docs/audits/evidence/w7-s3` | DUPLICATE-heavy → 7.61 MB DELETE_SAFE |
| 12.87 | 14 | `docs/audits/evidence/pr-i-e2e-reality-v1` | KEEP (12 referenced) |
| 12.28 | 26 | `docs/audits/evidence/w7-ux-audit` | KEEP (referenced) |
| 11.75 | 28 | `docs/audits/evidence/owner-rebuild-after` | ARCHIVE (15 orphan / 10.15 MB) |
| 11.32 | 20 | `docs/audits/evidence/w7-s4` | ARCHIVE + 2.22 MB DELETE_SAFE |
| 10.16 | 11 | `docs/evidence/text-first-mobile` | KEEP (referenced) |
| 9.09 | 24 | `docs/audits/evidence/premium-rebuild/w3` | KEEP (referenced) |
| 8.57 | 28 | `docs/audits/evidence/player-card-visuals-2026` | DUPLICATE → 4.28 MB DELETE_SAFE |
| 6.90 | 9 | `docs/design/living-world-rd/screenshots` | ARCHIVE (all orphan) |
| 6.63 | 6 | `docs/evidence/premium-unified-product-v1/after` | ARCHIVE (all orphan) |
| 6.29 | 15 | `docs/audits/evidence/owner-visual-acceptance-2026` | ARCHIVE (13 orphan) — **see caveat** |
| 6.17 | 12 | `docs/audits/evidence/owner-rebuild-before` | KEEP (referenced) |
| 5.99 | 7 | `docs/evidence/production-smoke-pr41/screenshots` | KEEP (referenced) |
| 4.62 | 8 | `docs/audits/evidence/premium-rebuild/s3` | ARCHIVE (all orphan) |
| 4.32 | 8 | `docs/evidence/supergrand-vision-os-leap-v1/screenshots` | ARCHIVE (all orphan) |
| 3.44 | 12 | `docs/evidence/staffing-operating-model-v1/screenshots` | ARCHIVE (all orphan) |
| 2.64 | 39 | `docs/audits/evidence/ux-ui-2-0-foundation-v1` | KEEP (24 referenced) |

**Caveat on `owner-visual-acceptance-2026`:** memory records the 2026 owner visual acceptance
round as REJECTED. Evidence for a rejected round is the record of *why* it was rejected —
`OWNER_REVIEW`, not ARCHIVE, until the owner confirms the round is closed.

## 2.3 Recoverable size by category

| Category | Files | Size | Basis |
|---|---|---|---|
| **DELETE_SAFE** | **28 PNG** | **14.89 MB** | Byte-identical duplicate blob **and** zero textual reference to that path **and** ≥1 copy retained → provably zero information loss |
| DUPLICATE (needs a decision) | 35 blob groups | 16.86 MB gross waste | Includes meaningful `prod-*` vs local pairs whose identity *is* the proof — do not collapse blindly |
| ARCHIVE | 260 PNG | 120.90 MB | Orphaned, unique blob, superseded audit round. Move to external storage with hash manifest; leave a stub README |
| KEEP | 224 PNG | 88.42 MB | Linked from a markdown/code file |
| KEEP (mandatory) | 444 `.sql` | 3.19 MB | **`supabase/migrations/` — KEEP, no exceptions** |
| DEAD_CODE | 21 `.tsx` | 84.8 KB | Zero importers, proven (§2.4) |
| OWNER_REVIEW (scripts) | 14 | 268.0 KB | Zero references (§2.5) |
| DEAD_DEPENDENCY | **0** | 0 | §2.6 |
| STALE_CONFIG | **0** | 0 | §2.6 |

**Single biggest win: 120.90 MB** — ARCHIVE the 260 orphaned unique-blob evidence PNGs, of
which `docs/evidence/premium-unified-product-v1/{before,after}` alone is **21.00 MB in 10
files** and `docs/audits/evidence/w7-s1` is **14.31 MB in 14 files**.

Nothing proposed here touches `runtime/`, `supabase/migrations/`, or any licence file.

## 2.4 DEAD_CODE — 21 components, zero importers (proven)

Verified three independent ways: (1) module-specifier index across all 2,479 TS/TSX/MTS/MJS
files; (2) `git grep -E "(from|import\()\s*[\"'][^\"']*/<stem>[\"']"` over `apps/`, excluding
tests — **zero non-test matches for all 21**; (3) exported-symbol search for JSX usage across
`apps/web/app` + `apps/web/components` — **`USED_ELSEWHERE=NONE` for all 21**.

Substring collisions were individually excluded: `proof-band` vs the live
`market-proof-band.tsx`; `status-chip` vs local inline `StatusChip` functions in
`absence-panel.tsx` / `agency-clients-section.tsx` / `marketplace-loop-section.tsx`;
`dashboard-section` vs the `data-testid` string in `dashboard/loading.tsx`; `market-pulse` vs
the live `market-pulse-board.tsx`. `site-nav.tsx:37` and `market-map.tsx:28` contain comments
explicitly stating that `audience-value-sections.tsx` and `live-map.tsx` are no longer used.

**11 of the 21 are hash-pinned in `apps/web/lib/guards/landing-freeze-baseline.json`.** Deleting
one changes the frozen set and fails `landing-freeze.test.ts`. Regenerating that baseline is an
**owner-gated act** (`landing-freeze.ts:18-20`).

| Component | Bytes | Freeze-pinned? | Class |
|---|---|---|---|
| `components/app/agency-workers-section.tsx` | 14,966 | no | DEAD_CODE |
| `components/app/live-map.tsx` | 9,928 | **YES** | DEAD_CODE / owner-gated |
| `components/app/live-world-map.tsx` | 7,180 | **YES** | DEAD_CODE / owner-gated |
| `components/marketing/market-moment.tsx` | 6,557 | **YES** | DEAD_CODE / owner-gated |
| `components/marketing/conversation-os-panel.tsx` | 5,323 | **YES** | DEAD_CODE / owner-gated |
| `components/app/role-catalogue-card.tsx` | 4,893 | no | DEAD_CODE |
| `components/app/feature-availability-grid.tsx` | 4,830 | no | DEAD_CODE |
| `components/marketing/service-offers.tsx` | 4,051 | no | DEAD_CODE |
| `components/ui/ResultShell.tsx` | 3,843 | no | DEAD_CODE |
| `components/app/market-counters.tsx` | 3,833 | **YES** | DEAD_CODE / owner-gated |
| `components/marketing/audience-value-sections.tsx` | 3,464 | **YES** | DEAD_CODE / owner-gated |
| `components/app/setup-role-choice.tsx` | 3,281 | no | DEAD_CODE |
| `components/marketing/proof-band.tsx` | 2,530 | **YES** | DEAD_CODE / owner-gated |
| `components/marketing/how-it-works-band.tsx` | 2,174 | **YES** | DEAD_CODE / owner-gated |
| `components/app/status-chip.tsx` | 2,080 | no | DEAD_CODE |
| `components/marketing/market-pulse.tsx` | 1,934 | **YES** | DEAD_CODE / owner-gated |
| `components/marketing/draft-board.tsx` | 1,404 | **YES** | DEAD_CODE / owner-gated |
| `components/app/live-ticker.tsx` | 1,387 | **YES** | DEAD_CODE / owner-gated |
| `components/app/dashboard-section.tsx` | 1,370 | no | DEAD_CODE |
| `components/app/open-in-waze.tsx` | 1,283 | no | DEAD_CODE |
| `components/app/preview-chip.tsx` | 554 | **YES** | DEAD_CODE / owner-gated |

**Safe remedy:** the 10 non-freeze-pinned files (44.0 KB) can be removed together with the
guard tests that reference them, in one PR, each guard checked individually — several assert
*absence* of a pattern and must not be dropped silently. **Risk:** removal is 0.02% of repo
bytes. The value is comprehension, not size — do not treat this as a size win.

## 2.5 scripts/ — 14 of 92 with zero references (268.0 KB)

Zero reference in `package.json`, `.github/`, `docs/`, app code, or any other script.

`db-proof-lmc-ledger.mts` (123,375 B), `db-proof-journal-photo-continuity.mts` (60,920 B),
`db-proof/engagement-end-v2.sh` (24,278 B), `db-proof-journal-atomic-supersede.mts` (21,031 B),
`db-proof/train-d-objects-tasks.sh` (18,543 B),
`db-proof/mp04-slice2-actor-matrix-proof.sql` (11,515 B),
`db-proof/w12-browser-proof-seed.sh` (5,975 B),
`db-proof/secdef-authenticated-rpc-smoke.sql` (4,626 B),
`db-proof/secdef-anon-negative-smoke.sql` (1,875 B),
`db-proof/secdef-grant-matrix.sql` (808 B), and 4 `scripts/esco/fixtures/*.csv` (1,491 B).

**Classification: `OWNER_REVIEW`, not DEAD_CODE.** These are re-runnable DB proof harnesses —
the executable evidence behind merged migrations. Unreferenced is expected for a one-shot
proof. Memory records that *"dry runs cannot prove persist"*, which is precisely what these
exist to do. **Remedy:** index them in a `scripts/db-proof/README.md` so they stop reading as
orphans. **Risk if deleted:** loses the only reproducible proof for several SECDEF/RLS and
ledger invariants.

## 2.6 DEAD_DEPENDENCY / STALE_CONFIG — both zero

`apps/web/package.json`: 15 dependencies, **0** unreferenced. 19 devDependencies, 3 with no
import site — `autoprefixer`, `postcss`, `prettier` — all three **config-driven and live**:
`apps/web/postcss.config.mjs`, `apps/web/.prettierrc`, `apps/web/tailwind.config.ts`,
`apps/web/tailwind-preset.ts` are all present and tracked. Root `package.json`: 0 deps,
3 devDeps, none unreferenced.

**No dead dependency and no stale config exists in this repo.** This is a clean result, not an
unchecked one.

---

## Recommended order (nothing here is executed by this audit)

1. **Brand purity: no action required.** Zero user-visible contamination. Do not run any
   brand-term replacement — §1.3a explains why a `labma` sweep would be actively harmful.
2. Add the operator-identity keys to the locale-promotion gate (§1.6) — the only real finding.
3. Correct the two misclassifications in `docs/audits/full-project-truth-2026-08-18.md`
   lines 320-323 (§1.5).
4. Owner decision on ARCHIVE: 120.90 MB of orphaned evidence PNGs, archived with a hash
   manifest before any directory is removed.
5. DELETE_SAFE: 14.89 MB of provable duplicates (§2.3).
6. Optional: remove the 10 non-freeze-pinned dead components (44.0 KB) with their guards.

**Not proposed and not touched:** `supabase/migrations/` (KEEP, all 444 files), `runtime/`,
any licence or copyright text, any git-history rewrite.
