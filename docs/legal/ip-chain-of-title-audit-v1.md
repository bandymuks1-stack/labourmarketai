# IP Chain-of-Title Audit — LabourMarket.ai — v1

**Date of audit:** 2026-07-11
**Auditor:** repo-internal audit (Claude Code session, read-only evidence collection), for owner + external counsel review
**Scope:** the software, documentation, UI/design, brand and data assets in the GitHub repository `bandymuks1-stack/labourmarketai` and the production surface at `https://labourmarket.ai`
**Status:** DRAFT FOR LEGAL REVIEW — this is an internal evidence memo, not a legal opinion. Every item marked VERIFY-BEFORE-SIGNING must be independently confirmed by counsel before any licence, assignment, or investment document relies on it.

---

## 1. Method and evidence base

All evidence below was collected on 2026-07-11 from:

- the local git worktree of `github.com/bandymuks1-stack/labourmarketai` (branch `feat/legal-entity-ip-license-truth-v1`, HEAD `923bf3b`);
- `git remote -v`, `git log` author/committer/trailer analysis over the full history (728 commits, 2026-05-19 → 2026-07-11);
- license fields of installed dependencies (`node_modules/*/package.json`);
- a live fetch of `https://labourmarket.ai` (page loaded the LabourMarket.ai platform, Lithuanian homepage, on 2026-07-11);
- a non-exhaustive web search for trademark registrations (2026-07-11);
- repo documents `docs/launch/legacy-vercel-project-retirement-v1.md` and `docs/policies/domain-truth-v1.md`.

What could NOT be verified from here: domain registrant identity, WHOIS data, Vercel account legal ownership, EUIPO register contents (official eSearch not queried), and the existence of any signed paper agreements outside the repo.

## 2. Contributor identities (git evidence)

`git log --format="%an <%ae>" | sort -u` over the full history returns exactly two author identities:

| Author identity | Commits | Notes |
|---|---|---|
| `bandymuks1-stack <bandymuks1@gmail.com>` | 677 | GitHub account of the owner |
| `Mano <mano@local>` | 51 | local git identity on the owner's machine (non-routable email) |

