import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  TRAINING_ASSIGNMENT_STATUSES,
  TRAINING_EVENT_TYPES,
  TRAINING_SKILL_PROVENANCE,
  deriveExpiryState,
} from "@/lib/training/training-model";
import {
  REVIEW_CYCLE_STATUSES,
  REVIEW_EVIDENCE_KINDS,
  REVIEW_EVENT_TYPES,
  REVIEW_STATUSES,
  deriveReviewCompleteness,
} from "@/lib/reviews/reviews-model";
import {
  DECISION_EVENT_TYPES,
  DECISION_STATUSES,
  DECISION_WORKFLOW_CONTEXT,
} from "@/lib/decisions/decisions-model";

/**
 * TRAINING & CERTIFICATION + DEVELOPMENT REVIEWS + MANAGEMENT DECISIONS v1
 * — repo-structural guard (train K).
 *
 * Pins the TS↔SQL contract of the three human-gated migrations and — above
 * everything else — the three product-identity doctrines:
 *
 *   1. TRAINING evidence may support skills but must NEVER fabricate
 *      competence: no worker_skills write, no journal_entry_skills write,
 *      one fixed provenance, and the canonical skill model untouched.
 *   2. PERFORMANCE: no rating, no score, no grade, no rank, no universal
 *      worker score, no AI ranking — asserted against the SQL itself, not
 *      against a comment.
 *   3. MANAGEMENT DECISIONS: the workflow engine's multi-approver step IS
 *      the vote; no second voting mechanism and no task machinery here.
 *
 * Strengthen this guard when the contract changes — never weaken or delete
 * it.
 */

const WEB = join(__dirname, "..", "..");
const REPO = join(WEB, "..", "..");

const migration = (name: string) =>
  join(REPO, "supabase", "migrations", `${name}.sql`);
const rollback = (name: string) =>
  join(REPO, "supabase", "rollbacks", `${name}.down.sql`);

const NAMES = [
  "20260817230000_training_certification_v1",
  "20260817231000_performance_reviews_v1",
  "20260817232000_management_decisions_v1",
] as const;

const sqlTraining = readFileSync(migration(NAMES[0]), "utf8");
const sqlReviews = readFileSync(migration(NAMES[1]), "utf8");
const sqlDecisions = readFileSync(migration(NAMES[2]), "utf8");
const ALL_SQL = [sqlTraining, sqlReviews, sqlDecisions];

const read = (rel: string) => readFileSync(join(WEB, rel), "utf8");

const trainingModel = read("lib/training/training-model.ts");
const trainingReads = read("lib/training/training.ts");
const trainingActions = read("lib/training/training-actions.ts");
const trainingUi = read("components/app/training-register.tsx");

const reviewsModel = read("lib/reviews/reviews-model.ts");
const reviewsReads = read("lib/reviews/reviews.ts");
const reviewsActions = read("lib/reviews/reviews-actions.ts");
const reviewsUi = read("components/app/development-reviews-section.tsx");

const decisionsModel = read("lib/decisions/decisions-model.ts");
const decisionsReads = read("lib/decisions/decisions.ts");
const decisionsActions = read("lib/decisions/decisions-actions.ts");
const decisionsUi = read("components/app/management-decisions-section.tsx");

const ALL_TS = [
  trainingModel, trainingReads, trainingActions, trainingUi,
  reviewsModel, reviewsReads, reviewsActions, reviewsUi,
  decisionsModel, decisionsReads, decisionsActions, decisionsUi,
];

/**
 * Every admitted literal of every `check (<col> in (…))` clause for a column,
 * across the whole file. Scans forward from each occurrence to the matching
 * close paren so multi-line CHECK bodies (the repo's dominant formatting) are
 * read correctly rather than silently returning an empty set.
 */
