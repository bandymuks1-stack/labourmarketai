# DPIA v1: matching, ranking, job alerts, Living CV inference and employer AI-assistant access

| | |
|---|---|
| **Status** | DRAFT v1, 2026-10-15 |
| **Review** | **Requires lawyer review.** It must also be adopted by the controller, which has not happened. This is not an approved DPIA and does not certify compliance. |
| **Assessment** | GDPR Art. 35(7). Screening update for other activities in §9. |
| **Controller** | UAB „Nonstop Group“. No DPO is appointed, so no Art. 35(2) DPO advice was available. See §8. |
| **Sources** | Audit A2 §4, D4, D6 · Audit A3 §1 (Art. 22) and addendum · Audit A1 §1 · `privacy-risk-and-dpia-screening-v1.md` · `legal-basis-matrix-v1.md` · `docs/DECISIONS/0023-living-cv-direct-indirect-potential-capabilities.md` (referenced) · code: `apps/web/lib/scouting/auto-match.ts`, `auto-match-receipt.ts`, `apps/web/lib/market/match-v1.ts`, `apps/web/lib/conversation/employer-workspace-contract.ts:41`, `apps/web/lib/capabilities/*`, `apps/web/app/api/cron/job-alerts/route.ts` |

> **LT santrauka.** Šis poveikio duomenų apsaugai vertinimas (DPIA) apima:
> - automatinį darbuotojų ir poreikių atitikimą;
> - kandidatų reitingavimą su automatine 8 kandidatų riba;
> - darbo pranešimus;
> - Living CV gebėjimų išvedimą, įskaitant „potencialius“ gebėjimus ir automatinį organizacijos patvirtinimą;
> - darbdavio prijungto AI asistento (MCP) prieigą prie kandidatų, darbuotojų sąrašų ir nebuvimų duomenų.
>
> Išvada: tai profiliavimas, bet ne vien automatizuotas sprendimas su teisiniu poveikiu. DPIA privalomas. Likutinė rizika yra AUKŠTA, kol:
> - darbdavio AI asistentas gali gauti nebuvimų priežastis ir darbuotojai apie tai neinformuoti;
> - nėra prieštaravimo (Art. 21) mechanizmo;
> - privatumo politikoje nėra profiliavimo aprašymo.
>
> Įgyvendinus priemones, rizika turėtų sumažėti iki VIDUTINĖS. Ar reikia konsultuotis su VDAI pagal 36 str., sprendžia savininkas ir teisininkas.

## 1. Why a DPIA is required

**Screening v1 said yes.** `privacy-risk-and-dpia-screening-v1.md` (open item 5) required a full DPIA "before any automated cross-user matching/decision feature ships". Automated matching has shipped (A2 D6). DPO-assessment trigger #1 has also fired.

**EDPB/WP248 criteria met (two or more → DPIA likely required):**

| Criterion | Met? | Why |
|---|---|---|
| Evaluation or scoring, including profiling | **Yes** | Ranking, the fit dimensions, the `eligible` hard-criteria gate, and capability inference. |
| Automated decision with legal or similarly significant effect | **Borderline** | No solely automated decision was found. But the automated top-N cut-off and the `eligible=false` hard blocks decide who an employer *sees*, and that affects access to work. |
| Systematic monitoring | Partly | Journal and work records are reviewed by managers. Telemetry exists, though it is outside this scope. |
| Sensitive data | **Yes, possibly** | Absence reasons may reveal health (Art. 9). The assistant can reach them. |
| Large scale | Not yet | 112 workers. 155k vacancies, but those are not subjects of the matching. |
| Matching or combining datasets | **Yes** | Self-declared profile, organisation-supplied evidence, second-party confirmations and inferred signals are combined. |
| Vulnerable data subjects | **Yes** | Job-seekers and employees are in a power imbalance. Learners may be minors. |
| Innovative use of technology | **Yes** | Third-party LLM assistants operate employer tools over worker data. |
| Prevents exercise of a right or access to a service or contract | Partly | Ranking affects access to job opportunities. |

**VDAI Art. 35(4) list.** The lawyer is asked to confirm which items on the Lithuanian list apply [LAWYER].

