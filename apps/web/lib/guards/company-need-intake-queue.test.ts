import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

/**
 * PUBLIC INTAKE OWNER QUEUE v1 — SAFETY GUARDS.
 *
 * The owner/internal queue lets an admin review and status the anonymous
 * public /company-need submissions persisted in company_need_public_intakes
 * (PR #678). This guard pins the safe shape so the queue can never silently
 * weaken the public security model it sits behind:
 *   - the queue reads/writes ONLY via the service-role admin client and is
 *     gated by isSuperadmin() on every service-role entry point (no row
 *     leaks to a non-admin);
 *   - the status action is double-gated (requireSuperadmin + the service
 *     layer's isSuperadmin), status is the closed operator set, and the app
 *     degrades honestly (42P01) when the table is absent;
 *   - the feature adds NO migration, NO RLS policy, and NO anon/authenticated
 *     table grant — the anonymous public path stays write-only-via-RPC and
 *     read-only-via-service-role exactly as PR #678 shipped it;
 *   - the queue sends NOTHING outbound (no email/SMS/push/Telegram/webhook);
 *   - the page lives under the requireSuperadmin-gated admin subtree.
 */

const APP_ROOT = join(__dirname, "..", "..");
const REPO_ROOT = join(APP_ROOT, "..", "..");
const readApp = (rel: string) => readFileSync(join(APP_ROOT, rel), "utf8");

// Strip block + line comments so assertions about EXECUTABLE code are not
// tripped by the explanatory docstrings (which legitimately name the things
// the feature promises NOT to do — Telegram, webhooks, customer_requests).
const stripComments = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\/\/[^\n]*/g, " ");

const DATA = "lib/admin/company-need-intakes.ts";
const SHARED = "lib/admin/company-need-intake-shared.ts";
const ACTION = "lib/admin/company-need-intake-actions.ts";
const PAGE = "app/[locale]/dashboard/admin/company-need-intakes/page.tsx";
const CONTROL = "components/app/company-need-intake-status.tsx";
const TABLE = "company_need_public_intakes";
const STATUSES = ["new", "contacted", "qualified", "rejected"] as const;

describe("the queue data layer is admin-gated and service-role-only", () => {
  const data = readApp(DATA);
  const dataCode = stripComments(data);

  it("reads/writes through the service-role admin client", () => {
    expect(data).toContain("createAdminClient");
    expect(data).toContain(`from("${TABLE}")`);
  });

  it("gates BOTH list and status-update behind isSuperadmin()", () => {
    expect(data).toContain("isSuperadmin");
    // one guard per exported service function (list + set)
    const guards = data.match(/if \(!\(await isSuperadmin\(\)\)\)/g) ?? [];
    expect(guards.length).toBeGreaterThanOrEqual(2);
  });

  it("constrains status to exactly the closed operator set", () => {
    const shared = stripComments(readApp(SHARED));
    for (const s of STATUSES) expect(shared).toContain(`"${s}"`);
    expect(shared).not.toContain('"verified"');
    expect(shared).not.toContain('"draft"');
    // the server module re-uses the shared closed set (single source of truth)
    expect(data).toContain("company-need-intake-shared");
  });

  it("degrades honestly when the intake table is absent (42P01)", () => {
    expect(data).toContain("42P01");
    expect(data).toContain("needs-migration");
  });

  it("never touches customer_requests", () => {
    expect(dataCode).not.toContain("customer_requests");
  });
});

describe("the status action is double-gated and boring", () => {
  const action = readApp(ACTION);

  it("app-layer gate: requireSuperadmin before any work", () => {
    expect(action).toContain("requireSuperadmin");
  });

  it("delegates the write to the admin-gated service function", () => {
    expect(action).toContain("setCompanyNeedIntakeStatus");
    expect(action).toContain("revalidatePath");
  });
});

describe("the page sits under the gated admin subtree", () => {
  const page = readApp(PAGE);

  it("re-asserts requireSuperadmin (defense-in-depth)", () => {
    expect(page).toContain("requireSuperadmin(locale)");
  });

  it("renders honest empty / migration / not-admin states", () => {
    expect(page).toContain("admin-company-need-intakes-empty");
    expect(page).toContain("admin-company-need-intakes-migration-blocker");
    expect(page).toContain("admin-company-need-intakes-not-admin");
  });
});

describe("the feature sends nothing outbound and adds no DB weakening", () => {
  const files = stripComments(
    [DATA, ACTION, PAGE, CONTROL].map(readApp).join("\n"),
  );

  it("no outbound channels in any queue file", () => {
    for (const bad of [
      "fetch(",
      "nodemailer",
      "sendgrid",
      "resend",
      "telegram",
      "webhook",
      "smtp",
    ]) {
      expect(files.toLowerCase()).not.toContain(bad);
    }
  });

  it("adds no migration and no RLS policy / anon grant for the table", () => {
    const migDir = join(REPO_ROOT, "supabase", "migrations");
    const touching = readdirSync(migDir).filter((f) =>
      readFileSync(join(migDir, f), "utf8").includes(TABLE),
    );
    // The original PR #678 migration + the canonical-journey P3 defect fix
    // (service-role-ONLY grants — the table was created with no grant at
    // all, which silently broke this very queue in production). The fix
    // must never widen access beyond service_role.
    expect(touching).toEqual([
      "20260707120000_company_need_public_intake.sql",
      "20260713190000_company_need_intake_service_grants.sql",
    ]);
    const grants = readFileSync(
      join(migDir, "20260713190000_company_need_intake_service_grants.sql"),
      "utf8",
    );
    const code = grants.replace(/^\s*--.*$/gm, "");
    // Every grant targets service_role and nothing else; no policy changes.
    for (const m of code.matchAll(/grant[\s\S]*?;/gi)) {
      expect(m[0]).toMatch(/to service_role/);
    }
    expect(code).not.toMatch(/to (anon|authenticated|public)\b/i);
    expect(code).not.toMatch(/create policy|alter policy|disable row level/i);
  });
});

describe("operator copy exists in every active locale", () => {
  const ACTIVE = ["lt", "en", "ru"] as const;
  const catalog = (loc: string) =>
    JSON.parse(readApp(`messages/${loc}.json`)) as {
      admin: { companyNeedIntakes: Record<string, Record<string, string>> };
    };

  it("title + status + action + result keys are present and parity holds", () => {
    for (const loc of ACTIVE) {
      const cn = catalog(loc).admin.companyNeedIntakes;
      expect(typeof cn.title).toBe("string");
      for (const s of STATUSES) {
        expect(typeof cn.status[s]).toBe("string");
        expect(typeof cn.actions[s]).toBe("string");
      }
      for (const k of ["saved", "notAdmin", "invalid", "notFound", "needsMigration", "error"]) {
        expect(typeof cn.result[k]).toBe("string");
      }
    }
  });
});
