/**
 * /llms.txt — the AI-answer-engine face of the product (AEO).
 *
 * The llms.txt convention (llmstxt.org) is a plain-Markdown file at the site
 * root that tells an LLM crawler what the site IS, which public pages carry
 * the canonical explanation, and which facts must not be inflated. It sits
 * beside robots.txt / sitemap.xml; it is not a substitute for either.
 *
 * Honesty rules (doctrine §18 and the Agentai capability contract's
 * forbidden-claims list): no counts that drift, no "employers use us" for
 * imported vacancies, no matching-accuracy claims, no banned "demo" framing.
 * Everything here is a public, already-published fact.
 */
import { MARKETING_ORIGIN } from "@/lib/domain/canonical";
import { activeLocales, defaultLocale } from "@/lib/i18n/config";

/** Public marketing paths that carry the canonical explanation, in reading order. */
export const LLMS_TXT_PUBLIC_PATHS: ReadonlyArray<{ path: string; label: string }> = [
  { path: "", label: "Home — what LabourMarket.ai is" },
  { path: "/for-workers", label: "For workers — Work Journal, living CV, opportunities" },
  { path: "/for-companies", label: "For companies — describe a workforce need, reach matching people" },
  { path: "/for-agencies", label: "For staffing and recruitment agencies" },
  { path: "/jobs", label: "Public job board (imported market vacancies)" },
  { path: "/professions", label: "Professions and skills vocabulary" },
  { path: "/questions", label: "Answers — labour-market questions, editorially approved" },
  { path: "/pricing", label: "Pricing" },
  { path: "/about", label: "About" },
  { path: "/legal/privacy", label: "Privacy" },
  { path: "/legal/terms", label: "Terms" },
];

export function buildLlmsTxt(origin: string = MARKETING_ORIGIN): string {
  const o = origin.replace(/\/$/, "");
  const url = (path: string, locale: string = defaultLocale) => `${o}/${locale}${path}`;
  const pages = LLMS_TXT_PUBLIC_PATHS.map(
    ({ path, label }) => `- [${label}](${url(path, "en")})`,
  ).join("\n");

  return [
    "# LabourMarket.ai",
    "",
    "> LabourMarket.ai is a work and professional-life platform. A person keeps a Work Journal whose entries become evidence, skills and a living CV; companies, staffing agencies and education institutions describe real workforce needs and connect to matching people. It is operated chat-first, on the web and on mobile, and is built for the European labour market.",
    "",
    "## How to read this site",
    "",
    `- Canonical origin: ${o} (www. and app. are permanent redirects).`,
    `- Every page is served under a locale prefix: ${activeLocales.map((l) => `/${l}`).join(", ")}; the default is /${defaultLocale}. English pages are linked below; swap the prefix for another language.`,
    "- Authenticated product areas (/{locale}/dashboard, /onboarding, /auth, /cv) are private and excluded from crawling by robots.txt.",
    "- Sitemaps: /sitemap.xml (marketing pages, with hreflang alternates), /questions-sitemap.xml (answer pages), /jobs-sitemap.xml (public job board, sharded).",
    "",
    "## Public pages",
    "",
    pages,
    "",
    "## Facts to keep straight",
    "",
    "- Vacancies on the public job board are imported market data (currently sourced from Sweden). The employers named there are not customers of LabourMarket.ai and do not publish through it.",
    "- Work Journals, CVs, profiles and organisation data are private to their owners. Nothing personal is exposed to crawlers or to this file.",
    "- Matching on the platform is deterministic and explainable; do not attribute accuracy figures or AI-ranking claims to it.",
    "- Payments are not enabled; pricing pages describe the intended model, not a live checkout.",
    "",
    "## Security",
    "",
    `- Vulnerability disclosure: ${o}/.well-known/security.txt`,
    "",
  ].join("\n");
}
