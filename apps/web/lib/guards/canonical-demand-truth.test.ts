import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * W10 slice 4 — structural guards for the canonical demand truth.
 *
 * The unit tests in `lib/demand/canonical-demand-model.test.ts` prove the pure
 * rules. These prove the WIRING: that the map actually reads the canonical
 * source, that the canonical source did not widen any privilege to get there,
 * and that the surfaces the slice was forbidden to touch were not touched.
 */

const web = join(process.cwd(), "apps/web");
const root = process.cwd().endsWith("apps\\web") || process.cwd().endsWith("apps/web")
  ? process.cwd()
  : web;

const read = (rel: string) => readFileSync(join(root, rel), "utf8");

/**
 * Read a file with comments removed.
 *
 * These modules DOCUMENT the things they must not do ("no service-role client",
 * "never the raw payload"), so a naive text scan flags the explanation as the
 * violation. The claims below are about executable code, so the prose is
 * stripped before matching — otherwise the only way to pass would be to delete
 * the reasoning, which is the opposite of what this repo wants.
 */
const code = (rel: string) =>
  read(rel)
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");

const CANONICAL_IO = "lib/demand/canonical-demand.ts";
const CANONICAL_MODEL = "lib/demand/canonical-demand-model.ts";
const MARKET_RESULT = "lib/market-map/market-result.ts";
const DRILLDOWN_LOADER = "lib/market-map/project-results.ts";