function admittedValues(sql: string, column: string): string[] {
  const out = new Set<string>();
  // Whitespace/newline tolerant: the repo wraps long CHECK bodies freely.
  const opener = new RegExp(`check\\s*\\(\\s*${column}\\s+in\\s*\\(`, "g");
  for (const m of sql.matchAll(opener)) {
    let i = (m.index ?? 0) + m[0].length;
    const bodyStart = i;
    let depth = 1;
    while (i < sql.length && depth > 0) {
      if (sql[i] === "(") depth += 1;
      else if (sql[i] === ")") depth -= 1;
      i += 1;
    }
    for (const v of sql.slice(bodyStart, i - 1).matchAll(/'([a-z_]+)'/g)) {
      out.add(v[1]);
    }
  }
  return [...out];
}

/** Comment-stripped source: a doctrine assertion must bite on CODE, and a
 *  comment saying "never writes X" must not be mistaken for writing X. */
function code(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .split("\n")
    .map((l) => l.replace(/(^|\s)(--|\/\/).*$/, "$1"))
    .join("\n");
}

describe("train K — gated migration artefacts", () => {
  it("all three migrations, paired rollbacks, gate docs and the db proof exist", () => {
    for (const n of NAMES) {
      expect(existsSync(migration(n)), `${n} migration`).toBe(true);
      expect(existsSync(rollback(n)), `${n} rollback`).toBe(true);
    }
    for (const doc of [
      "training-certification-gate.md",
      "performance-reviews-gate.md",
      "management-decisions-gate.md",
    ]) {
      expect(existsSync(join(REPO, "docs", "human-gates", doc)), doc).toBe(true);
    }
    expect(
      existsSync(join(REPO, "scripts", "db-proof", "training-development-v1.sh")),
    ).toBe(true);
  });

  it("each marker cites the owner mandate; no rollback carries one", () => {
    for (const [i, sql] of ALL_SQL.entries()) {
      // The SAME regex .github/scripts/migration-safety.mjs uses.
      expect(sql, NAMES[i]).toMatch(
        /(^|\r?\n)[ \t]*--[ \t]*@human-gate-approved\b/i,
      );
      expect(sql, NAMES[i]).toContain("owner mandate 2026-08-17");
      expect(sql, NAMES[i]).toContain("§4 migration authority");
      expect(sql, NAMES[i]).toContain("DRAFT — needs-human-gate");
      const down = readFileSync(rollback(NAMES[i]), "utf8");
      expect(down, NAMES[i]).not.toMatch(
        /(^|\r?\n)[ \t]*--[ \t]*@human-gate-approved\b/i,
      );
      // Every rollback REFUSES while real rows exist.
      expect(down, NAMES[i]).toContain("refusing to roll back");
    }
  });

  it("hard apply-order dependencies are asserted in the body, not only stated", () => {
    expect(sqlTraining).toContain("to_regclass('public.org_documents')");
    expect(sqlTraining).toContain("to_regclass('public.document_files')");
    expect(sqlDecisions).toContain("to_regclass('public.workflow_instances')");
    expect(sqlDecisions).toContain("to_regclass('public.work_tasks')");
  });

  it("the APPLIED_LEDGER carries a PENDING-APPLY-BY-LEAD entry for each", () => {
    const ledger = readFileSync(join(REPO, "docs", "APPLIED_LEDGER.md"), "utf8");
    for (const n of NAMES) {
      expect(ledger).toContain(`${n}.sql`);
      const entry = ledger.split(`${n}.sql`)[1]?.slice(0, 400);
      expect(entry, n).toContain("PENDING APPLY BY LEAD");
    }
  });

  it("no module touches an existing table, policy or notification constraint", () => {
    for (const [i, sql] of ALL_SQL.entries()) {
      expect(sql, NAMES[i]).not.toMatch(
        /alter table (if exists )?public\.notification_events/i,
      );
      expect(sql, NAMES[i]).not.toMatch(
        /(alter|drop)\s+table\s+(if exists\s+)?public\.(worker_skills|journal_entry_skills|worker_documents|work_tasks|org_documents|workflow_\w+)\b/i,
      );
      // No engine or document-engine function is recreated.
      expect(sql, NAMES[i]).not.toMatch(
        /create or replace function public\.(start_workflow|decide_workflow|acknowledge_document|assign_document)/i,
      );
    }
  });
});

