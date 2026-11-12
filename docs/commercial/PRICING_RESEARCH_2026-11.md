# Pricing research: EU and Sweden, November 2026

**Status:** RESEARCH ONLY. This file sets no price and activates nothing. It changes no contract and does not arm payments (MKT-7 stays open).

**Date:** 2026-11-12, Lane D of the 2026-11-15 launch. Owner approvals (c) and (d), 2026-11-12.

**What it does not replace:**
- The approved launch table stays in force until the owner decides otherwise. Its figure lives in `public.plans.price_eur_monthly`, its boundary in `apps/web/lib/billing/plans.ts`, and the gate is [`docs/human-gates/payments-price-table-gate.md`](../human-gates/payments-price-table-gate.md) (G-7/G-8).
- [Decision 0029](../DECISIONS/0029-commercial-sustainability-and-business-health.md) remains the one home of the sustainability rules.

**Earlier candidates:** [`pricing-decision-package-v1.md`](pricing-decision-package-v1.md) and [`pricing-candidate-v8-2026-08-13.md`](pricing-candidate-v8-2026-08-13.md) are history. This file supersedes neither of them silently. It is new input for the owner.

## 0. How to read this

**Every number carries a tag:**
- `[n]` is a numbered source in §9.
- `[R]` is a fact read from this repository, with the path given.
- `(estimate)` is a figure not found on any cited page. Its reasoning is stated next to it.

**How the sources were read:**
- Most vendor price pages could not be fetched directly from the research session; the network did not resolve stripe.com, supabase.com, hetzner.com, jobindex.dk, help.malt.com or se.indeed.com.
- Those figures come from **search-result text of the cited URL** on 2026-11-12. Where the page belongs to a third party, it is tagged *3rd-party*.
- Only the Anthropic API pricing page [46] was read directly.
- **Re-read every vendor page before any price goes live.**

**Exchange rates (estimate, not checked against Riksbanken):** 1 EUR ≈ 11.0 SEK, 1 USD ≈ 10.0 SEK.

**Hard rules from the owner (2026-11-12), which apply in every scenario:**
- Registration stays free.
- Basic need posting stays free.
- Payment is charged only for clear extra value.
- No price is activated by this document.
- No existing contract changes.

---

## 1. Where we are today (repository facts)

