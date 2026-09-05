import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

/**
 * P2/P6 SAFE-PILOT SUBSET GUARD (frozen design contract 2026-09-05 §2.9, §5
 * P2 + P6-subset; design system F "K1 passport with an edge", M; scorecard
 * X.22 "no internal architecture vocabulary", X.28 "gold only for a
 * confirmation").
 *
 * Pins four things the subset must keep true:
 *
 *   1. ONE CARD — the chat's "Mano kortelė" result renders the SAME canonical
 *      `WorkerPlayerCard`; the person's provenance edge is mounted there and
 *      nowhere else in the person-card family, with a DERIVED class (never a
 *      hard-coded EMPLOYER_CONFIRMED), always paired with its text equivalent.
 *   2. DERIVED, NOT STORED — the provenance module is pure (no IO); the card
 *      model derives the class from canonical rows (`journal_entry_confirmations`
 *      on the person's own entries, `worker_skills.verified`, own entries /
 *      documents); no migration or generated type stores a provenance class.
 *   3. WORDS — no forbidden term; "confirmed by" only on the EMPLOYER_CONFIRMED
 *      keys; every other class says it is not yet confirmed; chat render
 *      places never fall back to a raw id fragment.
 *   4. I18N — every new key exists in all five active locales, non-empty,
 *      with the same ICU placeholders, and no non-English value is byte-
 *      identical to English.
 */

const ROOT = join(__dirname, "..", "..");
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8");
const ACTIVE = ["lt", "en", "ru", "nl", "de"] as const;

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(entry) && !/\.test\.tsx?$/.test(entry)) out.push(p);
  }
  return out;
}
const rel = (abs: string) => relative(ROOT, abs).replace(/\\/g, "/");

const CARD = read("components/app/worker-player-card.tsx");
const EDGE = read("components/app/provenance/provenance-edge.tsx");
const MODEL = read("lib/player-card/player-card.ts");
const LABELS = read("lib/player-card/labels.ts");
const PURE = read("lib/evidence/provenance.ts");
const RESULT = read("components/app/workspace/player-card-result.tsx");
const SAMPLE = read("lib/player-card/sample-card.ts");

const messages = Object.fromEntries(
  ACTIVE.map((l) => [l, JSON.parse(read(`messages/${l}.json`)) as Record<string, unknown>]),
) as Record<(typeof ACTIVE)[number], Record<string, unknown>>;
const provenanceOf = (l: (typeof ACTIVE)[number]) =>
  (messages[l].provenance ?? {}) as Record<string, string>;
const chatOf = (l: (typeof ACTIVE)[number]) =>
  ((messages[l].conversation as Record<string, unknown>).chat ?? {}) as Record<string, string>;

const PROVENANCE_KEYS = [
  "label",
  "selfDeclared",
  "evidenceRecorded",
  "evidenceEntries",
  "evidenceDocument",
  "evidenceEntriesAndDocument",
  "employerConfirmed",
  "employerConfirmedNoDate",
  "systemDerived",
] as const;
const CHAT_KEYS = ["unnamedPerson", "unnamedNeed", "readinessDerivedNote"] as const;

