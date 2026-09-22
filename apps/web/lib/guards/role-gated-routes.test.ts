import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

import { type Role } from "@/lib/auth/actions";
import {
  DASHBOARD_PATHNAME_HEADER,
  ROLE_GATED_PREFIXES,
  type RouteRequirement,
  isDashboardPath,
  refusalDestination,
  routeRequirement,
  stripLocaleSegment,
} from "@/lib/auth/role-gated-routes";
import {
  accessNoticeOffersSetup,
  parseAccessNotice,
} from "@/lib/auth/access-notice";

const APP_ROOT = join(__dirname, "..", "..");
const DASHBOARD = join(APP_ROOT, "app", "[locale]", "dashboard");

const read = (abs: string): string => readFileSync(abs, "utf8");

/**
 * THE DEFECT THIS GUARD KEEPS CLOSED.
 *
 * A role gate that only runs in a page (or in the admin subtree layout) sits
 * UNDERNEATH `app/[locale]/dashboard/loading.tsx`. A `loading.tsx` wraps
 * everything below it in a Suspense boundary, and a `redirect()` thrown inside
 * a Suspense boundary cannot set an HTTP status — Next has already committed a
 * 200. Measured on the local production build 2026-09-22, worker →
 * `/lt/dashboard/company`: HTTP 200, 600 627 bytes of authenticated shell, and
 * ~600 ms of "Application error: a client-side exception has occurred" before
 * the browser performed the redirect itself. Nine of nine refused routes
 * behaved that way.
 *
 * Isolated with two same-shaped page redirects: `/lt/onboarding` (a
 * `loading.tsx` sits above it) answers 200 and redirects on the client;
 * `/lt/live-market-review` (none above it) answers a real 307.
 *
 * So the dashboard LAYOUT — the last frame above that boundary — refuses
 * first, and it needs to know which route it is wrapping. That is the only
 * thing `ROLE_GATED_PREFIXES` is for. A new gated page that is not covered by
 * it would still be SAFE (the page gate is untouched) but would silently
 * bring the crash flash back for that route, which is exactly the kind of
 * regression nobody notices. This guard re-derives the table from the pages.
 */

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const abs = join(dir, entry);
    if (statSync(abs).isDirectory()) walk(abs, out);
    else if (entry === "page.tsx" || entry === "layout.tsx") out.push(abs);
  }
  return out;
}

/** `…/dashboard/company/people/page.tsx` → `/dashboard/company/people`. */
function routeOf(abs: string): string {
  const rel = relative(DASHBOARD, abs).split(sep).slice(0, -1);
  // Route groups `(x)` add nesting, never a URL segment.
  const segments = rel.filter((s) => !(s.startsWith("(") && s.endsWith(")")));
  return "/dashboard" + (segments.length ? "/" + segments.join("/") : "");
}

const FILES = walk(DASHBOARD);

/**
 * Comments out. `/dashboard/network` carries a JSX comment that QUOTES
 * `requireRoleOrRedirect(locale, "company")` while explaining why that page
 * is NOT the home for a block — scanning raw source reported it as gated.
 */
function code(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
}

type SourceGate = { route: string; requirement: RouteRequirement; abs: string };