describe("1. TRAINING — evidence never fabricates competence", () => {
  it("the SQL status + event vocabularies match the TS model exactly", () => {
    expect(admittedValues(sqlTraining, "status").sort()).toEqual(
      [...TRAINING_ASSIGNMENT_STATUSES].sort(),
    );
    expect(admittedValues(sqlTraining, "event_type").sort()).toEqual(
      [...TRAINING_EVENT_TYPES].sort(),
    );
  });

  it("the canonical skill model is NEVER written", () => {
    // Neither the closed-vocabulary provenance column nor the journal-bound
    // evidence table may be written by this module.
    expect(sqlTraining).not.toMatch(
      /(insert|update)\s+(into\s+)?public\.worker_skills\b/i,
    );
    expect(sqlTraining).not.toMatch(
      /(insert|update)\s+(into\s+)?public\.journal_entry_skills\b/i,
    );
    for (const src of [trainingReads, trainingActions, trainingUi]) {
      // Comment-stripped: the modules DOCUMENT the seam, they must not use it.
      expect(code(src)).not.toContain("worker_skills");
      expect(code(src)).not.toContain("journal_entry_skills");
    }
    // The seam is documented in the migration for the later train.
    const prose = sqlTraining.replace(/\r?\n--\s*/g, " ");
    expect(prose).toContain("SKILL SEAM");
    expect(prose).toContain("worker_skills_source_check");
  });

  it("the linkage table carries ONE fixed provenance and no competence field", () => {
    expect(sqlTraining).toContain(
      `check (provenance = '${TRAINING_SKILL_PROVENANCE}')`,
    );
    const table = /create table if not exists public\.training_skill_links \(([\s\S]*?)\n\);/.exec(
      sqlTraining,
    );
    expect(table, "training_skill_links table not found").not.toBeNull();
    expect(table?.[1] ?? "").not.toMatch(
      /\b(level|score|rating|grade|rank|verified|confidence)\b/i,
    );
  });

  it("the acknowledgement mechanism is the document engine's, not a second one", () => {
    // No ack table, no ack command anywhere in this module.
    expect(sqlTraining).not.toMatch(/create table if not exists public\.\w*acknowledge/i);
    expect(sqlTraining).not.toMatch(/create or replace function public\.\w*acknowledge/i);
    // The migration points at the real one instead.
    expect(sqlTraining).toContain("document_acknowledgements");
    expect(trainingActions).toContain("acknowledgeDocumentAction");
  });

  it("completion is self-only + fill-once at BOTH layers", () => {
    expect(sqlTraining).toContain("training_assignments_fill_once");
    expect(sqlTraining).toContain(
      "training completion is fill-once: the completion stamp is immutable",
    );
    // The RPC compares against auth.uid() rather than a caller-supplied id.
    const body = sqlTraining.split("complete_training_assignment_v1")[2] ?? "";
    expect(body).toContain("a.assignee_profile_id <> uid");
  });

  it("all seven commands exist, are anon-revoked, and are the only write paths", () => {
    const rpcs = [
      "create_training_program_v1",
      "update_training_program_v1",
      "assign_training_v1",
      "complete_training_assignment_v1",
      "attach_training_certificate_v1",
      "set_training_assignment_expired_v1",
      "link_training_skill_v1",
    ];
    for (const rpc of rpcs) {
      expect(sqlTraining).toContain(`create or replace function public.${rpc}(`);
      expect(sqlTraining).toMatch(
        new RegExp(`revoke all on function public\\.${rpc}\\([^)]*\\) from anon;`),
      );
      expect(trainingActions).toContain(`"${rpc}"`);
    }
    expect(sqlTraining).toMatch(/from authenticated;/);
    expect(sqlTraining).not.toMatch(
      /create policy [a-z_]+ on public\.training[a-z_]*\s+for (insert|update|delete)/i,
    );
  });

  it("expiry is a render-time derivation, never a background job", () => {
    const today = new Date("2026-08-18T00:00:00Z");
    expect(deriveExpiryState(null, today)).toBe("none");
    expect(deriveExpiryState("2026-08-17", today)).toBe("lapsed");
    expect(deriveExpiryState("2026-09-01", today)).toBe("expiring");
    expect(deriveExpiryState("2027-01-01", today)).toBe("valid");
    // No scheduler wiring of any kind ships with the module.
    expect(sqlTraining).not.toMatch(/pg_cron|cron\.schedule/i);
  });
});

