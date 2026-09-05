import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { REQUIREMENT_LEDGER_CANDIDATE_LIMIT, REQUIREMENT_LEDGER_ROUTES } from "@/lib/player-card/requirement-ledger";

/**
 * REQUIREMENT LEDGER guards (frozen design contract 2026-09-05 §5 P3, §9 rows
 * 1–2; owner contract §12 / §16 / §17 and the §1b scale rule).
 *
 * The ledger is ONE contextual read model over EXISTING derivers and reads:
 *   - no second readiness model: states come from `deriveDocumentStatus`, the
 *     checklist → document-type bridge, the engine's skill fit and the
 *     profession mirror; nothing re-derives a validity window;
 *   - bounded reads under the caller's RLS: never the service role, every
 *     candidate read limited, `marketplace_listings` (TARGET scope) never read;
 *   - the READINESS write domain stays in its lane: no edit to CONV, no import
 *     from `lib/conversation` — the chat wiring is that lane's later work;
 *   - one visual consumer, real routes, active-locale copy.
 */
const WEB = join(__dirname, "..", "..");
const read = (rel: string) => readFileSync(join(WEB, rel), "utf8");
const stripComments = (src: string): string => src.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/[^\n]*/g, "$1");

const PURE = read("lib/player-card/requirement-ledger.ts");
const SERVER = read("lib/player-card/requirement-ledger-server.ts");
const COMPONENT = read("components/app/instruction-project-asks.tsx");
const PAGE = read("app/[locale]/dashboard/instructions/page.tsx");
const ACCESS = read("lib/projects/worker-project-access.ts");

