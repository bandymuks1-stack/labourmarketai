/**
 * Guard — EMPLOYER ORGANIZATION CONTEXT TRUTH (W8 slice 1).
 *
 * The W8 audit's P0-1 was not a bug in one file: it was a missing rule. The
 * active organization was decorative because every employer path was free to
 * resolve its own company from `companies.profile_id = auth.uid()`. A behaviour
 * test on the new resolver cannot stop a future edit from re-introducing that
 * shortcut somewhere else, so this guard pins the RULE at source level:
 *
 *   1. ONE canonical resolver — the employer spine reaches its company only
 *      through `lib/company/employer-company-context.ts`;
 *   2. NO profile-only company fallback anywhere in that spine;
 *   3. `callerCompanyId` never swallows a multi-row / failed read into `null`
 *      (the silent-empty defect);
 *   4. the active workspace is VISIBLE in the full chrome, where the employer
 *      actually works;
 *   5. employer conversation writes are not recorded as worker telemetry;
 *   6. the W6 PR #974 conflict files stay untouched by this slice.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const APP = join(__dirname, "..", "..");
const read = (rel: string): string => readFileSync(join(APP, rel), "utf8");

const RESOLVER = "lib/company/employer-company-context.ts";

/** Every employer entry point that must go through the ONE resolver. */
const SPINE: readonly { file: string; why: string }[] = [
  { file: "lib/scouting/scouting.ts", why: "demands + matching + shortlist" },
  { file: "lib/demand/demand-request.ts", why: "demand submit" },
  { file: "lib/demand/demand-lifecycle.ts", why: "confirm / close / reopen" },
  { file: "lib/booking/booking-actions.ts", why: "propose booking" },
  { file: "lib/communication/request-worker-conversation.ts", why: "contact worker" },
  { file: "lib/projects/projects.ts", why: "employer projects + planning source" },
  { file: "lib/ai-workspace/workflows.ts", why: "the employer scouting workflow" },
];