describe("2. PERFORMANCE — no score exists anywhere, proven from the SQL", () => {
  const FORBIDDEN =
    /\b(rating|score|grade|ranking|rank|stars|points|percentile|competency_level)\b/i;

  it("the review schema contains NO rating/score/grade/rank column", () => {
    for (const table of [
      "review_cycles",
      "performance_reviews",
      "review_evidence_links",
      "performance_review_events",
    ]) {
      const rx = new RegExp(
        `create table if not exists public\\.${table} \\(([\\s\\S]*?)\\n\\);`,
      );
      const m = rx.exec(sqlReviews);
      expect(m, `${table} not found in the migration`).not.toBeNull();
      // Column lines only — a prose comment may legitimately say "no score".
      const columns = (m?.[1] ?? "")
        .split("\n")
        .filter((l) => !l.trim().startsWith("--") && !l.includes("constraint"))
        .join("\n");
      expect(columns, `${table} must carry no assessment column`).not.toMatch(
        FORBIDDEN,
      );
    }
  });

  it("no command accepts a score, and the TS layer exports no rating vocabulary", () => {
    expect(sqlReviews).not.toMatch(/p_(rating|score|grade|rank)\b/i);
    for (const src of [reviewsModel, reviewsActions, reviewsReads]) {
      expect(src).not.toMatch(/export const \w*(RATING|SCORE|GRADE|RANK)\w*/i);
    }
    // The UI offers no rating control of any kind (comment-stripped: the
    // section's own doc comment legitimately explains the absence).
    expect(code(reviewsUi)).not.toMatch(/type="range"|★|\bstars?\b/i);
    expect(code(reviewsUi)).not.toMatch(FORBIDDEN);
  });

  it("the SQL status + evidence + event vocabularies match the TS model", () => {
    expect(admittedValues(sqlReviews, "status").sort()).toEqual(
      [...new Set([...REVIEW_CYCLE_STATUSES, ...REVIEW_STATUSES])].sort(),
    );
    expect(admittedValues(sqlReviews, "kind").sort()).toEqual(
      [...REVIEW_EVIDENCE_KINDS].sort(),
    );
    expect(admittedValues(sqlReviews, "event_type").sort()).toEqual(
      [...REVIEW_EVENT_TYPES].sort(),
    );
  });

  it("FACT / EVIDENCE / SUBJECTIVE OBSERVATION are separated and labelled", () => {
    const prose = sqlReviews.replace(/\r?\n--\s*/g, " ");
    expect(prose).toContain("SUBJECTIVE");
    expect(sqlReviews).toContain("SUBJECTIVE OBSERVATION written by the subject");
    // Each input is stamped with its own author/time — an opinion always
    // carries a name.
    expect(sqlReviews).toContain("manager_input_by");
    expect(sqlReviews).toContain("worker_input_at");
    // The UI renders an explicit author label above every free-text block.
    expect(reviewsUi).toContain('t("workerVoiceLabel")');
    expect(reviewsUi).toContain('t("managerVoiceLabel")');
    const en = JSON.parse(readFileSync(join(WEB, "messages", "en.json"), "utf8")) as {
      developmentReviews: { noScoreNote: string; workerVoiceLabel: string };
    };
    expect(en.developmentReviews.noScoreNote).toContain("no rating");
    expect(en.developmentReviews.workerVoiceLabel).toContain("own words");
  });

  it("visibility is narrow and a closed record is frozen", () => {
    expect(sqlReviews).toContain("review_can_view_v1");
    // Plain org members are NOT admitted by the predicate.
    const helper = sqlReviews.split("create or replace function public.review_can_view_v1")[1] ?? "";
    expect(helper).toContain("subject_profile_id = auth.uid()");
    expect(helper).toContain("reviewer_profile_id = auth.uid()");
    expect(helper).not.toContain("has_org_demand_access");
    expect(sqlReviews).toContain("a closed performance review is immutable");
    // Pure derivation stays counts-and-booleans only.
    const p = deriveReviewCompleteness({
      workerInput: "x",
      managerInput: null,
      developmentPlan: null,
    });
    expect(p.readyToClose).toBe(false);
    expect(Object.values(p).every((v) => typeof v === "boolean")).toBe(true);
  });
});