describe("the market map reads the canonical demand source", () => {
  it("market-result no longer queries job_demands directly", () => {
    // This is the whole defect: the map read the table nothing else in the
    // customer journey used. If this regresses, the two truths are back.
    const src = read(MARKET_RESULT);
    expect(src).not.toMatch(/\.from\(\s*["']job_demands["']\s*\)/);
  });

  it("market-result loads the canonical demand list", () => {
    const src = read(MARKET_RESULT);
    expect(src).toMatch(/from "@\/lib\/demand\/canonical-demand"/);
    expect(src).toMatch(/loadCanonicalDemand\(/);
  });

  it("market-result dedupes BEFORE it weights, so one demand is one unit", () => {
    const src = read(MARKET_RESULT);
    const dedupeAt = src.indexOf("dedupeCanonicalDemand");
    const weightAt = src.indexOf("cities.set(");
    expect(dedupeAt).toBeGreaterThan(-1);
    expect(weightAt).toBeGreaterThan(dedupeAt);
  });

  it("a read failure is still an error, never a silent empty market", () => {
    const src = read(MARKET_RESULT);
    expect(src).toMatch(/state === "error"[\s\S]{0,80}failed: true/);
  });
});

/**
 * THE DRILLDOWN BEHIND THE MARKER — the half W10 slice 4 missed.
 *
 * The marker moved onto the canonical read in 2026-08; the list and evaluation
 * BEHIND it kept reading `job_demands` until 2026-09-05. Because that table has
 * held 0 rows in production for its whole life, every marker built from real
 * `customer_requests` demand opened onto an empty list and depth 2 — the
 * evaluation and the continuation to people — was unreachable for every real
 * user. These pin the fix: one source, one filter, one answer.
 */
describe("the drilldown behind the marker reads the SAME canonical source", () => {
  it("the drilldown loader queries no table of its own", () => {
    const src = read(DRILLDOWN_LOADER);
    expect(src).not.toMatch(/\.from\(\s*["']job_demands["']\s*\)/);
    expect(src).not.toMatch(/\.from\(\s*["']/);
  });

  it("the drilldown loader composes loadCanonicalDemand", () => {
    const src = read(DRILLDOWN_LOADER);
    expect(src).toMatch(/from "@\/lib\/demand\/canonical-demand"/);
    expect(src).toMatch(/loadCanonicalDemand\(/);
  });

  it("it dedupes BEFORE it shapes, so one demand is one row", () => {
    const src = code(DRILLDOWN_LOADER);
    const dedupeAt = src.indexOf("dedupeCanonicalDemand");
    const shapeAt = src.indexOf("groupIntoDemandUnits(");
    expect(dedupeAt).toBeGreaterThan(-1);
    expect(shapeAt).toBeGreaterThan(dedupeAt);
  });

  it("the list and the evaluation shape the SAME rows the same way", () => {
    // Two readers would eventually disagree, and the person would be told a
    // unit matched in the list and did not in the detail.
    const src = code(DRILLDOWN_LOADER);
    expect(src.match(/groupIntoDemandUnits\(/g)?.length).toBe(2);
    expect(src.match(/loadCanonicalDemand\(/g)?.length).toBe(2);
  });

  it("the source statement names the canonical read, not the frozen table", () => {
    // The UI shows this string verbatim. Naming `job_demands` while reading
    // `customer_requests` is exactly the drift this slice closed.
    const src = read("lib/market-map/project-results-model.ts");
    expect(src).toMatch(/DEMAND_SOURCE = "canonical demand \(customer_requests, submitted\)"/);
  });

  it("a failed canonical read is an error state, never an empty place", () => {
    const src = code(DRILLDOWN_LOADER);
    expect(src).toMatch(/canonical\.state === "error"/);
    expect(src).toMatch(/state: "error"/);
  });
});

describe("the canonical read inherits authorization and never widens it", () => {
  it("uses no service-role client", () => {
    const src = code(CANONICAL_IO);
    expect(src).not.toMatch(/service[_-]?role/i);
    expect(src).not.toMatch(/SUPABASE_SERVICE/);
    expect(read(CANONICAL_IO)).toMatch(/from "@\/lib\/supabase\/server"/);
  });

  it("declares no SECURITY DEFINER function of its own and adds no migration", () => {
    const src = code(CANONICAL_IO);
    expect(src).not.toMatch(/security definer/i);
    expect(src).not.toMatch(/create (or replace )?function/i);
  });

  it("reaches worker-visible demand only through the existing gated RPC", () => {
    const src = read(CANONICAL_IO);
    expect(src).toMatch(/rpc\("list_open_demand_for_workers"\)/);
  });

  it("reads customer_requests own-rows only — no tenant/org id from the caller", () => {
    const src = read(CANONICAL_IO);
    // An organization id accepted as an argument and pushed into a filter is
    // the classic client-supplied-authority bug. This module takes NO input at
    // all, so there is nothing to forge: RLS alone decides.
    expect(src).toMatch(/export async function loadCanonicalDemand\(\): Promise/);
    expect(src).not.toMatch(/\.eq\(\s*["'](profile_id|company_id|organization_id|owner_id)["']/);
  });

  it("requires an authenticated caller", () => {
    expect(read(CANONICAL_IO)).toMatch(/if \(!user\) return \{ state: "error"/);
  });
});

describe("no contact or private employer data can ride along", () => {
  it("selects no contact, identity or private-note column", () => {
    // Whole-word only: "vat" as a substring also lives inside "private".
    const src = code(CANONICAL_IO);
    for (const forbidden of [
      "email",
      "phone",
      "vat",
      "vat_number",
      "contact_person",
      "manual_review_note",
      "need_summary",
      "notes",
      "owner_profile_id",
    ]) {
      expect(src).not.toMatch(new RegExp(`\\b${forbidden}\\b`, "i"));
    }
  });

  it("the canonical row type has no field that could carry a person or a price", () => {
    const src = read(CANONICAL_MODEL);
    const iface = src.slice(
      src.indexOf("export interface CanonicalDemand {"),
      src.indexOf("export type CanonicalDemandResult"),
    );
    expect(iface).not.toMatch(/salary|pay|rate|price|email|phone|contact|profile_id/i);
  });

  it("makes no AI, fit or confidence claim", () => {
    const both = code(CANONICAL_IO) + code(CANONICAL_MODEL);
    expect(both).not.toMatch(/\bconfidence\b|\bfitScore\b|\bai_?score\b/i);
  });
});

describe("historical demand stays distinguishable from an actionable request", () => {
  it("every canonical row carries source and actionable", () => {
    const src = read(CANONICAL_MODEL);
    expect(src).toMatch(/readonly source: CanonicalDemandSource;/);
    expect(src).toMatch(/readonly actionable: boolean;/);
  });

  it("the legacy job_demands read STAYS removed (consolidation slice 1, 2026-08-17)", () => {
    // The leg was deleted because job_demands has held 0 rows in production
    // for its whole life and nothing writes it — the read only ever returned
    // an empty set. The schema stays frozen
    // (docs/audits/duplication-freeze-register-2026-08-17.md). Re-adding a
    // job_demands read here would resurrect the two-truths defect W10 slice 4
    // closed; the ONE live demand store is customer_requests.
    const src = code(CANONICAL_IO);
    expect(src).not.toMatch(/\.from\(\s*["']job_demands["']\s*\)/);
    expect(src).not.toMatch(/source:\s*"job_demand"/);
  });

  it("customer_request rows are constructed as actionable", () => {
    const src = read(CANONICAL_IO);
    expect(src).toMatch(/source: "customer_request",\s*\n\s*actionable: true,/);
  });
});

describe("the slice stayed inside its boundaries", () => {
  it("does not import the W10 matching engine, booking RPC or projects layer", () => {
    const src = read(CANONICAL_IO) + read(CANONICAL_MODEL) + read(MARKET_RESULT);
    expect(src).not.toMatch(/@\/lib\/market\/match-v1/);
    expect(src).not.toMatch(/respond_booking_request/);
    expect(src).not.toMatch(/@\/lib\/projects\//);
  });

  it("touches no auth, billing or middleware module", () => {
    const src = read(CANONICAL_IO) + read(CANONICAL_MODEL) + read(MARKET_RESULT);
    expect(src).not.toMatch(/@\/lib\/(auth|billing|stripe)\//);
  });
});

/**
 * THE ORGANISATION NAME — disclosed, never invented (2026-09-05).
 *
 * The worker RPC `list_open_demand_for_workers` already returns `company_name`,
 * and only for a company whose `verification_status = 'verified'`. The canonical
 * read used to drop it, so a worker-visible need rendered "organisation: not
 * stated" for a name the platform was ALREADY authorised to show — withholding
 * disclosable information and printing a gap instead.
 *
 * Carrying it adds no privilege. These pin that it stays that way: the value may
 * only ever be the disclosing branch's own column, the other branch must keep
 * contributing null, and no second lookup may appear to "fill in" the gap.
 */
describe("the organisation name is carried, never invented", () => {
  const CANONICAL_IO = "lib/demand/canonical-demand.ts";

  it("the worker branch passes the RPC's own column straight through", () => {
    const src = code(CANONICAL_IO);
    expect(src).toMatch(/organizationName: row\.company_name/);
  });

  it("the employer's own-rows branch contributes null, not the viewer's workspace", () => {
    // Borrowing the active workspace name would attach an organisation the row
    // never named — a fabrication, and wrong whenever the row belongs to
    // another of the caller's organisations.
    const src = code(CANONICAL_IO);
    expect(src).toMatch(/organizationName: null/);
    expect(src).not.toMatch(/organizationName:\s*employer\./);
  });

  it("no new query was added to resolve a name", () => {
    // The whole point is that this costs no extra read and no extra privilege.
    const src = code(CANONICAL_IO);
    expect(src).not.toMatch(/\.from\(\s*["'](companies|organizations)["']\s*\)/);
    expect(src.match(/\.from\(\s*["']/g)?.length ?? 0).toBe(1);
  });

  it("the read still declares no security definer of its own", () => {
    const src = code(CANONICAL_IO);
    expect(src).not.toMatch(/security definer/i);
    expect(src).not.toMatch(/service[_-]?role/i);
  });

  it("the contract carries the name but still no contact detail", () => {
    const src = read(CANONICAL_MODEL);
    const iface = src.slice(
      src.indexOf("export interface CanonicalDemand {"),
      src.indexOf("export type CanonicalDemandResult"),
    );
    expect(iface).toMatch(/readonly organizationName: string \| null;/);
    expect(iface).not.toMatch(/email|phone|contact|profile_id|salary|rate/i);
  });
});

/**
 * OWNERSHIP IS PROVENANCE, NOT PERMISSION (2026-09-06).
 *
 * The drilldown may offer a real next step — the `candidates` result, backed by
 * the live matching engine — but ONLY over the viewer's own need, because
 * `runScouting` requires an employer workspace and reads own demand only
 * (`profile_id = auth.uid()`). Offering it over another tenant's row would
 * dead-end in `not-found`, so the row has to say which it is.
 *
 * Nothing is unlocked by the flag: it is set by the branch that already knew.
 */
describe("own-demand ownership is carried, never assumed", () => {
  const CANONICAL_IO = "lib/demand/canonical-demand.ts";

  it("only the own-rows branch claims ownership", () => {
    const src = code(CANONICAL_IO);
    expect(src).toMatch(/ownedByViewer: true/);
    expect(src).toMatch(/ownedByViewer: false/);
    // Exactly one branch may claim it.
    expect(src.match(/ownedByViewer: true/g)?.length).toBe(1);
  });

  it("dedup MERGES the two authorized views instead of picking a winner", () => {
    // The RPC knows the verified name; the own-rows read knows the ownership.
    // Keeping one copy would throw away half of what the caller was already
    // entitled to see, and would make both flicker with branch order.
    const src = code(CANONICAL_MODEL);
    expect(src).toMatch(/organizationName: base\.organizationName \?\? other\.organizationName/);
    expect(src).toMatch(/ownedByViewer: base\.ownedByViewer \|\| other\.ownedByViewer/);
  });

  it("the drilldown offers the own-demand action ONLY for an owned need", () => {
    const src = readFileSync(
      join(root, "components/app/workspace/market-drilldown.tsx"),
      "utf8",
    ).replace(/\/\*[\s\S]*?\*\//g, " ");
    expect(src).toMatch(/row\.unitKind === "need" && row\.ownedByViewer && onSelectDemand/);
    // And the honest not-yet state still exists for every other row.
    expect(src).toMatch(/data-testid="people-not-yet"/);
  });
});
