#!/usr/bin/env tsx
/**
 * Answer-Engine registry generator (Wave 0).
 *
 * Deterministically authors the canonical question registry and writes it to
 * content/answer-engine/question-registry.json. Reproducible + committed so a
 * guard can re-run it and fail on drift (same pattern as the taxonomy mirror).
 *
 * Grounded ONLY in real product reality (audits 2026-07-18):
 *  - 49 canonical profession slugs + 152 skill slugs (referenced, never duplicated);
 *  - 9 launch-market countries; the country-readiness EU-framework sources;
 *  - existing FAQ pairs + SEO_PROBLEMS + intake/company-need form fields.
 * No competitor content. No fabricated sources/authors/metrics. No answer BODIES
 * (Wave 0 = questions + classification only). Nothing is PUBLISHED or indexable.
 *
 * Run: pnpm -F web tsx scripts/build-answer-registry.ts
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  ANSWER_CATEGORIES,
  CATEGORY_MIN,
  type AnswerCategoryKey,
  type AnswerAudience,
  type RiskLevel,
  type HighRiskTopic,
  type FreshnessClass,
  type SearchIntent,
  type FunnelStage,
  type SourceReference,
  type CanonicalQuestion,
} from "../lib/answer-engine/contract";
import { ANSWER_ENGINE_LOCALES } from "../lib/answer-engine/contract";

// ── Real dimensions ────────────────────────────────────────────────────────
const COUNTRIES: readonly { code: string; name: string }[] = [
  { code: "lt", name: "Lithuania" },
  { code: "lv", name: "Latvia" },
  { code: "ee", name: "Estonia" },
  { code: "nl", name: "the Netherlands" },
  { code: "de", name: "Germany" },
  { code: "dk", name: "Denmark" },
  { code: "no", name: "Norway" },
  { code: "se", name: "Sweden" },
  { code: "pl", name: "Poland" },
];

// A diverse subset of the canonical 49 profession slugs (snake_case) for the
// per-profession family — cross-sector, not construction-only.
const PROFESSION_SAMPLE: readonly { slug: string; label: string }[] = [
  { slug: "electrician", label: "electrician" },
  { slug: "welder", label: "welder" },
  { slug: "driver", label: "driver" },
  { slug: "caregiver", label: "caregiver" },
  { slug: "software_developer", label: "software developer" },
  { slug: "teacher", label: "teacher" },
  { slug: "cook", label: "cook" },
  { slug: "warehouse_worker", label: "warehouse worker" },
  { slug: "cleaner", label: "cleaner" },
];

const EU_SOURCE: SourceReference = {
  type: "eu_framework",
  id: "eu-free-movement-and-posting-of-workers",
  url: "https://europa.eu/youreurope/citizens/work/index_en.htm",
};
const ELA_SOURCE: SourceReference = {
  type: "official_authority",
  id: "european-labour-authority",
  url: "https://www.ela.europa.eu/en",
};
const READINESS_CAP: SourceReference = {
  type: "product_capability",
  id: "country-readiness",
};

// ── Builder ────────────────────────────────────────────────────────────────
type Draft = {
  category: AnswerCategoryKey;
  subcategory: string;
  q: string;
  audiences: readonly AnswerAudience[];
  intent?: SearchIntent;
  funnel?: FunnelStage;
  risk?: RiskLevel;
  topics?: readonly HighRiskTopic[];
  freshness?: FreshnessClass;
  capability?: string;
  countries?: readonly string[];
  professions?: readonly string[];
  skills?: readonly string[];
  edu?: readonly string[];
  cluster?: string | null;
  sources?: readonly SourceReference[];
};

const drafts: Draft[] = [];
const push = (d: Draft) => drafts.push(d);

/** Author a whole category from terse rows sharing an audience default. */
function bank(
  category: AnswerCategoryKey,
  subcategory: string,
  audiences: readonly AnswerAudience[],
  rows: readonly (string | Partial<Draft> & { q: string })[],
  base: Partial<Draft> = {},
) {
  for (const row of rows) {
    const r = typeof row === "string" ? { q: row } : row;
    push({ category, subcategory, audiences, ...base, ...r });
  }
}

/** Expand a stem across a dimension into a clustered family (distinct answers). */
function family(
  category: AnswerCategoryKey,
  subcategory: string,
  cluster: string,
  audiences: readonly AnswerAudience[],
  stem: (x: { code?: string; name?: string; slug?: string; label?: string }) => string,
  items: readonly { code?: string; name?: string; slug?: string; label?: string }[],
  base: Partial<Draft> = {},
) {
  for (const it of items) {
    push({
      category,
      subcategory,
      audiences,
      cluster,
      q: stem(it),
      countries: it.code ? [it.code] : base.countries,
      professions: it.slug ? [it.slug] : base.professions,
      ...base,
    });
  }
}

// ════════════════════════════════════════════════════════════════════════════
// 1. Job search & opportunity discovery (min 55)
// ════════════════════════════════════════════════════════════════════════════
bank("job_search_discovery", "getting-started", ["worker", "job_seeker"], [
  "How do I start looking for work on LabourMarket.ai?",
  "How does LabourMarket.ai help me find work?",
  "Do I need to pay to look for work on LabourMarket.ai?",
  "Can I look for work without uploading a CV?",
  "How do I set the countries I want to work in?",
  "How do I say when I am available to start?",
  "Can I look for work while I am still employed?",
  "How do I make my profile visible to employers?",
  "How do I hide my profile from employers?",
  "What happens after I express interest in a work opportunity?",
  "How will I know if an employer is interested in me?",
  "Can I look for more than one type of work at the same time?",
  "How do I search for opportunities near a specific city?",
  "Does the platform promise me a job?",
  "Why do I see certain opportunities and not others?",
], { capability: "opportunity-board", freshness: "evergreen" });