Committer identities add only `GitHub <noreply@github.com>` (GitHub's merge-commit committer — not a person).

**No third-party human contributor identity appears anywhere in the history.** Both author identities are, on the evidence available, git identities used by the same natural person (the owner / operator of the `bandymuks1-stack` GitHub account). VERIFY-BEFORE-SIGNING: counsel should obtain a written confirmation from the owner that both identities are his, and that no other natural person (employee, contractor, collaborator) contributed code outside git (e.g. pasted snippets, design files).

**AI-assisted authorship.** Commit trailers show heavy AI assistance: `Co-Authored-By: Claude …` (Anthropic's Claude, various model versions) appears on 630 commits; `Co-Authored-By: Mano <mano@local>` on 656. The honest posture: the code was produced by the owner's contributor(s) directing AI coding tools; the AI tool vendor (Anthropic) does not claim ownership of output under its commercial terms, but **the copyright status of AI-assisted output varies by jurisdiction and is an open legal question — this is a point for the lawyer to address in the assignment/licence recitals, not a defect claim.** The assignment draft (see §6) is written to convey whatever assignable rights exist.

## 3. Findings table

| # | Asset | Current holder / author (per evidence) | Evidence (with date) | Gap | Required action |
|---|---|---|---|---|---|
| 1 | **Source code** (Next.js app `apps/web`, scripts, Supabase migrations, guards) | Natural-person contributor(s) behind `bandymuks1-stack` / `Mano` git identities; repo hosted in the owner's personal GitHub account `bandymuks1-stack` | `git remote -v` → `github.com/bandymuks1-stack/labourmarketai.git`; full `git log` author scan, 2026-07-11 | **NO written IP assignment to Labour Market AI Sp. z o.o. is evidenced anywhere in the repo.** GitHub account is a personal account, not an org owned by the company. No LICENSE file / copyright headers in repo root. | Execute the IP assignment (doc B, `ip-assignment-to-labour-market-ai-v1.md`) — **OWNER-SIGNATURE-REQUIRED**. Consider transferring the repo to a company-owned GitHub org after assignment. |
| 2 | **UI / visual design** (layouts, design tokens, `DESIGN.md`, SVG assets `apps/web/public/app-icon.svg`, `public/placeholders/logo-mark.svg`, `worker-portrait.svg`) | Same contributors as code; SVG assets appear repo-authored (hand/AI-drawn SVG, no stock-photo binaries found in `public/`) | Repo file inspection 2026-07-11; `public/` contains only SVGs | Same assignment gap as code. Origin of SVGs not documented — if any were derived from stock/third-party art, sublicensing could be restricted. | Include in assignment; owner to confirm in writing that brand/graphic assets are original or properly licensed. VERIFY-BEFORE-SIGNING. |
| 3 | **Documentation** (`docs/**`, README, AGENTS.md, product doctrine) | Same contributors | git history 2026-07-11 | Same assignment gap | Include in assignment. |
| 4 | **Brand name "LabourMarket.ai" / "Labour Market AI"** | Used in commerce by the platform; **no trademark registration found** in a non-exhaustive web check (2026-07-11). Status **UNVERIFIED** — the official EUIPO eSearch register was not queried. | Web search 2026-07-11 returned no registration for these marks | Unregistered mark = weak, jurisdiction-dependent protection only. Do NOT assert a registration exists in any document. | Professional trademark search + EUIPO (and LT/PL national) filing decision by counsel. VERIFY-BEFORE-SIGNING. |
| 5 | **Domain `labourmarket.ai`** | Operationally controlled by the owner: the domain serves the platform (live fetch 2026-07-11) from the Vercel project `labourmarketai` in the owner's **personal** Vercel account `bandymuks1-6851` (`docs/launch/legacy-vercel-project-retirement-v1.md`, `docs/policies/domain-truth-v1.md`) | Live HTTPS fetch 2026-07-11; repo Vercel docs dated 2026-07-11 | **Registrant identity UNVERIFIED** (no WHOIS/registrar access from this audit). Domain + Vercel project sit under personal accounts, not the company. | Registrar record check; formal transfer or written assignment of the domain registration to Labour Market AI Sp. z o.o.; document Vercel account/project ownership. VERIFY-BEFORE-SIGNING. |
| 6 | **Database schema / data structures** (Supabase migrations, `esco_*` tables' *structure*, RLS policies) | Same contributors as code | `supabase/migrations/*` in git history 2026-07-11 | Same assignment gap. Note: schema/structure is assignable; the *data* filling some tables is not (see #7). | Include in assignment (structure only, data excluded where third-party). |
| 7 | **ESCO taxonomy data** (occupation/skill labels loaded into `esco_*` tables; migrations `20260610130000_esco_taxonomy_core.sql`, `20260610230000_esco_labels_all_official_languages.sql`, etc.) | **European Commission** (ESCO is EU-published data with its own reuse conditions) | Migration files, 2026-07-11 | ESCO data is NOT owned by the project and CANNOT be assigned or sublicensed as proprietary IP. It is reusable under the European Commission's ESCO terms (attribution-style conditions). | Exclude expressly from the proprietary licence and from the assignment; add ESCO attribution where required; counsel to confirm current ESCO reuse terms. |
| 8 | **Open-source dependencies** | Their respective upstream authors | License fields read from installed packages, 2026-07-11: next MIT, react MIT, react-dom MIT, tailwindcss MIT, @supabase/supabase-js MIT, @supabase/ssr MIT, framer-motion MIT, next-intl MIT, zod MIT, stripe (SDK) MIT, @anthropic-ai/sdk MIT, unpdf MIT, leaflet BSD-2-Clause, mammoth BSD-2-Clause, lucide-react ISC, topojson-client ISC, world-atlas ISC | None of these are copyleft; all are permissive (MIT/BSD/ISC). But they remain under their own licences — they are not, and never become, proprietary IP of the company. | Exclude expressly from the proprietary licence/assignment. Full SBOM + licence scan (all transitive deps) recommended before any enterprise licence deal. |
| 9 | **Fonts** (Bricolage Grotesque, Inter, JetBrains Mono via `next/font/google`) | Their type foundries; distributed under SIL OFL-style licences via Google Fonts | `apps/web/app/[locale]/layout.tsx` import, 2026-07-11 | OFL fonts are freely embeddable/self-hostable; not sublicensable as proprietary. | Exclude from proprietary IP; no action beyond noting the licences. |
| 10 | **Map data** (world-atlas / Natural Earth-derived TopoJSON; Leaflet tiles config) | Natural Earth data is public domain; any tile provider has its own ToS | `package.json` deps, 2026-07-11 | Tile-provider terms (if OSM or commercial tiles are used at runtime) not audited here. | Counsel/dev to confirm the runtime tile source and its attribution requirements. |
| 11 | **Legacy repo code** (`bandymuks1-stack/labourmarket.ai` — the OLD repo; legacy "Labour Market Operating System" / earlier "Labma"-era build) | Same owner, but a separate retired codebase. Its Vercel project `labourmarket-ai` was deleted 2026-07-11 (HTTP 204), documented in `docs/launch/legacy-vercel-project-retirement-v1.md`. Legacy names ("Labma", "Construction OS", "Labour Market Operating System") still appear in current-repo docs as historical references. | Repo doc dated 2026-07-11; grep for legacy names, 2026-07-11 | Chain of title for any legacy code *reused* in the current repo is undocumented. Separately, **the older distinct "LABMA" project is a separate project and is NOT part of this IP** — it must not be swept into any assignment or licence by accident. | Assignment drafted to cover the current repo and any owner-authored predecessor code incorporated into it, while expressly excluding the separate LABMA project. Owner to confirm no third-party code entered via the legacy repo. VERIFY-BEFORE-SIGNING. |
| 12 | **Company entity** (assignee) | Labour Market AI Sp. z o.o. (LABOUR MARKET AI SPÓŁKA Z OGRANICZONĄ ODPOWIEDZIALNOŚCIĄ), KRS 0001218752, NIP 7011295735, REGON 543779454, ul. Żurawia 47/49 lok. 415, 00-680 Warszawa | Company identifiers supplied by owner; **not independently verified against the KRS register in this audit** | The company currently holds **no evidenced IP** in the platform. | Counsel to pull the current KRS extract; then execute the assignment. VERIFY-BEFORE-SIGNING. |

## 4. Honest conclusion

1. **The code, design, and documentation were authored by the owner's contributor(s)** — the two git identities `bandymuks1-stack <bandymuks1@gmail.com>` and `Mano <mano@local>` — working with AI coding tools, inside the owner's personal GitHub account `bandymuks1-stack`. No third-party human contributor appears in the history.
2. **NO written IP assignment to Labour Market AI Sp. z o.o. is evidenced in the repository.** As of this audit the company's claim to own the platform IP rests on nothing in writing. Any licence agreement whose recitals state that Labour Market AI Sp. z o.o. "owns" the software is **not currently true** and depends on first executing the assignment in `docs/legal/ip-assignment-to-labour-market-ai-v1.md`. That document is a DRAFT and is **OWNER-SIGNATURE-REQUIRED** — it evidences nothing until signed.
3. **Trademark: unregistered / unverified.** A non-exhaustive check found no registration; a professional trademark search and a filing decision are required. No document may assert a registered mark.
4. **Domain: registrant identity unverified.** The domain demonstrably serves the platform and the hosting sits in the owner's personal Vercel account (`bandymuks1-6851`) — an operational fact that itself needs formal assignment/records to the company.
5. **Third-party components (open-source dependencies, fonts, ESCO data, map data) remain under their own licences** and must be expressly excluded from any proprietary licence or assignment.
6. **AI-assisted authorship** should be disclosed to counsel and handled in the assignment recitals; it is a legal-characterisation question, not a discovered defect.

## 5. Priority action list

1. **Execute the IP assignment** (doc B) — OWNER-SIGNATURE-REQUIRED — after counsel review, with consideration and form requirements settled under the governing law (note: Polish and Lithuanian copyright law both impose written-form requirements for copyright transfers).
2. Verify domain registrant; transfer/assign the `labourmarket.ai` registration to the company; document Vercel and GitHub account arrangements (or migrate to company-owned org/team).
3. Commission a professional trademark search; decide on EUIPO filing.
4. Confirm KRS extract for the assignee entity.
5. Add ESCO attribution where required; run a full SBOM licence scan before any enterprise licensing deal.
6. Consider adding a LICENSE/COPYRIGHT notice to the repo consistent with the post-assignment ownership position.

---
*End of audit v1. Prepared 2026-07-11. Not legal advice.*