describe("1. one canonical resolver", () => {
  it("the resolver exists and takes no caller-supplied identifiers", () => {
    const src = read(RESOLVER);
    expect(src).toMatch(/export async function requireEmployerCompany\(\)/);
    expect(src).toMatch(/export const resolveEmployerCompanyContext = cache\(/);
    // The resolver's own signature is the anti-forgery property: nothing about
    // WHICH company is being asked for can come from a caller.
    expect(src).toMatch(/async function resolveEmployerCompanyContext\(\): Promise/);
  });

  it.each(SPINE)("$file resolves through the canonical module ($why)", ({ file }) => {
    expect(read(file)).toMatch(
      /from "@\/lib\/company\/employer-company-context"/,
    );
  });
});

describe("2. no profile-only company fallback in the employer spine", () => {
  it.each(SPINE)("$file never re-derives a company from companies.profile_id", ({ file }) => {
    const src = read(file);
    // The exact shortcut the audit found: reading `companies` keyed on the
    // caller's profile. Any spine file doing this again has bypassed the
    // workspace and made the switcher decorative a second time.
    const companiesByProfile =
      /from\(\s*["']companies["']\s*\)[\s\S]{0,240}?\.eq\(\s*["']profile_id["']/;
    expect(companiesByProfile.test(src)).toBe(false);
  });

  it("the resolver states, in source, that there is no such fallback", () => {
    const src = read(RESOLVER);
    expect(src).toMatch(/no fallback to/i);
    expect(src).toMatch(/companies\.profile_id/);
  });
});

describe("3. callerCompanyId is no longer a silent-empty", () => {
  const src = read("lib/projects/projects.ts");

  it("delegates to the resolver instead of querying companies itself", () => {
    expect(src).toMatch(
      /export async function callerCompanyId\(\)[\s\S]{0,400}resolveEmployerCompanyContext\(\)/,
    );
  });

  it("no companies read — and no maybeSingle — survives in callerCompanyId", () => {
    // The module still uses `maybeSingle()` legitimately elsewhere (single-row
    // project reads); the defect was specifically a `companies` lookup whose
    // multi-row error was discarded, so the assertion is scoped to that body.
    expect(/from\(\s*["']companies["']\s*\)/.test(src)).toBe(false);
    const body = src.slice(src.indexOf("export async function callerCompanyId("));
    expect(body).not.toMatch(/maybeSingle\(\)/);
  });

  it("an infrastructure failure is logged with its real reason before null", () => {
    expect(src).toMatch(/isEmployerContextFailure\(ctx\.reason\)/);
    expect(src).toMatch(/console\.error\(\s*"\[projects\] no employer company context"/);
  });

  it("exposes the tagged context for surfaces that can render a state", () => {
    expect(src).toMatch(/export async function callerCompanyContext\(\)/);
  });
});

describe("4. the active workspace is visible where the employer works", () => {
  it("the FULL dashboard chrome mounts the canonical WorkspaceChip", () => {
    const layout = read("app/[locale]/dashboard/layout.tsx");
    expect(layout).toMatch(
      /import \{ WorkspaceChip \} from "@\/components\/app\/conversation\/chat\/workspace-chip"/,
    );
    expect(layout).toMatch(/<WorkspaceChip \/>/);
  });

  it("it is the SAME component the conversation header uses — not a second switcher", () => {
    const header = read("components/app/conversation/chat/conversation-header.tsx");
    expect(header).toMatch(/<WorkspaceChip \/>/);
    // One implementation only: the chip file is the sole definition.
    expect(read("components/app/conversation/chat/workspace-chip.tsx")).toMatch(
      /export function WorkspaceChip\(\)/,
    );
  });

  it("the employer honest state names the space and stays free of raw DB text", () => {
    const notice = read("components/app/employer-context-notice.tsx");
    expect(notice).toMatch(/data-testid="employer-context-notice"/);
    expect(notice).toMatch(/data-reason=\{reason\}/);
    // Copy comes from EXISTING keys only (this slice may not touch messages/*).
    expect(notice).toMatch(/tSpaces\("current"\)/);
    expect(notice).toMatch(/tSpaces\("switchSpace"\)/);
    expect(notice).not.toMatch(/error\.(message|code)/);
  });

  it("the scouting surface renders the honest state instead of reading demands", () => {
    const page = read("app/[locale]/dashboard/company/scouting/page.tsx");
    // The context check must come BEFORE the demand read, or a wrong-context
    // request still touches another context's rows on its way to the notice.
    const gate = page.indexOf("resolveEmployerCompanyContext()");
    const demands = page.indexOf("listCompanyDemands()");
    expect(gate).toBeGreaterThan(-1);
    expect(demands).toBeGreaterThan(-1);
    expect(gate).toBeLessThan(demands);
    expect(page).toMatch(/<EmployerContextNotice/);
  });
});

describe("5. telemetry tells the truth about who acted", () => {
  it("the inline form derives the role from the action id", () => {
    const form = read("components/app/conversation/inline-action-form.tsx");
    expect(form).toMatch(/role_context: roleContextForAction\(spec\.actionId\)/);
    // The hardcoded literal that mislabelled every employer demand.
    expect(form).not.toMatch(/role_context:\s*"worker"/);
  });

  it("no employer or agency action can be recorded as a worker action", async () => {
    const { roleContextForAction } = await import("@/lib/conversation/action-role-context");
    const { COMPANY_ACTION_SCHEMAS } = await import("@/lib/conversation/company-schemas");
    const ids = Object.keys(COMPANY_ACTION_SCHEMAS);
    expect(ids.length).toBeGreaterThan(0);
    for (const id of ids) {
      expect(roleContextForAction(id)).not.toBe("worker");
    }
    // …and the worker side is unchanged.
    expect(roleContextForAction("worker.log-work")).toBe("worker");
  });

  it("the mapper emits only the existing coarse role vocabulary", () => {
    const documented = read("lib/telemetry/actions.ts");
    expect(documented).toMatch(
      /role_context".*coarse role: 'worker' \| 'company' \| 'agency' \| 'customer'/,
    );
    const mapper = read("lib/conversation/action-role-context.ts");
    expect(mapper).toMatch(/"worker" \| "company" \| "agency" \| "customer"/);
  });

  it("no organization or company id is attached to the funnel event", () => {
    const form = read("components/app/conversation/inline-action-form.tsx");
    expect(form).not.toMatch(/organizationId|companyId|organization_id|company_id/);
  });
});

describe("6. the W6 PR #974 conflict files stay untouched", () => {
  /** Exactly the files `git diff origin/main...feat/cc/w6-slice3-experience-records`
   *  reports for the registries and the shared i18n surface. This slice keeps
   *  its hands off them so the two branches can land in either order. */
  const W6_CONFLICT_FILES = [
    "lib/conversation/result-registry.ts",
    "lib/conversation/action-registry.ts",
    "components/app/workspace/result-body.tsx",
    "lib/product-gate/behavior-model.ts",
    "lib/i18n/client-messages.ts",
  ];

  it.each(W6_CONFLICT_FILES)("%s carries no W8 slice 1 marker", (file) => {
    expect(read(file)).not.toMatch(/W8 slice 1/);
  });

  it("the employer honest state introduces no new message key", () => {
    const notice = read("components/app/employer-context-notice.tsx");
    // Every translation call in the notice must name a key that already
    // existed. Pinning the exact call set is what makes an added key visible
    // here rather than only in a locale diff.
    const namespaces = [...notice.matchAll(/getTranslations\("([^"]+)"\)/g)].map((m) => m[1]);
    expect(new Set(namespaces)).toEqual(
      new Set(["spaces", "conversation.chat", "scouting"]),
    );
    const keys = [...notice.matchAll(/\bt[A-Z][A-Za-z]*\("([^"]+)"\)/g)].map((m) => m[1]);
    expect(new Set(keys)).toEqual(
      new Set([
        "current",
        "switchSpace",
        "workspacePersonal",
        "workspaceUnnamed",
        "contactRequest.noOrganization",
      ]),
    );
  });
});
