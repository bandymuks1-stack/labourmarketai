# DRAFT — OWNER-SIGNATURE-REQUIRED. NOT SIGNED. Not evidence of ownership until executed.

> **Status:** DRAFT v1, prepared 2026-07-11 for review by the owner and qualified counsel.
> This document has **no legal effect** until reviewed by counsel, completed (all bracketed
> placeholders resolved), and signed in the written form required by the governing law.
> It must never be presented, quoted, or relied on as an executed assignment.
> Language note: this draft is in English; **Lithuanian and/or Polish language versions may be
> required** for validity or evidentiary purposes (assignor residence / assignee seat) — counsel
> to decide which language version controls.

---

# INTELLECTUAL PROPERTY ASSIGNMENT AGREEMENT (DRAFT)

**Regarding the LabourMarket.ai platform**

This Intellectual Property Assignment Agreement (the "**Agreement**") is entered into on
[DATE — VERIFY-BEFORE-SIGNING] by and between:

## Parties

**Assignor(s):**

1. **[FULL LEGAL NAME OF NATURAL-PERSON CONTRIBUTOR — VERIFY-BEFORE-SIGNING]**, natural person,
   personal code / date of birth [●], residing at [●] (the "**Contributor**") — the natural person
   who authored the contributions recorded in the git history of the repository
   `github.com/bandymuks1-stack/labourmarketai` under the git identities
   `bandymuks1-stack <bandymuks1@gmail.com>` and `Mano <mano@local>`;

2. *(if applicable per the audit findings and counsel's review of any employment / engagement
   arrangements)* **UAB „Nonstop Group“**, a private limited liability company organised under the
   laws of the Republic of Lithuania, company code [● — VERIFY-BEFORE-SIGNING], registered office
   at [●], represented by [●] (together with the Contributor, the "**Assignors**");

**Assignee:**

**LABOUR MARKET AI SPÓŁKA Z OGRANICZONĄ ODPOWIEDZIALNOŚCIĄ** (Labour Market AI Sp. z o.o.),
a limited liability company organised under the laws of the Republic of Poland,
KRS 0001218752, NIP 7011295735, REGON 543779454, with its registered office at
ul. Żurawia 47/49 lok. 415, 00-680 Warszawa, Poland, represented by
[NAME, TITLE — VERIFY-BEFORE-SIGNING against current KRS extract] (the "**Company**").

## Recitals

(A) The Contributor has, since on or about 19 May 2026, created and developed a software
platform known as **LabourMarket.ai**, comprising source code, database schemas, documentation,
user-interface designs and brand materials, maintained in the GitHub repository
`bandymuks1-stack/labourmarketai` and deployed at the domain `labourmarket.ai`
(the "**Platform**").

(B) Substantial portions of the Platform were created with the assistance of AI coding tools
(commit records show "Co-Authored-By: Claude" trailers). Such AI-assisted output was created
under the direction and creative control of the Contributor. **[NOTE FOR COUNSEL: the
copyright characterisation of AI-assisted works differs between jurisdictions; the assignment
below is drafted to convey all rights the Assignors hold or may hold, whatever their
characterisation, and the Assignors additionally covenant not to assert any retained rights
against the Company.]**

(C) The Parties record honestly that, prior to this Agreement, **no written assignment of the
Platform intellectual property to the Company existed** (see the audit at
`docs/legal/ip-chain-of-title-audit-v1.md`, dated 2026-07-11). The Company's ownership of the
Platform therefore takes effect only upon execution of this Agreement.

(D) The Parties intend that the Company hold all assignable economic intellectual property
rights in the Platform, to enable the Company to license, commercialise and further develop it.

## 1. Definitions

1.1 "**Assigned Assets**" means, by reference to the asset inventory in the audit document
`docs/legal/ip-chain-of-title-audit-v1.md` (items 1, 2, 3, 6, and — to the extent owner-authored
code was incorporated into the current repository — item 11):

  (a) the **source code** of the Platform as contained in the repository
      `bandymuks1-stack/labourmarketai` at commit `923bf3b` (2026-07-11) and all prior
      revisions authored by the Assignors, including application code, build and CI scripts,
      guard scripts and Supabase database migrations;

  (b) the **database structures** (schemas, table definitions, RLS policies and functions)
      defined in the migrations, excluding third-party data content per Clause 3;

  (c) the **documentation** (all `docs/**` content, README, product doctrine, design and
      audit documents authored by the Assignors);

  (d) the **user-interface and visual designs**, including layouts, design tokens, and the
      original graphic assets in the repository (including `apps/web/public/app-icon.svg`,
      `apps/web/public/placeholders/logo-mark.svg`, `apps/web/public/placeholders/worker-portrait.svg`);

  (e) the **brand materials**: the names "LabourMarket.ai" and "Labour Market AI" as used by
      the Platform, associated logos and wordmarks, and all goodwill and any unregistered
      trade-mark rights therein **[NOTE: no trademark registration exists or is asserted;
      status per audit item 4 — UNVERIFIED]**; and

  (f) any **predecessor code** authored by the Assignors in the retired repository
      `bandymuks1-stack/labourmarket.ai` to the extent incorporated into the Platform.

1.2 "**Excluded Components**" has the meaning in Clause 3.

## 2. Assignment

2.1 Each Assignor hereby irrevocably **assigns and transfers to the Company, and the Company
accepts, all assignable economic copyright (autorių turtinės teisės / autorskie prawa
majątkowe) and all other assignable intellectual property rights** in and to the Assigned
Assets, throughout the world, for the entire duration of such rights, in all fields of
exploitation known at the date of this Agreement, including without limitation:
reproduction in any form; distribution; making available to the public (including via the
internet); adaptation, modification, translation and creation of derivative works;
rental and lending; and — in respect of software — the fields of exploitation enumerated in
[Art. 74(4) of the Polish Act on Copyright and Related Rights / Art. 15 of the Lithuanian
Law on Copyright and Related Rights — COUNSEL TO CONFORM THE ENUMERATION TO GOVERNING LAW;
Polish law requires express enumeration of fields of exploitation (pola eksploatacji)].

