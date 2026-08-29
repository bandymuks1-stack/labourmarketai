import { describe, expect, it } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { readdirSync } from "node:fs";
import { join } from "node:path";

import { adminRiskEntry } from "@/lib/ai/registry/agents/admin-risk";
import { bookingRiskEntry } from "@/lib/ai/registry/agents/booking-risk";
import {
  MESSAGE_RATE_CAP,
  CONVERSATION_RATE_CAP,
  evaluateRateCap,
  rateCapWindowStartIso,
} from "@/lib/communication/rate-caps";

/**
 * W6 slice 4 — FRAUD AND SAFETY GATES.
 *
 * The platform has risk signals. It must never have a path from a signal to a
 * verdict about a person. This file pins that separation as a CURRENT FACT of
 * the source tree, so the path cannot be added quietly later.
 *
 * A SIGNAL IS NOT:
 *   proof of wrongdoing · a reputation record · a negative experience · an
 *   account block · grounds to delete a skill · a hold on someone's earnings ·
 *   a public mark.
 *
 * WHAT THIS SLICE DELIBERATELY DOES NOT DO. It builds no scoring model, no
 * fraud platform, and no enforcement mechanism. The audit below found that no
 * enforcement path exists today, so the honest deliverable is a LOCK on that
 * state — not a new subsystem invented to have something to gate. If the
 * product later needs enforcement, these tests are the checklist it must
 * satisfy: authorized human decision, stated reason, audit row, idempotency,
 * reviewable state, reversibility, no cross-workspace effect.
 *
 * WHY SOURCE PINS RATHER THAN BEHAVIOUR. The claim being defended is an
 * ABSENCE — "there is no code that does X". A behavioural test can only
 * exercise code that exists; only a search over the tree can assert that a
 * capability is missing. Each pin below states which absence it defends.
 */

const APP = join(__dirname, "..", "..");
const REPO = join(APP, "..", "..");

function readSource(rel: string): string {
  const p = join(APP, rel);
  return existsSync(p) ? readFileSync(p, "utf8") : "";
}

/** Every .ts/.tsx under a directory, recursively, excluding tests. */
function sourceFiles(rel: string): string[] {
  const root = join(APP, rel);
  if (!existsSync(root)) return [];
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, e.name);
      if (e.isDirectory()) {
        if (e.name === "node_modules" || e.name === ".next") continue;
        walk(full);
      } else if (/\.tsx?$/.test(e.name) && !/\.test\.tsx?$/.test(e.name)) {
        out.push(full);
      }
    }
  };
  walk(root);
  return out;
}

/**
 * ONE traversal, and it retains only COMPACT FACTS — never the file contents.
 *
 * The first version held the full text of every source file in a module-level
 * array for the whole suite. That is a lot of retained memory next to ~790
 * other test files, and it measurably slowed the run: the repo's other
 * tree-scanning guards began timing out (vitest's default 5s per test) and the
 * full-suite failure count went from 8 to 19 with this file present. The
 * guards were flaky before this slice — the sets differ run to run — but a new
 * guard has no business making it worse.
 *
 * So the scan happens once, each file is read and immediately reduced to the
 * handful of booleans these tests actually ask about, and the string is
 * dropped. `readSource` stays available for the few pins that need to look at
 * ONE named file.
 */
type FileFacts = {
  readonly rel: string;
  readonly mentionsRiskAgent: boolean;
  readonly writes: boolean;
  readonly deletesWorkerSkills: boolean;
  readonly namedSkillRemoval: boolean;
  readonly paymentHold: boolean;
  readonly publicRiskMark: boolean;
  readonly enforcementMarker: boolean;
  readonly aiWriteExecution: boolean;
  readonly isAi: boolean;
  readonly isTrustOrJournal: boolean;
  readonly mentionsRateCap: boolean;
};