## 2. Systematic description of the processing (Art. 35(7)(a))

| ID | Operation | What happens (fact) | Inputs | Output and who sees it | Human involvement |
|---|---|---|---|---|---|
| P1 | **Auto-match on need publish** | When a need is submitted, reopened or its requirements confirmed, `runAutoMatchForDemand` runs deterministic match-v1 over employer-discoverable workers. It runs once, is idempotent by input hash, and its pool is bounded (`auto-match.ts:18-36`). | Need fields: role, country, location, language, notes, payload. Discoverable workers' professional summaries. | A receipt on `customer_requests.payload.auto_match_receipt` holding counts and at most 10 anonymised per-demand refs (`auto-match-receipt.ts`). Matches surface to the employer. **No message, invitation or notification is sent.** | The employer decides whether to contact anyone. |
| P2 | **Candidate search and ranking** | Scouting core and match-v1. Hard criteria (for example a required language) set `eligible=false` and cap status. Weighted criteria order candidates (`match-v1.ts:420-430, 712-960`). The employer workspace shows only the top **`EMPLOYER_CANDIDATES_LIMIT = 8`** (`employer-workspace-contract.ts:41`). | As P1, plus filters. | An ordered list, with fit dimensions and readiness shown as a sibling and never as an input (decision 0021). | The employer selects. No auto-reject exists anywhere (A2 §4). |
| P3 | **Job alerts and new-job-matches badge** | A cron (`/api/cron/job-alerts`, triggered by GitHub Actions) matches registered workers' stated profession, countries and salary to new active vacancies. It notifies via the in-app bell, and by e-mail only with an opt-in. App e-mail is not active. | Worker preferences; `public_vacancies`. | Notifications to the worker. | Informational. No decision is taken about the worker. |
| P4 | **Living CV inference** (decision 0023) | Deterministic inference of direct, indirect and potential capabilities from journal, evidence and organisation records. Evidence states are kept separate: recorded / declared / potential / confirmed / certified. | Journal, evidence, organisation-supplied records (including for people without accounts), confirmations. | Labels on the person's own record. Visible to employers when the person is discoverable or in a relationship. | The AI contract says nothing is saved as a fact without confirmation. **Open:** whether "potential" labels feed ranking. A grep of `lib/market` and `lib/scouting` found no `potential` reference, which is not conclusive [VERIFY]. |
| P5 | **Learning auto-confirmation** | `apply_learning_auto_confirmation` (migration `20260720150000` :628-781) writes a real skill confirmation when an organisation's confidence-threshold policy fires. | Learning signals, organisation policy. | A confirmed skill on the worker's record. | **None at decision time.** The organisation set the policy. The worker gets **no notice or explanation** (A3 addendum). |
| P6 | **Employer AI assistant (MCP) access** | An employer or manager connects ChatGPT, Claude or similar through OAuth. Tools run under the caller's RLS: `candidate.search` (`marketplace-capabilities.ts:69`), `roster.list` (`employer-operations-capabilities.ts:366`), `absence.review` and the journal review queue (`domain-action-capabilities.ts:630-652`), `shortlist.get`, `evidence.people.list`, `people.ingest.*`. | Everything the employer may read: candidates, roster, absence requests including reasons, journal entries under review, shortlists, imported history. | The data enters the employer's AI provider (US). | Writes need a one-time confirmation token (`lib/capabilities/confirmable.ts`). Reads do not. |

**Data subjects.** Workers (112), discoverable workers (29 granted, 7 withdrawn), roster people without accounts (41), learners (possibly minors), employer users.

**Recipients.**
- Employers and agencies (P1, P2, P6).
- The employer's AI provider (P6).
- Supabase and Vercel as processors.

**Retention.** See matrix M12, M13, M05, M21, M24. Mostly [OWNER DECISION].

## 3. Necessity and proportionality (Art. 35(7)(b))

