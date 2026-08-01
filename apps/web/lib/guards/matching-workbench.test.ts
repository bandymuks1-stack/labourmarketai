import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Phase 3.2 Human-Run Matching Workbench guard.
 *
 * Pins the honesty + canonical-model invariants of the workbench:
 *  - admin gate first, on the existing RLS (no service-role, no new table);
 *  - the match is a HUMAN decision — no scoring/ranking/AI suggestion code;
 *  - the decision log is append-only inside the existing payload column;
 *  - copy is slug→JSON in ALL 10 locales, with the human-decision statement;
 *  - supply labels say "declared" honestly (never a bare fake "verified").
 */

const APP = join(__dirname, "..", "..");
const read = (rel: string): string => readFileSync(join(APP, rel), "utf8");
const stripComments = (s: string): string =>
  s.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\/\/[^\n]*/g, " ");

const LIB = "lib/admin/matching-workbench.ts";
const ACTION = "lib/admin/matching-workbench-actions.ts";
const PAGE = "app/[locale]/dashboard/admin/matching/page.tsx";
const REVIEW = "components/app/matching-workbench-review.tsx";
const LOCALES = ["en", "lt", "lv", "et", "nl", "de", "da", "no", "sv", "pl", "ru"];

describe("matching workbench — admin gate + canonical model", () => {
  it("page gates with requireSuperadmin before any data load", () => {
    const page = read(PAGE);
    const gate = page.indexOf("requireSuperadmin");
    const data = page.indexOf("listWorkbench");
    expect(gate).toBeGreaterThan(-1);
    expect(data).toBeGreaterThan(-1);
    expect(gate).toBeLessThan(data);
  });

  it("lib rides the existing canonical tables only (no new table, no RPC write)", () => {
    const code = stripComments(read(LIB));
    const fromCalls = [...code.matchAll(/\.from\("([a-z_]+)"\)/g)].map(
      (m) => m[1],
    );
    const allowed = new Set([
      "customer_requests",
      "workers",
      "worker_professions",
      "worker_skills",
      "journal_entries",
      "journal_entry_confirmations",
      // S6 (§19): the fit C set + need-label resolution ride the APPLIED
      // canonical ESCO layer — read-only catalogue tables, still no new
      // table and no RPC write. (candidate_skills was removed from this
      // allowlist in W5 slice 1: the zero-writer ghost join is gone.)
      "esco_skills",
      "esco_labels",
      // Wagon 4: the esco_uri→slug bridge (same derivation input scouting
      // uses) + the READ-ONLY temporary team adapter over the existing org
      // spine (organizations organization_type='team', engagement_contexts
      // 'employee') — replaced by Wagon 2's canonical read model on rebase.
      "skills",
      "organizations",
      "engagement_contexts",
    ]);
    expect(fromCalls.length).toBeGreaterThan(0);
    for (const t of fromCalls) expect(allowed.has(t), `table ${t}`).toBe(true);
    // The write is the existing admin RLS UPDATE — never an .rpc() write and
    // never a service-role client.
    expect(code).not.toMatch(/\.rpc\(/);
    expect(code).not.toMatch(/service_role|SERVICE_ROLE/);
    expect(code).toMatch(/from "@\/lib\/supabase\/server"/);
  });

  it("match log is append-only and marked as a human decision", () => {
    const code = stripComments(read(LIB));
    expect(code).toMatch(/match_log: \[\.\.\.log, entry\]/);
    expect(code).toMatch(/decided_via: "human"/);
    // Server-side timestamp, never read from the form.
    expect(code).toMatch(/decided_at: new Date\(\)\.toISOString\(\)/);
  });

  it("no scoring / ranking / automatic suggestion anywhere in the slice", () => {
    for (const rel of [LIB, ACTION, PAGE, REVIEW]) {
      const code = stripComments(read(rel)).toLowerCase();
      expect(code, `${rel} must not score`).not.toMatch(
        /match[_ ]?score|ranking|\bscore\b\s*[:=]/,
      );
      expect(code, `${rel} must not auto-suggest`).not.toMatch(
        /auto[_ -]?match|suggested[_ ]?worker/,
      );
    }
  });

  it("action returns tagged state (never throws raw errors to the client)", () => {
    const code = stripComments(read(ACTION));
    expect(code).toMatch(/"use server"/);
    expect(code).toMatch(/ok: false, code: "not_admin"/);
    expect(code).not.toMatch(/throw new Error/);
  });
});

describe("matching workbench — copy honesty in all 10 locales", () => {
  for (const locale of LOCALES) {
    it(`${locale}.json carries the admin.matching namespace`, () => {
      const json = JSON.parse(read(`messages/${locale}.json`)) as {
        admin?: { matching?: Record<string, unknown>; hub?: Record<string, string> };
      };
      expect(json.admin?.matching, "admin.matching missing").toBeTruthy();
      expect(json.admin?.hub?.matching, "admin.hub.matching missing").toBeTruthy();
      const m = json.admin!.matching as { humanNote?: string };
      expect(typeof m.humanNote).toBe("string");
    });
  }

  it("LT + EN state the human-decision principle explicitly", () => {
    const lt = JSON.parse(read("messages/lt.json")).admin.matching
      .humanNote as string;
    const en = JSON.parse(read("messages/en.json")).admin.matching
      .humanNote as string;
    expect(lt).toMatch(/žmogaus, ne algoritmo/);
    expect(en).toMatch(/human, not an algorithm/);
  });

  it("supply labels say declared honestly (no bare verified claim)", () => {
    const en = JSON.parse(read("messages/en.json")).admin.matching.supply as {
      skillsDeclared: string;
      skillsConfirmed: string;
    };
    expect(en.skillsDeclared.toLowerCase()).toContain("declared");
    // Confirmed label reflects the real manager-confirmed flag — and the page
    // colors it success ONLY when the count is > 0 (checked below).
    const page = read(PAGE);
    expect(page).toMatch(/w\.skillsConfirmed > 0\s*\?\s*"text-state-success"/);
    expect(page).toMatch(/w\.managerConfirmations > 0\s*\?\s*"text-state-success"/);
  });

  it("page renders the human-note banner + the TASK 07.4 final-skin marker", () => {
    const page = read(PAGE);
    expect(page).toMatch(/data-testid="admin-matching-human-note"/);
    // TASK 07.4 delivered the final DRAFT-board skin — the preview marker is
    // gone and must NOT come back; the human-decision rule stays in the skin.
    expect(page).toMatch(/TASK 07\.4 final skin/);
    expect(page).not.toMatch(/bus pakeistas TASK 07/);
  });
});

describe("canonical engine on the workbench — stays §7/§19-honest (Wagon 4)", () => {
  it("the duplicate shortlist engine is deleted and the ONE engine runs instead", () => {
    // Deletion evidence + old-vs-new proofs live in
    // lib/guards/matching-consolidation.test.ts; this pins the page wiring.
    const page = read(PAGE);
    expect(page).toMatch(/from "@\/lib\/market\/match-v1"/);
    expect(page).toMatch(/matchWorkerToNeed\(/);
    expect(page).toMatch(/compareMatches\(/);
    expect(page).not.toMatch(/match-suggestions|buildMatchSuggestions/);
  });

  it("no composite numeric score is rendered as a fact; % only with its basis", () => {
    const page = read(PAGE);
    expect(page).not.toMatch(/\{\s*s\.score|matchScore|fitScore/);
    // The engine's skill-fit % always renders with the fit.basis line.
    expect(page).toMatch(/match\.skillFit\.pct/);
    expect(page).toMatch(/matched: match\.skillFit\.matchedTotal/);
  });

  it("start-conversation reuses the canonical messaging entry", () => {
    const page = read(PAGE);
    expect(page).toMatch(
      /from "@\/lib\/communication\/open-conversation-action"/,
    );
    expect(page).toMatch(/action=\{openDirectConversationAction\}/);
    // The transparent-ordering statement is shown to the human.
    expect(page).toMatch(/engine\.humanRule/);
  });

  it("engine + team copy exists in all locales", () => {
    for (const locale of LOCALES) {
      const json = JSON.parse(read(`messages/${locale}.json`)) as {
        admin?: {
          matching?: {
            engine?: { humanRule?: string; authorMarked?: string; status?: Record<string, string> };
            team?: { notReadable?: string; coverage?: string };
            missing?: { worker?: string; demand?: string };
          };
        };
      };
      const m = json.admin?.matching;
      expect(m?.engine?.humanRule, `${locale} engine.humanRule`).toBeTruthy();
      expect(m?.engine?.authorMarked, `${locale} engine.authorMarked`).toBeTruthy();
      expect(m?.engine?.status?.insufficient_data, `${locale} engine.status`).toBeTruthy();
      expect(m?.team?.notReadable, `${locale} team.notReadable`).toBeTruthy();
      expect(m?.team?.coverage, `${locale} team.coverage`).toBeTruthy();
      expect(m?.missing?.worker, `${locale} missing.worker`).toBeTruthy();
    }
  });

  it("team matching consumes the FROZEN Wagon-2 contract, read-only, with honest states", () => {
    const page = read(PAGE);
    expect(page).toMatch(/matchTeamToNeed\(/);
    expect(page).toMatch(/team\.notReadable/);
    // The matching layer itself never reads org tables — the engine takes
    // the TeamMatchInputV1 contract (temporary adapter fills it in the lib).
    const engine = stripComments(read("lib/market/match-team-v1.ts"));
    expect(engine).not.toMatch(/supabase|\.from\(|\.rpc\(|fetch\(|createClient/);
    const contract = read("lib/market/team-match-contract.ts");
    for (const field of [
      "teamId",
      "activeMemberCount",
      "deployableSize",
      "professionComposition",
      "skillComposition",
      "languageComposition",
      "certificationCoverage",
      "destinationCountries",
      "accommodationNeeded",
      "memberConsentCompleteness",
      "dataFreshness",
      "visibilityState",
    ]) {
      expect(contract, `contract field ${field}`).toContain(field);
    }
  });
});