/** Every route whose own source refuses on a held role. */
const PAGE_GATED: SourceGate[] = FILES.flatMap((abs): SourceGate[] => {
  const src = code(read(abs));
  const role = /requireRoleOrRedirect\(\s*locale\s*,\s*["'](\w+)["']\s*\)/.exec(src);
  if (role) {
    return [
      { route: routeOf(abs), requirement: { kind: "role", role: role[1] as Role }, abs },
    ];
  }
  if (/\brequireSuperadmin\(/.test(src)) {
    return [{ route: routeOf(abs), requirement: { kind: "admin" }, abs }];
  }
  return [];
});

describe("Guard: the layout gate table covers every gated dashboard route", () => {
  it("finds the gated routes at all (the scan itself is not vacuous)", () => {
    // A scan that silently matches nothing would make every assertion below
    // pass while proving nothing — the failure mode that makes source guards
    // worthless. Company + opportunities + buyer + the admin subtree are the
    // known minimum.
    expect(PAGE_GATED.length).toBeGreaterThanOrEqual(10);
    const roles = new Set(
      PAGE_GATED.map((g) =>
        g.requirement.kind === "role" ? g.requirement.role : "admin",
      ),
    );
    expect([...roles].sort()).toEqual(["admin", "company", "customer", "worker"]);
  });

  it("every page-gated route resolves to the SAME requirement in the table", () => {
    const drift: string[] = [];
    for (const gate of PAGE_GATED) {
      const fromTable = routeRequirement(gate.route);
      if (!fromTable) {
        drift.push(`${gate.route} is gated in source but absent from ROLE_GATED_PREFIXES`);
        continue;
      }
      const same =
        fromTable.kind === gate.requirement.kind &&
        (fromTable.kind !== "role" ||
          gate.requirement.kind !== "role" ||
          fromTable.role === gate.requirement.role);
      if (!same) {
        drift.push(
          `${gate.route}: source says ${JSON.stringify(gate.requirement)}, ` +
            `table says ${JSON.stringify(fromTable)}`,
        );
      }
    }
    expect(drift, drift.join("\n")).toEqual([]);
  });

  it("every table prefix corresponds to a route that really is gated in source", () => {
    // No dead rows: a prefix nobody gates would refuse people from a route
    // that was never meant to be restricted.
    const dead = ROLE_GATED_PREFIXES.filter(
      (row) => !PAGE_GATED.some((g) => g.route === row.prefix),
    ).map((row) => row.prefix);
    expect(dead, `table rows with no gated page/layout: ${dead.join(", ")}`).toEqual([]);
  });
});

describe("Guard: the layout refuses BEFORE it can stream", () => {
  const layout = read(join(DASHBOARD, "layout.tsx"));

  it("reads the requested path from the middleware header", () => {
    expect(layout).toContain("DASHBOARD_PATHNAME_HEADER");
    expect(layout).toMatch(/routeRequirement\(/);
    expect(layout).toMatch(/redirect\(refusalDestination\(/);
  });

  it("gates before the workspace context read (nothing expensive after a refusal)", () => {
    const gateAt = layout.indexOf("routeRequirement(");
    const workspaceAt = layout.indexOf("await getWorkspaceContext(");
    expect(gateAt).toBeGreaterThan(-1);
    expect(workspaceAt).toBeGreaterThan(-1);
    expect(gateAt, "the role gate must precede getWorkspaceContext").toBeLessThan(
      workspaceAt,
    );
  });

  it("decides from the reads the shell ALREADY performs — no second role read", () => {
    // One `profile_roles` read per request. A second one here would be the
    // duplicate authorization this change exists to remove.
    const reads = code(layout).match(/readActiveProfileRoles\(/g) ?? [];
    expect(reads.length).toBe(1);
    // The layout must not CALL the page gate (that would be the second read);
    // its comments are free to name it.
    expect(code(layout)).not.toMatch(/requireRoleOrRedirect\(/);
    expect(code(layout)).not.toMatch(/requireSuperadmin\(/);
  });

  it("never refuses admin on a FAILED profile read (that is not an answer)", () => {
    // `deriveIsAdmin` reads `profiles.active_role`; when that row did not
    // answer, half the dual signal is unknown and refusing would be a false
    // claim. `requireSuperadmin` throws onto the honest error surface instead.
    expect(layout).toMatch(/session\.profileRead !== "failed" && !isAdmin/);
  });
});

describe("Guard: the middleware carries the path and NOTHING else", () => {
  const mw = read(join(APP_ROOT, "middleware.ts"));

  it("sets the header for the dashboard tree", () => {
    expect(mw).toContain("DASHBOARD_PATHNAME_HEADER");
    expect(mw).toMatch(/intl\(withDashboardPathHeader\(request\)\)/);
  });

  it("makes no authorization decision of its own", () => {
    // The whole point: the middleware must not become a second place where
    // "may this person see this" is answered. No role reads, no role table
    // lookups, no profile queries. Comments stripped — the file is allowed to
    // EXPLAIN which gate it is feeding, just not to be one.
    const src = code(mw);
    expect(src).not.toMatch(/profile_roles/);
    expect(src).not.toMatch(/routeRequirement/);
    expect(src).not.toMatch(/ROLE_GATED_PREFIXES/);
    expect(src).not.toMatch(/deriveIsAdmin|requireSuperadmin|requireRoleOrRedirect/);
  });

  it("computes the header value instead of trusting an inbound one", () => {
    expect(mw).toMatch(/headers\.set\(DASHBOARD_PATHNAME_HEADER/);
  });
});

describe("Unit: the table and its helpers", () => {
  it("strips the locale segment, and only a real locale", () => {
    expect(stripLocaleSegment("/lt/dashboard/company", ["lt", "en"])).toBe(
      "/dashboard/company",
    );
    expect(stripLocaleSegment("/dashboard/company", ["lt", "en"])).toBe(
      "/dashboard/company",
    );
    // "dashboard" is not a locale — the path must survive intact.
    expect(stripLocaleSegment("/dashboard", ["lt", "en"])).toBe("/dashboard");
  });

  it("recognises the dashboard tree without matching a lookalike", () => {
    expect(isDashboardPath("/dashboard")).toBe(true);
    expect(isDashboardPath("/dashboard/company")).toBe(true);
    expect(isDashboardPath("/dashboards")).toBe(false);
    expect(isDashboardPath("/jobs")).toBe(false);
  });

  it("matches a segment and everything under it, but not a lookalike sibling", () => {
    expect(routeRequirement("/dashboard/company")).toEqual({
      kind: "role",
      role: "company",
    });
    expect(routeRequirement("/dashboard/company/people")).toEqual({
      kind: "role",
      role: "company",
    });
    // `/dashboard/companies` must NOT be caught by the `/dashboard/company`
    // row — a prefix match on the raw string would do exactly that.
    expect(routeRequirement("/dashboard/companies")).toBeNull();
    expect(routeRequirement("/dashboard")).toBeNull();
    expect(routeRequirement("/dashboard/journal")).toBeNull();
  });

  it("sends a refused person to the canonical home, carrying the reason", () => {
    expect(refusalDestination("lt", { kind: "role", role: "company" })).toBe(
      "/lt/dashboard?notice=needs_company_role",
    );
    // NO refusal is silent any more — the operator bounce carries a reason too.
    expect(refusalDestination("lt", { kind: "admin" })).toBe(
      "/lt/dashboard?notice=needs_operator_access",
    );
  });

  it("the page-level admin gate emits the SAME reason as the layout gate", () => {
    // Two gates, one destination and one sentence — whichever got there first.
    const superadmin = read(join(APP_ROOT, "lib", "auth", "superadmin.ts"));
    expect(code(superadmin)).toMatch(
      /redirect\(`\/\$\{locale\}\/dashboard\?notice=\$\{OPERATOR_ACCESS_NOTICE\}`\)/,
    );
    expect(code(superadmin)).not.toMatch(/redirect\(`\/\$\{locale\}\/dashboard`\)/);
  });

  it("uses a header name the client cannot confuse with a real one", () => {
    expect(DASHBOARD_PATHNAME_HEADER.startsWith("x-")).toBe(true);
  });
});

describe("Unit: the refusal reason becomes a sentence, never a token", () => {
  it("parses exactly the tokens the table can emit", () => {
    expect(parseAccessNotice("needs_company_role")).toBe("company");
    expect(parseAccessNotice("needs_worker_role")).toBe("worker");
    expect(parseAccessNotice("needs_customer_role")).toBe("customer");
  });

  it("parses the operator reason, which is not a participation role", () => {
    expect(parseAccessNotice("needs_operator_access")).toBe("operator");
    // …and offers no setup route, because operator access is granted out of
    // band. A link to the setup hub would be a control that cannot deliver.
    expect(accessNoticeOffersSetup("operator")).toBe(false);
    expect(accessNoticeOffersSetup("company")).toBe(true);
  });

  it("refuses anything else instead of echoing it back at the reader", () => {
    // A hand-typed or stale `?notice=` must render nothing — the alternative
    // is an internal value (or worse, injected text) in a box a person reads.
    expect(parseAccessNotice("needs_admin_role")).toBeNull();
    expect(parseAccessNotice("needs_banana_role")).toBeNull();
    expect(parseAccessNotice("<script>alert(1)</script>")).toBeNull();
    expect(parseAccessNotice("")).toBeNull();
    expect(parseAccessNotice(null)).toBeNull();
    expect(parseAccessNotice(undefined)).toBeNull();
  });

  it("the destination actually reads the parameter (the old promise was false)", () => {
    // `require-role.ts` asserted for a long time that the overview "renders a
    // banner explaining WHICH space the link needed". Nothing did. This is the
    // assertion that keeps it true.
    const home = read(join(DASHBOARD, "page.tsx"));
    expect(home).toMatch(/parseAccessNotice\(/);
    expect(home).toMatch(/AccessRefusalNotice/);
    expect(home).toMatch(/searchParams/);
  });

  it("every refusable role has copy in every ACTIVE locale", () => {
    const refusable = ROLE_GATED_PREFIXES.flatMap((r) =>
      r.requirement.kind === "role" ? [r.requirement.role] : [],
    );
    for (const locale of ["lt", "en", "ru", "nl", "de", "pl"]) {
      const messages = JSON.parse(
        read(join(APP_ROOT, "messages", `${locale}.json`)),
      ) as { workspace: { accessNotice?: Record<string, string> } };
      const notice = messages.workspace.accessNotice;
      expect(notice, `${locale}: workspace.accessNotice missing`).toBeTruthy();
      for (const role of refusable) {
        const line = notice?.[role];
        expect(line, `${locale}.${role}`).toBeTruthy();
        expect(line!.trim().length, `${locale}.${role} is empty`).toBeGreaterThan(10);
        // The person reads a sentence. The internal token never appears.
        expect(line).not.toMatch(/needs_|_role\b/);
      }
      expect(notice?.setupCta, `${locale}: setupCta`).toBeTruthy();
      // The operator refusal is a REASON too — no locale may leave it silent.
      const operator = notice?.operator;
      expect(operator, `${locale}: operator`).toBeTruthy();
      expect(operator).not.toMatch(/needs_|_access\b/);
    }
  });
});
