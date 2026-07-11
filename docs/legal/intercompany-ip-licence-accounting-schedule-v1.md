# Schedule B — Accounting / Licence Fee Calculation Schedule (Draft v1)

> **DRAFT v1 (2026-07-11) — FOR LAWYER REVIEW. NOT SIGNED. Do not use as evidence of an executed agreement.**

| Field | Value |
|---|---|
| Schedule to | Licence Agreement No. [NUMBER] |
| Agreement Effective Date | [AGREEMENT EFFECTIVE DATE] |
| Governs | § 7 of the Intercompany IP Licence Agreement (Licensor: Labour Market AI Sp. z o.o.; Licensee: UAB „Nonstop Group“) |
| Tax cross-reference | `docs/legal/cross-border-tax-review-checklist-v1.md` — VAT / withholding-tax treatment must be confirmed in writing by accountants/tax advisers BEFORE the first invoice |

This Schedule B sets out the full computation of **Adjusted Net Profit from LabourMarket.ai Activity** ("Adjusted Net Profit") and the monthly fee process. In case of doubt as to computation mechanics, this Schedule prevails over the summary in Agreement § 7.3. The methodology must be applied **consistently month over month**; methodology changes require a written amendment signed by both Parties.

## B.1 Scope ring-fence

1. The calculation covers **only** revenues and costs attributable to LabourMarket.ai activity of UAB „Nonstop Group“.
2. The fee is **never** computed on the whole of UAB „Nonstop Group“'s unrelated business (construction, staffing, or any other line). The Licensee's accounting shall segregate LabourMarket.ai activity using dedicated ledger accounts, cost centres, project codes, or an equivalent consistently-applied mechanism.
3. Calculation period: one calendar month ("Calculation Month"). The fee for Calculation Month M is calculated from M's results and invoiced/paid in month M+1.

## B.2 Adjusted Net Profit — numbered computation procedure

### Step 1 — Revenue lines (attributed to LabourMarket.ai activity, Calculation Month)

| Line | Item |
|---|---|
| R1 | Gross invoiced/recognised revenue from LabourMarket.ai activity (subscriptions, platform fees, platform-related services), recognised per the Licensee's revenue-recognition rules |
| R2 | minus VAT (all revenue taken net of VAT) |
| R3 | minus credit notes issued relating to LabourMarket.ai revenue |
| R4 | minus refunds |
| R5 | minus chargebacks |
| R6 | minus discounts granted |
| **R** | **Net Attributed Revenue = R1 − R2 − R3 − R4 − R5 − R6** |

### Step 2 — Deduction lines (costs attributable to LabourMarket.ai activity, Calculation Month)

| Line | Item |
|---|---|
| C1 | Direct platform operating costs (software subscriptions and tooling used by the platform, licences, monitoring, etc.) |
| C2 | Payment collection costs (payment processor fees, collection charges) |
| C3 | Hosting and infrastructure costs (cloud, servers, storage, bandwidth, backups) |
| C4 | Platform-attributed marketing costs |
| C5 | Employee and contractor costs directly related to the platform (development, operations, product) — attributed by time/assignment records where staff are shared |
| C6 | Customer support costs for the platform |
| C7 | Reasonable, consistently-allocated share of overheads (office, accounting, general administration) — allocation key fixed in writing by the accountants and applied consistently |
| **C** | **Total Attributed Costs = C1 + C2 + C3 + C4 + C5 + C6 + C7** |

### Step 3 — "Before" lines (expressly NOT deducted)

Adjusted Net Profit is calculated **before** (i.e. without deducting) the following:

| Line | Item excluded from deductions | Reason |
|---|---|---|
| X1 | The Calculation Month's own licence fee | No circularity — the fee cannot reduce the base it is computed from |
| X2 | Corporate income tax | Pre-tax measure |
| X3 | Dividends and profit distributions | Not operating costs |
| X4 | Financing costs unrelated to the platform | Outside the ring-fence |
| X5 | Shareholders' personal expenses | Never deductible in this calculation |
| X6 | Unjustified one-off or non-operating costs | Only justified, operating, platform-attributable costs count |

