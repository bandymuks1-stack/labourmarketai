import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import {
  CONVERSATION_ACTIONS,
  getConversationAction,
} from "@/lib/conversation/action-registry";
import {
  CONVERSATION_RESULTS,
  canRenderInline,
  getResult,
  resultForAction,
} from "@/lib/conversation/result-registry";
import { ENGAGEMENT_ACTION_SCHEMAS } from "@/lib/engagements/engagement-schemas";
import { authorizeDispatch } from "@/lib/conversation/dispatch-core";
import { roleContextForAction } from "@/lib/conversation/action-role-context";
import type { Role } from "@/lib/auth/actions";

/**
 * §7.1 — BOOKING ENGAGEMENT END. The invariants this slice must not lose.
 *
 * The defect being closed is not a bug in a function; it is a CAPABILITY WITH
 * NO DOOR. `end_company_worker_engagement_v1` has been applied in production
 * since 20260723120000 and had zero client callers — nobody could reach it.
 * Most of what follows therefore pins SHAPE (one id, one executor, one RPC,
 * one renderer) rather than behaviour, because shape is what rots first: the
 * cheapest way to break this is to add a second, side-specific path beside it.
 */

const WEB = join(__dirname, "..", "..");
const read = (...p: string[]) => readFileSync(join(WEB, ...p), "utf8");

/**
 * Strip TS/JS comments before scanning for a forbidden reference.
 *
 * These modules are heavily commented, and the comments NAME the very things
 * the guards below forbid — "there is no `project_id` at any hop",
 * "`end_company_worker_engagement_v1` had zero callers". A raw substring scan
 * flags exactly the prose that explains why the rule exists, which would push
 * the next author to delete the explanation to make the test pass. The rules
 * are about CODE, so they read code.
 */
function code(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
}

/**
 * Every application file whose CODE (not prose) names `needle`, as
 * web-relative paths.
 *
 * `lib/supabase/types.ts` is excluded because it is GENERATED from the live
 * schema: v1 appears there because it exists in the database, which is the
 * fact this guard is built on, not a violation of it. Test files are excluded
 * for the same reason — this file names both functions repeatedly.
 */
function referencesInCode(needle: string): string[] {
  const hits: string[] = [];
  const walk = (dir: string) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      if (e.name === "node_modules" || e.name === ".next") continue;
      const p = join(dir, e.name);
      if (e.isDirectory()) {
        walk(p);
        continue;
      }
      if (!/\.tsx?$/.test(e.name) || /\.test\.tsx?$/.test(e.name)) continue;
      const rel = p.slice(WEB.length + 1).replace(/\\/g, "/");
      if (rel === "lib/supabase/types.ts") continue;
      if (code(readFileSync(p, "utf8")).includes(needle)) hits.push(rel);
    }
  };
  for (const d of ["lib", "components", "app"]) walk(join(WEB, d));
  return hits.sort();
}

const RESULT_BODY = read("components", "app", "workspace", "result-body.tsx");
const RENDERER = read("components", "app", "workspace", "engagements-result.tsx");
const READER = read("lib", "engagements", "engagements-result.ts");
const WRITER = read("lib", "engagements", "end-engagement.ts");
const EXECUTORS = read("lib", "engagements", "engagement-executors.ts");
const DISPATCH = read("lib", "conversation", "dispatch.ts");

// ═══════════════════════════════════════════════════════════════════════════
// ONE result, ONE renderer, and the renderer came FIRST
// ═══════════════════════════════════════════════════════════════════════════