bank("job_search_discovery", "opportunity-fit", ["worker", "job_seeker"], [
  "Why is an opportunity shown as a good fit for me?",
  "What does the fit signal on an opportunity mean?",
  "Why am I missing some skills for an opportunity?",
  "How can I improve my fit for the work I want?",
  "In matching, why does a confirmed skill count for more than a declared one?",
  "Does the platform rank me against other people?",
  "Can I see which of my skills matched an opportunity?",
  "How do I find opportunities that fit my current skills?",
  "What is a near-miss opportunity?",
  "How do I get a stronger match for an opportunity?",
], { capability: "matching", freshness: "evergreen" });

bank("job_search_discovery", "work-forms", ["worker", "job_seeker", "freelancer"], [
  { q: "How do I find full-time work in Europe?", cluster: "find-work-by-form" },
  { q: "How do I find part-time work in Europe?", cluster: "find-work-by-form" },
  { q: "How do I find seasonal work in Europe?", cluster: "find-work-by-form" },
  { q: "How do I find temporary work in Europe?", cluster: "find-work-by-form" },
  { q: "How do I find project-based work in Europe?", cluster: "find-work-by-form" },
  { q: "How do I find shift work in Europe?", cluster: "find-work-by-form" },
  { q: "How do I find work as a self-employed specialist in Europe?", cluster: "find-work-by-form" },
  { q: "How do I offer my team or brigade for work in Europe?", cluster: "find-work-by-form", audiences: ["team", "freelancer"] },
], { capability: "opportunity-board", freshness: "slow" });

bank("job_search_discovery", "practical", ["worker", "job_seeker"], [
  "How do I save an opportunity to look at later?",
  "How do I see opportunities I recently viewed?",
  "How do I filter opportunities by accommodation offered?",
  "How do I filter opportunities by transport or pickup?",
  "How do I filter opportunities by language requirement?",
  "How do I compare two work opportunities?",
  "What should I do if there are no opportunities yet?",
  "How do I get notified about new opportunities that fit me?",
  "Can students find work opportunities on the platform?",
  "How do I find work if I have no formal qualifications?",
  "How do I find work if my experience is from another country?",
  "How do I find work in a profession I have not worked in before?",
  "What is the honest status when an opportunity board is empty?",
  "How do I express interest without applying formally?",
  "How do I withdraw my interest in an opportunity?",
  "Can I look for work anonymously first?",
  "How do I show I am open to relocating for work?",
  "How do I show I already have my own accommodation?",
  "How do I show I have my own transport?",
  "How do I set my preferred pay for work opportunities?",
  "How do I find opportunities that match my languages?",
  "How do I know an opportunity is real and not a fake listing?",
], { capability: "opportunity-board", freshness: "evergreen" });

// ════════════════════════════════════════════════════════════════════════════
// 2. CV, profile & experience (min 40)
// ════════════════════════════════════════════════════════════════════════════
bank("cv_profile_experience", "profile-basics", ["worker", "job_seeker"], [
  "What is a work profile on LabourMarket.ai?",
  "How is a work profile different from a paper CV?",
  "How do I build my work profile?",
  "What should I put in my work profile?",
  "How do I import my existing CV?",
  "What happens to my CV after I import it?",
  "Does the platform change my CV without my permission?",
  "How do I turn my work experience into a profile?",
  "How do I add a profession to my profile?",
  "How do I add more than one profession to my profile?",
  "How do I show my years of experience?",
  "How do I add my languages to my profile?",
  "How do I add my availability to my profile?",
  "How do I add my documents to my profile?",
  "Who can see the documents in my profile?",
], { capability: "profile", freshness: "evergreen" });

bank("cv_profile_experience", "cv-import-ai", ["worker", "job_seeker"], [
  "How does the assistant help me build my profile from my words?",
  "Does the AI invent experience I do not have?",
  "Do I have to accept every suggestion the assistant makes?",
  "How do I review and edit AI suggestions on my profile?",
  "Can I reject an AI suggestion about my skills?",
  "Is my imported CV used to train anything?",
  "How do I keep my profile up to date over time?",
  "What is a living work identity?",
], { capability: "cv", freshness: "evergreen" });

bank("cv_profile_experience", "showing-experience", ["worker", "job_seeker", "graduate"], [
  "How do I show experience if I have never had a formal job title?",
  "How do I show experience gained abroad?",
  "How do I show experience gained informally?",
  "How do I present my potential, not just past positions?",
  "How do I show work I did without a contract?",
  "How do I describe my experience so employers understand it?",
  "How do I keep a private record of my work over time?",
  "How does the work journal build my profile?",
  "What is the work journal and why should I use it?",
  "How do journal entries become skills on my profile?",
  "Can I export my profile as a CV?",
  "How do I present a career gap honestly?",
  "How do I show seasonal or short assignments on my profile?",
  "How do I present volunteer or community work?",
  "How do I show a portfolio of past projects?",
  "How do I present references or confirmations from managers?",
  "What is the difference between self-declared and confirmed experience?",
], { capability: "work-journal", freshness: "evergreen" });

