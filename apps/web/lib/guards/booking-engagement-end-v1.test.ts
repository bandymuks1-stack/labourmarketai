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