describe("the engagements result exists exactly once and can actually render", () => {
  it("exactly one `engagements` ResultKind is declared", () => {
    const matches = CONVERSATION_RESULTS.filter((r) => r.kind === "engagements");
    expect(matches.length, "duplicate or missing engagements result").toBe(1);
  });

  it("it is `real`, and `real` is only legal because a case exists", () => {
    // The W11 P0-4 ordering, pinned by name. `dataReadiness: "real"` makes
    // `canRenderInline` true, which SKIPS the honest fallback — so promoting
    // readiness before the renderer exists does not overstate, it actively
    // removes the way forward and dead-ends on "Preparing this result."
    const r = getResult("engagements");
    expect(r?.dataReadiness).toBe("real");
    expect(
      RESULT_BODY.includes('case "engagements":'),
      "engagements is `real` but InlineResult has no case for it",
    ).toBe(true);
    expect(RESULT_BODY).toContain("<EngagementsResult");
  });

  it("renders inline in both of its contexts and in neither other one", () => {
    expect(canRenderInline("engagements", "personal")).toBe(true);
    expect(canRenderInline("engagements", "organization")).toBe(true);
    // An engagement has no project (no FK path at any hop), so a project
    // context could only ever show rows unrelated to that project.
    expect(canRenderInline("engagements", "project")).toBe(false);
  });

  it("the renderer receives the context rather than re-deriving it", () => {
    // Two sources for one fact could disagree; `ResultBody` has already used
    // this exact value to decide the result may render at all.
    expect(RESULT_BODY).toMatch(/<EngagementsResult[\s\S]{0,160}context=\{context\}/);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// TWO doors, ONE result
// ═══════════════════════════════════════════════════════════════════════════

describe("both opening actions target the same result", () => {
  const OPENERS = ["company.review-engagements", "worker.review-engagements"] as const;

  it("both ids exist in the action registry", () => {
    for (const id of OPENERS) {
      expect(getConversationAction(id), `${id} missing from the action registry`).toBeDefined();
    }
  });

  it("both resolve to `engagements` and to nothing else", () => {
    for (const id of OPENERS) {
      // `resultForAction` is first-match-wins — the trap that made the old
      // `reputation` slot unreachable. Neither id may appear on another result.
      expect(resultForAction(id)?.kind, `${id} resolves elsewhere`).toBe("engagements");
      const owners = CONVERSATION_RESULTS.filter((r) => r.openedBy.includes(id));
      expect(owners.length, `${id} is claimed by ${owners.length} results`).toBe(1);
    }
  });

  it("both are READS — an opening action never writes", () => {
    for (const id of OPENERS) {
      const a = getConversationAction(id)!;
      expect(a.confirmation, `${id} tier`).toBe("read");
      expect(a.handler.kind, `${id} handler`).toBe("deep_link");
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// ONE end action, ONE executor, ONE server action, ONE RPC
// ═══════════════════════════════════════════════════════════════════════════

describe("the end action is shared by both sides and exists exactly once", () => {
  it("the forbidden side-specific pair does not exist", () => {
    const ids = CONVERSATION_ACTIONS.map((a) => a.id);
    expect(ids).not.toContain("company.end-engagement");
    expect(ids).not.toContain("worker.end-engagement");
    // …and nothing else in the registry ends an engagement either.
    const enders = ids.filter((id) => /end.*engagement|engagement.*end/i.test(id));
    expect(enders, `more than one ender: ${enders.join(", ")}`).toEqual(["engagement.end"]);
  });

  it("it belongs to the RELATIONSHIP and lists both parties", () => {
    const a = getConversationAction("engagement.end")!;
    expect(a.subject).toBe("engagement");
    expect(a.allowedRoles).toContain("worker");
    expect(a.allowedRoles).toContain("company");
    // Strong tier: there is no reopen RPC, so the confirmation card is the
    // only step before a state nobody can walk back.
    expect(a.confirmation).toBe("strong_irreversible");
  });

  it("BOTH sides pass the same authorization gate, and a stranger still may not", () => {
    const descriptor = getConversationAction("engagement.end");
    for (const role of ["worker", "company", "agency"] as const) {
      expect(
        authorizeDispatch({ descriptor, heldRoles: new Set<Role>([role]), executable: true }),
        role,
      ).toEqual({ ok: true });
    }
    expect(
      authorizeDispatch({
        descriptor,
        heldRoles: new Set<Role>(["customer"]),
        executable: true,
      }),
    ).toEqual({ ok: false, code: "not_authorized" });
  });

  it("exactly one executor, and it delegates to the ONE shared server action", () => {
    expect(Object.keys(ENGAGEMENT_ACTION_SCHEMAS)).toEqual(["engagement.end"]);
    expect(EXECUTORS).toContain("endEngagementAction");
    // No branch on who is asking: the side is re-derived in SQL, and a branch
    // here would be a second authorization model competing with it.
    expect(EXECUTORS).not.toMatch(/actorSide\s*===|viewerSide\s*===/);
  });

  it("the telemetry namespace is classified deliberately, not by fallback", () => {
    // A silent fallback reads as "an id nobody has classified yet".
    expect(roleContextForAction("engagement.end")).toBe("worker");
    expect(
      read("lib", "conversation", "action-role-context.ts"),
    ).toContain('actionId.startsWith("engagement.")');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// The input is an id and NOTHING else
// ═══════════════════════════════════════════════════════════════════════════

describe("the client supplies an engagement id and nothing else", () => {
  const schema = ENGAGEMENT_ACTION_SCHEMAS["engagement.end"];
  const ok = "11111111-2222-4333-8444-555555555555";

  it("accepts a well-formed id", () => {
    expect(schema.safeParse({ engagementId: ok }).success).toBe(true);
  });

  it("rejects a malformed id before anything could run", () => {
    for (const bad of [{}, { engagementId: "" }, { engagementId: "nope" }, { engagementId: 7 }, null]) {
      expect(schema.safeParse(bad).success, JSON.stringify(bad)).toBe(false);
    }
  });

  it("rejects company id, worker id, side and project id — by parsing, not by convention", () => {
    // Authority is re-derived server-side from the actor and the row. If these
    // were merely IGNORED, a later caller could start passing them and
    // somebody would eventually read one.
    for (const extra of [
      { companyId: ok },
      { workerId: ok },
      { side: "company" },
      { projectId: ok },
      { actorSide: "worker" },
    ]) {
      expect(
        schema.safeParse({ engagementId: ok, ...extra }).success,
        Object.keys(extra)[0],
      ).toBe(false);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// The confirmation is fresh, bound and single-use
// ═══════════════════════════════════════════════════════════════════════════

describe("the strong-tier confirmation is bound to this engagement's state", () => {
  it("the dispatcher fingerprints the engagement's own status", () => {
    // Without this the token would be merely FRESH, not single-use: the same
    // card could be submitted twice within its TTL.
    expect(DISPATCH).toMatch(/actionId === "engagement\.end"/);
    expect(DISPATCH).toMatch(/from\("company_worker_engagements"\)[\s\S]{0,200}select\("status"\)/);
    expect(DISPATCH).toContain("`engagement:${(data?.status as string) ?? \"missing\"}`");
  });

  it("the renderer mints a token before every end and never dispatches without one", () => {
    expect(RENDERER).toContain('prepareConfirmationAction("engagement.end"');
    expect(RENDERER).toMatch(/dispatchWorkerAction\([\s\S]{0,200}confirmationToken: prep\.token/);
    // The token is checked BEFORE the dispatch — a `!prep.ok` that fell
    // through would send an unconfirmed write.
    expect(RENDERER).toContain("if (!prep.ok)");
  });

  it("cancelling writes nothing at all", () => {
    // Cancel only closes the card. No mint, no dispatch — pinned by the fact
    // that the cancel handler is a pure state setter.
    expect(RENDERER).toMatch(
      /engagement-end-cancel-\$\{row\.engagementId\}`\}[\s\S]{0,400}onClick=\{\(\) => setConfirming\(false\)\}/,
    );
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// What this slice must NOT do
// ═══════════════════════════════════════════════════════════════════════════

describe("no project, no second audit trail, no new route", () => {
  it("neither the reader, the writer nor the renderer touches a project", () => {
    for (const [name, src] of [
      ["reader", READER],
      ["writer", WRITER],
      ["renderer", RENDERER],
      ["executor", EXECUTORS],
    ] as const) {
      expect(code(src), `${name} joins a project`).not.toMatch(/\bprojects?\s*\(/);
      expect(code(src), `${name} accepts a project id`).not.toMatch(/project_id|projectId/);
    }
  });

  it("nothing writes `audit_logs` — the engagement row IS the audit record", () => {
    for (const src of [READER, WRITER, EXECUTORS, RENDERER]) {
      expect(code(src)).not.toContain("audit_logs");
    }
  });

  it("no new route was added for this result", () => {
    // The `experiences` precedent: W6 slice 3B's `/dashboard/experiences` was
    // refused by Product Gate A-09 and deleted. A 73rd route would be refused
    // the same way. Both the result and the end action name an EXISTING page.
    const appDir = join(WEB, "app", "[locale]", "dashboard");
    const dirs = readdirSync(appDir, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name);
    expect(dirs).not.toContain("engagements");

    for (const route of [
      getResult("engagements")!.advancedRoute,
      getConversationAction("engagement.end")!.advancedRoute,
      getConversationAction("company.review-engagements")!.advancedRoute,
      getConversationAction("worker.review-engagements")!.advancedRoute,
    ]) {
      expect(
        () =>
          readFileSync(join(WEB, "app", "[locale]", ...route.split("/").filter(Boolean), "page.tsx")),
        `${route} has no page.tsx`,
      ).not.toThrow();
    }
  });

  it("v1 still has no application caller", () => {
    // v1 is DEPRECATED, not dropped — its removal is a later, separate,
    // owner-gated migration. Until then it must stay callerless, or there
    // would be two competing APIs for one decision.
    expect(referencesInCode("end_company_worker_engagement_v1")).toEqual([]);
  });

  it("exactly one module calls the v2 RPC", () => {
    expect(referencesInCode("end_company_worker_engagement_v2")).toEqual([
      "lib/engagements/end-engagement.ts",
    ]);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Honest states — an absence is never rendered as an emptiness
// ═══════════════════════════════════════════════════════════════════════════

describe("a failed read is never shown as `you have none`", () => {
  it("the reader keeps `blocked` and `needs-migration` distinct from `empty`", () => {
    expect(READER).toContain('kind: "blocked"');
    expect(READER).toContain('kind: "needs-migration"');
    expect(READER).toContain('kind: "empty"');
    // The catch arm must not collapse into an empty result.
    expect(READER).toMatch(/catch \{[\s\S]{0,300}kind: "blocked"/);
  });

  it("the renderer words all three separately", () => {
    for (const key of [
      "engagementsBlocked",
      "engagementsNeedsMigration",
      "engagementsEmptyCompany",
      "engagementsEmptyWorker",
    ]) {
      expect(RENDERER, `${key} unused`).toContain(key);
    }
  });

  it("a GDPR-detached row is never presented as the worker's own", () => {
    // `worker_id is null` is the erasure model from 20260723120000. Such a row
    // can still be the COMPANY's row, and the company may still end it.
    expect(READER).toMatch(/r\.worker_id !== null && r\.workers\?\.profile_id === user\.id/);
  });

  it("the end CTA exists only on an active row", () => {
    // Offering a control the server would refuse is the fake-control class
    // this product forbids.
    expect(RENDERER).toMatch(/const ended = row\.status === "ended"/);
    expect(RENDERER).toMatch(/\{!ended &&/);
  });

  it("`already_ended` is not reported as a second write", () => {
    expect(EXECUTORS).toMatch(/case "already_ended":[\s\S]{0,200}ok: false/);
    expect(RENDERER).toContain("engagementsAlreadyEnded");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// The W11 outcome-survival lesson
// ═══════════════════════════════════════════════════════════════════════════

describe("the outcome survives the reload it triggers (W11 regression)", () => {
  it("outcome state lives in the parent, not in the row that unmounts", () => {
    // Found in the authenticated browser on the project result: the success
    // line was set and then thrown away by the refresh before anyone could
    // read it. A row reports its outcome UP.
    const parentStart = RENDERER.indexOf("export function EngagementsResult");
    const rowStart = RENDERER.indexOf("function EngagementRowView");
    expect(parentStart).toBeGreaterThan(-1);
    expect(rowStart).toBeGreaterThan(parentStart);

    const parent = RENDERER.slice(parentStart, rowStart);
    const row = RENDERER.slice(rowStart);

    expect(parent, "the parent must own the outcome").toMatch(
      /useState<Outcome \| null>\(null\)/,
    );
    expect(row, "the row must NOT hold outcome state").not.toMatch(
      /useState<Outcome \| null>/,
    );
    expect(row, "the row must report its outcome upward").toContain("onOutcome(");
  });

  it("the message is rendered in every phase the reload passes through", () => {
    // The refresh puts the parent back into `loading`. If the message were
    // rendered only in the loaded branch it would still blink out of
    // existence for the length of the round trip.
    const parent = RENDERER.slice(
      RENDERER.indexOf("export function EngagementsResult"),
      RENDERER.indexOf("function EngagementRowView"),
    );
    const occurrences = parent.match(/\{message\}/g) ?? [];
    expect(occurrences.length, "message must render in loading, error and loaded").toBeGreaterThanOrEqual(4);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// i18n
// ═══════════════════════════════════════════════════════════════════════════

describe("every locale can render this result", () => {
  const LOCALES = ["da", "de", "en", "et", "lt", "lv", "nl", "no", "pl", "ru", "sv"] as const;
  const KEYS = [
    "engagementsError",
    "engagementsBlocked",
    "engagementsNeedsMigration",
    "engagementsEmptyCompany",
    "engagementsEmptyWorker",
    "engagementsUnavailable",
    "engagementsConflict",
    "engagementsStaleConfirmation",
    "engagementsStatusActive",
    "engagementsStatusEnded",
    "engagementsStarted",
    "engagementsEndedOn",
    "engagementsUnknownParty",
    "engagementsEndAction",
    "engagementsEndTitle",
    "engagementsEndBody",
    "engagementsEndCta",
    "engagementsCancel",
    "engagementsWorking",
    "engagementsEnded",
    "engagementsEndedAt",
    "engagementsAlreadyEnded",
    "engagementsAlreadyEndedAt",
    // Shared keys the renderer also uses. `lib/i18n/request.ts` has NO
    // fallback to English, so a missing one renders as its own path.
    "openFull",
    "pendingInline",
    "retry",
  ] as const;

  for (const locale of LOCALES) {
    it(`${locale} carries every engagements string`, () => {
      const m = JSON.parse(read("messages", `${locale}.json`));
      const results = m.conversation?.results;
      expect(results, `${locale} has no conversation.results`).toBeDefined();
      expect(typeof results.engagements?.title).toBe("string");
      for (const k of KEYS) {
        expect(typeof results[k], `${locale}:${k}`).toBe("string");
        expect((results[k] as string).trim().length, `${locale}:${k}`).toBeGreaterThan(0);
      }
      for (const k of [
        "chipEngagements",
        "userEngagements",
        "engagementsOpened",
        "engagementsNone",
        "engagementsNoCompany",
        "engagementsUnavailable",
      ]) {
        expect(typeof m.conversation.chat[k], `${locale}:chat.${k}`).toBe("string");
      }
      for (const path of [
        ["worker", "reviewEngagements"],
        ["company", "reviewEngagements"],
        ["engagement", "end"],
      ] as const) {
        const node = m.conversation.actions[path[0]]?.[path[1]];
        expect(typeof node?.label, `${locale}:${path.join(".")}.label`).toBe("string");
        expect(typeof node?.description, `${locale}:${path.join(".")}.description`).toBe("string");
      }
    });
  }

  it("the confirmation copy states every consequence AND every non-consequence", () => {
    // The one screen where vagueness is most expensive. English is asserted
    // literally; the other locales are pinned only for length, because a
    // translation that dropped four clauses would be visibly short.
    const en = JSON.parse(read("messages", "en.json")).conversation.results
      .engagementsEndBody as string;
    for (const claim of ["final", "cannot be reopened", "history", "nothing is deleted"]) {
      expect(en.toLowerCase(), claim).toContain(claim);
    }
    for (const denial of ["project", "membership", "experience", "review", "invoiced"]) {
      expect(en.toLowerCase(), `must deny: ${denial}`).toContain(denial);
    }
    for (const locale of LOCALES) {
      const body = JSON.parse(read("messages", `${locale}.json`)).conversation.results
        .engagementsEndBody as string;
      expect(body.length, `${locale} confirmation body looks truncated`).toBeGreaterThan(150);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Migration ratchet + the parked worktree
// ═══════════════════════════════════════════════════════════════════════════

describe("the migration set is exactly what this slice declared", () => {
  const MIGRATIONS = join(WEB, "..", "..", "supabase", "migrations");

  it("the v2 migration and its paired rollback both exist", () => {
    const files = readdirSync(MIGRATIONS);
    expect(files).toContain("20260804160000_booking_engagement_end_v2.sql");
    const rollbacks = readdirSync(join(WEB, "..", "..", "supabase", "rollbacks"));
    expect(rollbacks).toContain("20260804160000_booking_engagement_end_v2.down.sql");
  });

  it("the human-gate marker is present, narrow, and states what it approves", () => {
    // This assertion used to require the marker's ABSENCE — a self-added
    // marker was the one thing that could turn a RED review into a silent
    // apply. The owner has since given the gate (2026-08-04, reviewed HEAD
    // d2c4f6c8, canonical production project — the ref itself is deliberately
    // NOT written here; see the shape check below), so absence is no longer
    // the honest invariant.
    //
    // It is replaced by a STRICTER one rather than deleted. A marker is only
    // legitimate if it says which findings it covers, and a later author must
    // not be able to widen it by editing a comment: the header must still name
    // exactly the three approved findings, the reviewed HEAD and the project
    // ref. A marker pasted onto some OTHER migration, or this one silently
    // re-purposed for a fourth finding, fails here.
    const sql = readFileSync(join(MIGRATIONS, "20260804160000_booking_engagement_end_v2.sql"), "utf8");
    // The SAME regex `.github/scripts/migration-safety.mjs` uses, so this
    // guard and the CI gate can never disagree about what an approval IS.
    expect(sql).toMatch(/(^|\r?\n)[ \t]*--[ \t]*@human-gate-approved\b/i);

    for (const finding of ["security-definer-function", "grant-or-revoke", "data-dml"]) {
      expect(sql, `the marker must name ${finding}`).toContain(finding);
    }
    expect(sql, "the approval must name the reviewed HEAD").toContain(
      "d2c4f6c86a6a68ff55ec0895945c75c25c601c28",
    );
    // The approval must name the project it was given for — but the raw
    // Supabase ref may NOT be written here. `single-domain-origin.test.ts`
    // forbids that literal anywhere in `apps/web` source and caught this exact
    // line on its first run. The migration header is not user-facing source
    // and keeps the ref (the applied ledger records it the same way), so the
    // assertion checks the SHAPE of a project ref rather than embedding one.
    expect(
      /production project `[a-z]{20}`/.test(sql),
      "the approval must name the production project it was given for",
    ).toBe(true);

    // The gate script itself must NOT have been touched to get here — that is
    // the difference between an approval and a bypass.
    const gate = readFileSync(join(WEB, "..", "..", ".github", "scripts", "migration-safety.mjs"), "utf8");
    expect(gate).toContain("const ANNOTATION = /(^|\\r?\\n)[ \\t]*--[ \\t]*@human-gate-approved\\b/i;");
  });

  it("this branch's own migration is the ONLY newly marked one", () => {
    // NOT a repo-wide "only this file is marked" claim — that would be false
    // and was, on the first run: 98 migrations already carry owner markers,
    // because every previously approved migration keeps the marker that
    // approved it. That is the normal state of an approved history.
    //
    // The invariant that actually matters is narrower: this branch adds ONE
    // migration, and the approval must not have spread to anything newer.
    // Files dated at or after this one are the only ones this branch could
    // have touched.
    const newer = readdirSync(MIGRATIONS)
      .filter((f) => f.endsWith(".sql") && f >= "20260804160000")
      .filter((f) =>
        /(^|\r?\n)[ \t]*--[ \t]*@human-gate-approved\b/i.test(
          readFileSync(join(MIGRATIONS, f), "utf8"),
        ),
      );
    // 2026-08-05: two additions — the worker display-name package's write-path
    // and backfill migrations gained their markers under OWNER DECISIONS 1+2,
    // recorded (exact wording + reviewed sha256 + production preflight) in
    // docs/human-gates/worker-display-name-write-path-gate.md. Each marker was
    // added in the same commit as its recorded decision, per that gate's
    // procedure — not spread from this branch's approval.
    expect(newer).toEqual([
      "20260804160000_booking_engagement_end_v2.sql",
      "20260805090000_worker_display_name_write_path_v1.sql",
      "20260805090100_worker_display_name_backfill_v1.sql",
      // 2026-08-05: M-P0-1 (company ownership cap removal) gained its marker
      // under the owner's directive §3 apply approval, recorded in
      // docs/APPLIED_LEDGER.md (ledger 20260805171825) and the structural
      // train doc. Added in the same commit as that record.
      "20260805170000_multi_org_company_ownership_cap_removal_v1.sql",
      // 2026-08-05: M-P0-2 (save_company_setup_v3) gained its marker under
      // "OWNER DECISION — APPLY AND MERGE M-P0-2" §1, recorded in
      // docs/APPLIED_LEDGER.md (ledger 20260805180836) and the structural
      // train doc. Added in the same commit as that record.
      "20260805190000_save_company_setup_v3_multi_org.sql",
      // 2026-08-05: M-P0-4 slice 1 (company_memberships v1) gained its
      // marker under "OWNER DECISION — APPLY COMPANY_MEMBERSHIPS V1" §1,
      // recorded in docs/architecture/COMPANY_MEMBERSHIPS_V1.md and the
      // train doc. Added in the same commit as that record.
      "20260806090000_company_memberships_v1.sql",
      // 2026-08-06: M-P0-4 slice 2 (membership commands v1) gained its
      // marker under "OWNER DECISION — CLOSE MEMBERSHIP AUTHORITY, MERGE
      // DURABLE WORKSPACE, CONTINUE M-P0-6/7/8" §1/§4, recorded in
      // docs/architecture/COMPANY_MEMBERSHIPS_V1.md and
      // docs/APPLIED_LEDGER.md (ledger 20260806052445). Added in the same
      // commit as that record.
      "20260806120000_company_membership_commands_v1.sql",
      // 2026-08-06: the consumer-slice DB widening gained its marker under
      // "OWNER DECISION — CLOSE MULTI-ORGANIZATION STRUCTURAL TRAIN" §1/§3,
      // recorded in docs/APPLIED_LEDGER.md. Added in the same commit as
      // that record.
      "20260806180000_membership_authority_widening_v1.sql",
      // 2026-08-06: M-P0-6 (org demand spine v2) gained its marker under
      // "OWNER DECISION — CLOSE MULTI-ORGANIZATION STRUCTURAL TRAIN" §1/§4,
      // recorded in docs/human-gates/org-demand-spine-v2-gate.md and
      // docs/APPLIED_LEDGER.md. Added in the same commit as that record.
      "20260806200000_org_demand_spine_v2.sql",
      // 2026-08-06: Stripe TEST multi-subject v2 gained its marker under
      // Owner Decision S1 (command §10, reviewed 72bba623, successor PR
      // #1040), recorded in docs/human-gates/stripe-multi-subject-v2-gate.md.
      // Added in the same commit as that record.
      "20260806220000_stripe_multi_subject_v2.sql",
      // 2026-08-06: W6 author/subject model v1 gained its marker under
      // Owner Decision W6-D1 (reviewed HEAD 30691a60), recorded in
      // docs/human-gates/experience-author-subject-v1-gate.md and
      // docs/APPLIED_LEDGER.md (ledger 20260806135649). Added in the marker
      // commit 266df613 together with that record.
      "20260806230000_experience_author_subject_v1.sql",
      // 2026-08-06: the M-P0-4 gap closure (org owner membership seed v1)
      // gained its marker under the owner's Finding-2 apply approval
      // (PR #1043, reviewed HEAD 61b444bd, binding executable sha256
      // e4aebfb6…51668), recorded in
      // docs/human-gates/fresh-organization-owner-membership-v1-gate.md.
      // Added in the same commit as that record.
      "20260807090000_org_owner_membership_seed_v1.sql",
      // 2026-08-08: booking→engagement org-first resolution (#1047) gained
      // its marker under the beta-stabilization P0 owner decision ("APPROVE
      // proceeding with #1047 PROVIDED current-code re-verification proves…"),
      // recorded with the re-verification (39/39 DB proof incl. sibling
      // isolation + RLS visibility) in
      // docs/human-gates/booking-engagement-org-resolution-gate.md. Added in
      // the same commit as that record. Executable sha256 unchanged by the
      // marker: da6ae1cd…cd8c2.
      "20260807140000_booking_engagement_org_resolution_v1.sql",
      // 2026-08-08: W12 employer absence privacy hardening. The marker records
      // that the RED content (a GRANT and an ALTER/DROP POLICY) is INTENTIONAL
      // — narrowing the policy IS the change. Owner decision given 2026-08-08,
      // merged in #1089 and APPLIED to production the same day. Gate record:
      // docs/human-gates/w12-absence-privacy-hardening-gate.md; design + proof:
      // docs/audits/W12_EMPLOYER_ABSENCE_PRIVACY_HARDENING.md.
      "20260808120000_worker_absence_scheduling_view_v1.sql",
      // 2026-08-08: W14 item 6 retention redaction. The marker records that the
      // RED content (a SECURITY DEFINER function + a GRANT) is INTENTIONAL —
      // the constrained mutation path IS the mechanism. Owner decision given
      // 2026-08-08 (REDACT-NOT-DELETE at 90 days). Gate record:
      // docs/human-gates/w14-ai-runs-retention-gate.md; contract + proof:
      // docs/audits/W14_ITEM6_AI_RUNS_RETENTION.md.
      "20260808130000_ai_runs_retention_redaction_v1.sql",
      // 2026-08-08: W14 item 6 retention SCHEDULER. The marker records that the
      // RED content (CREATE EXTENSION pg_cron, a new SECURITY DEFINER wrapper,
      // GRANTs, and a scheduled job) is INTENTIONAL — the caller IS the
      // mechanism. NO APPLY APPROVAL EXISTS YET: the 2026-08-08 owner decision
      // approved the retention CAPABILITY, not installing a new database
      // extension. Gate record: docs/human-gates/w14-retention-scheduler-gate.md.
      "20260808140000_ai_runs_retention_schedule_v1.sql",
      // 2026-08-12: beta-audit P1 defect A1 (#1095). The marker records that
      // the RED content (three SECURITY DEFINER function bodies + their
      // GRANT/REVOKE posture) is INTENTIONAL — replacing the authorization
      // predicate IS the change. Unlike most entries above, an APPLY APPROVAL
      // DOES EXIST: the owner gave "#1095 = APPROVED YES" in the public beta
      // completion train v6.2 directive, and the marker was added in the same
      // commit that recorded it. Before the marker was added, every premise in
      // the migration header was re-read from PRODUCTION (the A1 defect, the
      // free `_by_roster` name and W11's reverted engagement bridge were all
      // still live), and the two "body preserved from the APPLIED migration"
      // claims were proven by normalised-md5 comparison against production
      // `pg_proc.prosrc` rather than by eye. Guard for that provenance:
      // lib/guards/caller-manages-worker-engagements.test.ts.
      "20260808150000_caller_manages_worker_engagements_v1.sql",
      // 2026-08-12: #1097 — can_view_worker learns about booking engagements.
      // The marker records that the RED content (a SECURITY DEFINER function
      // body + its GRANT/REVOKE posture) is INTENTIONAL: replacing the GDPR
      // identity-disclosure predicate IS the change.
      //
      // AN APPLY APPROVAL EXISTS, and it was CONDITIONAL. The owner first
      // approved only the PREPARATION (train v6.3 §3): the widening "MUST NOT
      // be blindly applied in its previous disclosure state", and could be
      // merged/applied only once C1 (the accept screen states the disclosure),
      // C2a (legal-basis matrix names company_worker_engagements) and C2b (the
      // public data-access matrix stops under-claiming) held. Those three
      // shipped in 520cfcf1 and the migration stayed deliberately UNMARKED —
      // an agent attempting the marker was refused by the harness permission
      // classifier, and that refusal was respected rather than routed around.
      // The owner then granted the marker outright in train v6.4 §1
      // "OWNER APPROVAL A", scoped to this migration only. It was added in the
      // same commit that recorded the decision, and only after re-verifying on
      // the branch (not from the prior report) that HEAD was 520cfcf1, the tree
      // clean, the count 198, main fully contained, and C1/C2a/C2b still
      // present. Guard for that provenance — including a negative control that
      // a BARE marker without the recorded decision fails:
      // lib/guards/can-view-worker-booking-engagement.test.ts.
      "20260809120000_can_view_worker_booking_engagement_v1.sql",
      // 2026-08-09: public vacancy persistence v1. The marker records that the
      // RED content (GRANT/REVOKE and a CREATE POLICY) is STRUCTURALLY
      // UNAVOIDABLE — there is no way to add a table with row-level security
      // that the gate scores green, so every new RLS table must be human-gated
      // or the gate would be meaningless.
      //
      // NO APPLY APPROVAL EXISTS YET: this ships UNAPPLIED and the gate record
      // states the decision being asked for. Worth noting what the gate CAUGHT
      // rather than merely annotated — the first draft granted SELECT to
      // `anon`, and `rls-to-anon`/`grant-anon-public` fired. The grant was
      // REMOVED rather than approved (the controlled-beta worker journey begins
      // at registration, so `anon` bought nothing), leaving only these two
      // unavoidable findings. Gate record:
      // docs/human-gates/public-vacancy-persistence-gate.md.
      "20260809160000_public_vacancy_persistence_v1.sql",
      // 2026-08-10: durable notification events v1. The marker records that
      // the RED content (GRANT/REVOKE incl. a COLUMN-level UPDATE grant on
      // read_at, and two CREATE POLICY statements) is STRUCTURALLY
      // UNAVOIDABLE for a new RLS table — same class as the vacancy
      // persistence entry above. NO APPLY APPROVAL EXISTS YET: ships
      // UNAPPLIED; the gate record states the decision being asked for.
      // Gate record: docs/human-gates/notification-events-gate.md.
      "20260810070000_notification_events_v1.sql",
      // 2026-08-13: notification event types v2 (booking_withdrawn +
      // engagement_ended) — DRAFT under the V8 loop-matrix follow-up,
      // @human-gate-approved states the ROUTE only; the apply decision is
      // AWAITING_OWNER_DECISION in
      // docs/human-gates/notification-events-v2-types-gate.md. Rollback
      // paired, ships UNAPPLIED.
      "20260813100000_notification_events_v2_types.sql",
      // 2026-08-17: security train A (advisor triage, PR #1168) — four
      // migrations marked under the owner's 2026-08-17 mandate (autonomous
      // functional completion train V2, §4 migration authority), which
      // PRE-APPROVES safe policy corrections / org-authority extensions of
      // existing SECDEF RPCs for autonomous application AFTER review + tests
      // + CI green. Unlike most entries above, the approval is a standing
      // mandate rather than a per-migration decision; each marker cites the
      // mandate + its safety class in the migration header, all four ship
      // UNAPPLIED (ledger: PENDING APPLY BY LEAD SESSION via Supabase MCP),
      // and each carries a paired rollback restoring byte-exact live
      // definitions. Markers were added in the same commit as the ledger
      // records. Provenance guard: lib/guards/security-train-a-v1.test.ts.
      "20260817120000_catalog_least_privilege_v1.sql",
      "20260817121000_invitation_org_authority_v1.sql",
      "20260817122000_contact_disclosure_org_authority_v1.sql",
      "20260817123000_finance_org_authority_v1.sql",
      // 2026-08-17: Workflow & Approval Engine v1 PAIR. The markers record
      // that the RED content (7 new RLS tables + SELECT policies +
      // GRANT/REVOKE + 12 SECURITY DEFINER functions + 3 trigger guards;
      // and a constraint drop/re-add widening on notification_events) is
      // STRUCTURALLY UNAVOIDABLE for a row-level-secured write engine —
      // same class as the vacancy-persistence / notification-events entries
      // above. The annotation authority is the owner mandate 2026-08-17
      // (autonomous functional completion train V2, §4 migration authority);
      // the annotation states the ROUTE, and the apply act belongs to the
      // LEAD session (PENDING APPLY BY LEAD in docs/APPLIED_LEDGER.md).
      // Gate record: docs/human-gates/workflow-engine-gate.md. Rollbacks
      // paired; behavioural proof: scripts/db-proof/workflow-engine-v1.sh.
      // Renamed from the 20260817120000/121000 slots after security train A
      // (above) claimed those version prefixes on main.
      "20260817130000_workflow_engine_v1.sql",
      "20260817130100_notification_events_v3_workflow_types.sql",
      // 2026-08-17: Document & Evidence Engine v1 pair (train C of the
      // autonomous functional completion train V2). The markers record that
      // the RED content (new RLS tables + SECURITY DEFINER RPCs +
      // GRANT/REVOKE + storage bucket/policies; and the two strictly-widening
      // constraint drop+re-adds on notification_events) is STRUCTURALLY
      // UNAVOIDABLE / INTENTIONAL. The annotation route was pre-approved by
      // the owner mandate 2026-08-17 (train V2 §4 migration authority); the
      // APPLY is performed by the train LEAD, recorded as PENDING APPLY BY
      // LEAD in docs/APPLIED_LEDGER.md. Gate records:
      // docs/human-gates/document-file-layer-gate.md,
      // docs/human-gates/notification-document-types-v3-gate.md. DB proof
      // (76/76, migration + rollback verbatim):
      // scripts/db-proof/document-file-layer.sh. Renamed from the
      // 20260817120000/121000 slots after trains A/B claimed 120000-130100
      // on main; the 140100 constraint union builds on 130100's list.
      "20260817140000_document_file_layer_v1.sql",
      "20260817140100_notification_document_types_v3.sql",
      // 2026-08-17: train D (autonomous functional completion train V2).
      // All four markers cite the owner mandate 2026-08-17 §4 migration
      // authority — pre-approved for the train, applied ONLY by the LEAD
      // session; deferred entries in docs/APPLIED_LEDGER.md. Rollbacks
      // paired, all four ship UNAPPLIED.
      "20260817150000_work_objects_v1.sql",
      "20260817151000_work_tasks_v2_collaboration.sql",
      "20260817152000_project_responsible_v1.sql",
      "20260817153000_notification_events_v4_task_types.sql",
      // 2026-08-17: durable workspace pointer v2 (consolidation train L
      // slice 1) — marked under the SAME standing owner mandate 2026-08-17
      // (autonomous functional completion train V2, §4 migration authority)
      // as the security-train-A entries above. The marker cites the mandate
      // + safety class (additive column + SECURITY DEFINER validation
      // trigger; backward-compatible — the app feature-detects 42703/
      // PGRST204 today) in the migration header. It supersedes the OLD
      // 20260714210000 draft, which carries its own earlier marker but is
      // dated before this list's 20260804160000 cutoff so it never appears
      // here; that file is now header-marked SUPERSEDED-BY-20260817160000
      // and must never be applied. Ships UNAPPLIED (ledger: PENDING APPLY BY
      // LEAD SESSION via Supabase MCP), paired rollback, DB proof
      // scripts/db-proof/durable-workspace-pointer-v2.sh (32/32).
      "20260817160000_durable_workspace_pointer_v2.sql",
      // 2026-08-17: timesheets v1 (train E of the same autonomous functional
      // completion train V2) gained its marker under the SAME owner mandate's
      // §4 migration authority, recorded in docs/APPLIED_LEDGER.md (Deferred,
      // PENDING APPLY BY LEAD) and the migration's own header. Added in the
      // same commit as that record — not spread from this branch's approval.
      "20260817170000_timesheets_v1.sql",
      // 2026-08-17: typed employee requests + configurable leave balance
      // policies PAIR (functional completion train V2, agent F). The markers
      // record that the RED content (2 new RLS tables + SELECT policies +
      // GRANT/REVOKE + 4 SECURITY DEFINER commands, ZERO triggers, ZERO
      // seeded rows) is STRUCTURALLY UNAVOIDABLE for new row-level-secured,
      // RPC-only-writable tables — same class as the engine entry above.
      // The annotation authority is the owner mandate 2026-08-17 (autonomous
      // functional completion train V2, §4 migration authority); the
      // annotation states the ROUTE, and the apply act belongs to the LEAD
      // session (PENDING APPLY BY LEAD in docs/APPLIED_LEDGER.md). The
      // requests migration CONSUMES the engine strictly through its public
      // commands (registered consumer in lib/guards/workflow-engine.test.ts).
      // Rollbacks paired; behavioural proof:
      // scripts/db-proof/employee-requests-leave-balances.sh; module guard:
      // lib/guards/employee-requests.test.ts.
      "20260817180000_employee_requests_v1.sql",
      "20260817181000_leave_balance_policies_v1.sql",
      // 2026-08-17: Employee Lifecycle v1 (train G of the autonomous
      // functional completion train V2). The marker records that the RED
      // content (7 new RLS tables + SELECT policies + GRANT/REVOKE + 16
      // SECURITY DEFINER functions + 1 append-only trigger guard + 4
      // additive NULLABLE engagement_contexts columns) is STRUCTURALLY
      // UNAVOIDABLE for a row-level-secured lifecycle engine — same class
      // as the workflow/document-engine entries above. The engine builds ON
      // the CANONICAL employment record engagement_contexts (lead decision,
      // duplication-consolidation plan v1) and CALLS the applied
      // end_org_membership_v1 rather than forking it. The annotation route
      // is the owner mandate 2026-08-17 §4 migration authority; the APPLY
      // belongs to the LEAD session (PENDING APPLY BY LEAD in
      // docs/APPLIED_LEDGER.md). Gate record:
      // docs/human-gates/employee-lifecycle-gate.md. Rollback paired;
      // behavioural proof (85/85, migration + rollback verbatim):
      // scripts/db-proof/employee-lifecycle.sh.
      "20260817190000_employee_lifecycle_v1.sql",
      // 2026-08-17: Agreement & Rights Engine v1 (train H of the autonomous
      // functional completion train V2). The marker records that the RED
      // content (3 new RLS tables + SELECT policies + GRANT/REVOKE + 9
      // SECURITY DEFINER functions + 2 append-only trigger guards) is
      // STRUCTURALLY UNAVOIDABLE for a row-level-secured register — same
      // class as the workflow/document entries above. Annotation authority:
      // owner mandate 2026-08-17 (autonomous functional completion train
      // V2, §4 migration authority); the annotation states the ROUTE, the
      // apply act belongs to the LEAD session (PENDING APPLY BY LEAD in
      // docs/APPLIED_LEDGER.md, apply AFTER 20260817130000 AND
      // 20260817140000 — hard dependencies asserted in-file). Gate record:
      // docs/human-gates/agreements-gate.md. Rollback paired (0-row
      // guarded); behavioural proof (89/89, migration + rollback verbatim):
      // scripts/db-proof/agreements-v1.sh. LEGAL DOCTRINE pinned in the
      // header: no status implies signed/legal/valid/binding; signature
      // evidence is a separate explicit field pair; no e-signature flow.
      "20260817200000_agreements_v1.sql",
      // 2026-08-17: financial ops (train J of the same autonomous functional
      // completion train V2). All three markers cite the SAME owner mandate
      // 2026-08-17 §4 migration authority + safety class in their headers.
      // The RED content is structurally unavoidable: gated SECURITY DEFINER
      // commands + EXECUTE grants (invoice upgrades), and additionally new
      // RLS-bearing tables + an append-only trigger guard (procurement,
      // business trips). All three ship UNAPPLIED (ledger: PENDING APPLY BY
      // LEAD), with paired rollbacks. They CONSUME the workflow + document
      // engines and fork neither; the v1 finance RPCs are left byte-untouched
      // (a changed contract is a NEW _v2 name — rollback-chain rule). DB
      // proof: scripts/db-proof/financial-ops-v1.sh; module guard:
      // lib/guards/financial-ops.test.ts.
      "20260817220000_finance_invoice_upgrades_v1.sql",
      "20260817221000_procurement_v1.sql",
      "20260817222000_business_trips_v1.sql",
      // 2026-08-17: Training & Certification + Development Reviews +
      // Management Decisions v1 (train K of the autonomous functional
      // completion train V2). Each marker records that the RED content
      // (4 new RLS tables + SELECT policies + GRANT/REVOKE + 8 SECURITY
      // DEFINER functions + append-only / fill-once trigger guards per
      // file) is STRUCTURALLY UNAVOIDABLE for a row-level-secured
      // register — the same class as the workflow / document / agreement
      // entries above. Annotation authority: owner mandate 2026-08-17
      // (autonomous functional completion train V2, §4 migration
      // authority); the annotation states the ROUTE, the apply act belongs
      // to the LEAD session (PENDING APPLY BY LEAD in
      // docs/APPLIED_LEDGER.md; 230000 applies AFTER 20260817140000,
      // 232000 AFTER 20260817130000 AND 20260817140000 AND the applied
      // work_tasks migration — hard dependencies asserted in-file). Gate
      // records: docs/human-gates/{training-certification,
      // performance-reviews,management-decisions}-gate.md. Rollbacks
      // paired and 0-row guarded; behavioural proof (127/127, migrations +
      // rollbacks verbatim): scripts/db-proof/training-development-v1.sh.
      // DOCTRINE pinned in the headers: a certificate is evidence a course
      // was completed, never a competence claim; NO rating/score/grade/rank
      // column exists in the review schema; the workflow engine's
      // multi-approver step IS the vote.
      "20260817230000_training_certification_v1.sql",
      "20260817231000_performance_reviews_v1.sql",
      "20260817232000_management_decisions_v1.sql",
      // Org document register delta v1 (train I): the RED class here is
      // 4 SECURITY DEFINER commands + their GRANT/REVOKE pairs + one
      // widening drop/re-add of the org_document_events event vocabulary —
      // STRUCTURALLY UNAVOIDABLE for RPC-only writes on an RLS-bearing
      // register. No new table, no policy touched, no train C function
      // recreated (create_org_document_v1 stays as merged; the extended
      // contract is create_org_document_v2). Annotation authority: owner
      // mandate 2026-08-17 (autonomous functional completion train V2, §4
      // migration authority); the annotation states the ROUTE, the apply
      // act belongs to the LEAD session (PENDING APPLY BY LEAD in
      // docs/APPLIED_LEDGER.md, apply AFTER 20260817130000, 20260817140000
      // AND 20260817150000 — all three asserted in-file). Gate record:
      // docs/human-gates/org-document-register-delta-gate.md. Rollback
      // paired (0-row guarded: refuses while any added column or delta
      // event row holds real data). Retention doctrine pinned in the
      // header: nothing is ever deleted on a retention date.
      "20260817240000_org_document_register_delta_v1.sql",
      // 2026-08-18: workflow template MANAGEMENT v1. The RED class here is
      // 3 SECURITY DEFINER commands + their GRANT/REVOKE pairs — the
      // smallest possible shape for a gated write path, and structurally
      // unavoidable: the engine's write surface is RPC-only by design. NO
      // new table, NO column, NO policy, NO trigger, NO existing object
      // recreated, NO DML at apply time. Annotation authority: owner
      // mandate 2026-08-17 (autonomous functional completion train V2, §4
      // migration authority); the annotation states the ROUTE, the apply
      // act belongs to the LEAD session (PENDING APPLY BY LEAD in
      // docs/APPLIED_LEDGER.md, apply AFTER 20260817130000 — asserted
      // in-file). Gate record:
      // docs/human-gates/workflow-template-management-gate.md. Rollback
      // paired and deliberately data-preserving: it drops the three
      // commands and deletes no row, because deleting a definition would
      // destroy the approval history of every instance that ran on it.
      "20260818120000_workflow_template_management_v1.sql",
      // 2026-08-18: public vacancy PREVIEW v1 (train A). The marker records
      // that the RED content (three SECURITY DEFINER projection functions plus
      // their REVOKE-from-PUBLIC/GRANT-to-anon posture) is INTENTIONAL — an
      // allowlisted anonymous projection IS the mechanism, and it is what lets
      // the public job board exist WITHOUT weakening the `authenticated`-only
      // RLS on public_vacancies. Applied to production 2026-08-18 under the
      // owner directive of the same day (§5: jobs must be publicly
      // discoverable, restricted fields must not reach anonymous callers).
      // All three signatures are registered in
      // apps/web/lib/security/anon-secdef-allowlist.ts with written contracts.
      "20260818140000_public_vacancy_preview_v1.sql",
      // 2026-08-18: canonical work-time truth (train B). The marker records
      // that the RED content is a `create or replace` of ONE existing
      // SECURITY DEFINER function body — `timesheet_compute_lines_v1` — plus a
      // re-assertion of its already-reviewed REVOKEs and two COMMENTs. No
      // table, policy, grant, trigger or column changes; no DML. Approved by
      // the owner ruling of 2026-08-18 ("TIMESHEET / WORK HOURS CANONICAL
      // TRUTH": journal_entry_metrics is canonical; journal_entry_work_items
      // must not be populated to satisfy readers). Blast radius measured at
      // zero: `timesheets` has 0 rows and 0 lifetime inserts in production, so
      // no frozen snapshot exists that the new body could change.
      "20260818150000_journal_canonical_work_time_v1.sql",
      // 2026-08-18: the public vacancy SITEMAP projection gained its marker
      // under the owner directive that job supply must be publicly
      // discoverable AND INDEXABLE — the same ruling that approved the
      // anonymous preview functions in 20260818140000. It is strictly
      // narrower than those: one read-only SECURITY DEFINER function whose
      // RETURNS TABLE exposes `id` and `last_modified` and nothing else.
      // Added in the same commit as the migration, not spread from this
      // branch's approval.
      "20260818160000_public_vacancy_sitemap_v1.sql",
      // 2026-08-19: worker saved PUBLIC VACANCIES v1 (20260819094500) carries
      // the marker because it is RED-class — it drops a NOT NULL on
      // worker_saved_opportunities.request_id and adds two SECURITY DEFINER
      // functions. The annotation lets CI classify it; it does NOT approve an
      // apply. The migration ships UNAPPLIED behind needs-human-gate, exactly
      // as the v1 table's own migration did.
      "20260819094500_worker_saved_public_vacancies_v1.sql",
      // 2026-08-19: Work Journal <-> work_task evidence link v1
      // (20260819190000) carries the marker on an EXPLICIT owner decision
      // recorded on PR #1212, scoped to the P0 link capability only. RED-class
      // by route — one SECURITY DEFINER read helper, two SECURITY DEFINER
      // write RPCs and their grants; it creates ONE table and recreates no
      // existing function, policy, grant or constraint. The marker lets CI
      // classify it; the PR still ships as a draft behind needs-human-gate,
      // exactly as every structural migration before it.
      "20260819190000_journal_task_evidence_link_v1.sql",
      // 2026-08-19: task attribution of canonical work-time (20260819220000)
      // carries the marker on an EXPLICIT owner decision approving chain step
      // A and this exact attribution rule. RED by route — it replaces the
      // timesheet_compute_lines_v1 SECURITY DEFINER body — while creating and
      // dropping nothing and running no DML. The marker lets CI classify it;
      // the owner said BUILD IT AND STOP BEFORE APPLYING, so it ships
      // UNAPPLIED behind needs-human-gate.
      "20260819220000_timesheet_task_attribution_v1.sql",
      // 2026-08-20: the chain step B on-ramp (20260820070000) carries the
      // marker on an EXPLICIT owner decision approving the minimum real
      // work_task approval flow. RED by route — it replaces the
      // create_workflow_definition_v1 SECURITY DEFINER body — while creating
      // and dropping nothing and running no DML at apply time. It adds ONE
      // value to ONE allowlist, a strict superset, because 20260819210000
      // widened the table CHECK constraints but not this RPC's own copy.
      "20260820070000_workflow_work_task_definition_v1.sql",
      // 2026-08-23: notification channel preferences v1 gained its marker on
      // the owner's EXPLICIT D7 approval ("OWNER CONTINUATION — TRAIN 2+
      // CLOSE THE OPEN VALUE LOOP" §1–§2: consent model approved — per-type
      // explicit consent, privacy-safe defaults, marketing never silently
      // opt-in), recorded in docs/human-gates/value-train-2-owner-decisions-v1.md
      // → D7. RED by route (table grants to authenticated); one new own-row
      // RLS table, no existing object touched, no DML. Marker added in the
      // same commit as the recorded decision, per this gate's procedure.
      "20260823160000_notification_preferences_v1.sql",
      // 2026-08-24: the anonymous public-vacancy boundary v2 gained its
      // marker on the owner's EXPLICIT P0 addendum + apply approval ("OWNER
      // ADDENDUM — FIX REAL PRODUCTION LANDING / PUBLIC JOB PRIVACY" and
      // "OWNER DECISION: APPROVED — apply the #1255 production migration",
      // 2026-08-24, PR #1255). RED by route only (SECURITY DEFINER function
      // replace); in substance a strict NARROWING: NULLs title_raw +
      // attribution_code for anon, no grant/policy/table change, rollback
      // restores v1 verbatim. Marker added in the same commit as the change.
      "20260824120000_public_vacancy_anon_boundary_v2.sql",
      // 2026-08-24: NULL-safe owner guards v2 gained its marker on the owner's
      // MASTER ORDER §4 security directive — a correctness fix that makes the
      // six SECURITY DEFINER functions compare the nullable owner column
      // NULL-safely (v_owner = uid → (v_owner is not null and v_owner = uid)),
      // creating and dropping nothing and running no DML. The marker lets CI
      // classify it; owner-approved and APPLIED to production 2026-08-24
      // (PR #1256). Detailed risk analysis is in the private Internal Brain
      // per AGENTS.md, not here.
      "20260824130000_null_safe_owner_guards_v2.sql",
          // 2026-08-26: the practice work-history widening
      // (20260826182421) carries the marker because a CREATE OR REPLACE of a
      // SECURITY DEFINER function is RED by classification and cannot reach
      // CI green without it. The marker is an ACKNOWLEDGEMENT, not an
      // approval: the PR is a draft carrying needs-human-gate and the
      // migration ships UNAPPLIED until the owner applies it.
      "20260826182421_practice_work_history_v1.sql",
      // 2026-08-27: organization roles v1 — the multi-capability foundation
      // that lets an education institution register honestly instead of
      // calling itself a company. The marker records that the RED content is
      // INTENTIONAL and reviewed: grants on two NEW tables (this project's
      // pg_default_acl for schema public is empty, so a new table is otherwise
      // unreadable by `authenticated`), a SECURITY DEFINER writer RPC, and
      // `using (true)` on the VOCABULARY table only — identical to the
      // existing relationship_types_select precedent. The assignment table is
      // scoped, not permissive. Owner approval given in-session 2026-08-27
      // ("I approve proceeding with BOTH prepared owner-gated changes… This
      // approval applies only to the exact reviewed/tested scopes"), and the
      // marker was added in the same commit as that recorded decision.
      "20260827050000_organization_roles_v1.sql",
      // 2026-08-27: relationship invitations v1 — the institution↔learner
      // link. The marker records that the RED content is INTENTIONAL and
      // reviewed: CREATE OR REPLACE of five existing SECURITY DEFINER
      // functions, their re-asserted REVOKE/GRANT floor, seed DML on the
      // relationship registry, and one DROP that is not a removal of
      // capability — Postgres treats `create_invitation_v1` with an added
      // defaulted parameter as a NEW function, so leaving both would make
      // every 9-positional-argument call ambiguous. Nothing is dropped
      // otherwise, no policy changes, no grant widens. APPLIED to production
      // 2026-08-27 under owner ruling §1 ("APPROVED: Apply migration
      // 20260827200000 using the canonical Supabase MCP apply_migration path
      // only"), ledger 20260827132137; the marker was added in the same commit
      // as that record. Provenance guard:
      // lib/guards/relationship-invitations.test.ts.
      "20260827200000_relationship_invitations_v1.sql",
      // 2026-08-27: learner visibility, least privilege — the answer to the
      // consequence 20260827200000 disclosed rather than hid. The marker
      // records that the RED content is a CREATE OR REPLACE of ONE auth-core
      // SECURITY DEFINER predicate, `can_view_worker`, which the envelope
      // classes RED in either direction. This one NARROWS: the
      // engagement_contexts branch gains a single conjunct joining a new
      // fail-closed registry column, and every other arm is byte-identical.
      // Every relationship slug except `student` is seeded true, so employer,
      // company, agency, booking and project visibility are unchanged by
      // construction. Owner ruling 2026-08-27 §2 ("implement the smallest
      // architecture-consistent fix … Regression-prove employee/employer
      // visibility remains unchanged"), applied the same day and proven by a
      // controlled comparison on production with a NON-ADMIN organization
      // owner: one engagement row, employee -> visible, the same row as
      // student -> not visible. Provenance guard:
      // lib/guards/learner-visibility-least-privilege.test.ts.
      "20260827210000_learner_visibility_least_privilege_v1.sql",
      // 2026-08-28: LMC spend compensation (#1305) gained its marker under an
      // explicit owner approval whose scope was recorded VERBATIM, because an
      // approval remembered loosely is an approval that grows. Full record -
      // the wording, the reviewed HEAD 3f0e2ce7, the reviewed migration
      // sha256, the production pre-state and every post-apply check - lives in
      // docs/human-gates/lmc-spend-compensation-gate.md. Marker added in the
      // SAME commit as that record, per the procedure the worker display-name
      // gate above established.
      //
      // Worth stating plainly because it is a money ledger: the approval
      // covers the two findings this file actually raises
      // (security-definer-function, grant-or-revoke) and nothing else, and it
      // explicitly does NOT approve live payments, live-money activation, new
      // pricing, or any weakening of LMC authorization. The capability ships
      // switched OFF (`lmc_compensation_enabled` defaults false).
      "20260828090000_lmc_spend_compensation_v1.sql",
      // 2026-08-29: the profile email identity binding carries the marker as
      // the doctrine ACKNOWLEDGEMENT that it is RED (auth-core adjacent:
      // trigger on profiles, two SECURITY DEFINER recreates, two policy
      // replacements). Approved and applied 2026-08-29 (#1338).
      "20260829120000_profile_email_identity_binding_v1.sql",
      // 2026-08-29: the anonymous write bounds carry the marker as the
      // doctrine ACKNOWLEDGEMENT that the file is RED (grant-adjacent:
      // triggers on anon-writable tables, SECURITY DEFINER helpers, a public
      // RPC recreated). Its header says OWNER APPROVAL: PENDING — the marker
      // is not approval, and the file ships UNAPPLIED.
      "20260829130000_anon_write_bounds_v1.sql",
      // 2026-08-31: work-hour allocations v1 (M3, PR #1344) gained its marker
      // under the owner's closure-session decision, recorded VERBATIM in the
      // migration header and .github/scripts/owner-waivers.mjs:
      // "M3_MIGRATION_APPROVAL: APPROVE / HOURS_PRODUCT_GATE_WAIVER: APPROVE.
      // Approval scope is limited strictly to the fresh #1344 / package 0010
      // implementation." The marker acknowledges the three intentional RED
      // findings (grant-or-revoke incl. anon revoke, RLS policies on the new
      // table, updated_at trigger) reviewed in
      // docs/DECISIONS/0010-owner-migration-decision-package-2026-08-31.md,
      // and was added in the same commit as the scoped /dashboard/hours
      // waiver that same decision approved.
      "20260829140000_work_hour_allocations_v1.sql",
      // 2026-08-31: M3 compute wiring (20260831170000) carries the marker
      // under the owner's 2026-08-31 closure-session approval sequence
      // ("wire the actual timesheet compute path"), the follow-up slice the
      // repo records verbatim in docs/DECISIONS/0010 ("Wiring
      // `timesheet_compute_lines_v1` to aggregate from allocations is the
      // follow-up slice after the table exists") and in the APPLIED_LEDGER
      // row for ledger 20260831161725 ("timesheets stay honest-empty until
      // the compute-wiring follow-up (same owner-approved sequence) lands").
      // RED by route — it replaces the timesheet_compute_lines_v1 SECURITY
      // DEFINER body (the established re-issue idiom of 20260818150000 and
      // 20260819220000) — while creating and dropping nothing and running no
      // DML. The journal half is copied VERBATIM from 20260819220000; the
      // additions are the allocation source, the allocation-wins dedupe and
      // the combined 500-line cap. The marker lets CI classify it; merge and
      // production apply stay with the main session after review.
      "20260831170000_timesheet_compute_allocations_v1.sql",
]);
  });

  it("the ROLLBACK carries no marker — there is nothing to approve in undoing", () => {
    const down = readFileSync(
      join(MIGRATIONS, "..", "rollbacks", "20260804160000_booking_engagement_end_v2.down.sql"),
      "utf8",
    );
    expect(down).not.toMatch(/(^|\r?\n)[ \t]*--[ \t]*@human-gate-approved\b/i);
  });

  it("it is additive — v1 is deprecated, never dropped here", () => {
    const sql = readFileSync(join(MIGRATIONS, "20260804160000_booking_engagement_end_v2.sql"), "utf8");
    expect(sql).not.toMatch(/drop\s+function\s+(if\s+exists\s+)?public\.end_company_worker_engagement_v1/i);
    // …and it touches no existing object's shape or privileges.
    expect(sql).not.toMatch(/alter\s+table|create\s+policy|drop\s+policy|create\s+index/i);
  });
});
