# Legal Entity & IP Licence — Final Report v1 (2026-07-11)

```text
STATUS: GREEN (officially verified structure live in production and docs;
  everything requiring a professional or a signature is honestly marked
  DRAFT / VERIFY-BEFORE-SIGNING — nothing presented as approved or signed)
BASE: main @ 923bf3b (after PR #701)
FINAL MAIN COMMIT: f9148e9 (PR #702) + this docs/proof PR on top
PRS:
  #702 feat(legal): legal entity, IP licence and controller truth v1
  (+ follow-up docs/proof PR: APPLIED_LEDGER entry, this report)
OFFICIAL SOURCES CHECKED (2026-07-11):
  PL: KRS API odpis aktualny (api-krs.ms.gov.pl); MF VAT White List
  (wl-api.mf.gov.pl, requestId DnbMy-980956a 09:33:46); VIES REST.
  LT: Registrų centras JAR open data (snapshot 2026-07-10); VIES REST.
POLISH COMPANY VERIFIED DATA: LABOUR MARKET AI SPÓŁKA Z OGRANICZONĄ
  ODPOWIEDZIALNOŚCIĄ · KRS 0001218752 · NIP 7011295735 · REGON 543779454 ·
  EU VAT PL7011295735 ACTIVE ("Czynny", VAT-registered 2026-03-01; VIES
  VALID) · ul. Żurawia 47/49 lok. 415, 00-680 Warszawa · capital 5 000 PLN ·
  board members represent independently · no liquidation/removal markers.
LITHUANIAN COMPANY VERIFIED DATA: UAB „Nonstop Group“ · code 302676973 ·
  VAT LT100010790613 (VIES VALID) · Mūšos g. 2C, Aukštikalnių k., LT-39103
  Pasvalio r. sav. · registered 2011-10-17 · legal form UAB · status: no
  special legal status (not in liquidation/restructuring).
UNVERIFIED FIELDS (VERIFY-BEFORE-SIGNING; excluded from public production
  text): exact spelling of the PL board member (API masks names; owner
  states Donatas Šukys, Prezes Zarządu); LT director from RC extract (owner
  states Ramūnas Šukys — shown on the imprint per owner direction, marked
  company-document-verified in the source of truth); shareholding structure;
  agreement date/number; controlling language; governing law of the
  intercompany agreement; VAT/WHT regimes.
IP OWNER: Labour Market AI Sp. z o.o. (licensor; no operations, no data).
PLATFORM OPERATOR: UAB „Nonstop Group“.
COMMERCIAL SELLER: UAB „Nonstop Group“.
CONTRACTING PARTY: UAB „Nonstop Group“ (Terms name it in 5 locales).
DATA CONTROLLER: UAB „Nonstop Group“ (Privacy Policy section 1, consent
  text v2, ROPA, legal notice — all name it).
DPO: Not appointed (dpo-requirement-assessment-v1.md; Art. 37 criteria not
  met at current scale; re-assessment triggers defined; the managers are
  explicitly NOT DPO).
PRIVACY CONTACT: info@labourmarket.ai (mailbox, never labelled DPO).
IP CHAIN OF TITLE: AUDITED (ip-chain-of-title-audit-v1.md). KEY GAP: no
  written IP assignment to the Polish company exists — the code (728
  commits by 2 owner identities + AI-assisted) sits in the owner's personal
  GitHub org; assignment DRAFT prepared
  (ip-assignment-to-labour-market-ai-v1.md, OWNER-SIGNATURE-REQUIRED).
  Trademark NOT registered (non-exhaustive check) — professional search
  needed. Domain registrant unverified; open-source deps (MIT/BSD/ISC) and
  ESCO data excluded from proprietary IP.
LICENCE AGREEMENT: DRAFTS in LT/PL/EN + Schedule A (IP inventory with
  chain-of-title status) + Schedule B (accounting). [AGREEMENT EFFECTIVE
  DATE] and No. [NUMBER] left blank — NOT signed, never presented as signed.
FIRST-YEAR PERIOD: first 12 consecutive calendar months from the effective
  date.
MONTHLY FEE FORMULA: 30% × Positive Adjusted Net Profit from
  LabourMarket.ai activity for the previous calendar month; zero → 0 EUR;
  negative → 0 EUR; NEVER computed on the whole of UAB's unrelated business.
PROFIT DEFINITION: platform-attributed revenues (net of VAT, credit notes,
  refunds, chargebacks, discounts, per revenue recognition) minus direct
  platform costs, payment collection, hosting, attributed marketing,
  directly-related staff/contractors, support, consistent overhead share —
  computed BEFORE the licence fee itself (no circularity), income tax,
  dividends, non-platform financing, shareholder personal costs,
  unjustified one-offs. Full procedure: accounting schedule + policy +
  monthly template (illustrative example clearly labelled NOT REAL).
MONTHLY ACCOUNTING PROCESS: UAB accounting prepares the statement by the
  10th business day of the following month; both companies receive it;
  licensor invoices per statement; 14 calendar days; EUR; errors corrected
  in the next statement; statements carry no personal data.
TWELVE-MONTH REVIEW: starts ≥30 days before period end; written amendment
  only; no retroactivity; existing formula survives until amended/terminated.
TRANSFER PRICING: memo drafted; 30% explicitly NOT claimed arm's-length;
  no comparables invented; DEMPE honestly notes title-vs-conduct gap;
  adviser question list included.
VAT REVIEW: NOT decided — checklist item, written confirmation required
  before the first invoice (no regime pre-printed anywhere).
WITHHOLDING TAX REVIEW: NOT decided — same blocking checklist (treaty,
  I&R Directive conditions, certificate of residence).
CORPORATE APPROVALS: PL uchwała + LT sprendimas DRAFTS with empty
  signature/date blocks — not adopted, not presented as adopted.
PRIVACY POLICY: controller section FIRST in 5 locales (identity, contacts,
  VDAI complaint right, PL company excluded from data access); pending list
  now honestly holds retention periods + binding lawyer-reviewed version.
TERMS: core sections live in 5 locales — UAB contracting party/seller/
  invoicer, Lithuanian law with mandatory B2C carve-outs, PL company =
  licensor only, platform ≠ employment promise; full text still marked as
  being finalised (honest).
CONSENT VERSION: 2026-07-11.v2 (controller block in every locale of both
  purposes); DB pins updated in production via MCP (verified by SQL);
  0 consent events existed → no backfill, nobody auto-consented; a future
  v1 grant would be granted_stale_version (fail closed, guard-tested).
LT/EN/RU/NL/DE: all legal surfaces complete; parity guards green; i18n-debt
  unchanged; production smoke found zero MISSING_MESSAGE.
PUBLIC LEGAL NOTICE: /legal/legal-notice live in 5 locales (operator + IP
  owner blocks, verified registry numbers from the code module, DPO line,
  open-source note; in sitemap + footer; no bank data anywhere).
FOOTER: entity disclosure line + © Labour Market AI Sp. z o.o. + operator
  licence note + legal-notice link (brand-only copyright removed).
TESTS: 8314 / 529 files ✅ typecheck ✅ lint ✅ build ✅ placeholders ✅
  i18n-debt ✅ SEO indexing ✅ route smoke ✅ constitution ✅
  migration-safety self-test + classifier GREEN (human-gated) ✅ new
  legal-entity-truth guard (31 tests) ✅ consent guards intact ✅.
PRODUCTION SMOKE (2026-07-11, deploy dpl_J3yQRgmZU1FKjfEDTim8rMoY9zdV READY):
  18/18 checks green — legal-notice/terms/privacy × 5 locales contain the
  right entities and verified numbers, footer discloses both entities, old
  brand-only © gone, partner copy no longer names the PL company, no
  MISSING_MESSAGE, no bank-number patterns; consent fail-closed system
  untouched (RLS/ledger unchanged by this train; disclosure execution UI
  still deliberately absent).
LANDING: frozen — landing-freeze guard green; only the shared footer and
  legal routes changed (allowed exception).
SIGNING PACK: C:\Users\Mano\Downloads\labourmarketai-legal-entity-pack-v1\
  (15 files: LT/PL/EN agreements, schedules, resolutions, calc template,
  invoice wording, TP memo, tax checklist, signing checklist, verification
  report, professional-approval list, IP assignment draft). No fake
  signatures or dates anywhere.
ACCOUNTANT ACTIONS: items 13–17 of 14-fields-requiring-professional-approval.md
  (VAT, WHT, deductibility, TP thresholds, allocation keys) — all blocking
  before the FIRST invoice.
TAX ADVISER ACTIONS: WHT/treaty/I&R Directive analysis; TP method choice;
  arm's-length assessment of 30%.
LAWYER ACTIONS: agreement review (3 languages), IP assignment execution,
  moral rights, trademark search/filing, final Privacy/Terms wording,
  retention periods.
OWNER SIGNATURES REQUIRED (in order): IP assignment → both resolutions →
  licence agreement (3 languages) + schedules.
BLOCKERS: none technical. The licence agreement recitals depend on the IP
  assignment being signed first (chain-of-title gap) — sequenced in the
  signing checklist.
ROLLBACK: revert f9148e9 (+ the docs PR); DB: paired down file restores
  consent v1 pins. Registry facts need no rollback.
NEXT ACTION: owner walks the signing checklist (verify 2 masked names →
  professionals' written confirmations → assignment → resolutions →
  agreement); production needs no further change for this scope.
```