// ════════════════════════════════════════════════════════════════════════════
// 3. Skills & competencies (min 45)
// ════════════════════════════════════════════════════════════════════════════
bank("skills_competencies", "skills-basics", ["worker", "job_seeker"], [
  "How do I add skills to my profile?",
  "Where do the skill suggestions come from?",
  "What is a skill confidence signal?",
  "What do the red, yellow and green skill signals mean?",
  "How is a skill confirmed on the platform?",
  "Who can confirm my skills?",
  "What is the difference between a declared skill and a confirmed skill?",
  "Can I see how many of my skills are confirmed?",
  "How do I get my skills confirmed by a manager?",
  "Does the platform verify my skills automatically?",
  "How are my skills kept private from employers by default?",
  "How do I remove a skill from my profile?",
  "What is a skill taxonomy?",
  "How does the platform recognise skills from my work journal?",
  "Why does the platform show skills as evidence, not claims?",
], { capability: "skills", freshness: "evergreen" });

bank("skills_competencies", "transferable-and-gaps", ["worker", "job_seeker", "career_changer"], [
  "What are transferable skills?",
  "How does the platform see my transferable skills?",
  "How do I find out which of my skills apply to other professions?",
  "What is a skills gap?",
  "How do I find out which skills I am missing for a role?",
  "How do I know which skills to add to get more opportunities?",
  "How is my skill coverage for a specific need calculated?",
  "Can two people have the same skill but different confidence?",
  "How do I show a skill I use but was never formally trained in?",
  "How do soft skills fit into my profile?",
  "How do language skills affect my opportunities?",
  "How do I show a licence or certificate as a skill?",
  "How do practical skills compare to formal qualifications here?",
  "How do I strengthen a skill that is only self-declared?",
], { capability: "skills", freshness: "evergreen" });

bank("skills_competencies", "productivity-signals", ["worker", "employer"], [
  "What is a productivity or pace signal for a skill?",
  "How is a skill pace measured on the platform?",
  "Are my skill signals ever used to compare me against other people?",
  "Can I see a private breakdown of my own skills by confidence?",
  "How does confirmed work change my skill signals?",
  "Why does the platform never show one overall rating for a person?",
  "How do industry-typical benchmarks differ from measured signals?",
  "What sample size is needed before a skill benchmark is shown?",
  "How do I understand the fit percentage on a specific need?",
  "Why is a fit percentage always tied to a specific need?",
  "How are confirmed versus declared skills separated in a match?",
  "What does it mean that skills are shown with their basis?",
  "How do I read the skill match explanation on an opportunity?",
  "How do extra strengths beyond a requirement get shown?",
  "How is a skill signal computed from journal entries and confirmations?",
  "Why can the same person have different fit results in different contexts?",
], { capability: "intelligence", freshness: "evergreen" });

// ════════════════════════════════════════════════════════════════════════════
// 4. Professions & professional directions (min 45) — per-profession family
// ════════════════════════════════════════════════════════════════════════════
family("professions_directions", "what-a-profession-does", "profession-day-to-day", ["worker", "student", "career_changer"],
  (p) => `What does a ${p.label} do day to day?`, PROFESSION_SAMPLE, { capability: "professions", freshness: "slow" });
family("professions_directions", "how-to-become", "profession-how-to-become", ["worker", "student", "career_changer"],
  (p) => `How do I become a ${p.label} in Europe?`, PROFESSION_SAMPLE, { capability: "professions", freshness: "slow", risk: "MEDIUM" });
family("professions_directions", "skills-needed", "profession-skills-needed", ["worker", "student", "career_changer"],
  (p) => `What skills does a ${p.label} need?`, PROFESSION_SAMPLE, { capability: "skills", freshness: "slow" });
family("professions_directions", "where-to-work", "profession-where-to-work", ["worker", "job_seeker"],
  (p) => `Where can a ${p.label} find work across Europe?`, PROFESSION_SAMPLE, { capability: "opportunity-board", freshness: "slow" });
family("professions_directions", "adjacent-directions", "profession-adjacent", ["worker", "career_changer"],
  (p) => `What related professions can a ${p.label} move into?`, PROFESSION_SAMPLE, { capability: "adjacent-directions", freshness: "slow" });