| Fact | Value | Where |
|---|---|---|
| Approved launch table | PERSON €0; ORGANIZATION FREE €0 with **1 concurrent active position**; ORGANIZATION **€99/month** with no fixed position limit | [R] `docs/human-gates/payments-price-table-gate.md`, `lib/billing/plans.ts` |
| Price readiness | `PRICING_READINESS_STATE = "owner_confirmed"` | [R] `lib/billing/readiness.ts` |
| Who is billed | Only organizations in `BILLING_PILOT_ORGANIZATION_IDS`, which admits nobody by default. Every public page behaves as if billing is off. | [R] `lib/billing/config-core.ts` |
| Free-position limit | Enforced **only** for an organization whose billing is armed. `open-needs-gate.ts` is permissive otherwise. | [R] `lib/billing/open-needs-gate.ts` |
| Live mode | Blocked unless `STRIPE_MODE=live`, the live keys, `STRIPE_LIVE_ACTIVATION=approved-by-owner` and the confirmed price table are all present. The second owner act (`live_payments_enabled`, PR #2441) is still a **draft**. | [R] `config-core.ts`, PR #2441 |
| Selling entity | UAB "Nonstop Group", company code 302676973, **VAT LT100010790613**, Lithuania | [R] `messages/en.json` → `legal.*` |
| Deferred, not sold | ai_plus, agency tiers, LMC top-ups, priority visibility, annual and enterprise pricing, institution pricing | [R] payments-price-table-gate.md |

> **Correction to the research brief.** The brief said "SE VAT". The seller is a **Lithuanian** VAT-registered company, so VAT works as follows:
> - **Swedish business customers:** reverse charge. The buyer accounts for Swedish VAT, and the invoice carries 0% plus "reverse charge" (VAT Directive Art. 44 + 196 [34]; Skatteverket's description of the same rule [33]).
> - **Lithuanian business customers:** Lithuanian VAT.
> - **Consumers in other EU states:** VAT of the customer's country through OSS. That is 25% for Sweden [32].
>
> The EU's €10,000 B2C distance-sales threshold and the Lithuanian standard rate (21%) are *not* in the cited sources and must be confirmed by the accountant **(to verify)**. §8 lists what Stripe Tax needs for this.

---

## 2. Competitor pricing (sources: §9)

### 2.1 Job boards and recruitment advertising

| Player | Model | What the page states (seen 2026-11-12) | Source |
|---|---|---|---|
| **Arbetsförmedlingen Platsbanken** (SE) | Free | Advertising is free ("kostnadsfritt"). Ads are also distributed via EURES and partners. The advertiser must be in SCB's company register. | [1] official |
| **Blocket Jobb** (SE) | Pay-per-post (assumed) | **Not public.** G2: "Blocket has not provided pricing". | [24] 3rd-party |
| **Indeed Sweden** | Freemium + pay-per-result | **Up to 3 free job posts per calendar month.** Sponsored jobs in SE are billed **per started application (PPSA)**. No SEK unit prices are published. | [2][3] official |
| **Indeed Smart Sourcing** | AI-assisted sourcing subscription | UK Professional **£325/month**. No SE price. | [4] official (UK) |
| **LinkedIn Jobs** | Freemium + PPC | One free open job, with a cap on free posts. Promoted jobs are **pay-per-click on a budget**. Prepaid credits give up to 35% off. | [5][6][7] official |
| **LinkedIn Recruiter Lite** | Per-seat subscription | **About $170/month or $1,680/year**, which LinkedIn does not publish. | [8] 3rd-party |
| **LinkedIn Hiring Assistant** | AI add-on | **Not public.** Sold as an add-on to Recruiter / RPS+. | [9] 3rd-party |
| **StepStone** (DE) | Pay-per-post | **€219–€5,499 per ad**; "Pro" **€1,449 per 30 days**. Prices rose 3–10% on 2026-03-25. | [10] 3rd-party |
| **Jobindex** (DK) | Pay-per-post | DIY ad **DKK 1,025** (3 weeks); profile ad **DKK 3,085**; private-person ads free | [11] official (snippet) |

### 2.2 Gig, freelance and on-demand staffing

| Player | Model | What the page states | Source |
|---|---|---|---|
| **Workpilots** | Per-hour (assumed) | **Not public** (company profile only) | [20] 3rd-party |
| **Gigstr** (SE) | Hire-in or direct hire | **Not public**. Its operating status is unclear: a 2022 bankruptcy is reported. | [19] 3rd-party |
| **Yepstr** (SE) | Fixed hourly price + subscription | **215 / 245 SEK/h ex VAT**. The subscription gives 10% off plus 1,000 SEK of credit per month. | [21] official (snippet) |
| **Coople** | Wage × fee factor + pool subscription | Example **factor 1.43** (CHF 20 → 28.60/h). UK pool plans **£100 and £300/month**. | [17] official |
| **Instaffo** (DE) | Pay-per-hire | "100% erfolgsbasiert" (fully success-based). **The percentage is set per contract (not public).** | [18] |
| **Malt** | Commission | Freelancer **10% → 5% after 6 months**, 2% on a client the freelancer brings. Client fee 15–20% (3rd-party only; recent documents omit it). | [12] official, [13] 3rd-party |
| **Upwork** | Commission + fees | Client **5%** plus a contract fee of **$0.99–$14.99**. Freelancer **0–15%** variable. | [14] official, [15] |
| **Fiverr** | Commission | Seller **20%**; buyer **5.5%** plus a small-order fee | [16] 3rd-party |
| **Bemlo** (SE healthcare) | SaaS + staffing (assumed) | **Not public** (demo booking only) | [22] |
| **Zmarta** (SE) | **Not relevant** | A loan and insurance comparison group with no recruitment product. It appears only as an *employer* on Jobylon. | [23] official |
| **Teamtailor** (SE ATS) | Flat subscription | **Not public**. Third-party estimate **$199–229/month** for small teams. | [25] 3rd-party |
| **Jobylon** (SE ATS) | Sales-led | **Not public** (quote only) | [26] 3rd-party |

### 2.3 Construction staffing in Sweden

No construction staffing company was found that publishes hire-in rates or ad prices. The searches covered Byggbemanning, Bravura, Jobbusters, Bemannia and Hantverkarjobb / Byggjobb. The usable anchors are:

- **Consumer carpenter price:** median **703 SEK/h incl. VAT**. The most common price is 688 incl. VAT, which is **550 SEK/h ex VAT** [41] (3rd-party survey).
- **Public-procurement staffing factor:** agency price = gross wage × **1.85–2.15**, i.e. an 85–115% markup [28] official (Adda 2024).
- **Agency carpenter hire-in:** about 450–650 SEK/h ex VAT **(estimate)**. Reasoning: a wage of 240 SEK/h [39] × the factor of 1.85–2.15 [28], plus a construction premium.

### 2.4 Industry benchmarks

| Metric | Value | Source |
|---|---|---|
| Kompetensföretagen | Just under **1,000 member companies**, **70,000+ annual employees** (March 2025) | [27] official |
| Swedish staffing market | Q4 2024 **−17%**; H1 2026, top-35 panel: **+28%** | [27] |
| Recruitment fee, public framework | **1.6 × final monthly salary**, about **13% of annual salary** | [29] official (Avropa) |
| Recruitment fee, private market | 20–30% of annual salary is often quoted; **not confirmed on any page reached (estimate)** | — |
| Agency work, EU | **2.6%** of employed people (2022) | [31] official (Eurostat) |
| Agency work, global | **1.9%** | [30] official (WEC 2024) |
| Agency gross margin | About 18–22% of revenue **(estimate**; check Randstad and Adecco annual reports) | — |

### 2.5 What the market shows

**Pricing models in use:**
- **Free:** Platsbanken [1].
- **Freemium:** Indeed [2], LinkedIn [7].
- **Subscription:** Recruiter Lite [8], Smart Sourcing [4], Teamtailor [25], Coople pools [17].
- **Pay-per-result:** Indeed PPSA [3], Instaffo [18].
- **Pay-per-post:** StepStone [10], Jobindex [11].
- **Commission:** Malt [12], Upwork [14], Fiverr [16], the Coople factor [17].
- **AI features:** Hiring Assistant [9], Smart Sourcing credits [4].

**What this means for us:**
- **Distribution is free in Sweden.** Platsbanken charges nothing [1] and Indeed gives 3 posts a month [2]. Charging for a basic need post would compete with free, which is one more reason the owner's hard rule is commercially right.
- **Nobody publicly prices verified work evidence**, a living CV, or multi-site workforce operations. That is where a paid plan can be clearly "extra value".

---

## 3. Swedish and EU context

- **VAT rates.** 25% is the general Swedish rate [32] official. **EU B2B services** are taxed where the buyer is established, and the buyer accounts for the VAT (Art. 44 + 196 [34]; Skatteverket [33]).
- **Construction reverse charge** (*omvänd byggmoms*, [35]) covers construction services between construction firms. It does **not** cover SaaS sold to them **(estimate, confirm with an accountant)**.
- **Market size.**
  - About **354,000 people** work in construction, 7% of employment [37].
  - **64%** of Installatörsföretagen members have under 10 employees [38].
  - Byggföretagen has about **4,000** members [42].
  - Legal entities in SNI F: 90,000–110,000, about 90% with under 10 employees **(estimate; pull SCB FDB [36] to confirm)**.
- **Wage anchors.**
  - SSYK 711 hourly wage (private sector, 2025): **240.60 SEK (men) / 229.80 SEK (women)** [39] official.
  - "Träarbetare, snickare m.fl." (carpenters and wood workers): **39,700 SEK/month** [40] official.
  - A plan at 690 SEK/month costs **about one billable carpenter hour** [41]. That is the willingness-to-pay framing used below.

---

## 4. Unit economics

### 4.1 Price inputs

| Item | Price | Source |
|---|---|---|
| Claude Haiku 5.5 (prompts ≤ 100k tokens) | **$0.10 / $0.50** per MTok input/output; cache hit $0.01 | [46] official, read directly |
| Claude Sonnet 5.5 | **$2 / $10** per MTok; cache hit $0.10 | [46] |
| Claude Opus 5.5 | **$4 / $20** per MTok; cache hit $0.20 | [46] |
| Batch API | **−50%** | [46] |
| Supabase Pro | **$25/month** per organisation, 100k MAU included, then $0.00325 per MAU; compute billed on top | [47] 3rd-party |
| Hetzner Cloud VPS | CX23 **€5.49/month**, CX32 (legacy) **€8.49/month**, after the 2026-04-01 increase | [48] 3rd-party |
| Stripe, standard EEA cards | **1.5% + fixed fee** (1.80 SEK for an SE account) | [49] official notice (2023) |
| Stripe Billing | **0.7%** of Billing volume | [49] snippet, unconfirmed |
| Stripe Tax | **0.5%** per transaction where registered | [49] official |

> **Our account's own figures will differ.**
> - Card fees above are for a **Swedish** Stripe account. Our account belongs to a **Lithuanian** entity, and the LT fixed fee is in EUR **(to verify** on stripe.com/lt/pricing).
> - Our VPS and Supabase plan sizes are not recorded in this file. Use the owner's real invoices once they are known **(to verify)**.

### 4.2 Cost per active user per month (all estimates)

The usage profiles are assumptions, not measurements.

**Worker, free core:**
- 20 AI actions a month on Haiku 5.5, about 3k input + 0.5k output tokens each: about $0.011, roughly **0.1 SEK**.
- The same on Sonnet 5.5: about **2.2 SEK**.
- Share of database, storage and VPS: **0.05–0.3 SEK**.
- **Total: 0.2–2.5 SEK** per worker per month.

**Organization admin, paid plan:**
- 150 Sonnet 5.5 actions, 5k input + 1k output each: about $3, roughly **30 SEK** per month.
- Prompt caching brings this to about 15–20 SEK.
- Heavy multi-site use (600 actions): **80–120 SEK**.
- **Conclusion: sell AI as a quota, never unlimited.**

**Payment cost on a 690 SEK invoice:**
- Card 1.5% + Billing 0.7% + fixed fee: about **17 SEK, 2.5%**.
- Stripe Tax adds 0.5%.
- Annual invoices paid by bank transfer cut this further.

### 4.3 Benchmarks

- **Freemium → paid conversion:**
  - Self-serve: **6–8%**.
  - Sales-assisted: 10–15%.
  - OpenView: freemium about **7%**, trial about 14%.
  - 2026 ChartMogul / ProductLed report: median **8%**, but a quarter of products are below 2.5%.
  - All of these are secondary sources [43].
- **SaaS gross margin:** median about **71–74%** (KeyBanc 2025); about **80%** (Benchmarkit 2025) [44].
- **SMB product-led CAC:** **$200–500**; CAC payback for contracts under $5k/year: **11 months** median [45], 3rd-party.

### 4.4 Segment estimates (all estimates)

| Segment | CAC (SEK) | Willingness to pay | Freemium → paid within 12 months |
|---|---|---|---|
| Worker | 0–50 organic (invited by an employer or agency); 50–200 paid social | Core always free; optional extras are low priority | n/a |
| SME organization (1–49 people) | 2,000–6,000 self-serve or via partners; 8,000–20,000 through field sales | 290–990 SEK/month, about 0.5–2 carpenter hours [39][41] | **3–6%**, below the 8% median: low digital maturity, and Platsbanken is free [1] |
| Staffing agency | 10,000–30,000, sales-led | 1,500–5,000 SEK/month. Comparators: Recruiter Lite [8], Smart Sourcing [4], Coople pools [17] | 8–15% of active agencies |
| Education institution | 15,000–40,000; procurement cycles | 10,000–60,000 SEK/year, as a pilot or an annual licence | 5–10%; long cycle |

---

## 5. Three scenarios

All prices are **monthly, ex VAT**. EUR is converted at 11 SEK per EUR and rounded (estimate). **Nothing below is activated.**

**What every scenario keeps free:**
- Registration for every segment.
- Basic need posting.
- Applications and messaging.
- The worker's core: living CV, journal, their own evidence, applying, and exporting their own data.

### Scenario A: conservative, free-heavy

| Segment | Plan | SEK / EUR | Paid value |
|---|---|---|---|
| Worker | Free | 0 | All of the core, plus a small Haiku AI quota |
| Organization | Free | 0 | Unlimited need posts, 1 project, up to 10 workers on timesheets |
| Organization | Bas | 290 / €26 | Unlimited projects and workers, verified-evidence exports, 200 AI actions |
| Agency | Free supply | 0 | Declare supply, receive demand |
| Agency | Agency Pro | 990 / €90 | Pool management, bulk proposals, 500 AI actions |
| Institution | Free + Pilot pass | 0; pilot 4,900 / €445 for 6 months, one-off | Cohort and RPL evidence export |

**Projected results (estimates):**
- **Organizations:** 3% conversion × 290 SEK → about **8,700 SEK MRR per 1,000 active organizations**.
- **Agencies:** 8% of 100 × 990 SEK → about **7,900 SEK MRR**.
- **Margin:** about 85% per paid account; **70–80% blended**.
- **CAC payback:** 8–24 months.
- **Risk:** too thin to fund sales, and it reads as a cheap tool, not trust infrastructure.

### Scenario B: balanced (recommended shape)

| Segment | Plan | SEK / EUR | Paid value |
|---|---|---|---|
| Worker | Free | 0 | Core plus a Haiku AI quota; exporting their own evidence is free |
| Organization | Free | 0 | Unlimited need posts, applications, messaging, 1 active project, up to 5 workers on timesheets |
| Organization | Team | 690 / €63 | Up to 3 sites, 50 workers, verified-evidence exports and attestation workflows, evidence-weighted matching, 500 AI actions |
| Organization | Business | 1,990 / €181 | Unlimited sites, multi-site workforce management and forecasting, API, 2,000 AI actions |
| Add-on | AI pack | 190 / €17 per 500 actions | Priced for at least a 70% margin |
| Agency | Supply | 1,490 / €135 | Supply-pool tools, bulk proposals, client connections, 1,000 AI actions, 3 seats |
| Agency | Supply Pro | 3,990 / €363 | Unlimited seats, multi-client dashboards |
| Institution | Free / Institution Plus | 0 / 1,490 / €135 (14,900 per year) | RPL evidence exports, employer matching, outcome reports |
| All organizations | Pilot pass | 4,900 / €445, one-off for 90 days; credited toward an annual plan | Low-risk entry that matches construction project cycles |

**Projected results (estimates):**
- **Organizations:** 5% conversion; 80% Team / 20% Business mix gives ARPA about 950 SEK → **47,500 SEK MRR per 1,000 active organizations**.
- **Agencies:** 12% of 100; ARPA about 2,240 SEK → **26,900 SEK MRR**.
- **Institutions:** 5 on Plus → **7,450 SEK MRR**.
- **Example base** (1,000 organizations, 100 agencies, 50 institutions, about 15,000 workers): **about 82,000 SEK MRR**, roughly €7.4k, or about **0.98 MSEK ARR**.
- **Margin:**
  - Cost per paid account: Team about 62 SEK, giving **about 91%**; Business about 191 SEK, giving **about 90%**.
  - The free tier costs about 21,750 SEK/month, so the **blended margin is about 67% at this size**, rising to over 80% as paid accounts grow.
- **CAC payback:** SME **2.5–7 months**; agency **5–15 months**. Both are within the 11–15 month benchmark [45].

### Scenario C: aggressive

| Segment | Plan | SEK / EUR | Paid value |
|---|---|---|---|
| Worker | Free + Worker Plus | 0 / 49 / €4.5 | Priority visibility, branded CV export |
| Organization | Free | 0 | Posting and applications only; **timesheets behind a paywall** |
| Organization | Pro | 1,490 / €135 | Timesheets, projects, exports, matching, 1,000 AI actions |
| Organization | Enterprise | 3,990+ / €363+ | Multi-site, API, SSO |
| Organization | Success fee | 3–5% of first-year salary per verified hire | Pay-per-result, as Instaffo does [18]; below the 13% framework rate [29] |
| Agency | Per seat | 790 / €72 per seat, minimum 3 seats | — |
| Institution | Annual licence | 29,900 / €2,720 per year | — |

**Projected results (estimates):**
- **Organizations:** 2–2.5% conversion × ARPA about 2,240 SEK → **50,000–56,000 SEK MRR per 1,000 organizations**.
- **Agencies:** about **32,000 SEK MRR**.
- **Success fees:** 0–20k SEK MRR, highly volatile.

**Risks, which are architectural as well as commercial:**
- **Paywalling timesheets** starves the evidence flywheel: fewer confirmed journal entries reach the living CV (decision 0023/0025).
- **A success fee** pulls positioning toward "only recruitment / only marketplace", reductions that axiom A-13 forbids.
- **Worker Plus** strains the "worker core free" principle.

---

## 6. Recommendation (for the owner to decide; nothing changes on merge)

1. **Adopt the *shape* of Scenario B, with one element from A:** a free organization keeps timesheets for up to 5 workers. That keeps confirmed work evidence flowing into workers' histories, which is the flywheel. Payment starts where the admin burden grows: more than one site, more workers, evidence exports at scale, advanced matching, agency supply tools, and AI beyond a quota.

2. **Decision needed: open need posting vs the current table.**
   - The current approved table limits a free organization to **1 concurrent active position** once billing is armed [R].
   - The owner's 2026-11-12 rule says **basic need posting stays free**. One concurrent free position satisfies "basic", but competitors give more for free: Indeed allows 3 posts a month [2] and Platsbanken is unlimited and free [1].
   - **Recommended:** raise the free concurrent-position allowance (for example to 3), or remove the position ceiling and meter sites, workers and exports instead.
   - This is an **owner decision**. No code changes here.

3. **Keep EUR as the billing currency of the €99 plan.**
   - The live Stripe price is EUR and the seller is Lithuanian [R].
   - If the owner wants SEK, add a SEK price as a *second* Stripe price on the same product. That is a new price id; existing subscriptions stay on their current price.
   - Converting the Scenario B Team plan (690 SEK) gives about €63 (estimate). The current €99 plan sits between Team and Business, so no immediate price change is needed to stay within the market band.

4. **Meter AI as a quota.** Route free and worker AI to Haiku 5.5 with caching; reserve Sonnet 5.5 for paid quotas [46].

5. **Defer success fees** until matched hires are measured. Then test them as an *optional* alternative to a subscription, never as a replacement (A-13).

6. **Before activating any figure:**
   - Re-read the vendor pages from a session with network access to stripe.com and supabase.com.
   - Pull SCB FDB counts for SNI F [36].
   - Confirm the EUR/SEK rate.
   - Interview 10–15 construction SMEs and 5 agencies at 690 / 1,490 SEK.
   - Record the decision through the §12 process of the canonical architecture.

---

## 7. What is already finished in test mode (Lane D, 2026-11-12)

**Proved offline by the real modules chained** (`apps/web/lib/billing/test-mode-chain.integration.test.ts`; only the I/O edges are faked):
- Checkout bound to the organization at the server price. It requests Stripe Tax (`automatic_tax`), a required billing address and VAT-id collection (EU reverse charge). Whether the live account has Stripe Tax active is an open owner question (§8.1 item 0).
- Signed webhook, idempotency and replay.
- Trial → active.
- Paid invoice.
- **Payment failure → past_due grace.**
- **Dunning exhausted → unpaid → FREE.**
- **Recovery → paid again.**
- **Refund recorded with no state change.**
- **Pause → no grace.**
- **Cancel at period end → still entitled until the end.**
- **Deletion → FREE**, and a late "active" event cannot revive a cancelled subscription.

**Fixed in the same lane (PR #3252):** a Stripe `paused` subscription was read as `past_due` and granted paid-plan grace while collecting nothing. It now reads as `unpaid`.

**Public copy (Lane D (b), PR #3250, built on #3206):** public pages no longer promise card payment or invoices while online payment is closed. They also no longer state the "1 active position" limit, which is enforced only where billing is armed.

---

## 8. LIVE activation request to the owner (one request, ordered steps)

This consolidates gate G-8 in [`payments-price-table-gate.md`](../human-gates/payments-price-table-gate.md) with what this lane added. **Every step is an owner act.** No agent sets a key, flips a flag or merges a RED PR.

**Never paste a secret** into chat, a file or a PR. Set values on the VPS with `lm-env-set.sh` and `read -s` [R].

### 8.1 Facts the owner must confirm first (tax and legal)

0. **Resolve the Stripe Tax contradiction first. This blocks everything below.**
   - **What the repository says:**
     - [R] `docs/launch/SAFE_CHECKPOINT_2026-09-05_window2.md` records "Stripe Tax ACTIVE (pre-existing, reused)" on the live account.
     - The public-claims registry later records the owner's position: "Stripe Tax is NOT configured and the owner refused Stripe Tax registration (2026-10-23)" ([R] `apps/web/lib/public-claims/registry.ts`, the retired claim `employer.vat-via-stripe-tax`).
     - Checkout always sends `automatic_tax: { enabled: true }` ([R] `lib/billing/providers/stripe-test.ts`).
   - **Why it matters:** if Stripe Tax is not active on the live account, the live checkout is expected to fail when the session is created **(to verify in test mode with Tax off)**.
   - **The owner chooses one:**
     - **(i)** Activate Stripe Tax with the Lithuanian and OSS registrations below. No code change is needed.
     - **(ii)** Keep Stripe Tax off. A separate owner-gated PR then makes `automatic_tax` conditional, and VAT is handled by manual Stripe tax rates or by the accountant's invoicing. That PR is **not** part of this lane, and no agent writes it without the owner's choice.
   - **What this lane assumed:** steps 2 and 8.3 step 2 below assume (i).

1. **Seller identity:** UAB "Nonstop Group", VAT **LT100010790613** [R]. Confirm Stripe account KYC is complete for this entity, and confirm the payout bank account (EUR IBAN).
2. **VAT registrations to add in Stripe Tax** (Settings → Tax → Registrations):
   - **Lithuania** (domestic).
   - The **EU OSS** (Union scheme) registration, **if** the company sells to consumers in other EU states or is over the B2C distance threshold. Confirm the OSS status with the accountant.
   - A Swedish VAT registration is **not** needed for B2B sales to Swedish VAT-registered buyers, because they reverse-charge [33][34]. Have the accountant confirm.
3. **Who may buy:** recommend **B2B only** for the organization plan.
   - Checkout already collects VAT ids (`tax_id_collection`) [R].
   - If consumers can buy, the EU 14-day withdrawal right applies and the terms must say how it works **(legal to confirm)**.
4. **Prices shown ex VAT** on /pricing, with "+ VAT where applicable". Stripe Checkout shows the VAT before payment [R] (`accountBilling.subscribe.chargedToday` copy).

### 8.2 Legal terms that must exist before the first live charge

Have legal review the existing `/legal/terms` and `/legal/privacy` and confirm each item below is present.

- **Subscription terms:**
  - The plan and price (€99/month ex VAT).
  - Monthly renewal until cancelled.
  - The 14-day trial for a first subscription (when `BILLING_TRIAL_ENABLED=true`), and that the card is charged after it.
  - Cancellation through the Customer Portal takes effect at period end.
  - What happens on a failed payment: a grace period, then the plan falls back to Free, exactly as proved in §7.
- **Refund policy:** state who decides and how. Today a refund is recorded and changes no access automatically [R].
- **Invoice details:** seller name, address, company code and VAT id on every invoice. Stripe adds the reverse-charge note when a valid EU VAT id is collected and Stripe Tax is active.
- **Processor listing:** Stripe as payment processor. Already in `legal.privacy` and `legal.dataProtection` [R]; confirm it is current.

### 8.3 Stripe dashboard (LIVE mode)

1. **Products:** "LabourMarket.ai — Organization", recurring **€99.00/month** EUR, tax behaviour **exclusive**. Copy the `price_…` id.
2. **Settings → Tax** (only under choice (i) in 8.1 item 0):
   - Enable Stripe Tax.
   - Add the registrations from 8.1.
   - Set the head office to Lithuania.
   - Set the default product tax code to SaaS / electronically supplied services.
3. **Developers → Webhooks → Add endpoint:**
   - URL: `https://labourmarket.ai/api/billing/webhook`.
   - Events: `checkout.session.completed`, `checkout.session.expired`, `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.paid`, `invoice.payment_succeeded`, `invoice.payment_failed`, `charge.refunded`, `charge.dispute.created`, `charge.dispute.closed`.
   - Copy the `whsec_…` signing secret.
4. **Settings → Billing → Customer portal:** cancel at period end **on**, update payment method **on**, invoice history **on**. Save.
5. **Settings → Billing → Subscriptions and emails (dunning):**
   - Smart Retries **on**.
   - *If all retries fail* → **mark the subscription as unpaid** (this matches the proved path: unpaid → Free, step 9 of the chain test).
   - Send emails for failed payments and for payments that need 3-D Secure / SCA **on**.
6. **Settings → Billing → Invoices:**
   - Invoice number prefix.
   - Company name, address, company code and VAT id in the invoice template.
   - Send finalized invoices and receipts by email **on**.
7. **Settings → Public details:** statement descriptor (e.g. `LABOURMARKET.AI`), support email, and links to the terms and privacy pages.
8. **Radar:** keep the default rules on.

### 8.4 Production environment (VPS), set by the owner

| Variable | Value |
|---|---|
| `PAYMENTS_ENABLED` | `true` |
| `BILLING_PROVIDER` | `stripe` |
| `STRIPE_MODE` | `live` |
| `STRIPE_SECRET_KEY` | `sk_live_…` (or a restricted `rk_live_…` key, per `config-core.ts`) |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | `pk_live_…` |
| `STRIPE_WEBHOOK_SECRET` | `whsec_…` from 8.3 step 3 |
| `STRIPE_PRICE_COMPANY_PILOT` | the `price_…` from 8.3 step 1 |
| `STRIPE_LIVE_ACTIVATION` | `approved-by-owner` (**owner act 1**) |
| `BILLING_PILOT_ORGANIZATION_IDS` | the owner-confirmed organization id(s) for the first payment. Exactly `ALL_ORGANIZATIONS` is the public launch, which is a **separate later act**. |
| `BILLING_TRIAL_ENABLED` | `true` (the default) or `false`; this is the owner's choice and affects new checkouts only |

Leave `STRIPE_PRICE_WORKER_PLUS` and `STRIPE_PRICE_AGENCY_PILOT` **unset**; those plans are deferred.

### 8.5 Exact order of steps

1. **Merge the lane PRs in this order:**
   - **#3252**, the test-lifecycle PR.
   - **#3250**, the public-copy PR (it contains #3206).
   - This research PR (docs only).
   The first two are payment PRs labelled `needs-human-gate`, so the owner merges them.
2. **Test pass on production, no money.**
   - Run `sh /root/lm-prod/bin/lm-stripe-arm.sh test` with TEST keys, a TEST price and the pilot organization id.
   - Sign in as that organization's owner, open `/dashboard/account` → "Order the Organization plan", and pay with card 4242 4242 4242 4242.
   - An agent then verifies read-only through Supabase MCP: a `payment_webhook_events` row with `test_mode=true, processed=true`, and a `billing_subscriptions` row with `test_mode=true`, status `trialing` or `active`, bound to the pilot organization.
   - Then run `lm-stripe-arm.sh off`.
3. **Second owner act (MKT-7):**
   - Review and merge **PR #2441** (RED draft): live checkouts need `live_payments_enabled`.
   - Set `lmc_settings.live_payments_enabled = true` through the owner channel.
   - **Without #2441, step 4 rests on one owner act only. Do not skip it.**
4. **One real payment.**
   - Run `lm-stripe-arm.sh live`. The pilot organization owner buys €99 with a real card.
   - An agent verifies read-only: the webhook row is processed, the subscription is `active` and bound to the organization, and the account page shows the plan. The Customer Portal opens. The invoice shows the seller's VAT id, and the reverse charge for an EU VAT id.
   - Then **refund** the payment in Stripe → `charge.refunded` is recorded and access is unchanged, as in §7 step 11.
5. **Public launch, a separate decision:** set `BILLING_PILOT_ORGANIZATION_IDS=ALL_ORGANIZATIONS`.
   - The public /pricing then switches *by itself* to its live wording: card payment, invoices, the 1-position free limit.
   - Before that, the owner confirms the free-position allowance (§6 item 2).

**Rollback at any time:**
- Remove `STRIPE_LIVE_ACTIVATION` or set `PAYMENTS_ENABLED=false` → `stripe_live_blocked`.
- Set `live_payments_enabled = false` → no new live checkouts.
- Neither involves a data migration [R].

---

## 9. Sources

Accessed 2026-11-12, via search-result text unless marked "read directly". Re-verify before acting.

1. Arbetsförmedlingen – Annonsera i Platsbanken: https://arbetsformedlingen.se/for-arbetsgivare/rekrytera/annonsera-i-platsbanken
2. Indeed SE – Free job post limit: https://se.indeed.com/help/employers/articles/free-job-post-limit
3. Indeed SE – PPSA: https://se.indeed.com/help/employers/articles/pay-per-started-application-ppsa-overview ; https://se.indeed.com/arbetsgivare/betala-for-resultat
4. Indeed Smart Sourcing (UK): https://uk.indeed.com/employers/smart-sourcing?hl=en ; HireTruffle: https://hiretruffle.com/blog/indeed-pricing
5. LinkedIn Help – Pay-per-click promoted jobs: https://www.linkedin.com/help/linkedin/answer/a520820
6. LinkedIn – Free vs paid job posts: https://business.linkedin.com/talent-solutions/post-jobs/pricing
7. LinkedIn Help – Free vs promoted jobs: https://www.linkedin.com/help/linkedin/answer/a519737
8. 100hires – LinkedIn Recruiter pricing 2026: https://100hires.com/linkedin-recruiter-cost.html
9. HeroHunt – LinkedIn Hiring Assistant 2026: https://www.herohunt.ai/blog/linkedin-hiring-assistant-2026-cost-and-alternatives/
10. JobJump – StepStone Kosten: https://jobjump.net/arbeitgeber/vergleich/stepstone-kosten
11. Jobindex – Prisliste: https://www.jobindex.dk/virksomheder/prisliste
12. Malt Help – Fees: https://help.malt.com/hc/en-150/articles/29539691425938-Fees-at-Malt
13. Freelance-solution.fr – Malt vs Upwork vs Fiverr 2026: https://www.freelance-solution.fr/tarif-freelance/malt-vs-upwork-vs-fiverr/
14. Upwork – Client pricing: https://www.upwork.com/pricing/client
15. goLance – Upwork fees 2026: https://golance.com/blogs/upwork-fees-explained-2026
16. Vaultleap – Fiverr fees 2026: https://vaultleap.com/blog/fiverr-fees-explained-2026 ; Wise: https://wise.com/gb/blog/fiverr-payments
17. Coople – Cost calculation: https://help.coople.com/en/articles/13612366-how-are-your-costs-calculated ; https://www.coople.com/uk/pricing/
18. Instaffo – Placement fee: https://employer-help.instaffo.com/en/articles/how-do-i-calculate-the-placement-fee-RqtpcBS3csCl ; OMR: https://omr.com/de/reviews/product/instaffo
19. G2 – Gigstr: https://www.g2.com/products/gigstr/pricing ; Nordic9: https://nordic9.com/companies/gigstr-company6478279381/
20. CB Insights – Workpilots: https://www.cbinsights.com/company/workpilots
21. Yepstr – Pricing: https://yepstr.com/en/pricing
22. Bilarna – Bemlo: https://bilarna.com/provider/bemlo/llms.txt
23. Zmarta – Careers: https://www.zmarta.se/careers ; Jobylon terms: https://cdn.jobylon.com/companies/g/194/terms
24. G2 – Blocket: https://www.g2.com/products/blocket/pricing ; SourceForge: https://sourceforge.net/software/product/Blocket-Jobb
25. CostBench – Teamtailor: https://www.costbench.com/software/ats/teamtailor/
26. Capterra – Jobylon: https://www.capterra.com/p/160946/Jobylon/
27. Kompetensföretagen (via TT): https://via.tt.se/pressmeddelande/3820881/bemanningsbranschen-tappade-17-procent-fjarde-kvartalet?publisherId=2596428 ; Realtid: https://www.realtid.se/bors-finans/starkt-halvar-bemanningsforetag/
28. Adda – Bemanningstjänster 2024: https://www.adda.se/globalassets/2.-upphandling-ramavtal/1.-ekonomi-hr/hr/bemanningstjanster-2024/bemanningstjanster-2024.pdf
29. Avropa – Rekryteringstjänster, allmänna villkor: https://avropa.se/globalassets/bilagor/1.-aktuella-rao/rekryteringstjanster-23.3-11976-2023/1.-avropsstod/allmanna-villkor.pdf
30. WEC Economic Report 2024: https://wecglobal.org/uploads/2024/04/WEC-Economic-Report-2024.pdf
31. Eurostat – Temporary agency workers: https://ec.europa.eu/eurostat/statistics-explained/SEPDF/cache/116057.pdf
32. Skatteverket – Momssatser: https://www.skatteverket.se/foretag/moms/saljavarorochtjanster/momssatspavarorochtjanster.4.58d555751259e4d66168000409.html ; Belopp och procent 2026: https://www.skatteverket.se/privat/skatter/beloppochprocent/2026.html
33. Skatteverket – Tjänster till EU-företag: https://www.skatteverket.se/foretag/moms/sarskildamomsregler/handelmedandralander/momsreglerforutlandskaforetagare.4.166ce5f105dd45b4cb8000145.html
34. VAT Directive 2006/112/EC Art. 196: https://legislation.gov.uk/eudr/2006/112/article/196 (verify on EUR-Lex)
35. Skatteverket – Omvänd betalningsskyldighet (bygg): https://skatteverket.se/foretag/moms/sarskildamomsregler/omvandskattskyldighet.4.47eb30f51122b1aaad28000258292.html
36. SCB – Företagsdatabasen: https://www.scb.se/hitta-statistik/statistik-efter-amne/naringsverksamhet-och-utrikeshandel/ovrigt/foretagsdatabasen-fdb/
37. SCB – Jobb i byggbranschen: https://www.scb.se/pressmeddelande/jobb-i-byggbranschen-drabbas-av-nedgang-i-ekonomin/
38. Boverket 2026 – Långsiktig företagsutveckling i byggbranschen: https://www.boverket.se/globalassets/publikationer/dokument/2026/underlag-2-langsiktig-foretagsutveckling-i-byggbranschen.pdf
39. SCB – Genomsnittlig timlön, arbetare privat sektor 2025: https://www.scb.se/hitta-statistik/statistik-efter-amne/arbetsmarknad/loner-och-arbetskostnader/lonestrukturstatistik-privat-sektor-slp/pong/tabell-och-diagram/arbetare-2016/genomsnittlig-timlon-efter-yrke-2025
40. SCB Lönesök – Snickare: https://www.scb.se/hitta-statistik/sverige-i-siffror/lonesok/Search/?lon=snickare
41. Byggahus – Timpris snickare 2026: https://www.byggahus.se/timpris-snickare-vad-kostar-en-snickare-2026
42. Byggföretagen – Årsredovisning 2024: https://byggforetagen.se/app/uploads/2025/05/Arsredovisning-2024-webb.pdf
43. Freemium benchmarks (secondary): https://www.crazyegg.com/blog/free-to-paid-conversion-rate/ ; https://userpilot.com/blog/freemium-saas/ ; https://www.singlegrain.com/blog/ms/free-to-paid-conversion-rates/
44. Aleph – SaaS gross margin 2026: https://www.getaleph.com/answers/saas-gross-margin-2026
45. SaaS Hero – SMB CAC: https://www.saashero.net/?p=11303 ; ScaleXP – CAC payback: https://www.scalexp.com/?p=129928
46. Anthropic – API pricing (**read directly**): https://platform.claude.com/docs/en/about-claude/pricing
47. Toolradar – Supabase pricing 2026: https://toolradar.com/blog/supabase-pricing-2026 (official https://supabase.com/pricing not reachable)
48. AgentDeals – Hetzner pricing 2026: https://agentdeals.dev/hetzner-pricing-2026 (official https://www.hetzner.com/cloud/ not reachable)
49. Stripe – EEA pricing update: https://support.stripe.com/questions/pricing-updates-for-businesses-based-in-the-european-economic-area-(eea) ; https://stripe.com/sv-se/pricing ; https://stripe.com/tax/pricing (stripe.com not reachable directly)