describe("1. ONE card, ONE edge", () => {
  it("the chat's 'Mano kortelė' result renders the canonical WorkerPlayerCard — no second card", () => {
    expect(RESULT).toMatch(/import \{ WorkerPlayerCard \} from "@\/components\/app\/worker-player-card"/);
    expect(RESULT).toMatch(/<WorkerPlayerCard/);
    const definitions = walk(join(ROOT, "components")).filter((f) =>
      /export function WorkerPlayerCard\(/.test(readFileSync(f, "utf8")),
    );
    expect(definitions.map(rel)).toEqual(["components/app/worker-player-card.tsx"]);
  });

  it("the card mounts the provenance edge with the DERIVED class and its text equivalent", () => {
    expect(CARD).toMatch(/<ProvenanceEdge provenanceClass=\{card\.provenance\.class\}/);
    expect(CARD).toMatch(/<ProvenanceLine[\s\S]*?provenanceClass=\{card\.provenance\.class\}[\s\S]*?testid="player-card-provenance"/);
    expect(CARD).toMatch(/data-provenance=\{card\.provenance\.class\}/);
    // The words ride with the class from ONE label builder, so edge and text
    // can never disagree.
    expect(LABELS).toMatch(/provenance: \{\s*class: card\.provenance\.class/);
    expect(LABELS).toMatch(/provenanceTextKey\(card\.provenance\)/);
  });

  it("no component hard-codes an EMPLOYER_CONFIRMED edge — the class is always a derived value", () => {
    const offenders = walk(join(ROOT, "components")).filter((f) =>
      /provenanceClass=(?:"EMPLOYER_CONFIRMED"|\{\s*"EMPLOYER_CONFIRMED"\s*\})/.test(readFileSync(f, "utf8")),
    );
    expect(offenders.map(rel)).toEqual([]);
  });

  it("the gold edge material is spelled ONCE in the person-card family (provenance-edge.tsx)", () => {
    const family = [
      "components/app/worker-player-card.tsx",
      "components/app/workspace/player-card-result.tsx",
      ...walk(join(ROOT, "components", "app", "player-card")).map(rel),
      ...walk(join(ROOT, "components", "visual")).map(rel),
    ];
    for (const f of family) {
      expect(read(f), f).not.toMatch(/trust-accent|tier-gold/);
    }
    expect(EDGE).toMatch(/EMPLOYER_CONFIRMED: "border-solid border-trust-accent"/);
    // The other classes are NOT gold: dashed grey, cyan, dotted grey.
    expect(EDGE).toMatch(/SELF_DECLARED: "border-dashed border-ink-500"/);
    expect(EDGE).toMatch(/EVIDENCE_SUPPORTED: "border-solid border-brand-cyan"/);
    expect(EDGE).toMatch(/SYSTEM_DERIVED: "border-dotted border-ink-500"/);
  });

  it("the edge is never the only signal: the edge is aria-hidden and the line exposes the class as data", () => {
    expect(EDGE).toMatch(/aria-hidden[\s\S]*?data-provenance-edge=\{provenanceClass\}/);
    expect(EDGE).toMatch(/data-provenance=\{provenanceClass\}/);
  });
});

describe("2. derived, not stored", () => {
  it("lib/evidence/provenance.ts is pure — no IO, no clock, no copy", () => {
    expect(PURE).not.toMatch(/supabase|server-only|fetch\(|next\/headers|next-intl|Date\.now|new Date\(\)/);
    expect(PURE).toMatch(/export function deriveProvenance\(/);
    // It composes the ONE evidence-tier ladder and the journal's latest-wins
    // review rule — never a second interpretation of a row.
    expect(PURE).toMatch(/deriveEvidenceTier/);
    expect(PURE).toMatch(/deriveReviewResult/);
  });

  it("the card model derives the class from canonical rows the card already counts", () => {
    expect(MODEL).toMatch(/provenance: deriveProvenance\(\{/);
    expect(MODEL).toMatch(/\.from\("journal_entry_confirmations"\)/);
    // Bounded, indexed, own rows only (owner scale constraint §1b).
    expect(MODEL).toMatch(/journal_entries!inner\(worker_id/);
    expect(MODEL).toMatch(/\.eq\("journal_entries\.worker_id", workerId\)/);
    expect(MODEL).toMatch(/\.limit\(PROVENANCE_CONFIRMATION_LIMIT\)/);
    // The confirming organisation is a LEFT join: unreadable → null → dash.
    expect(MODEL).toMatch(/engagement_contexts\(organizations\(display_name, legal_name\)\)/);
    expect(MODEL).not.toMatch(/engagement_contexts!inner/);
  });

  it("no migration and no generated type stores a provenance class column", () => {
    const dir = join(ROOT, "..", "..", "supabase", "migrations");
    const hits = readdirSync(dir)
      .filter((f) => f.endsWith(".sql"))
      .filter((f) => /provenance_class/i.test(readFileSync(join(dir, f), "utf8")));
    expect(hits).toEqual([]);
    expect(read("lib/supabase/types.ts")).not.toMatch(/provenance_class/);
  });

  it("the public sample card goes through the SAME derivation (no prettier marketing class)", () => {
    expect(SAMPLE).toMatch(/provenance: deriveProvenance\(\{/);
    expect(SAMPLE).not.toMatch(/class: "EMPLOYER_CONFIRMED"/);
  });
});

describe("3. words", () => {
  it("provenance and chat additions carry no forbidden term", () => {
    for (const l of ACTIVE) {
      for (const [k, v] of Object.entries(provenanceOf(l))) {
        expect(v, `${l}.provenance.${k}`).not.toMatch(/demo|демо/i);
      }
      for (const k of CHAT_KEYS) {
        expect(chatOf(l)[k], `${l}.conversation.chat.${k}`).not.toMatch(/demo|демо/i);
      }
    }
  });

  it("EN: 'confirmed by' only on the EMPLOYER_CONFIRMED keys; every other class says not yet confirmed", () => {
    const en = provenanceOf("en");
    for (const k of ["employerConfirmed", "employerConfirmedNoDate"]) {
      expect(en[k]).toMatch(/^Confirmed by /);
    }
    for (const k of ["selfDeclared", "evidenceRecorded", "evidenceEntries", "evidenceDocument", "evidenceEntriesAndDocument"]) {
      expect(en[k], k).toMatch(/not yet confirmed$/);
      expect(en[k], k).not.toMatch(/\bverified\b|confirmed by/i);
    }
    expect(en.systemDerived).toMatch(/^Derived from/);
  });

  it("chat render places never fall back to a raw id fragment (L1: ordinary words only)", () => {
    const files = walk(join(ROOT, "lib", "conversation"));
    for (const f of files) {
      expect(readFileSync(f, "utf8"), rel(f)).not.toMatch(/#\$\{\w+(?:\.\w+)*\.slice\(0, ?\d\)\}/);
    }
    expect(read("lib/conversation/capacity.ts")).toMatch(/t\("unnamedPerson"\)/);
    expect(read("lib/conversation/agency-workspace.ts")).toMatch(/tChat\("unnamedPerson"\)/);
    expect(read("lib/conversation/agency-workspace.ts")).toMatch(/tChat\("unnamedNeed"\)/);
  });

  it("the readiness answer marks its ratio as DERIVED (fact/derived marking, frozen design §1.7)", () => {
    const chat = read("components/app/conversation/chat/conversation-chat.tsx");
    expect(chat).toMatch(/readinessDerivedNote: string;/);
    expect(chat).toMatch(/res\.checklistTracked \? \[labels\.readinessDerivedNote\]/);
    expect(read("components/app/conversation/chat/labels.ts")).toMatch(/"readinessDerivedNote",/);
  });
});

describe("4. i18n — five active locales, same keys, same placeholders, no English identicals", () => {
  const placeholders = (v: string) =>
    [...v.matchAll(/\{(\w+)(?:,\s*plural)?/g)].map((m) => m[1]).sort().join(",");

  it("provenance namespace: same key set, non-empty in every active locale", () => {
    for (const l of ACTIVE) {
      const p = provenanceOf(l);
      expect(Object.keys(p).sort(), l).toEqual([...PROVENANCE_KEYS].sort());
      for (const k of PROVENANCE_KEYS) expect(p[k].trim().length, `${l}.${k}`).toBeGreaterThan(0);
    }
  });

  it("chat additions present and non-empty in every active locale", () => {
    for (const l of ACTIVE) {
      for (const k of CHAT_KEYS) {
        expect(typeof chatOf(l)[k] === "string" && chatOf(l)[k].trim().length > 0, `${l}.${k}`).toBe(true);
      }
    }
  });

  it("ICU placeholders match English in every locale", () => {
    const en = provenanceOf("en");
    for (const l of ACTIVE) {
      const p = provenanceOf(l);
      for (const k of PROVENANCE_KEYS) expect(placeholders(p[k]), `${l}.${k}`).toBe(placeholders(en[k]));
    }
  });

  it("no non-English value is byte-identical to English (no untranslated strings)", () => {
    const en = provenanceOf("en");
    const enChat = chatOf("en");
    for (const l of ACTIVE.filter((x) => x !== "en")) {
      for (const k of PROVENANCE_KEYS) expect(provenanceOf(l)[k], `${l}.provenance.${k}`).not.toBe(en[k]);
      for (const k of CHAT_KEYS) expect(chatOf(l)[k], `${l}.chat.${k}`).not.toBe(enChat[k]);
    }
  });
});
