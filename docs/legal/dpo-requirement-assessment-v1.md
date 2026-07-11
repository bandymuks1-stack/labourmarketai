# DPO Requirement Assessment — LabourMarket.ai (v1)

> **STATUS: DRAFT — FOR PROFESSIONAL REVIEW.**
> This assessment has NOT been reviewed by a lawyer or data-protection
> specialist. It documents the operator's honest self-assessment under GDPR
> Article 37 as at 2026-07-11 and must be revisited on the triggers listed in
> §5. It is not legal advice.

Controller assessed: **UAB „Nonstop Group“** (primary data controller for the
LabourMarket.ai platform). Labour Market AI Sp. z o.o. is the IP
owner/licensor only, has no routine personal-data access, and is not a
controller of platform user data (see the licence structure documents in this
folder).

---

## 1. Factual platform state (as at 2026-07-11)

- Scale in production: approximately **20 worker profiles** and **4 companies**.
- Core activity: an **operator-coordinated labour marketplace** — a human
  operator coordinates matching between workers and companies.
- **No special-category data is requested by design** (no health, biometric,
  union, etc. fields in the product).
- **Consent-gated visibility system is live and fail-closed** — worker data
  is visible to companies only per recorded consent; absent consent, nothing
  is disclosed.
- **No automated matching in production** — matching decisions are made by a
  human operator; there is no automated decision-making or profiling engine
  running against users in production.

## 2. GDPR Article 37(1) criteria check

A DPO is mandatory if any of the following applies:

| Criterion | Assessment | Result |
|---|---|---|
| (a) Processing by a public authority or body | UAB „Nonstop Group“ is a private company | **No** |
| (b) Core activities consist of processing operations which require **regular and systematic monitoring of data subjects on a large scale** | Core activity is an operator-coordinated marketplace. There is no tracking/monitoring feature set aimed at observing data subjects, and at ~20 worker profiles / 4 companies the processing is honestly **not large-scale** by any reasonable reading. Systematic monitoring: **no** at current functionality and scale. | **No** |
| (c) Core activities consist of **large-scale processing of special categories** (Art. 9) or criminal-conviction data (Art. 10) | No special-category data is requested by design; none is processed as a core activity | **No** |

## 3. Conclusion

**A DPO is not currently mandatory** for UAB „Nonstop Group“ in respect of
the LabourMarket.ai platform, based on the honest factual state in §1.

Adopted public/privacy-notice wording:

> **"DPO: Not appointed; privacy contact info@labourmarket.ai (mailbox, not a
> DPO)."**

The privacy contact mailbox handles data-subject requests and privacy
questions. It must not be labelled "DPO", "Data Protection Officer", or any
equivalent, because no DPO has been designated under Art. 37.

## 4. Explicit non-appointment note (conflict of interest)

**Donatas Šukys and Ramūnas Šukys are NOT appointed as DPO and must not be
labelled as such** in any notice, contract, website text, or correspondence.
As managing officers of the respective companies they determine the purposes
and means of processing; designating a manager as DPO would create a conflict
of interest incompatible with the independence requirements of GDPR Art. 38(6)
guidance. If a DPO ever becomes required (or is voluntarily designated), it
must be a person or external service without such a conflict, formally
designated and notified to the supervisory authority per Art. 37(7).

## 5. Re-assessment triggers (mandatory review, not optional)

This assessment must be redone, in writing, when ANY of the following occurs:

1. **Automated matching launch** — any move from human-operator matching to
   automated matching, scoring, ranking, or profiling of workers/companies in
   production (also triggers a DPIA screening review).
2. **Large-scale growth** — treated as a **review trigger, not a fixed legal
   threshold**: material growth in registered profiles, companies, geographic
   reach, or data volume such that the "large scale" question could
   reasonably be answered differently than in §2. Set an internal checkpoint
   (e.g. at each significant growth milestone and at least annually) rather
   than assuming any specific number is the legal line.
3. **Special-category processing** — any product change that requests or
   infers Art. 9 data (e.g. health/ability information, union membership).
4. **Systematic monitoring features** — any feature that regularly and
   systematically observes user behaviour (activity tracking, location
   tracking, continuous performance monitoring, etc.).
5. **Regulatory or guidance change** relevant to Art. 37 as flagged by the
   privacy adviser.

Each re-assessment: record date, facts, conclusion, and reviewer in a new
versioned file (`dpo-requirement-assessment-v2.md`, ...).

## 6. Cross-references

- Consent/visibility design: `consent-and-disclosure-design-v1.md`
- DPIA screening: `privacy-risk-and-dpia-screening-v1.md`
- Legal basis mapping: `legal-basis-matrix-v1.md`
- Intercompany structure (licensor has no personal-data access):
  `intercompany-transfer-pricing-memo-v1.md`,
  resolutions §5 in `resolution-labour-market-ai-ip-licence-v1.pl.md` and
  `resolution-nonstop-group-ip-licence-v1.lt.md`

---

*DRAFT v1 — internal assessment as at 2026-07-11; subject to professional
review and to the re-assessment triggers above.*