| Question | Assessment |
|---|---|
| **Purpose legitimate and specified?** | Yes for P1–P4: connecting people with real work and making their work visible. That is the core product purpose (canonical architecture). P5: legitimate for organisations that run learning programmes, but it is not specified to the worker. P6: a legitimate convenience for employers, but the purpose was never specified to the workers whose data flows. |
| **Lawful basis** | P1/P2: the pool is consent-gated (`profile_discoverability`, 6(1)(a)). **[LAWYER] Does the consent text tell the worker that they will be automatically ranked and possibly excluded by hard criteria?** If not, the text needs a new version, which will invalidate prior grants by design. P3: 6(1)(b). P4: 6(1)(b) for the own record. P5: 6(1)(f) of the organisation [LAWYER]. P6: the employer's own basis for its onward transfer. The platform's basis for disclosing is the underlying visibility basis, which did not contemplate onward transfer to an AI provider [LAWYER]. Absence reasons need an **Art. 9(2)** condition [LAWYER]. |
| **Data minimisation** | P1: good. The receipt holds counts and anonymised refs, and contact data is never in the pool. P2: contact and CV are released only through per-company consent. P6: **not minimised.** Full tool outputs, including absence reasons, leave the platform. |
| **Accuracy** | Deterministic rules. "Missing data never fabricates an outcome" (`match-v1.ts` contract). Inferred labels carry their evidence state. Risk: a stale or wrong profile leads to wrong hard blocks. |
| **Storage limitation** | Receipts and notifications have no automatic retention (G-12). |
| **Transparency** | **Insufficient.** The privacy policy has no profiling section and no Art. 13(2)(f) statement (A3 L11). The copy says "no behavioural scoring" (`en.json:5790`). The top-8 cut-off is not explained. P5 is undisclosed. P6 is described as acting "only with your own permissions" (`en.json:5727`), which is misleading from the workers' side. |
| **Data-subject rights** | No objection mechanism exists (Art. 21). Discoverability withdrawal removes the person from the pool, which is effective for P1 and P2. There is no way to contest a ranking or a hard block, and no way to dispute an auto-confirmation (A3 §4). |
| **Processors and transfers** | No DPA is evidenced (G-07). P6 sends data to US providers (G-03). |

## 4. Risks to rights and freedoms (Art. 35(7)(c))

Likelihood (L) and severity (S) are rated low, medium or high. They are rated before the measures in §5.

| # | Risk | Ops | L | S | Inherent |
|---|---|---|---|---|---|
| K1 | **Hidden exclusion from work.** Hard criteria and the top-8 cut-off hide a suitable worker. The worker never learns why and cannot contest it. | P1, P2 | M | H | **HIGH** |
| K2 | **Discriminatory effect** through proxy criteria: language, country, availability, driving licence, age-correlated signals, gaps from absences. | P2, P4 | M | H | **HIGH** |
| K3 | **Wrong or overstated capability labels** ("potential" read as "confirmed") influence employer choices. Doctrine forbids fake verification. | P4, P5 | M | M | MEDIUM |
| K4 | **Auto-confirmation without notice.** The worker cannot see, contest or explain a confirmation written by an organisation policy. | P5 | M | M | MEDIUM |
| K5 | **Health-related absence reasons and journal content leave for a US AI provider** without the worker's knowledge. Possible further use by the provider depends on the employer's plan. | P6 | M (no measurement of employer grants) | H | **HIGH** |
| K6 | **Loss of control and transparency.** Workers do not know that third-party LLMs read their data on the employer's side. | P6 | H | M | **HIGH** |
| K7 | **Profiling of people without accounts.** Imported history feeds competency signals for 41 people with no notice and no rights path. | P4 (via A15) | H | M | **HIGH** |
| K8 | **Minors in the pool or under inference** (learners). | P1–P4 | L–M | H | MEDIUM-HIGH |
| K9 | **Over-notification or nudging** by alerts. | P3 | L | L | LOW |
| K10 | **Security.** An employer OAuth token or a compromised assistant account exfiltrates roster and candidate data at scale through tools. | P6 | L–M | H | MEDIUM-HIGH |

## 5. Measures (Art. 35(7)(d))

Status key: **IN PLACE** (evidenced) · **PROPOSED** (owner decides) · [LAWYER].