// ════════════════════════════════════════════════════════════════════════════
// 5. Career change & transferable skills (min 35)
// ════════════════════════════════════════════════════════════════════════════
bank("career_change_transferable", "changing-direction", ["worker", "career_changer"], [
  "How do I change my professional direction?",
  "How does the platform help me discover adjacent professions?",
  "How do I know which career change is realistic for my skills?",
  "How do I use my current skills to move into a new profession?",
  "What is an adjacent professional direction?",
  "How does the platform explain why a direction fits me?",
  "How do I see which of my skills support a new direction?",
  "How do I see what I would still need to learn for a new direction?",
  "Can I explore new directions without leaving my current work?",
  "How do I compare several possible professional directions?",
  "How do I move from a manual role into an office role?",
  "How do I move from an office role into a hands-on trade?",
  "How do I move into a supervisory or team-lead direction?",
  "How do I move into a self-employed direction?",
  "How do I test a new direction before committing to it?",
  "How do transferable skills reduce the risk of changing careers?",
  "How do I find opportunities that accept transferable skills?",
  "How do I present a career change to an employer honestly?",
  "How long does a professional direction change usually take?",
  "How do I keep my income while retraining for a new direction?",
  "How do I know if I am ready to change professions?",
  "What is the difference between a job change and a career change?",
  "How do I recognise skills I can carry into any profession?",
  "How do I discover directions I had not considered?",
  "How do I plan the steps of a career change?",
  "How do I handle a career change later in life?",
  "How do I change direction after a long time in one profession?",
  "How do I change direction if my industry is shrinking?",
  "How do I use my language skills to change direction?",
  "How do I use my digital skills to change direction?",
  "How do I move between related trades?",
  "How do I move from a seasonal profession to a stable one?",
  "How do I show an employer that my transferable skills matter?",
  "How do I find mentors or peers who changed direction?",
  "How do I set a realistic timeline for reskilling into a new role?",
], { capability: "adjacent-directions", freshness: "evergreen" });

// ════════════════════════════════════════════════════════════════════════════
// 6. Reskilling & learning (min 35)
// ════════════════════════════════════════════════════════════════════════════
bank("reskilling_learning", "learning-basics", ["worker", "reskiller", "career_changer"], [
  "What is reskilling?",
  "What is upskilling?",
  "What is the difference between reskilling and upskilling?",
  "How do I know which skills to learn next?",
  "How do I identify my skills gaps before learning?",
  "How do I turn a skills gap into a learning plan?",
  "How do I choose a learning path that leads to real work?",
  "How do I prioritise which skills to learn first?",
  "How do I learn a new skill while working full-time?",
  "How do I stay motivated while reskilling?",
  "How do I measure progress while learning a new skill?",
  "How do I record new skills as I learn them?",
  "How do newly learned skills appear on my profile?",
  "How do I get a newly learned skill confirmed?",
  "How do I show learning in progress on my profile?",
  "How do I decide between formal training and on-the-job learning?",
  "How do vocational qualifications compare to on-the-job experience?",
  "How do I find out what learning a specific profession requires?",
  "How do I plan reskilling if I want to change countries too?",
  "How do micro-skills add up to a new profession?",
  "How do I balance learning cost against future work opportunities?",
  "How do I avoid learning skills that are not in demand?",
  "How do I use market signals to choose what to learn?",
  "How do I keep learning relevant as professions change?",
  "How do I reskill after automation affects my role?",
  "How do I reskill if I have limited time and budget?",
  "How do I document informal learning honestly?",
  "How do I show a certificate I earned outside the platform?",
  "How do I combine several small skills into a stronger profile?",
  "How do I plan a step-by-step reskilling journey?",
  "How do I know a learning path is honest and not a false promise?",
  "How do I find the transferable skills I already have before learning new ones?",
  "How do I set learning goals tied to real opportunities?",
  "How do I review whether my reskilling is paying off?",
  "Why does the platform not promise courses it cannot back with a real source?",
], { capability: "skills", freshness: "slow" });

// ════════════════════════════════════════════════════════════════════════════
// 7. Salary & working conditions (min 35) — HIGH risk (salaries)
// ════════════════════════════════════════════════════════════════════════════
bank("salary_conditions", "pay", ["worker", "job_seeker"], [
  "How do I find out typical pay for my profession?",
  "Why is a salary shown as an estimate and not a fixed offer?",
  "How are salary benchmarks calculated on the platform?",
  "Why might no salary benchmark be shown for my profession?",
  "What is the difference between gross and net pay?",
  "How do I set my preferred pay basis?",
  "How do I understand pay differences between countries?",
  "How do I find out the minimum wage in a country?",
  "What are typical working hours for my profession?",
  "What is overtime and how is it usually paid?",
  "What are shift and night-work conditions?",
  "What are typical accommodation arrangements for posted work?",
  "What transport or pickup arrangements are common for work abroad?",
  "How do I understand my rights on working conditions?",
  "How do I compare total conditions, not just the hourly rate?",
], { risk: "HIGH", topics: ["salaries"], freshness: "volatile", capability: "intelligence", sources: [EU_SOURCE] });

bank("salary_conditions", "contracts-and-rights", ["worker"], [
  "What is the difference between an employment contract and a service contract?",
  "What is the difference between employee, self-employed and agency work?",
  "What is a posted worker and what conditions apply?",
  "What host-country minimum conditions apply to posted workers?",
  "What social-security rules apply when I work in another EU country?",
  "What is an A1 certificate and when do I need one?",
  "What are my rights if pay is delayed?",
  "What should a fair work agreement include?",
  "How are holidays and rest periods usually handled?",
  "What protections exist against unfair working conditions?",
  "What should I check before accepting work in another country?",
  "How do I keep evidence of what was agreed about my work?",
  "What is subcontractor chain liability for unpaid wages?",
  "How do taxes usually work when I work in another EU country?",
  "How do I confirm the exact national rules for my situation?",
  "What conditions must an employer disclose before I start?",
  "How do I recognise unsafe or unfair conditions?",
  "What is the Posting of Workers Directive in simple terms?",
  "How do I find the competent national authority for a work question?",
  "Why is legal and tax information here informational and not legal advice?",
], { risk: "HIGH", topics: ["labour_law", "taxes", "social_security"], freshness: "volatile", capability: "country-readiness", sources: [EU_SOURCE, ELA_SOURCE, READINESS_CAP] });