describe("3. MANAGEMENT DECISIONS — thin over the engines", () => {
  it("the SQL status + event vocabularies match the TS model", () => {
    expect(admittedValues(sqlDecisions, "status").sort()).toEqual(
      [...DECISION_STATUSES].sort(),
    );
    expect(admittedValues(sqlDecisions, "event_type").sort()).toEqual(
      [...DECISION_EVENT_TYPES].sort(),
    );
  });

  it("there is NO second voting mechanism", () => {
    expect(sqlDecisions).not.toMatch(/\b(vote|ballot|tally|quorum)_?\w*\s+(text|int|boolean|jsonb)/i);
    expect(sqlDecisions).not.toMatch(
      /create table if not exists public\.\w*(vote|ballot)\w*/i,
    );
    expect(sqlDecisions).not.toMatch(
      /create or replace function public\.\w*(vote|approve_decision|decide_decision)\w*/i,
    );
    for (const src of [decisionsModel, decisionsActions, decisionsUi]) {
      // Comment-stripped: the modules DOCUMENT that they hold no vote, so the
      // words appear in prose; they must not appear in code.
      expect(code(src)).not.toMatch(/\b(castVote|tally|ballot|quorum)\b/i);
    }
    // The engine's context value is REUSED, never widened.
    expect(DECISION_WORKFLOW_CONTEXT).toBe("management_decision");
    const engine = readFileSync(
      migration("20260817130000_workflow_engine_v1"),
      "utf8",
    );
    expect(engine).toContain("'management_decision'");
  });

  it("the mirror can only follow a REAL pending engine instance", () => {
    expect(sqlDecisions).toContain("context_entity_type = 'management_decision'");
    expect(sqlDecisions).toMatch(/from public\.workflow_instances/);
    expect(sqlDecisions).toContain("return 'no_instance'");
    // The app layer starts instances through the ENGINE's own command.
    expect(decisionsActions).toContain('"start_workflow_instance_v1"');
    // ...and never through a decide/approve command of its own.
    expect(decisionsActions).not.toContain("decide_workflow_step_v1");
    // A result is only recordable after the engine approved.
    expect(sqlDecisions).toContain("if d.status <> 'approved' then return 'invalid_state'");
  });

  it("follow-up work links to REAL work_tasks and duplicates no task field", () => {
    const table = /create table if not exists public\.decision_task_links \(([\s\S]*?)\n\);/.exec(
      sqlDecisions,
    );
    expect(table).not.toBeNull();
    expect(table?.[1] ?? "").toContain("references public.work_tasks(id)");
    expect(table?.[1] ?? "").not.toMatch(
      /\b(title|status|assignee_profile_id|due_at|priority)\b/,
    );
    // No task is ever created by this module.
    expect(sqlDecisions).not.toMatch(/insert into public\.work_tasks/i);
    expect(decisionsActions).not.toContain("create_work_task_v1");
  });

  it("all seven commands exist, are anon-revoked, and writes stay RPC-only", () => {
    const rpcs = [
      "create_management_decision_v1",
      "update_management_decision_v1",
      "submit_management_decision_v1",
      "sync_management_decision_v1",
      "record_management_decision_result_v1",
      "attach_decision_document_v1",
      "link_decision_task_v1",
    ];
    for (const rpc of rpcs) {
      expect(sqlDecisions).toContain(`create or replace function public.${rpc}(`);
      expect(sqlDecisions).toMatch(
        new RegExp(`revoke all on function public\\.${rpc}\\([^)]*\\) from anon;`),
      );
    }
    for (const rpc of rpcs.filter((r) => r !== "sync_management_decision_v1")) {
      expect(decisionsActions).toContain(`"${rpc}"`);
    }
    expect(decisionsReads).toContain('"sync_management_decision_v1"');
    expect(sqlDecisions).not.toMatch(
      /create policy [a-z_]+ on public\.(management_decision|decision_)[a-z_]*\s+for (insert|update|delete)/i,
    );
  });

  it("the nav-guard claim is corrected honestly, and the marketing guard stays strict", () => {
    // The audit's "nav guard actively excludes it" resolves to the PUBLIC
    // MARKETING header's template-label ban. It is unrelated and untouched.
    const navGuard = read("lib/guards/public-nav-canonical.test.ts");
    expect(navGuard).toContain('expect(Object.values(n)).not.toContain("Sprendimai");');
    expect(navGuard).toContain('expect(Object.values(n)).not.toContain("Ištekliai");');
    // The correction is recorded where a future reader will find it.
    const prose = sqlDecisions.replace(/\r?\n--\s*/g, " ");
    expect(prose).toContain("NAV-GUARD NOTE");
    expect(prose).toContain("public-nav-canonical.test.ts");
    // The surface ships as a SECTION on an existing route — no nav item.
    expect(
      existsSync(join(WEB, "app", "[locale]", "dashboard", "network", "page.tsx")),
    ).toBe(true);
    expect(decisionsActions).toContain("/dashboard/network?dec=");
  });
});

