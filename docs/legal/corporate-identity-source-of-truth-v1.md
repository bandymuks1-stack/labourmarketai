# Corporate Identity — Source of Truth v1 (2026-07-11)

Single authoritative record of the two legal entities behind LabourMarket.ai.
Every fact is labelled with its verification class:

- **VERIFIED OFFICIAL** — read directly from an official register on the
  stated date (source + timestamp recorded);
- **VERIFIED FROM COMPANY DOCUMENT** — from a company-held document, not
  independently re-checked in a register;
- **OWNER-DIRECTED ROLE** — a role allocation decided by the owner (this
  goal command), not a registry fact;
- **VERIFY-BEFORE-SIGNING** — must be confirmed before any signature or
  public publication; NOT allowed in production public text.

No bank account numbers, personal codes, private addresses or full registry
extracts are stored in this repo (deliberate — the VAT White List response
contains a bank account; it was NOT copied here and must not be published).

## 1. Labour Market AI Sp. z o.o. (Poland) — IP OWNER / LICENSOR

| Field | Value | Class | Source (date) |
|---|---|---|---|
| Official registered name | LABOUR MARKET AI SPÓŁKA Z OGRANICZONĄ ODPOWIEDZIALNOŚCIĄ | VERIFIED OFFICIAL | KRS API `api-krs.ms.gov.pl` OdpisAktualny + MF VAT White List `wl-api.mf.gov.pl` (2026-07-11 09:33 CEST) |
| Short form used in documents | Labour Market AI Sp. z o.o. | VERIFIED OFFICIAL (legal form abbreviation of the above) | same |
| Legal form | Spółka z ograniczoną odpowiedzialnością | VERIFIED OFFICIAL | KRS (2026-07-11) |
| KRS | 0001218752 | VERIFIED OFFICIAL | MF VAT White List + KRS API (2026-07-11) |
| NIP | 7011295735 | VERIFIED OFFICIAL | KRS + White List + VIES (2026-07-11) |
| REGON | 543779454 | VERIFIED OFFICIAL | MF VAT White List (KRS shows 14-digit padded 54377945400000) (2026-07-11) |
| EU VAT | PL7011295735 — **ACTIVE** ("Czynny"; VIES VALID) | VERIFIED OFFICIAL | MF VAT White List (registration 2026-03-01) + VIES REST (2026-07-11) |
| Registered office | ul. Żurawia 47/49, lok. 415, 00-680 Warszawa, Polska | VERIFIED OFFICIAL | KRS + White List + VIES (2026-07-11) |
| Share capital | 5 000,00 PLN | VERIFIED OFFICIAL | KRS (2026-07-11) |
| Representation organ | ZARZĄD (management board) | VERIFIED OFFICIAL | KRS dział 2 (2026-07-11) |
| Representation method | "DO SKŁADANIA OŚWIADCZEŃ W IMIENIU SPÓŁKI JEST UPOWAŻNIONY KAŻDY Z CZŁONKÓW ZARZĄDU SAMODZIELNIE." (each board member represents independently) | VERIFIED OFFICIAL | KRS dział 2 (2026-07-11) |
| Board / representative | PREZES ZARZĄDU, name masked in the public API as "D****** Š****" — consistent with owner-stated **Donatas Šukys**; exact official spelling | VERIFY-BEFORE-SIGNING (full KRS odpis or company copy) | KRS API masks natural-person names (2026-07-11) |
| Business contact | info@labourmarket.ai | VERIFIED FROM COMPANY DOCUMENT | owner baseline |
| Liquidation / restructuring / removal | none indicated: active VAT payer, current KRS entry, no removal/denial dates in the White List record | VERIFIED OFFICIAL | White List fields (2026-07-11) |
| Role in the structure | IP owner, licensor, recipient of the licence fee; NOT the platform seller/operator; NOT the users' data controller; NO routine access to platform personal data | OWNER-DIRECTED ROLE | goal command 2026-07-11 |

## 2. UAB „Nonstop Group“ (Lithuania) — PLATFORM OPERATOR / LICENSEE