// ════════════════════════════════════════════════════════════════════════════
// 8. Working in EU countries (min 45) — per-country family, HIGH risk
// ════════════════════════════════════════════════════════════════════════════
family("working_in_eu_countries", "documents", "work-documents-by-country", ["worker", "job_seeker"],
  (c) => `What documents do I need to work legally in ${c.name}?`, COUNTRIES,
  { risk: "HIGH", topics: ["labour_law", "migration", "visas"], freshness: "volatile", capability: "country-readiness", sources: [EU_SOURCE, ELA_SOURCE, READINESS_CAP] });
family("working_in_eu_countries", "finding-work", "find-work-by-country", ["worker", "job_seeker"],
  (c) => `How do I find work in ${c.name} through LabourMarket.ai?`, COUNTRIES,
  { risk: "MEDIUM", freshness: "slow", capability: "opportunity-board" });
family("working_in_eu_countries", "conditions", "conditions-by-country", ["worker"],
  (c) => `What are typical working conditions for foreign workers in ${c.name}?`, COUNTRIES,
  { risk: "HIGH", topics: ["labour_law", "salaries"], freshness: "volatile", capability: "country-readiness", sources: [EU_SOURCE, READINESS_CAP] });
family("working_in_eu_countries", "language", "language-by-country", ["worker", "job_seeker"],
  (c) => `Do I need to speak the local language to work in ${c.name}?`, COUNTRIES,
  { risk: "LOW", freshness: "slow", capability: "country-readiness" });
family("working_in_eu_countries", "posting", "posting-registration-by-country", ["company", "employer", "agency"],
  (c) => `What posting or registration steps apply when sending workers to ${c.name}?`, COUNTRIES,
  { risk: "HIGH", topics: ["labour_law", "migration", "taxes"], freshness: "volatile", capability: "country-readiness", sources: [EU_SOURCE, ELA_SOURCE, READINESS_CAP] });

// ════════════════════════════════════════════════════════════════════════════
// 9. International & regional mobility (min 25)
// ════════════════════════════════════════════════════════════════════════════
bank("international_regional_mobility", "moving-for-work", ["worker", "job_seeker"], [
  "What is free movement of workers in the EU?",
  "How do I plan a move to another country for work?",
  "How do I show I am willing to relocate for work?",
  "How do I set several target countries at once?",
  "How do I compare opportunities across countries?",
  "How do I move for work within my own country?",
  "How do I understand regional differences in work demand?",
  "How do I find work in a specific region rather than a whole country?",
  "How does the platform match me across countries?",
  "How do I prepare documents before moving for work?",
  "How do I find accommodation when moving for work?",
  "How do I arrange transport when relocating for work?",
  "How do I keep my profile visible in several countries?",
  "How do I understand recognition of my qualifications abroad?",
  "How do I recognise which countries need my profession most?",
  "How do I move between neighbouring countries for seasonal work?",
  "How do I return to my home country after working abroad?",
  "How do I keep a record of work done in different countries?",
  "How do language requirements change between countries?",
  "How do I plan a step-by-step relocation for work?",
  "How do I handle family considerations when moving for work?",
  "How do I understand cost-of-living differences between countries?",
  "How do I avoid common mistakes when moving for work?",
  "How do I check that a cross-border opportunity is legitimate?",
  "How do I understand my rights when working across borders?",
], { risk: "MEDIUM", freshness: "slow", capability: "country-readiness" });

// ════════════════════════════════════════════════════════════════════════════
// 10. Employers & finding workers (min 45)
// ════════════════════════════════════════════════════════════════════════════
bank("employers_finding_workers", "posting-need", ["employer", "company"], [
  "How do I post a work need on LabourMarket.ai?",
  "What information does a work need require?",
  "How do I describe the role or work type I need?",
  "How do I set the team size I need?",
  "How do I set the start period and duration of a need?",
  "How do I set the country and location for a need?",
  "How do I set a language requirement for a need?",
  "How do I save a work need as a draft?",
  "How do I submit a work need for matching?",
  "What happens after I submit a work need?",
  "How is my work need kept private and owner-scoped?",
  "Can I edit a work need after submitting it?",
], { capability: "matching", freshness: "evergreen" });

bank("employers_finding_workers", "finding-people", ["employer", "company"], [
  "How do I find workers who fit my need?",
  "How does candidate scouting work?",
  "How are candidates ranked for my need?",
  "Why is a candidate shown as a fit for my need?",
  "How do I see which skills a candidate has for my need?",
  "How do I see which skills a candidate is missing?",
  "What is the difference between confirmed and declared skills when hiring?",
  "How do I shortlist candidates for a need?",
  "How do I contact a candidate on the platform?",
  "Why can I not see a candidate's private contact details by default?",
  "How does consent affect what I can see about a worker?",
  "How do I find a whole team or brigade, not just one worker?",
  "How do I find a competence or capability, not just a job title?",
  "How do I search for workers by country and availability?",
  "How do I understand a candidate's readiness for my need?",
  "How do I avoid discriminating when reviewing candidates?",
  "How do I find workers with their own transport or tools?",
  "How do I find workers who need or have accommodation?",
  "How do I find workers who speak a specific language?",
  "How do I understand the fit explanation for a candidate?",
  "Why does the platform never show one overall score for a candidate?",
  "How do I keep my hiring decisions fair and evidence-based?",
  "How do I find workers open to relocating to my country?",
  "How do I re-use a previous need to find similar workers?",
  "How do I understand a candidate's experience shown as evidence?",
  "How do I request a worker's documents with their consent?",
  "How do I move a candidate through my hiring pipeline?",
  "How do I find seasonal or short-term workers?",
  "How do I find specialists for a specific project?",
  "How do I understand why a candidate is a near match?",
  "How do I give feedback on a candidate honestly?",
  "How do I find workers when I have very little time?",
  "How do I compare several candidates for the same need?",
], { risk: "MEDIUM", topics: ["discrimination"], capability: "scouting", freshness: "evergreen" });