describe("4. cross-cutting — no AI, no sending, honest degradation", () => {
  it("no module calls a model or sends anything outbound", () => {
    for (const src of ALL_TS) {
      expect(src).not.toMatch(/from ["'](openai|@anthropic-ai|@google\/gener)/i);
      expect(src).not.toMatch(/from ["'](nodemailer|@sendgrid|twilio)/i);
      expect(src).not.toMatch(/fetch\(\s*["']https?:/i);
    }
    for (const sql of ALL_SQL) {
      expect(sql).not.toMatch(/\bhttp_(get|post)\b|pg_net|net\.http/i);
    }
  });

  it("every read degrades honestly on a missing migration", () => {
    for (const src of [trainingReads, reviewsReads, decisionsReads]) {
      expect(src).toContain('kind: "needs-migration"');
    }
    for (const src of [trainingActions, reviewsActions, decisionsActions]) {
      expect(src).toContain('"needs_migration"');
    }
    for (const ui of [trainingUi, reviewsUi, decisionsUi]) {
      expect(ui).toContain('t("notAvailable")');
    }
  });

  it("the acting organization is resolved server-side, never from the form", () => {
    for (const src of [trainingActions, reviewsActions, decisionsActions]) {
      expect(src).toContain("requireEmployerCompany");
      expect(src).not.toMatch(/formData\.get\(["']organizationId["']\)/);
    }
  });

  it("all 11 catalogs carry the three namespaces with the same key shape", () => {
    const locales = ["en", "lt", "lv", "et", "nl", "de", "da", "no", "sv", "pl", "ru"];
    const flatten = (obj: Record<string, unknown>, prefix = ""): string[] =>
      Object.entries(obj).flatMap(([k, v]) =>
        typeof v === "object" && v !== null
          ? flatten(v as Record<string, unknown>, `${prefix}${k}.`)
          : [`${prefix}${k}`],
      );
    for (const ns of ["training", "developmentReviews", "managementDecisions"] as const) {
      const shapes = new Map<string, string>();
      for (const locale of locales) {
        const catalog = JSON.parse(
          readFileSync(join(WEB, "messages", `${locale}.json`), "utf8"),
        ) as Record<string, Record<string, unknown> | undefined>;
        expect(catalog[ns], `${locale}.json misses ${ns}`).toBeDefined();
        shapes.set(locale, flatten(catalog[ns] ?? {}).sort().join("|"));
      }
      const enShape = shapes.get("en");
      for (const [locale, shape] of shapes) {
        expect(shape, `${locale} ${ns} keys differ from en`).toBe(enShape);
      }
    }
  });
});
