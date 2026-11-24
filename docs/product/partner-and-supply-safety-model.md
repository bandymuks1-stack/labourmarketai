# Partner & Supply Safety Model

> Internal model for how partners/agencies/companies join and what access they
> get, so unverified or risky companies cannot get uncontrolled direct access to
> client or worker contacts until reviewed. **This is internal product logic —
> public copy never frames it as "everyone goes through us".** It is expressed
> publicly only as trust, transparency, reputation and a fair market. No DB
> migration is required for the model to be documented; any future schema is
> additive + owner-gated. Companion: [`partner-risk-and-reputation-policy.md`](./partner-risk-and-reputation-policy.md).

## 1. Partner types

`our_operating_company` · `approved_agency` · `approved_staffing_company` ·
`approved_sector_partner` · `subcontractor_company` · `new_unverified_partner` ·
`restricted_partner` · `blocked_partner`.

## 2. Partner statuses

`not_reviewed` · `documents_requested` · `limited_access` ·
`works_through_approved_route` · `approved_direct_partner` · `trusted_partner` ·
`risk_flagged` · `blocked`.

## 3. Sectors (open to all)

`construction` · `manufacturing` · `logistics` · `hospitality` · `agriculture` ·
`cleaning` · `care` · `technical` · `other`.

## 4. Access rules (internal)

- The platform is **open to all sectors**.
- Trusted agencies and partners may have **greater visibility**.
- **Unverified or risky partners do not get uncontrolled direct access** to client
  or worker contacts.
- Problematic or unclear companies may be **limited**, or allowed **only through an
  approved responsible route** (an approved partner or the operating company), until
  reviewed.
- None of this releases uncontrolled direct contact details.

## 5. Public expression (binding)

Publicly, this is a principle of **trust, transparency, reputation and a fair
market** — **not** "we control everyone" and **not** "everyone must go through us".
The landing and public copy never name a gate; they speak about reliability and
risk reduction. See [`public-trust-positioning.md`](./public-trust-positioning.md).