// ════════════════════════════════════════════════════════════════════════════
// 11. Companies, teams & projects (min 25)
// ════════════════════════════════════════════════════════════════════════════
bank("companies_teams_projects", "company-space", ["company", "employer"], [
  "How does a company create its space on LabourMarket.ai?",
  "How does a company show what it does and where it works?",
  "How does a company represent what or who it needs?",
  "How does a company show the services it offers?",
  "How do I manage my company's activity presence?",
  "How do I add colleagues or managers to my company space?",
  "How do roles and permissions work in a company space?",
], { capability: "company", freshness: "evergreen" });

bank("companies_teams_projects", "teams-projects", ["team", "project_owner", "company"], [
  "How do I represent a real work team or brigade?",
  "How does a team show its combined capabilities?",
  "How does an employer send an enquiry to a team?",
  "How do I create a project on the platform?",
  "How do I assign workers to a project?",
  "How do I manage a project's operations and handover?",
  "How does a worker see the projects they are assigned to?",
  "How do project records support later disputes or proof?",
  "How do I find partners or collaborators for a project?",
  "How do I invite a partner to collaborate?",
  "How do collaboration invitations work?",
  "How do I keep project communication clear and traceable?",
  "How does a project help the smaller party prove what happened?",
  "How do I build a team from workers on the platform?",
  "How do I represent a subcontractor relationship honestly?",
  "How do teams and projects connect to real work needs?",
  "How do I keep team membership records accurate?",
  "How do I show a team's availability and deployable size?",
], { capability: "teams", freshness: "evergreen" });

// ════════════════════════════════════════════════════════════════════════════
// 12. Students, graduates & education institutions (min 25)
// ════════════════════════════════════════════════════════════════════════════
bank("students_graduates_institutions", "students", ["student", "graduate"], [
  "How can a student use LabourMarket.ai?",
  "How do I build a profile as a student with little experience?",
  "How do I show my potential as a new entrant?",
  "How do I find first work opportunities as a student?",
  "How do I present internships and coursework on my profile?",
  "How do I show skills learned during studies?",
  "How do I find part-time or seasonal work while studying?",
  "How do I present a diploma or qualification on my profile?",
  "How do I move from studying into my first profession?",
  "How do I explore which professions fit my studies?",
  "How do I find work in another country as a graduate?",
  "How do I show volunteer or project work as a student?",
  "How do I get my first skills confirmed?",
  "How do I plan a career direction as a graduate?",
], { capability: "profile", freshness: "evergreen" });

bank("students_graduates_institutions", "institutions", ["education_institution", "partner"], [
  "How can an education institution work with LabourMarket.ai?",
  "How can a school present its programmes to learners honestly?",
  "How can a training provider connect learning to real work signals?",
  "How can an institution help students show their skills?",
  "How can an institution understand local labour-market demand?",
  "How do institutions fit into the universal opportunity model?",
  "How can a college help graduates present potential over titles?",
  "How can an institution support reskilling learners?",
  "How is any institution partnership represented honestly, without fake claims?",
  "How can an institution reference real labour-market data for guidance?",
  "How can institutions support students across several countries?",
], { capability: "none", freshness: "slow" });

// ════════════════════════════════════════════════════════════════════════════
// 13. Agencies & partners (min 15)
// ════════════════════════════════════════════════════════════════════════════
bank("agencies_partners", "agencies", ["agency", "partner"], [
  "How does a staffing agency use LabourMarket.ai?",
  "How does an agency represent the workers it can offer?",
  "How does an agency see open demand it can serve?",
  "How does an agency propose that it can offer workers for a need?",
  "How is agency work represented honestly and consent-based?",
  "How does an agency keep worker consent and privacy intact?",
  "How does an agency show aggregate document readiness with consent?",
  "How do agencies fit into a universal, non-narrow platform?",
  "How does an agency find needs that match its workers?",
  "How does an agency avoid exposing private worker data?",
  "How does an agency build trust with employers on the platform?",
  "How do partners collaborate without a fake endorsement?",
  "How does the platform prevent fake agency or partner claims?",
  "How does an agency present its specialisation across sectors?",
  "How does an agency represent teams it can deploy?",
], { risk: "MEDIUM", topics: ["personal_data"], capability: "scouting", freshness: "evergreen" });