| Field | Value | Class | Source (date) |
|---|---|---|---|
| Official name | UAB „Nonstop Group“ | VERIFIED OFFICIAL | RC JAR open data (snapshot 2026-07-10, read 2026-07-11) + VIES (2026-07-11) |
| Legal form | Uždaroji akcinė bendrovė (form code 310) | VERIFIED OFFICIAL | RC JAR open data |
| Company code | 302676973 | VERIFIED OFFICIAL | RC JAR open data + VIES |
| VAT code | LT100010790613 — **VALID** in VIES | VERIFIED OFFICIAL | VIES REST (2026-07-11 07:33 UTC) |
| Registered office | Mūšos g. 2C, Aukštikalnių k., Pasvalio apylinkių sen., LT-39103 Pasvalio r. sav., Lietuva | VERIFIED OFFICIAL | RC JAR open data + VIES |
| Registration date | 2011-10-17 | VERIFIED OFFICIAL | RC JAR open data |
| Legal status | "Teisinis statusas neįregistruotas" (status code 0) = NO special legal status — not in liquidation, restructuring or deregistration | VERIFIED OFFICIAL | RC JAR open data (snapshot 2026-07-10) |
| Director | Ramūnas Šukys | VERIFIED FROM COMPANY DOCUMENT (owner baseline; not shown in RC open data) — exact registry confirmation | VERIFY-BEFORE-SIGNING (RC extract) |
| Business contact | info@nonstopgroup.lt | VERIFIED FROM COMPANY DOCUMENT | owner baseline |
| Platform / privacy contact | info@labourmarket.ai | OWNER-DIRECTED ROLE | goal command |
| Role in the structure | platform operator, commercial seller, customer contracting party, invoice issuer, payment recipient, customer support, PRIMARY DATA CONTROLLER, IP licensee | OWNER-DIRECTED ROLE | goal command 2026-07-11 |

## 3. Canonical role structure (mandatory everywhere)

| Role | Entity |
|---|---|
| IP OWNER / LICENSOR | Labour Market AI Sp. z o.o. |
| PLATFORM OPERATOR | UAB „Nonstop Group“ |
| COMMERCIAL SELLER | UAB „Nonstop Group“ |
| CUSTOMER CONTRACTING PARTY | UAB „Nonstop Group“ |
| INVOICE ISSUER TO PLATFORM CUSTOMERS | UAB „Nonstop Group“ |
| PAYMENT RECIPIENT FROM PLATFORM CUSTOMERS | UAB „Nonstop Group“ |
| PRIMARY DATA CONTROLLER | UAB „Nonstop Group“ |
| IP LICENSEE | UAB „Nonstop Group“ |
| DPO | Not appointed (see dpo-requirement-assessment-v1.md) |
| PRIVACY CONTACT | info@labourmarket.ai (a contact mailbox, NOT a DPO) |

Hard rules (guard-enforced in `apps/web/lib/guards/legal-entity-truth.test.ts`):
"LabourMarket.ai" is a platform/brand name, never a legal entity; the Polish
company is never named as seller/operator/contracting party; UAB „Nonstop
Group“ is never named as IP owner; the licence fee is never called a
dividend; no unverified KRS/REGON and no bank account may appear in public
text.

## 4. VERIFY-BEFORE-SIGNING register

| # | Field | Why | How to verify |
|---|---|---|---|
| 1 | Exact spelling of the Polish board member's name (owner-stated: Donatas Šukys, Prezes Zarządu) | public KRS API masks natural-person names | full KRS odpis (ekrs.ms.gov.pl) or company copy of the odpis |
| 2 | UAB „Nonstop Group“ director (owner-stated: Ramūnas Šukys) | RC open data has no officers | RC registry extract (Registrų centras) |
| 3 | Licence agreement effective date `[AGREEMENT EFFECTIVE DATE]` | not signed yet | set at signing |
| 4 | Licence agreement number `[NUMBER]` | not assigned yet | assign at signing |
| 5 | VAT / withholding-tax treatment of the licence fee | needs accountant/tax adviser written confirmation | see cross-border-tax-review-checklist-v1.md |

Verification timestamps: MF White List requestDateTime 11-07-2026 09:33:46
(request id DnbMy-980956a); VIES PL + LT 2026-07-11T07:33:46Z; KRS API
2026-07-11; RC JAR open-data snapshot formed 2026-07-10.