| # | Measure | Addresses | Status | Owner |
|---|---|---|---|---|
| S1 | Consent-gated pool: only `profile_discoverability` workers. Withdrawal takes effect at the next statement. | K1, K2 | IN PLACE | — |
| S2 | No auto-reject. Contact only through a human employer action. The auto-match sends nothing. | K1 | IN PLACE (`auto-match-receipt.ts:6-14`; A2 §4) | — |
| S3 | Receipt holds counts and anonymised refs only. No worker id or contact in the receipt. | minimisation | IN PLACE | — |
| S4 | Evidence states kept apart. AI cannot verify skills or accept or reject candidates (contract rule 4). Writes need confirmation tokens. | K3 | IN PLACE | — |
| S5 | **Privacy-policy profiling section.** It must explain: what is ranked; which hard criteria apply; the top-N display; that no solely automated decision is taken; how to object or withdraw; the logic in plain terms (Art. 13(2)(f), 14(2)(g), 15(1)(h) to the extent applicable). Also remove "no behavioural scoring". | K1, K6 | PROPOSED | L + E |
| S6 | **Consent text version bump** naming automatic ranking, if the lawyer finds the current text insufficient. A bump invalidates old grants, which is fail-closed by design. Weigh the cost of re-asking 29 people. | K1 | PROPOSED [LAWYER] | O + L |
| S7 | **Worker-side "why am I (not) shown" explanation.** Show the hard criteria that block, and the missing facts, on the worker's own record. Doctrine: explain without disabling inference. | K1, K2 | PROPOSED | E |
| S8 | **Bias review of hard criteria and weights.** List every hard criterion and confirm a job-related justification for each. Do not use age, health, nationality or gender proxies. Re-check on each `AUTO_MATCH_MATCHER_VERSION` bump. | K2 | PROPOSED | E + O |
| S9 | **Label honesty for inferred capabilities** (decision 0023: fix the label, keep the inference). "Potential" must never render as confirmed in employer views. Confirm whether potential labels feed ranking. | K3 | PROPOSED / VERIFY | E |
| S10 | **Auto-confirmation notice and contest.** Notify the worker when a confirmation was written by an organisation policy. Label it as policy-based. Let the worker dispute it. | K4 | PROPOSED | E |
| S11 | **Restrict employer-side MCP tools.** Exclude absence reasons and journal free text from assistant tool outputs, or put them behind an explicit per-organisation switch with a recorded acknowledgement. Return counts or status instead of reason text. | K5, K10 | PROPOSED (**priority**) | O + E |
| S12 | **Organisation terms for AI-assistant use.** The employer warrants it has a DPA with its AI provider, a transfer mechanism and a legal basis, and accepts controller responsibility for the onward transfer. | K5, K6 | PROPOSED | L |
| S13 | **Worker notice** in the privacy policy and on the data-access page: organisations you work with may operate the platform through AI assistants, and this is what those assistants can read. | K6 | PROPOSED | L + E |
| S14 | **Measure employer-side OAuth grants**: count them by role. Add rate limits and an audit of tool reads by organisation. Allow the organisation owner to revoke grants. | K10 | PROPOSED | E |
| S15 | **Objection mechanism (Art. 21)** for legitimate-interest profiling: P4 signals used for others, P5, and inclusion of no-account people. | K1, K7 | PROPOSED | E + L |
| S16 | **Art. 14 notice and rights path for organisation-imported people** (G-05). Until it exists, exclude unlinked roster people from any cross-organisation inference or ranking (confirm current behaviour). | K7 | PROPOSED / VERIFY | E + L |
| S17 | **Age policy** (`minors-and-age-policy-v1.md`). Under-18 learners are excluded from the discoverable pool and from hand-offs. | K8 | PROPOSED | O + L |
| S18 | Alert frequency caps and dedupe. Notification preferences respected. E-mail only by opt-in. | K9 | IN PLACE | — |
| S19 | **Tripwire:** a guard test that fails if `trust_score` or `matches.score` are ever written. Writing them requires a DPIA update. | K2 | PROPOSED | E |

## 6. Residual risk

