import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * No-disclaimer worker UI guard (fix/cv).
 *
 * Normal users must NOT see explanatory/system/disclaimer/provenance paragraphs
 * about: rule-based dictionary, AI / not-AI, suggestions becoming facts,
 * automatic saving, confirmation/verification process, provenance/source, the
 * pipeline, or who confirms what. The worker-facing journal / CV / composer
 * surface shows short labels + status + actions only.
 *
 * Scope: the worker-facing message subtree this PR owns (journal namespace,
 * journalSkillLinks, the journal-composer structuring keys) + the component
 * source that renders it. Distinctive forbidden phrases are scanned (not generic
 * words like "source", which appear legitimately elsewhere).
 */

const web = join(__dirname, "..", "..");
const read = (rel: string) => readFileSync(join(web, rel), "utf8");
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const base = (loc: string) => JSON.parse(read(`messages/${loc}.json`)) as Record<string, any>;
const journalNs = (loc: string) => JSON.parse(read(`messages/${loc}/journal.json`)) as Record<string, unknown>;

const LOCS = ["lt", "en", "ru"] as const;

// Distinctive forbidden user-facing EXPLANATION phrases (scanned in message
// VALUES and in rendered component text).
const FORBIDDEN_PHRASES: RegExp[] = [
  /kol kas naudojame/i,
  /paprastą žodyną/i,
  /dirbtinį intelektą/i,
  /netampa faktais/i,
  /neišsaugoma automatiškai/i,
  /Patvirtinkite tik tai/i,
  /nepatvirtinti neišsaugomi/i,
  /Tai pasiūlymas/i,
  /pasiūlymas iš jūsų teksto/i,
  /Patvirtinimas atsiras/i,
  /Patvirtinti gali/i,
  /gali patvirtinti/i,
  /vadovas ar klientas/i,
  /vartotojo pateikti įgūdžiai/i,
  /darbuotojo pateikti įgūdžiai/i,
  // CV-evidence-card confirmer/process wording (fix/cv final cleanup):
  /who can confirm/i,
  /confirmed by/i,
  /\bverifier\b/i,
  /patvirtina žmogus/i,
  /Patvirtinta vadov/i,
  /Laukia vadov/i,
  /Awaiting manager/i,
  /Confirmed by manager/i,
  // CV-tier surface (fix/cv final): status only, never who confirmed it.
  /manager[\s-]?confirmed/i,
  /confirmed by .{0,5}manager/i,
  /vadovo patvirtin/i,
  /\bprovenance\b/i,
];
// Raw source-taxonomy enum identifiers — forbidden only in user-visible message
// VALUES. In component CODE they are legitimate type values / map keys (the
// owner allows technical names in code, not UI), so they are NOT scanned in source.
const FORBIDDEN_ENUMS: RegExp[] = [
  /\bself_declared\b/,
  /\brecognized_from_text\b/,
  /\bmanually_linked_to_entry\b/,
  /\bconfirmed_by_person\b/,
  /\bstale_needs_review\b/,
  /\bprofile_skill_available_to_link\b/,
];
const FORBIDDEN_VALUE = [...FORBIDDEN_PHRASES, ...FORBIDDEN_ENUMS];

function values(obj: unknown, out: string[] = []): string[] {
  if (typeof obj === "string") out.push(obj);
  else if (Array.isArray(obj)) obj.forEach((v) => values(v, out));
  else if (obj && typeof obj === "object") for (const v of Object.values(obj)) values(v, out);
  return out;
}

describe("Guard: no explanatory/disclaimer text in worker-facing journal/CV copy", () => {
  for (const loc of LOCS) {
    it(`${loc}: journal + journalSkillLinks + composer-structuring values carry no forbidden phrase`, () => {
      const b = base(loc);
      const subtrees: unknown[] = [
        journalNs(loc),
        b.journalSkillLinks,
        b.structuring?.groupEyebrow,
        b.structuring?.buckets,
        b.profileHub?.journalLink,
        b.profileHub?.pillars?.journal,
        b.workerEvidence, // CV-evidence-card surface
        b.cvExport?.tiers, // CV-tier labels surface
        b.cvExport?.summary, // CV summary stat labels
      ];
      const all = subtrees.flatMap((s) => values(s));
      const offenders = all.filter((v) => FORBIDDEN_VALUE.some((rx) => rx.test(v)));
      expect(offenders, `${loc} forbidden disclaimer text: ${offenders.join(" | ")}`).toEqual([]);
    });
  }
});

describe("Guard: the worker composer/page no longer renders the disclaimer keys", () => {
  const sources = [
    "components/app/journal-entry-composer.tsx",
    "app/[locale]/dashboard/journal/page.tsx",
    "components/app/journal-entry-skill-links.tsx",
    "components/app/text-first-composer.tsx",
    "components/app/profile-text-first-flow.tsx",
    "components/app/worker-evidence-card.tsx",
  ];
  const REMOVED_KEYS = [
    "ruleBasedNotice",
    "suggestionReviewIntro",
    "classifyLater",
    "skillProvenanceNote",
    "benefitNotAuto",
  ];
  for (const rel of sources) {
    it(`${rel} renders none of the removed disclaimer keys`, () => {
      const src = read(rel);
      for (const k of REMOVED_KEYS) {
        expect(src.includes(`"${k}"`), `${rel} still references ${k}`).toBe(false);
      }
      expect(src).not.toMatch(/SuggestionProvenanceLabel/);
    });
    it(`${rel} renders no forbidden EXPLANATION literal text`, () => {
      // Strip JS comments first — code comments are not user-facing, and may
      // legitimately mention "who can confirm" etc. while documenting the
      // removal. Enum identifiers are also legitimate code, not UI.
      const src = read(rel)
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/(^|[^:])\/\/.*$/gm, "$1");
      const hit = FORBIDDEN_PHRASES.find((rx) => rx.test(src));
      expect(hit, `${rel} renders forbidden literal: ${hit}`).toBeUndefined();
    });
  }
});