2.2 The assignment includes the right to exercise derivative-work rights and the right to
authorise third parties to exercise them, and, to the maximum extent permitted by law, the
right to further assign and sublicense.

2.3 To the extent any right in the Assigned Assets cannot be presently assigned, the relevant
Assignor grants the Company an exclusive, irrevocable, perpetual, worldwide, royalty-free,
sublicensable licence to such right, and shall execute any further documents needed to perfect
the Company's title.

## 3. Exclusions — open-source, third-party and public-sector components

3.1 The following are **expressly excluded** from the Assigned Assets and from any proprietary
licence granted over the Platform; they remain governed solely by their own licences/terms:

  (a) **open-source dependencies** declared in `package.json` / `apps/web/package.json` and all
      transitive dependencies (including Next.js, React, Tailwind CSS, Supabase client
      libraries, framer-motion, next-intl, zod, Stripe SDK, Anthropic SDK, unpdf — MIT;
      Leaflet, mammoth — BSD-2-Clause; lucide-react, topojson-client, world-atlas — ISC), each
      under its respective licence;

  (b) **fonts** (Bricolage Grotesque, Inter, JetBrains Mono), under their respective open
      font licences;

  (c) **ESCO taxonomy data** (the occupation/skill classification content loaded into the
      `esco_*` database tables), which is published by the European Commission and reusable
      only under the Commission's ESCO conditions of use — the Assignors convey no rights in
      that data;

  (d) **map/geographic data** from public-domain or third-party sources (Natural Earth /
      world-atlas; any runtime tile provider under its own terms); and

  (e) the separate legacy "**LABMA**" project, which is a distinct project of the owner and is
      **not part of the Platform IP and not assigned** under this Agreement.

## 4. Moral rights

4.1 The Parties acknowledge that under Lithuanian and Polish law an author's **moral rights
(autorių asmeninės neturtinės teisės / autorskie prawa osobiste) are non-waivable and
non-transferable**. Nothing in this Agreement purports to assign them.

4.2 To the maximum extent permitted by applicable law, the Contributor **undertakes not to
exercise** moral rights in a manner that would impede the Company's normal exploitation of the
Assigned Assets, and authorises the Company to make the Platform available with or without
author attribution and to permit modifications by the Company and its licensees.
**[FLAG FOR LAWYER: conform this clause to the chosen governing law; Polish practice commonly
uses a non-exercise undertaking plus authorisation; confirm enforceability.]**

## 5. Consideration

5.1 In consideration of the assignment, the Company shall pay / provide the Assignor(s):
**[CONSIDERATION — VERIFY-BEFORE-SIGNING. Counsel to determine amount/form (monetary sum,
shares, or set-off), tax treatment (including Polish 50% author's-cost rules or Lithuanian
personal income tax, as applicable), and whether separate remuneration per field of
exploitation must be stated under Polish law.]**

## 6. Warranties of the Assignors

Each Assignor warrants, to the best of their knowledge, that: (a) they created the Assigned
Assets (with AI-tool assistance as recited) and did not copy third-party proprietary material
into them except the Excluded Components; (b) no third party has been granted conflicting
rights; (c) no employee or contractor other than the Assignors contributed protectable material
to the Assigned Assets **[VERIFY-BEFORE-SIGNING against the audit's contributor findings]**;
and (d) the Assigned Assets are unencumbered.

## 7. Further assurances

The Assignors shall, at the Company's request, execute all documents and take all actions
reasonably necessary to perfect, register or defend the Company's rights, including in respect
of the `labourmarket.ai` domain registration, hosting and repository accounts (currently held
in personal accounts `bandymuks1-stack` (GitHub) and `bandymuks1-6851` (Vercel) — see audit
items 1 and 5), and any future trademark applications.

## 8. Written form; governing law; language

8.1 This Agreement is concluded in **written form**, which the Parties acknowledge is a
validity requirement for copyright transfer under [Polish / Lithuanian] law. Electronic
signature is permissible only if it satisfies the written-form requirement of the governing
law — **[COUNSEL TO CONFIRM]**.

8.2 Governing law: **[POLAND / LITHUANIA — VERIFY-BEFORE-SIGNING]**. Courts of [●] have
exclusive jurisdiction.

8.3 This Agreement is executed in the English language; **[a Lithuanian / Polish version may
be executed; specify which version prevails]**.

## 9. Entire agreement

This Agreement supersedes all prior understandings regarding the Assigned Assets. Amendments
require written form under pain of nullity.

---

## SIGNATURES

**NOT SIGNED — DRAFT ONLY. This document evidences nothing until executed.**

| | |
|---|---|
| **Assignor (Contributor):** | |
| Name: ______________________________ | Signature: ______________________________ |
| Date: ______________________________ | Place: ______________________________ |

| | |
|---|---|
| **Assignor (UAB „Nonstop Group“, if applicable):** | |
| Name / title: ______________________________ | Signature: ______________________________ |
| Date: ______________________________ | Place: ______________________________ |

| | |
|---|---|
| **Assignee (Labour Market AI Sp. z o.o.):** | |
| Name / title: ______________________________ | Signature: ______________________________ |
| Date: ______________________________ | Place: ______________________________ |

---
*Draft v1 prepared 2026-07-11 by reference to `docs/legal/ip-chain-of-title-audit-v1.md`.
Not legal advice. OWNER-SIGNATURE-REQUIRED.*