### Step 4 — Result and fee

1. **Adjusted Net Profit (ANP) = R − C** (with X1–X6 never included in C).
2. **Fee rule:**
   - ANP **positive** → Monthly Licence Fee = **30% × ANP**;
   - ANP **zero** → fee = **0 EUR**;
   - ANP **negative** → fee = **0 EUR**; no negative fee, no credit, and no loss carry-forward to future months unless the Parties agree otherwise in writing.
3. Rounding: fee rounded to the nearest euro cent (2 decimals), standard commercial rounding.
4. Currency: **EUR**. If any attributed revenue or cost arises in another currency, it is converted using the rate the Licensee's accounting consistently applies for statutory bookkeeping.

## B.3 Monthly timeline

| Step | Deadline | Actor |
|---|---|---|
| 1. Close prior-month accounting/management reports for LabourMarket.ai activity | per the Licensee's normal close calendar | Licensee's accounting |
| 2. Prepare the monthly licence-fee calculation statement (R lines, C lines, ANP, fee) using the consistent methodology | **by the 10th business day** of the month following the Calculation Month | Licensee's accounting |
| 3. Provide the statement to both companies | same day as step 2 | Licensee's accounting |
| 4. Licensor issues its invoice based on the statement (invoice description per Agreement § 7.5; forbidden words per § 7.6) | promptly after receiving the statement | Licensor |
| 5. Payment | within **14 calendar days** of the invoice date, unless the Parties' accountants determine another term is mandatory | Licensee |

## B.4 Statement content and data-minimisation rule

The monthly statement contains: the Calculation Month; each R line and C line at category level; the ANP; the fee; and the preparer's identification. The statement must **not** contain unnecessary personal data of employees or customers (no individual salary data, no customer personal details — aggregated category totals only), per Agreement § 5.5 and § 7.4(d).

## B.5 Error correction

Errors discovered after a statement has been issued are corrected **in the next month's statement** as a separately-shown adjustment line (positive or negative), with a short written explanation. Already-issued invoices are not reissued unless the accountants determine a correcting invoice is mandatory under applicable invoicing rules. Corrections never operate retroactively beyond what Agreement § 8.4 permits.

## B.6 Worked example — ILLUSTRATIVE EXAMPLE — NOT REAL FIGURES

> **ILLUSTRATIVE EXAMPLE — NOT REAL FIGURES.** Round numbers are used solely to show the mechanics. They are not forecasts, targets, or actual results.

Calculation Month: an example month "M".

| Line | Amount (EUR) |
|---|---|
| R — Net Attributed Revenue (after VAT, credit notes, refunds, chargebacks, discounts) | 10 000 |
| C — Total Attributed Costs (C1–C7) | 6 000 |
| **Adjusted Net Profit (ANP = R − C)** | **4 000** |
| **Monthly Licence Fee = 30% × 4 000** | **1 200** |

Zero / negative illustrations (same labels, NOT real figures):

| Scenario | R (EUR) | C (EUR) | ANP (EUR) | Fee (EUR) |
|---|---|---|---|---|
| Zero month | 6 000 | 6 000 | 0 | 0 |
| Loss month | 5 000 | 8 000 | −3 000 | 0 (no negative fee, no carry-forward) |

## B.7 Methodology stability

The accountants of the Licensee document the initial methodology (ledger accounts / cost centres used, overhead allocation key, currency-conversion source) in a written methodology note before the first statement. Any change to the methodology applies prospectively only and requires a written amendment to this Schedule signed by both Parties (Agreement § 11.5).

---

**This Schedule is part of an UNSIGNED DRAFT. It does not evidence execution of the Agreement.**