| Risk | Residual today (measures in place only) | Residual after S5–S19 |
|---|---|---|
| K1 hidden exclusion | HIGH | MEDIUM (explained, objectable, consent-based) |
| K2 discrimination | MEDIUM-HIGH | MEDIUM (bias review done, then re-checked per version) |
| K3 label overstatement | MEDIUM | LOW |
| K4 auto-confirmation | MEDIUM | LOW |
| K5 health data to AI provider | **HIGH** | LOW-MEDIUM (if S11 excludes reasons) |
| K6 transparency of assistant use | **HIGH** | MEDIUM |
| K7 no-account profiling | **HIGH** | MEDIUM |
| K8 minors | MEDIUM-HIGH | LOW-MEDIUM |
| K10 assistant exfiltration | MEDIUM-HIGH | MEDIUM |

**Overall:**
- **Today:** HIGH residual risk, driven by K5, K6 and K7, and by K1 without transparency.
- **After the proposed measures:** expected MEDIUM.

## 7. Prior consultation (Art. 36)

**Consultation is not needed if:**
- the owner implements at least S5, S11, S13, S15 and S16;
- the lawyer confirms the residual risk is no longer high.

**Consultation is needed if:**
- the controller decides to keep the processing as it is (in particular P6 including absence reasons);
- and the controller cannot mitigate the high risk.

In that case Art. 36(1) requires prior consultation with VDAI **before continuing** that processing. **[OWNER + LAWYER decision]**

## 8. Consultation and sign-off

| Item | State |
|---|---|
| DPO advice (Art. 35(2)) | No DPO appointed. The DPO re-assessment is due (G-33). |
| Views of data subjects (Art. 35(9)) | Not sought. Proposed: a short consultation with 3–5 workers and 1 employer from the pilot base [OWNER]. |
| Processor input | Not sought. |
| Controller approval | **Not given.** Fill in: name/role, date, decision. |
| Review cadence | On every `AUTO_MATCH_MATCHER_VERSION` bump, on every new MCP tool that returns third-party data, on any new AI task touching personal data, and at least yearly. |

## 9. DPIA screening update: other activities

| Activity | WP248 criteria hit | Screening result | Next step |
|---|---|---|---|
| **Organisation-supplied history of people without accounts** (A15; 41 people, 2,944 records, addresses in `source_fact`) | dataset combination; vulnerable (employees, ex-employees); data not obtained from the subject (no Art. 14 notice); impedes rights (no request path) | **DPIA REQUIRED** (or a joint DPIA with the importing organisation, depending on the role outcome) | Separate DPIA v1 after the role decision (`roles-and-responsibilities-v1.md` §4). Interim: S16. |
| **Absence reasons** (`worker_absences`, possibly health data) | sensitive data; employment (vulnerable); innovative tech when exposed through MCP | **DPIA REQUIRED** for the AI-assistant exposure (covered by K5 above). For plain storage by the employer: screening says the employer's own DPIA, with the platform as processor | Implement S11. Redact reason text at 12 months [OWNER DECISION R-3]. Lawyer to confirm the Art. 9(2)(b) basis. |
| **Minors among learners** (A28) | vulnerable; possibly evaluation (learning signals) | **DPIA RECOMMENDED** once the age policy is chosen | `minors-and-age-policy-v1.md` |
| First-party telemetry (A22) | systematic monitoring (light) | Screening: not high risk in itself. The legal issue is ePrivacy consent (G-10). | No DPIA. Fix consent. |
| Public vacancy corpus with contact persons (A19) | large scale (41k ads with e-mails); data not from the subject | Screening: MEDIUM. A legitimate-interest assessment plus Art. 14(5)(b) reasoning are needed. A DPIA is probably not required [LAWYER]. | Written LIA; redact contacts in display or stop retaining after removal. |
| AI translation and intent (Gemini; suspended) | innovative tech; free text may contain anything | **DPIA RECOMMENDED before re-enabling** `AI_GEMINI_PAID_TIER_CONFIRMED` | Include in a DPIA v2 with the vendor terms evidence. |
| Commercial hand-offs to Nonstop staffing (A20) | purpose change within the controller | Screening: not high risk if consent-based and transparent | Fix notice (G-11). |