const RISK_AGENT = /admin_risk|adminRisk|booking_risk|bookingRisk/;
const WRITE = /\.(insert|update|upsert|delete)\(|\.rpc\(|revalidatePath\(/;
const DELETES_WORKER_SKILLS = /from\(["']worker_skills["']\)[\s\S]{0,160}\.delete\(/;
/**
 * IDENTIFIER BOUNDARY. All five enforcement markers shipped with a literal
 * U+0008 where `\b` was intended (2026-08-02 → 2026-08-29): they compiled,
 * matched nothing, and every "stays advisory" invariant below passed
 * vacuously. The boundary is now an explicit non-alphanumeric one — NOT
 * `\b`, because `_` is a word character and `\bhold_payout\b` would let
 * `hold_payout_v1` (the repo's own RPC naming convention) walk past it.
 */
const ident = (alts: string): RegExp =>
  new RegExp(`(?<![A-Za-z0-9])(?:${alts})(?![A-Za-z0-9])`);
const NAMED_SKILL_REMOVAL = ident("delete_worker_skill|removeSkillForRisk|revokeSkill");
const PAYMENT_HOLD = ident(
  "payment_hold|withhold_payment|hold_payout|freeze_earnings|suspend_payout",
);
const PUBLIC_RISK_MARK = ident(
  "public_flag|publicly_flagged|fraud_badge|scam_badge|risk_badge",
);
const ENFORCEMENT_MARKERS = ident(
  "suspendAccount|banUser|blockAccount|deactivateProfile|removeSkillForRisk|holdEarnings",
);
const AI_WRITE_EXECUTION = ident(
  "executeWrite|applyAgentDecision|autoApply|enforceAgent|agentEnforce",
);

const AI_DIR = join("lib", "ai");
const REGISTRY_DIR = join("ai", "registry");
const EVALS_DIR = join("ai", "evals");
const TRUST_DIR = join("lib", "trust");
const JOURNAL_DIR = join("lib", "journal");

const FACTS: FileFacts[] = [...sourceFiles("lib"), ...sourceFiles("app")].map((f) => {
  const src = readFileSync(f, "utf8");
  return {
    rel: f.replace(APP, "").split(String.fromCharCode(92)).join("/"),
    mentionsRiskAgent:
      RISK_AGENT.test(src) && !f.includes(REGISTRY_DIR) && !f.includes(EVALS_DIR),
    writes: WRITE.test(src),
    deletesWorkerSkills: DELETES_WORKER_SKILLS.test(src),
    namedSkillRemoval: NAMED_SKILL_REMOVAL.test(src),
    paymentHold: PAYMENT_HOLD.test(src),
    publicRiskMark: PUBLIC_RISK_MARK.test(src),
    enforcementMarker: ENFORCEMENT_MARKERS.test(src),
    aiWriteExecution: AI_WRITE_EXECUTION.test(src),
    isAi: f.includes(AI_DIR),
    isTrustOrJournal: f.includes(TRUST_DIR) || f.includes(JOURNAL_DIR),
    mentionsRateCap: /rate_limited|RATE_CAP|evaluateRateCap/.test(src),
  };
  // `src` goes out of scope here — nothing large is retained.
});

const MIGRATIONS = join(REPO, "supabase", "migrations");
const MIGRATION_FILES = existsSync(MIGRATIONS)
  ? readdirSync(MIGRATIONS).filter((f) => f.endsWith(".sql"))
  : [];

// ── 1. The admin-risk agent is ADVISORY, and cannot be anything else ────────

describe("slice 4 — the admin-risk agent is advisory", () => {
  it("declares, in its own registry entry, that it never blocks anyone", () => {
    const rules = adminRiskEntry.safetyRules.join(" ").toLowerCase();
    expect(rules).toContain("never auto-reject");
    expect(rules).toMatch(/ban|block/);
    expect(rules).toContain("the admin decides");
    // The words it may never emit as an outcome.
    const blocked = adminRiskEntry.blockedClaims.map((c) => c.toLowerCase());
    expect(blocked).toContain("auto-reject");
    expect(blocked).toContain("banned");
  });

  it("emits a SUGGESTION and a severity — never a decision field", () => {
    const src = readSource("lib/ai/registry/agents/admin-risk.ts");
    expect(src).toContain("suggested_admin_action");
    // No field that could be read as an executed outcome.
    expect(src).not.toMatch(/\b(decision|verdict|enforcement|action_taken|applied)\s*:/);
    // Severity is a bounded advisory enum, never a number that could be
    // thresholded into an automatic action.
    expect(src).toMatch(/severity: z\.enum\(AI_CONFIDENCE\)/);
    expect(src).not.toMatch(/severity: z\.number/);
  });

  it("booking-risk is advisory on the same terms", () => {
    const rules = bookingRiskEntry.safetyRules.join(" ").toLowerCase();
    expect(rules.length).toBeGreaterThan(0);
    const src = readSource("lib/ai/registry/agents/booking-risk.ts");
    expect(src).not.toMatch(/\b(decision|verdict|enforcement|action_taken|applied)\s*:/);
  });

  it("no runtime code consumes either agent's OUTPUT", () => {
    // The first draft asserted that nothing outside the registry and the evals
    // MENTIONS these agents, and it flagged `lib/ai/runtime/task-routing.ts`.
    // That file turned out to be a pure STATIC MAP from agent key to task
    // type — routing metadata, not a reader of any agent result. Banning the
    // mention would have been a false positive dressed up as a rule, so the
    // test pins what actually matters: nothing that names these agents writes.
    const offenders = FACTS.filter((x) => x.mentionsRiskAgent && x.writes).map(
      (x) => x.rel,
    );
    expect(offenders).toEqual([]);
  });

  it("the only non-registry reference is routing metadata, and it stays inert", () => {
    // Pinned explicitly so the exemption above cannot silently widen.
    const routing = readSource("lib/ai/runtime/task-routing.ts");
    expect(routing).toMatch(/admin_risk:\s*"explain_match"/);
    expect(routing).not.toMatch(/\.(insert|update|upsert|delete)\(|\.rpc\(/);
    expect(routing).not.toMatch(/["']server-only["']/);
  });

  it("the AI runtime has no write-execution path at all", () => {
    // An agent that cannot be executed against a user is advisory by
    // construction, not by promise.
    const ai = FACTS.filter((x) => x.isAi);
    expect(ai.length).toBeGreaterThan(0);
    expect(ai.filter((x) => x.aiWriteExecution).map((x) => x.rel)).toEqual([]);
  });
});

// ── 2. No signal reaches enforcement, reputation, skills or money ───────────

describe("slice 4 — no enforcement primitive exists to be reached", () => {
  it("no table carries a user ban / suspension / block column", () => {
    // Checked against the MIGRATIONS, which are the schema's source of truth.
    // The three known matches are deliberately NOT user enforcement:
    //   ai_runs.blocked_reason        — an AI run's own safety gate
    //   learning_policy_settings.disabled_at/by — an operator policy toggle
    //   project_stages.blocked_reason — project workflow state
    const ALLOWED = /ai_runs|learning_policy_settings|project_stages/;
    const hits: string[] = [];
    for (const f of MIGRATION_FILES) {
      const src = readFileSync(join(MIGRATIONS, f), "utf8");
      for (const m of src.matchAll(
        /^\s*(\w*(?:banned|suspended|is_blocked|account_blocked|frozen|restricted)\w*)\s+(boolean|timestamptz|timestamp|text|uuid)/gim,
      )) {
        // Find the enclosing create-table name, cheaply.
        const before = src.slice(0, m.index ?? 0);
        const table = /create table[^(]*?(\w+)\s*\(/gi.exec(
          before.slice(before.lastIndexOf("create table")),
        )?.[1];
        if (!table || !ALLOWED.test(table)) hits.push(`${f}: ${m[1]} on ${table ?? "?"}`);
      }
    }
    expect(hits).toEqual([]);
  });

  it("the ONE worker-skill deletion is the worker's own save, and is ownership-gated", () => {
    // The first draft asserted that NOTHING deletes worker_skills, and it
    // flagged the skills API route. That route turned out to be the worker
    // editing their OWN skill set: it checks `ownsWorker`, diffs requested
    // against saved, and deletes what the person deselected. Banning it would
    // have banned self-management, not risk enforcement. So the rule is the
    // one actually meant: exactly one deletion site, owner-gated, and free of
    // any risk vocabulary.
    const deleters = FACTS.filter((x) => x.deletesWorkerSkills).map((x) => x.rel);
    expect(deleters, "exactly one worker-skill deletion site").toEqual([
      "/app/api/workers/[workerId]/skills/route.ts",
    ]);
    const only = readSource("app/api/workers/[workerId]/skills/route.ts");
    expect(only).toMatch(/ownsWorker\(/);
    expect(only).toMatch(/status: 403/);
    // A deselection, not a verdict: nothing about risk may appear in the one
    // file that can remove a skill.
    expect(only).not.toMatch(/risk|fraud|abuse|suspicious|penalt/i);
  });

  it("no OTHER module can remove a skill by name", () => {
    expect(FACTS.filter((x) => x.namedSkillRemoval).map((x) => x.rel)).toEqual([]);
  });

  it("no payment / earning hold mechanism exists", () => {
    expect(FACTS.filter((x) => x.paymentHold).map((x) => x.rel)).toEqual([]);
  });

  it("no code path marks a person publicly as a risk", () => {
    expect(FACTS.filter((x) => x.publicRiskMark).map((x) => x.rel)).toEqual([]);
  });
});

// ── 3. A signal is not reputation ──────────────────────────────────────────

describe("slice 4 — a signal is never a reputation input", () => {
  it("the risk agents are not referenced by any trust/reputation module", () => {
    const trust = FACTS.filter((x) => x.isTrustOrJournal);
    expect(trust.length).toBeGreaterThan(0);
    expect(trust.filter((x) => x.mentionsRiskAgent).map((x) => x.rel)).toEqual([]);
  });

  it("rate limiting is not referenced by any trust/reputation module", () => {
    // Hitting a spam cap must not become a fact about a person.
    const trust = FACTS.filter((x) => x.isTrustOrJournal);
    expect(trust.length).toBeGreaterThan(0);
    expect(trust.filter((x) => x.mentionsRateCap).map((x) => x.rel)).toEqual([]);
  });
});

// ── 4. Rate caps: transient, self-scoped, and default-closed ───────────────

describe("slice 4 — rate caps limit an action, they do not judge a person", () => {
  it("the decision vocabulary has no punitive state", () => {
    // allowed / rate_limited / unavailable — and nothing that persists.
    expect(evaluateRateCap(0, MESSAGE_RATE_CAP)).toBe("allowed");
    expect(evaluateRateCap(MESSAGE_RATE_CAP.max, MESSAGE_RATE_CAP)).toBe("rate_limited");
    expect(evaluateRateCap(MESSAGE_RATE_CAP.max + 1000, MESSAGE_RATE_CAP)).toBe(
      "rate_limited",
    );
  });

  it("is DEFAULT-CLOSED: an unreadable count refuses the write, never allows it", () => {
    for (const bad of [null, undefined, Number.NaN, -1]) {
      expect(evaluateRateCap(bad as number | null, MESSAGE_RATE_CAP)).toBe("unavailable");
    }
  });

  it("is a ROLLING WINDOW, so it expires on its own — never a lasting ban", () => {
    const now = Date.UTC(2026, 7, 2, 12, 0, 0);
    const start = new Date(rateCapWindowStartIso(MESSAGE_RATE_CAP, now)).getTime();
    expect(now - start).toBe(MESSAGE_RATE_CAP.windowMinutes * 60_000);
    expect(MESSAGE_RATE_CAP.windowMinutes).toBeLessThanOrEqual(24 * 60);
    expect(CONVERSATION_RATE_CAP.windowMinutes).toBeLessThanOrEqual(24 * 60);
  });

  it("the module is PURE — it cannot persist a mark even if asked to", () => {
    const src = readSource("lib/communication/rate-caps.ts");
    expect(src).not.toMatch(/from\(|\.rpc\(|insert|update|delete|fetch\(/);
    expect(src).not.toMatch(/["']server-only["']/);
  });

  it("hitting a cap writes nothing and escalates to nothing", () => {
    const actions = readSource("lib/communication/actions.ts");
    expect(actions).toContain("rate_limited");
    // The refusal returns; it does not record a strike, a flag, or a count.
    expect(actions).not.toMatch(/strike|violation_count|abuse_record|offen[cs]e/i);
    // And it never escalates into suspension.
    expect(actions).not.toMatch(/suspend|ban\b/i);
  });

  it("caps are scoped to the caller's OWN counts — no cross-workspace effect", () => {
    const actions = readSource("lib/communication/actions.ts");
    // The windowed reads filter on the caller, so one person's flood cannot
    // rate-limit anyone else, in any organization.
    expect(actions).toMatch(/rateCapWindowStartIso/);
    expect(actions).not.toMatch(/organization_id[\s\S]{0,80}rate/i);
  });
});

// ── 5. The one automated trust writer stays dormant and honestly labelled ───

describe("slice 4 — auto-confirm is not a capability and not a reputation", () => {
  it("an automatic confirmation is never presented as a human one", () => {
    const review = readSource("lib/journal/review-status.ts");
    expect(review).toMatch(/auto_confirm/);
    // W6 slice 1 pinned the qualifier; slice 4 pins that it still exists, so a
    // dormant automated writer cannot quietly start looking like a person.
    expect(review).toMatch(/rowIsAutomatic|automatic/i);
  });

  it("a learning signal is not an input to confidence", () => {
    // STRUCTURAL, not lexical — the third time this trap fired in W6. A word
    // search for "photo" flagged confidence.ts's own doctrine comment ("it
    // must never consume … photos-as-votes"), i.e. the very sentence that
    // forbids the thing being tested for. What must be pinned is the INPUT
    // TYPE, as a closed set.
    const confidence = readSource("lib/journal/confidence.ts");
    const inputs = /export type ConfidenceInputs = \{([\s\S]*?)\};/.exec(confidence)?.[1] ?? "";
    expect(inputs.length).toBeGreaterThan(0);
    const fields = [...inputs.matchAll(/^\s{2}(\w+)\s*[?:]/gm)].map((m) => m[1]).sort();
    // W6 slice 2's containment, re-pinned here so a risk or learning signal
    // cannot be added as a fifth term.
    expect(fields).toEqual([
      "lastConfirmationAt",
      "managerConfirmedEntries",
      "selfLoggedEntries",
      "uniqueConfirmers",
    ]);
    // And the formula reads nothing beyond that set.
    const formula = /const raw =([\s\S]*?);/.exec(confidence)?.[1] ?? "";
    for (const term of formula.matchAll(/inputs\.(\w+)/g)) {
      expect(fields).toContain(term[1]);
    }
  });

  it("zero policy rows is rendered as absence, never as an active learning system", () => {
    // The honesty rule: an empty queue/policy table must not be presented as
    // "the system is learning". Pinned on the module that reads it.
    const learning = readSource("lib/learning/learning.ts");
    if (learning.length > 0) {
      expect(learning).not.toMatch(/\bis learning\b|actively learning/i);
    }
  });
});

// ── 6. If enforcement is ever built, this is the contract it must meet ──────

describe("slice 4 — the enforcement contract (currently vacuous, deliberately)", () => {
  /**
   * There is no enforcement path today — every test above asserts an absence.
   * This block states the requirements ANY future path must satisfy, and fails
   * loudly the moment one appears without them. It is written as a discovery
   * test rather than a comment so that "we forgot the audit row" is a red
   * build, not a code-review hope.
   */
  it("no enforcement entry point exists yet", () => {
    const offenders = FACTS.filter((x) => x.enforcementMarker).map((x) => x.rel);
    expect(
      offenders,
      "An enforcement path appeared. It must require: an authorized human decision, " +
        "a stated reason, an audit_logs row, idempotency, a reviewable state, " +
        "reversibility, and no cross-workspace effect. Extend this guard to prove each.",
    ).toEqual([]);
  });

  it("no AI agent output is wired to an enforcement marker", () => {
    const mixed = FACTS.filter((x) => x.enforcementMarker && x.mentionsRiskAgent).map(
      (x) => x.rel,
    );
    expect(mixed, "a file mixes agent output with enforcement").toEqual([]);
  });
});

// ── NEGATIVE CONTROL — the enforcement markers can fire ─────────────────────

describe("NEGATIVE CONTROL — every enforcement marker fires on the thing it forbids", () => {
  const CASES: readonly [name: string, re: RegExp, hit: string[], miss: string[]][] = [
    [
      "NAMED_SKILL_REMOVAL",
      NAMED_SKILL_REMOVAL,
      ['rpc("delete_worker_skill", { id })', "await removeSkillForRisk(x)", "delete_worker_skill_v1("],
      ["undelete_worker_skill(", "revokeSkillset(", "removeSkillForRisky"],
    ],
    [
      "PAYMENT_HOLD",
      PAYMENT_HOLD,
      ["status: 'payment_hold'", "hold_payout_v1(", "await suspend_payout("],
      ["unfreeze_earnings(", "payment_holds_count", "prehold_payout"],
    ],
    [
      "PUBLIC_RISK_MARK",
      PUBLIC_RISK_MARK,
      ["<RiskBadge kind='fraud_badge' />", "public_flag = true", "scam_badge_v2"],
      ["public_flags_total", "risk_badges", "unfraud_badge"],
    ],
    [
      "ENFORCEMENT_MARKERS",
      ENFORCEMENT_MARKERS,
      ["await suspendAccount(id)", "banUser(", "holdEarnings_v1("],
      ["unbanUser(", "blockAccounts(", "deactivateProfiles"],
    ],
    [
      "AI_WRITE_EXECUTION",
      AI_WRITE_EXECUTION,
      ["executeWrite(decision)", "applyAgentDecision(", "autoApply_v1("],
      ["autoApplyAll(", "reexecuteWrite(", "enforceAgents("],
    ],
  ];

  for (const [name, re, hits, misses] of CASES) {
    it(`${name} matches its markers and ignores near-misses`, () => {
      for (const h of hits) expect(re.test(h), `${name} must match ${JSON.stringify(h)}`).toBe(true);
      for (const m of misses) expect(re.test(m), `${name} must not match ${JSON.stringify(m)}`).toBe(false);
    });
  }

  it("no marker carries a control character where a boundary was meant", () => {
    for (const [name, re] of CASES) {
      for (const ch of re.source) {
        expect(ch.charCodeAt(0) < 0x20, `${name} contains a control character`).toBe(false);
      }
    }
  });
});