// ════════════════════════════════════════════════════════════════════════════
// 14. Labour-market data & trends (min 20)
// ════════════════════════════════════════════════════════════════════════════
bank("labour_market_data_trends", "market-data", ["worker", "employer", "company", "job_seeker"], [
  "What labour-market signals does LabourMarket.ai show?",
  "Where do the labour-market data and signals come from?",
  "Why are market numbers always shown with a source?",
  "How do I read demand signals for my profession?",
  "How do I understand skill scarcity in a market?",
  "How do market signals help me make career decisions?",
  "How do employers use demand data to plan hiring?",
  "Why does the platform avoid inventing statistics?",
  "How fresh is the labour-market data shown?",
  "How do I understand differences in demand between countries?",
  "How do I find which professions are in demand where I want to work?",
  "How do I use market trends to choose what to learn?",
  "How are salary benchmarks sourced and dated?",
  "What is the difference between platform-measured and industry-typical figures?",
  "How does the platform protect privacy in aggregate data?",
  "Why is individual behaviour never exposed in market data?",
  "How do I interpret a labour-market signal responsibly?",
  "How do I know a market figure is current and not stale?",
  "How does the platform show demand without exposing individuals?",
  "How do I compare demand across professions?",
], { risk: "MEDIUM", freshness: "volatile", capability: "intelligence", sources: [EU_SOURCE] });

// ════════════════════════════════════════════════════════════════════════════
// 15. AI, automation & the future of professions (min 20)
// ════════════════════════════════════════════════════════════════════════════
bank("ai_automation_future", "ai-on-platform", ["worker", "employer", "job_seeker"], [
  "How does LabourMarket.ai use AI?",
  "Does AI make hiring or verification decisions for me?",
  "Why does AI only suggest and never confirm on my behalf?",
  "How does AI help structure my work journal into skills?",
  "Is AI content shown to a customer reviewed by a human first?",
  "How does the platform keep AI honest and traceable?",
  "How is my data protected when AI reads my journal?",
  "Does AI change my records without my confirmation?",
  "How will automation affect my profession?",
  "How do I prepare for changes automation brings to my work?",
  "How do I use market signals to future-proof my career?",
  "How do transferable skills protect me as professions change?",
  "How do I reskill ahead of automation in my field?",
  "How does the platform help me see where work is moving?",
  "Why does the platform not promise an AI career advisor it cannot back?",
  "How do I keep control over AI suggestions about my profile?",
  "How is AI used to explain a match, not to rate a person?",
  "How do I understand the limits of AI on the platform?",
  "How does the platform log AI suggestions for transparency?",
  "How does AI support, not replace, human decisions here?",
], { capability: "matching", freshness: "slow" });

// ════════════════════════════════════════════════════════════════════════════
// 16. LabourMarket.ai usage, security & privacy (min 40)
// ════════════════════════════════════════════════════════════════════════════
bank("platform_usage_security_privacy", "usage", ["worker", "employer", "company", "job_seeker"], [
  "What is LabourMarket.ai?",
  "Who is LabourMarket.ai for?",
  "Is LabourMarket.ai only for one sector?",
  "Is LabourMarket.ai only a job board?",
  "How do I create an account?",
  "Do I need an invitation to join?",
  "How do I choose my starting role or intention?",
  "Can I change or add roles later?",
  "How do I switch between my roles?",
  "How do I navigate the dashboard?",
  "How do I search across my own items?",
  "What languages is LabourMarket.ai available in?",
  "How do I change the interface language?",
  "How do I contact support?",
  "How do I delete my account?",
  "How do I export my data?",
  "Is LabourMarket.ai free to start using?",
  "How do I understand what is real versus a preview on the platform?",
], { capability: "none", freshness: "evergreen" });

bank("platform_usage_security_privacy", "privacy-security", ["worker", "employer", "company"], [
  { q: "How is my personal data protected on LabourMarket.ai?", risk: "HIGH", topics: ["personal_data"] },
  { q: "Who can see my profile and private records?", risk: "HIGH", topics: ["personal_data"] },
  { q: "How does default-closed visibility protect my content?", risk: "HIGH", topics: ["personal_data"] },
  { q: "What consent is required before an employer sees my details?", risk: "HIGH", topics: ["personal_data"] },
  { q: "How do I control who can contact me?", risk: "MEDIUM", topics: ["personal_data"] },
  { q: "Are my private choices ever shown to employers?", risk: "HIGH", topics: ["personal_data"] },
  { q: "How is my data used for research, and is it anonymised?", risk: "HIGH", topics: ["personal_data"] },
  { q: "How does the platform keep records tamper-evident?", risk: "MEDIUM" },
  { q: "How are my journal entries kept private?", risk: "HIGH", topics: ["personal_data"] },
  { q: "How do I revoke access I previously granted?", risk: "MEDIUM", topics: ["personal_data"] },
  { q: "How is my document data kept owner-only?", risk: "HIGH", topics: ["personal_data"] },
  { q: "How does the platform protect me against unfair data use?", risk: "HIGH", topics: ["personal_data", "discrimination"] },
  { q: "What is the legal basis for processing my data?", risk: "HIGH", topics: ["personal_data"] },
  { q: "How do I read the privacy policy and terms?", risk: "MEDIUM", topics: ["personal_data"] },
  { q: "How is my data kept separate from other tenants?", risk: "MEDIUM", topics: ["personal_data"] },
  { q: "How does the platform prevent fake profiles and listings?", risk: "MEDIUM" },
  { q: "How do I report a suspicious opportunity or user?", risk: "MEDIUM" },
  { q: "How is my communication kept secure and traceable?", risk: "MEDIUM", topics: ["personal_data"] },
  { q: "How does privacy apply equally to workers and companies?", risk: "HIGH", topics: ["personal_data"] },
  { q: "Why is legal and privacy information here informational and not legal advice?", risk: "HIGH", topics: ["labour_law", "personal_data"] },
  { q: "How do I understand what data is required versus optional?", risk: "MEDIUM", topics: ["personal_data"] },
  { q: "How does the platform minimise the data it stores about me?", risk: "MEDIUM", topics: ["personal_data"] },
], { capability: "privacy", freshness: "slow", sources: [READINESS_CAP] });

