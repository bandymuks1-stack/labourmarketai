import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

/**
 * R-2, GREEN half (2026-09-19 completion window).
 *
 * THE DEFECT: a direct booking mints `company_worker_engagements`; the journal
 * review gate reads `engagement_contexts`; nothing bridges them. The RED half
 * (provisioning a context inside the booking RPC) stays owner-gated. What CAN
 * be true without touching authority:
 *   1. the booked person is VISIBLE on the employer's people page;
 *   2. the reason their journal is not reviewable is stated, not hidden;
 *   3. the exit is the ONE legitimate path — the employee invitation, whose
 *      acceptance is the WORKER's act and already provisions the context;
 *   4. the read is RLS-scoped and bounded; no RPC, no service role, no write;
 *   5. a failed read is never rendered as "nobody is booked".
 */
const WEB = join(__dirname, "..", "..");
const read = (rel: string) => readFileSync(join(WEB, rel), "utf8");

const model = read("lib/company/booked-people.ts");
const section = read("components/app/booked-people-section.tsx");
const page = read("app/[locale]/dashboard/company/people/page.tsx");

describe("R-2 GREEN — booked people read model", () => {
  it("reads the caller's own booking engagements through RLS only — no RPC, no service role, no write", () => {
    expect(model).toMatch(/\.from\("company_worker_engagements"\)/);
    expect(model).toMatch(/\.eq\("status", "active"\)/);
    expect(model).not.toMatch(/\.rpc\(/);
    expect(model).not.toMatch(/service_role|createServiceClient|createAdminClient/i);
    expect(model).not.toMatch(/\.(insert|update|upsert|delete)\(/);
  });

  it("is bounded", () => {
    expect(model).toMatch(/BOOKED_PEOPLE_LIMIT = 50/);
    expect(model).toMatch(/\.limit\(BOOKED_PEOPLE_LIMIT\)/);
  });

  it("a GDPR-detached row is nobody's booking; a failed read is its own kind", () => {
    expect(model).toMatch(/if \(!r\.worker_id \|\| !r\.started_at\) continue;/);
    expect(model).toMatch(/\{ kind: "error"; message: string \}/);
    expect(model).not.toMatch(/data \?\? \[\]\)[^]*?return \{ kind: "ok", rows: \[\] \}[^]*?error/);
  });
});

describe("R-2 GREEN — the section on the people page", () => {
  it("is rendered by the employer's people page from the RLS read, excluding roster rows", () => {
    expect(page).toMatch(/listBookedPeople\(companyRow\.id, \{/);
    expect(page).toMatch(/excludeWorkerIds: new Set\(activeWorkerRows\.map\(\(w\) => w\.workerId\)\)/);
    expect(page).toMatch(/memberProfileIds: new Set\(/);
    expect(page).toMatch(/<BookedPeopleSection result=\{bookedPeople\} \/>/);
  });

  it("names the honest evidence state and exits to the canonical employee invitation", () => {
    expect(section).toMatch(/data-testid="booked-person-not-reviewable"/);
    expect(section).toMatch(/data-testid="booked-person-member"/);
    expect(section).toMatch(/href=\{"\/dashboard\/network\?type=join_as_employee"/);
    expect(section).toMatch(/data-testid="booked-person-invite-link"/);
  });

  it("never offers the employer a way to create the context alone (no add-member, no direct write)", () => {
    expect(section).not.toMatch(/addOrgMember|add_org_member|provision_company_worker_engagement_context/);
    expect(section).not.toMatch(/"use client"/);
    expect(section).not.toMatch(/\.rpc\(|\.from\(/);
  });

  it("a failed read is its own sentence, never an empty list", () => {
    expect(section).toMatch(/result\.kind === "error"/);
    expect(section).toMatch(/data-testid="booked-people-error"/);
  });

  it("only real stored facts are shown — no rating, score, estimate or invented duration", () => {
    // Comments explain what is absent; the JSX itself must not contain it.
    const jsx = section.replace(/\/\*[^]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
    expect(jsx).not.toMatch(/rating|score|estimate|★|stars?\b/i);
    expect(section).toMatch(/row\.startedAt\.slice\(0, 10\)/);
  });
});

describe("R-2 GREEN — copy in every active locale says the same true thing", () => {
  const locales = ["en", "lt", "ru", "nl", "de"] as const;
  for (const loc of locales) {
    it(`${loc}: the not-reviewable state names the worker's acceptance as the only way in`, () => {
      const json = JSON.parse(read(`messages/${loc}.json`));
      const booked = json.organizationDoors.pages.people.booked;
      for (const k of ["title", "intro", "since", "unnamed", "memberState", "notReviewableState", "inviteExit", "error"]) {
        expect(typeof booked[k], `${loc}.${k}`).toBe("string");
        expect(booked[k].trim().length, `${loc}.${k}`).toBeGreaterThan(0);
        expect(booked[k], `${loc}.${k}`).not.toMatch(/\[EN\]|demo/i);
      }
      expect(booked.since).toMatch(/\{date\}/);
    });
  }
});

// ── Static render of the section — the non-empty states, without fabricating
//    production data. `getTranslations` is stubbed to a key-echo + interpolation
//    so the assertions are about STRUCTURE (which state renders which exit),
//    not about copy; the copy is pinned per locale above.
vi.mock("next-intl/server", () => ({
  getTranslations: async () => (key: string, vars?: Record<string, string>) =>
    vars ? `${key}:${Object.values(vars).join(",")}` : key,
}));
vi.mock("@/lib/i18n/navigation", () => ({
  Link: (props: { href: string; children: unknown; "data-testid"?: string }) =>
    createElement("a", { href: props.href, "data-testid": props["data-testid"] }, props.children as never),
}));

describe("R-2 GREEN — the section renders each truth as its own state", () => {
  const rows = [
    {
      engagementId: "e-booked-only",
      workerId: "w1",
      profileId: "p1",
      name: "Jonas",
      startedAt: "2026-09-04T08:00:00Z",
      isMember: false,
    },
    {
      engagementId: "e-member",
      workerId: "w2",
      profileId: "p2",
      name: null,
      startedAt: "2026-09-01T08:00:00Z",
      isMember: true,
    },
  ] as const;

  it("booked-only → not-reviewable sentence + the employee-invitation exit; member → members-panel sentence, no exit", async () => {
    const { BookedPeopleSection } = await import("@/components/app/booked-people-section");
    const html = renderToStaticMarkup(await BookedPeopleSection({ result: { kind: "ok", rows } }));
    expect(html).toContain('data-testid="booked-people"');
    expect(html).toContain('data-testid="booked-person-e-booked-only"');
    expect(html).toContain('data-member="false"');
    expect(html).toContain('data-testid="booked-person-not-reviewable"');
    expect(html).toContain('href="/dashboard/network?type=join_as_employee"');
    expect(html).toContain("since:2026-09-04");
    expect(html).toContain("Jonas");
    // The member row: no invitation exit anywhere near it.
    const memberRow = html.slice(html.indexOf('data-testid="booked-person-e-member"'));
    expect(memberRow).toContain('data-testid="booked-person-member"');
    expect(memberRow).not.toContain("join_as_employee");
    // Unnamed is stated, never replaced by an id.
    expect(memberRow).toContain("unnamed");
    expect(memberRow).not.toContain("w2");
  });

  it("empty and needs-migration render nothing; a failed read renders the error sentence and no list", async () => {
    const { BookedPeopleSection } = await import("@/components/app/booked-people-section");
    expect(await BookedPeopleSection({ result: { kind: "ok", rows: [] } })).toBeNull();
    expect(await BookedPeopleSection({ result: { kind: "needs-migration" } })).toBeNull();
    const html = renderToStaticMarkup(
      await BookedPeopleSection({ result: { kind: "error", message: "boom" } }),
    );
    expect(html).toContain('data-testid="booked-people-error"');
    expect(html).not.toContain('data-testid="booked-people-list"');
    expect(html).not.toContain("boom");
  });
});