describe("no second readiness model — the ledger derives from the existing derivers", () => {
  it("the pure model imports the existing document deriver and the checklist → document-type bridge, and never re-derives a validity window", () => {
    expect(PURE).toContain('import { deriveDocumentStatus, type RequirementRow, type WorkerDocumentRow } from "@/lib/documents/readiness";');
    expect(PURE).toContain('import { documentTypesForReadinessItem } from "@/lib/projects/readiness-items";');
    expect(PURE).toContain('import { inventoryHref } from "@/lib/documents/document-centre-model";');
    const code = stripComments(PURE);
    expect(code).not.toMatch(/T23:59:59|DOCUMENT_EXPIRING_WINDOW_DAYS|86_?400_?000|getTime\(\)/);
    expect(code).not.toMatch(/\.from\(|\.rpc\(|createClient|fetch\(/);
    expect(code).not.toMatch(/score|percent|rating|stars?\b/i);
  });

  it("the server read composes the named existing reads (documents page, own checklist, own assignment, the ONE worker_skills read, own languages, the gated board, the profession mirror)", () => {
    for (const imp of [
      'import { getWorkerSkillRows } from "@/lib/data/worker-core";',
      'import { listMyDocuments, type DocumentsListResult } from "@/lib/documents/readiness";',
      'import { loadWorkerOpportunities } from "@/lib/opportunities/load-worker-opportunities";',
      'import { skillsForProfession } from "@/lib/taxonomy/profession-skills";',
      'import { getOwnWorkerLanguages } from "@/lib/worker/worker-languages";',
      "getOwnWorkerId,",
      "getWorkerProjectView,",
      "listOwnReadinessItems,",
      "LEDGER_READINESS_STATUSES,",
    ]) {
      expect(SERVER).toContain(imp);
    }
    // Own rows are read through those reads only — never a direct table read.
    const code = stripComments(SERVER);
    expect(code).not.toMatch(/\.from\("worker_documents"\)|\.from\("worker_skills"\)|\.from\("worker_languages"\)|\.from\("project_worker_readiness_items"\)|\.from\("customer_requests"\)/);
  });

  it("the existing checklist read is EXTENDED (optional statuses), its default stays the open rows only, and its anchors for the privacy guard are intact", () => {
    expect(ACCESS).toContain('const OPEN_READINESS_STATUSES = ["needed", "missing", "rejected", "expired"] as const;');
    expect(ACCESS).toContain('export const LEDGER_READINESS_STATUSES = ["needed", "missing", "received", "checked", "rejected", "expired"] as const;');
    expect(ACCESS).toContain(".in(\"status\", [...(options?.statuses ?? OPEN_READINESS_STATUSES)])");
    expect(ACCESS).toMatch(/\.eq\("worker_id", workerId\)/);
    expect(ACCESS).not.toContain('"not_required"');
  });
});

describe("bounded reads under the caller's RLS — never the service role, never the TARGET marketplace", () => {
  it("no admin / service-role client anywhere on the path", () => {
    for (const [name, src] of [["server", SERVER], ["pure", PURE], ["page", PAGE], ["component", COMPONENT]] as const) {
      expect(src, name).not.toMatch(/createAdminClient|service_role|SUPABASE_SERVICE_ROLE|supabase\/admin/);
    }
    expect(SERVER).toContain('import "server-only";');
    expect(SERVER).toContain('import { createClient } from "@/lib/supabase/server";');
  });

  it("every candidate read is limited to the pinned bound, filtered on the row's own status column, and there is no marketplace_listings read (§1.6 — no P0 category exists there; a covering partial index is a follow-up migration, not a claim this guard makes)", () => {
    const code = stripComments(SERVER);
    expect(REQUIREMENT_LEDGER_CANDIDATE_LIMIT).toBeLessThanOrEqual(20);
    const froms = [...code.matchAll(/\.from\("([a-z_]+)"\)/g)].map((m) => m[1]);
    expect(froms.sort()).toEqual(["service_offerings", "training_assignments", "training_programs"]);
    expect(code).not.toContain("marketplace_listings");
    const limits = [...code.matchAll(/\.limit\(([^)]+)\)/g)].map((m) => m[1]);
    expect(limits).toHaveLength(3);
    for (const l of limits) expect(l).toBe("REQUIREMENT_LEDGER_CANDIDATE_LIMIT");
    expect(code).toMatch(/\.from\("training_programs"\)[\s\S]*?\.eq\("is_active", true\)/);
    expect(code).toMatch(/\.from\("training_assignments"\)[\s\S]*?\.eq\("assignee_profile_id", profileId\)/);
    expect(code).toMatch(/\.from\("service_offerings"\)[\s\S]*?\.eq\("status", "active"\)/);
  });

  it("the ledger is readable only for the caller's OWN worker row — another personId is answered not-own, never partially", () => {
    expect(SERVER).toContain("if (args.personId !== ownWorkerId) return { kind: \"not-own\" };");
    const fn = SERVER.slice(SERVER.indexOf("export async function loadRequirementLedger"));
    expect(fn.indexOf('return { kind: "not-own" }')).toBeLessThan(fn.indexOf("getWorkerProjectView("));
  });

  it("shared person reads are request-cached so several contexts on one page cost one read each (no N+1)", () => {
    expect(SERVER).toContain('import { cache } from "react";');
    for (const fn of ["cachedDocuments", "cachedLanguages", "cachedTrainingCandidates", "cachedServiceCandidates", "cachedOpportunities"]) {
      expect(SERVER).toMatch(new RegExp(`const ${fn} = cache\\(`));
    }
    expect(PAGE).toContain("const LEDGER_PROJECT_LIMIT = 5;");
  });
});

describe("write-domain lane: READINESS only — no CONV edit, no CONV import", () => {
  it("neither ledger module imports from lib/conversation or components/app/conversation", () => {
    for (const src of [PURE, SERVER, COMPONENT]) {
      expect(src).not.toMatch(/from "@\/lib\/conversation\//);
      expect(src).not.toMatch(/from "@\/components\/app\/conversation\//);
    }
  });

  it("the resolutions point at the SAME routes the readiness steps already use, and the add-document action is the documents centre's own inventory href", () => {
    const STEPS = read("lib/player-card/readiness-steps.ts");
    expect(STEPS).toContain(`href: "${REQUIREMENT_LEDGER_ROUTES.journal}"`);
    expect(STEPS).toContain(`href: "${REQUIREMENT_LEDGER_ROUTES.profile}"`);
    expect(REQUIREMENT_LEDGER_ROUTES.messages).toBe("/dashboard/communication");
    expect(PURE).toContain("href: inventoryHref({ type: slug, country: input.country }),");
  });
});

describe("one visual consumer — the instructions page, ordinary words, honest fallback, accessible targets", () => {
  it("the page loads the ledger per instruction project and hands it to the SAME asks component (the asks stay the fallback)", () => {
    expect(PAGE).toContain('import { loadOwnProjectLedgers } from "@/lib/player-card/requirement-ledger-server";');
    expect(PAGE).toContain("ledgers = await loadOwnProjectLedgers(");
    expect(PAGE).toContain("ledger={ledgers.get(ins.projectId) ?? null}");
    // The helper resolves the caller's OWN worker id once and loads each project through the one read.
    expect(SERVER).toMatch(/const personId = await getOwnWorkerId\(\);[\s\S]*loadRequirementLedger\(\{ personId, context: \{ kind: "project", projectId, conversationId \} \}\)/);
    expect(SERVER).toContain("export const OWN_PROJECT_LEDGERS_LIMIT = 5;");
    expect(PAGE).toContain("loadOwnProjectAsks(read.instructions.map((i) => i.projectId)");
    expect(COMPONENT).toContain('href="/dashboard/documents"');
    expect(COMPONENT).toContain('data-testid="instruction-project-asks-record"');
  });

  it("state is never colour alone (a mark + the word + a data attribute); resolutions are real links with ≥ 44 px targets and a focus ring", () => {
    expect(COMPONENT).toMatch(/const STATE_MARK: Record<RequirementLedgerRow\["state"\], string> = \{\s*valid: "✓",\s*expiring: "!",\s*missing: "–",\s*unknown: "\?",/);
    expect(COMPONENT).toContain("data-state={row.state}");
    expect(COMPONENT).toContain("{labels.state[row.state]}");
    expect(COMPONENT).toMatch(/const ACTION_LINK =\s*"inline-flex min-h-11[^"]*focus-visible:ring-2/);
    expect(COMPONENT).toContain('rel="noreferrer noopener"');
  });

  it("no architecture vocabulary and no banned words reach the person; the copy lands in every active locale with the same keys", () => {
    const REQUIRED_KEYS = [
      "ratio",
      "availability",
      "state.valid",
      "state.expiring",
      "state.missing",
      "state.unknown",
      "level.recommended",
      "level.conditional",
      "why.project_checklist",
      "why.country_requirement",
      "why.employer_demand",
      "why.profession",
      "from.ownDocument",
      "from.ownDocumentUntil",
      "from.ownSkill",
      "from.ownSkillConfirmed",
      "from.ownLanguage",
      "from.ownProfile",
      "from.manager",
      "from.notReadable",
      "from.none",
      "managerStatus.needed",
      "managerStatus.missing",
      "managerStatus.received",
      "managerStatus.checked",
      "managerStatus.rejected",
      "managerStatus.expired",
      "resolution.addDocument",
      "resolution.issuingAuthority",
      "resolution.trainingProgram",
      "resolution.serviceOffering",
      "resolution.serviceOfferingRate",
      "resolution.addEvidence",
      "resolution.setAvailability",
      "resolution.ask",
      "resolutionWhy.assignedToYou",
      "resolutionWhy.nameMatches",
      "rejected",
    ];
    const get = (obj: unknown, path: string): unknown => path.split(".").reduce<unknown>((o, k) => (o && typeof o === "object" ? (o as Record<string, unknown>)[k] : undefined), obj);
    for (const locale of ["lt", "en", "ru", "nl", "de"]) {
      const ledger = get(JSON.parse(read(`messages/${locale}.json`)), "instructions.card.ledger");
      expect(ledger, locale).toBeDefined();
      for (const key of REQUIRED_KEYS) {
        const v = get(ledger, key);
        expect(typeof v, `${locale}: ${key}`).toBe("string");
        expect((v as string).trim().length, `${locale}: ${key}`).toBeGreaterThan(0);
        expect(v as string, `${locale}: ${key}`).not.toMatch(/demo|ledger|RLS|RPC|dispatcher|workspace|roster|readiness model/i);
      }
      expect(get(ledger, "ratio")).toMatch(/\{have\}[\s\S]*\{total\}/);
      expect(get(ledger, "rejected")).toContain("{count}");
      expect(get(ledger, "why.country_requirement")).toContain("{country}");
    }
  });
});