// ════════════════════════════════════════════════════════════════════════════
// Assemble → assign IDs / slugs / defaults → link related → write JSON.
// ════════════════════════════════════════════════════════════════════════════
const usedSlugs = new Set<string>();
function slugify(q: string): string {
  let base = q
    .toLowerCase()
    .replace(/[’'".,?!:;()]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .split("-")
    .slice(0, 12)
    .join("-");
  let slug = base;
  let n = 2;
  while (usedSlugs.has(slug)) slug = `${base}-${n++}`;
  usedSlugs.add(slug);
  return slug;
}

const PENDING_TX = Object.fromEntries(
  ANSWER_ENGINE_LOCALES.map((l) => [l, "TRANSLATION_PENDING"]),
) as CanonicalQuestion["translationStatusByLocale"];
const NOT_READY_IDX = Object.fromEntries(
  ANSWER_ENGINE_LOCALES.map((l) => [l, "NOT_READY"]),
) as CanonicalQuestion["indexingStatusByLocale"];

const questions: CanonicalQuestion[] = drafts.map((d, i) => {
  const risk: RiskLevel = d.risk ?? "LOW";
  const evidenceStatus = risk === "HIGH" ? "EVIDENCE_REQUIRED" : "NONE_REQUIRED";
  const sources =
    d.sources ??
    (d.capability && d.capability !== "none"
      ? [{ type: "product_capability", id: d.capability } as SourceReference]
      : []);
  return {
    canonicalQuestionId: `AE-${String(i + 1).padStart(4, "0")}`,
    canonicalQuestion: d.q,
    category: d.category,
    subcategory: d.subcategory,
    audiences: d.audiences,
    searchIntent: d.intent ?? "informational",
    funnelStage: d.funnel ?? "awareness",
    applicableCountries: d.countries ?? [],
    applicableProfessions: d.professions ?? [],
    applicableSkills: d.skills ?? [],
    applicableEducationLevels: d.edu ?? ["any"],
    riskLevel: risk,
    highRiskTopics: d.topics ?? [],
    freshnessClass: d.freshness ?? "evergreen",
    evidenceStatus,
    sourceReferences: sources,
    relatedQuestionIds: [],
    relatedProductCapability: d.capability ?? "none",
    translationStatusByLocale: PENDING_TX,
    indexingStatusByLocale: NOT_READY_IDX,
    lastReviewedAt: null,
    reviewOwner: "unassigned",
    canonicalSlug: slugify(d.q),
    localizedSlugs: {},
    duplicateClusterId: d.cluster ?? null,
    contentStatus: d.cluster ? "CLUSTERED" : "DISCOVERED",
  };
});

// Link related questions: same subcategory OR same cluster (cap 6, no self).
const byId = new Map(questions.map((q) => [q.canonicalQuestionId, q]));
for (const q of questions) {
  const related = questions.filter(
    (o) =>
      o.canonicalQuestionId !== q.canonicalQuestionId &&
      (o.duplicateClusterId && o.duplicateClusterId === q.duplicateClusterId
        ? true
        : o.subcategory === q.subcategory && o.category === q.category),
  );
  (q as unknown as { relatedQuestionIds: string[] }).relatedQuestionIds = related
    .slice(0, 6)
    .map((o) => o.canonicalQuestionId);
}
void byId;

// Distribution report.
const byCategory: Record<string, number> = {};
const byAudience: Record<string, number> = {};
const byRisk: Record<string, number> = {};
for (const q of questions) {
  byCategory[q.category] = (byCategory[q.category] ?? 0) + 1;
  byRisk[q.riskLevel] = (byRisk[q.riskLevel] ?? 0) + 1;
  for (const a of q.audiences) byAudience[a] = (byAudience[a] ?? 0) + 1;
}

const here = dirname(fileURLToPath(import.meta.url));
const outDir = resolve(here, "..", "content", "answer-engine");
mkdirSync(outDir, { recursive: true });
const out = {
  generatedBy: "scripts/build-answer-registry.ts",
  wave: 0,
  note: "Canonical question registry (classification only). No answer bodies; nothing published or indexable.",
  locales: ANSWER_ENGINE_LOCALES,
  count: questions.length,
  categoryMinimums: CATEGORY_MIN,
  distributionByCategory: byCategory,
  questions,
};
writeFileSync(resolve(outDir, "question-registry.json"), JSON.stringify(out, null, 2) + "\n", "utf8");

// eslint-disable-next-line no-console
console.log(`answer-registry: wrote ${questions.length} questions.`);
for (const { key, min } of ANSWER_CATEGORIES) {
  const n = byCategory[key] ?? 0;
  // eslint-disable-next-line no-console
  console.log(`  ${n >= min ? "OK " : "!! "}${key}: ${n}/${min}`);
}
// eslint-disable-next-line no-console
console.log("  risk:", byRisk);
