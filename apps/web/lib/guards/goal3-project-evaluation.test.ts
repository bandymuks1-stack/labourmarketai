import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

import {
  geographyFromAnchor,
  geographyLabel,
  parseGeography,
  projectMatchesGeography,
  serializeGeography,
  type GeographySelection,
} from "@/lib/market-map/geography-selection";
import {
  buildPeopleContinuation,
  groupIntoProjects,
  type DemandJoinRow,
  type ProjectEvaluation,
} from "@/lib/market-map/project-results-model";

/**
 * GOAL 3 — EVALUATE PROJECTS.
 *
 * The journey these pin is: click a real place on the proven market map, get
 * the projects that create the demand there, open one, and understand why it
 * matched. Everything below is a rule that a plausible future patch would undo
 * silently, which is the only reason it is in CI:
 *
 *  1. a selection may never claim more precision than the data has;
 *  2. what the list shows is exactly what the marker counted;
 *  3. a failed read is never rendered as an empty market;
 *  4. the loader reads as the signed-in user — RLS is the authorization;
 *  5. one map, at one depth;
 *  6. the explanation is a filter reporting itself, not a judgement.
 */

const WEB = resolve(__dirname, "..", "..");
const read = (rel: string) => readFileSync(join(WEB, rel), "utf8");

const MODEL = "lib/market-map/project-results-model.ts";
const LOADER = "lib/market-map/project-results.ts";
const ACTIONS = "lib/market-map/project-results-actions.ts";
const DRILLDOWN = "components/app/workspace/market-drilldown.tsx";
const HOOK = "components/app/workspace/use-result-param.ts";
const PANEL = "components/app/world-state/context-panel.tsx";
const MARKET_RESULT = "lib/market-map/market-result.ts";

/** The locales that carry the `conversation.results` namespace today. */
const RESULT_LOCALES = ["lt", "en", "ru", "nl", "de"] as const;

// ── W4.1 — the geography contract ──────────────────────────────────────────

describe("W4.1 — a selection may never claim more precision than the data has", () => {
  it("round-trips every supported precision through the URL", () => {
    const cases: GeographySelection[] = [
      { countryCode: "NL", city: "Rotterdam", precision: "city" },
      { countryCode: "DE", precision: "country" },
      { countryCode: "NL", region: "Randstad", precision: "region" },
    ];
    for (const g of cases) {
      expect(parseGeography(serializeGeography(g))).toEqual(g);
    }
  });

  it("writes the precision EXPLICITLY rather than inferring it from fields", () => {
    // Inference is how a country selection quietly becomes a city one after a
    // refactor, so the token has to carry the word.
    expect(serializeGeography({ countryCode: "NL", precision: "country" })).toBe(
      "NL:country",
    );
    expect(
      serializeGeography({ countryCode: "NL", city: "Rotterdam", precision: "city" }),
    ).toBe("NL:city:Rotterdam");
  });

  it("percent-encodes a place name so a colon cannot split the token", () => {
    const g: GeographySelection = {
      countryCode: "NL",
      city: "Rotterdam: Zuid",
      precision: "city",
    };
    const token = serializeGeography(g);
    expect(token.split(":").length).toBe(3);
    expect(parseGeography(token)).toEqual(g);
  });

  it("REJECTS a fabricated place instead of repairing it", () => {
    for (const token of [
      "NL:city:", //           city precision with no city
      "NL:city", //            city precision, no segment at all
      "NL:country:Rotterdam", // a country selection wearing a city name
      "ZZ:city:Nowhere", //    not a real country
      "N:city:Rotterdam", //   not an ISO-2 code
      "NL:street:Coolsingel", // an invented precision
      "NL", //                 no precision at all
      "NL:city:%E0%A4%A", //   malformed percent-escape
      "",
      null,
      undefined,
    ]) {
      expect(parseGeography(token as string | null), `token: ${String(token)}`).toBeNull();
    }
  });

  it("upgrades nothing when translating a map anchor into a selection", () => {
    // A dashed country anchor can only ever become a country selection. The
    // anchor already carries the honest precision; this is a translation.
    expect(
      geographyFromAnchor({ country: "de", label: "DE", precision: "country" }),
    ).toEqual({ countryCode: "DE", precision: "country" });
    expect(
      geographyFromAnchor({ country: "nl", label: "Rotterdam", precision: "city" }),
    ).toEqual({ countryCode: "NL", city: "Rotterdam", precision: "city" });
  });

  it("shows the person the place that was actually matched", () => {
    expect(
      geographyLabel({ countryCode: "NL", city: "Rotterdam", precision: "city" }),
    ).toBe("Rotterdam, NL");
    expect(geographyLabel({ countryCode: "DE", precision: "country" })).toBe("DE");
  });
});

// ── W4.2 — the filter mirrors what the marker counted ──────────────────────

/** Rotterdam and Hamburg resolve; Duisburg does not — the same shape as the
 *  real coordinate table, without depending on today's contents of it. */
const resolves = (country: string, city: string) =>
  ["nl:rotterdam", "nl:eindhoven", "de:hamburg"].includes(
    `${country.toLowerCase()}:${city.trim().toLowerCase()}`,
  );

describe("W4.2 — city precision selects the city, and only the city", () => {
  const rotterdam: GeographySelection = {
    countryCode: "NL",
    city: "Rotterdam",
    precision: "city",
  };

  it("matches the same city written differently", () => {
    for (const city of ["Rotterdam", "rotterdam", "ROTTERDAM"]) {
      expect(projectMatchesGeography({ country: "NL", city }, rotterdam, resolves)).toBe(
        true,
      );
    }
  });

  it("does not match another city, another country, or a missing city", () => {
    expect(
      projectMatchesGeography({ country: "NL", city: "Eindhoven" }, rotterdam, resolves),
    ).toBe(false);
    expect(
      projectMatchesGeography({ country: "DE", city: "Rotterdam" }, rotterdam, resolves),
    ).toBe(false);
    expect(projectMatchesGeography({ country: "NL", city: null }, rotterdam, resolves)).toBe(
      false,
    );
  });
});

describe("W4.2 — country precision selects the UNRESOLVED aggregate", () => {
  const germany: GeographySelection = { countryCode: "DE", precision: "country" };

  it("matches a project whose city could not be resolved", () => {
    expect(
      projectMatchesGeography({ country: "DE", city: "Duisburg" }, germany, resolves),
    ).toBe(true);
    expect(projectMatchesGeography({ country: "DE", city: null }, germany, resolves)).toBe(
      true,
    );
  });

  it("does NOT sweep in the country's resolved cities", () => {
    // The dashed marker's weight is the unresolved demand alone. Matching every
    // project in the country would show more rows than the marker counted, and
    // the two numbers would silently disagree.
    expect(
      projectMatchesGeography({ country: "DE", city: "Hamburg" }, germany, resolves),
    ).toBe(false);
  });
});

describe("W4.2 — region precision is unsupported, not empty", () => {
  it("never matches, because `projects` has no subdivision column", () => {
    const region: GeographySelection = {
      countryCode: "NL",
      region: "Randstad",
      precision: "region",
    };
    expect(
      projectMatchesGeography({ country: "NL", city: "Rotterdam" }, region, resolves),
    ).toBe(false);
  });

  it("the loader answers `unsupported_precision`, never `empty`", () => {
    // "No projects here" is a claim about the market. "We cannot answer this
    // shape of question" is a claim about us. Conflating them is a lie.
    const src = read(LOADER);
    expect(src).toMatch(/precision === "region"/);
    expect(src).toMatch(/state: "unsupported_precision"/);
  });
});

// ── grouping ───────────────────────────────────────────────────────────────

function demand(over: Partial<DemandJoinRow> & { projects: DemandJoinRow["projects"] }) {
  return {
    id: "d1",
    role_title: "Elektrikas",
    headcount_needed: 4,
    required_skills: null,
    start_date: "2026-09-01",
    project_id: over.projects?.id ?? null,
    ...over,
  } as DemandJoinRow;
}

function project(over: Partial<NonNullable<DemandJoinRow["projects"]>> = {}) {
  return {
    id: "p1",
    title: "Rotterdam haven",
    country: "NL",
    city: "Rotterdam",
    status: "live",
    start_date: null,
    end_date: null,
    company_id: "c1",
    companies: { display_name: "Dev Construction BV", legal_name: null },
    ...over,
  } as NonNullable<DemandJoinRow["projects"]>;
}

const ROTTERDAM: GeographySelection = {
  countryCode: "NL",
  city: "Rotterdam",
  precision: "city",
};

describe("W4.3 — the project rows", () => {
  it("keeps several projects in one city apart and sums each one's demand", () => {
    const rows = groupIntoProjects(
      [
        demand({ id: "d1", projects: project({ id: "p1" }), headcount_needed: 5 }),
        demand({
          id: "d2",
          projects: project({ id: "p1" }),
          headcount_needed: 3,
          role_title: "Montuotojas",
        }),
        demand({ id: "d3", projects: project({ id: "p2", title: "Kralingen" }), headcount_needed: 2 }),
      ],
      ROTTERDAM,
      resolves,
    );
    expect(rows).toHaveLength(2);
    expect(rows[0]?.projectId).toBe("p1");
    expect(rows[0]?.openHeadcount).toBe(8);
    expect(rows[0]?.openDemandCount).toBe(2);
    // Several roles: a project is not assumed to be one role.
    expect(rows[0]?.roles).toEqual(["Elektrikas", "Montuotojas"]);
    // Most demand first — a stable, stated order, not a ranking of quality.
    expect(rows[1]?.projectId).toBe("p2");
  });

  it("drops every project outside the selection", () => {
    const rows = groupIntoProjects(
      [
        demand({ projects: project({ id: "p1" }) }),
        demand({ id: "d2", projects: project({ id: "p2", city: "Eindhoven" }) }),
        demand({ id: "d3", projects: project({ id: "p3", country: "DE", city: "Hamburg" }) }),
      ],
      ROTTERDAM,
      resolves,
    );
    expect(rows.map((r) => r.projectId)).toEqual(["p1"]);
  });

  it("returns nothing — not something — for a place with no projects", () => {
    const rows = groupIntoProjects(
      [demand({ projects: project() })],
      { countryCode: "LT", city: "Vilnius", precision: "city" },
      resolves,
    );
    expect(rows).toEqual([]);
  });

  it("never inflates a headcount that was not stated", () => {
    const rows = groupIntoProjects(
      [demand({ projects: project(), headcount_needed: null })],
      ROTTERDAM,
      resolves,
    );
    expect(rows[0]?.openHeadcount).toBe(0);
    // …and says so, rather than presenting 0 as the answer.
    expect(rows[0]?.missing).toContain("headcount");
  });

  it("reports every gap explicitly", () => {
    const rows = groupIntoProjects(
      [
        demand({
          projects: project({ city: null, companies: null }),
          role_title: null,
          required_skills: null,
          start_date: null,
        }),
      ],
      { countryCode: "NL", precision: "country" },
      resolves,
    );
    expect(rows[0]?.missing).toEqual(
      expect.arrayContaining([
        "city",
        "startDate",
        "endDate",
        "roleTitle",
        "requiredSkills",
        "organization",
      ]),
    );
    // An unresolvable city degrades the ROW's precision too, so a dashed
    // marker and an "approximate" row can never disagree.
    expect(rows[0]?.precision).toBe("country");
  });

  it("carries complete timing through when the data has it", () => {
    const rows = groupIntoProjects(
      [
        demand({
          projects: project({ start_date: "2026-09-15", end_date: "2027-03-01" }),
          start_date: "2026-10-01",
        }),
      ],
      ROTTERDAM,
      resolves,
    );
    // Earliest start across the project and its needs — the date the person
    // would actually have to be available for.
    expect(rows[0]?.startDate).toBe("2026-09-15");
    expect(rows[0]?.endDate).toBe("2027-03-01");
    expect(rows[0]?.missing).not.toContain("startDate");
    expect(rows[0]?.missing).not.toContain("endDate");
  });

  it("explains the match with a CODE and the row's own values", () => {
    const city = groupIntoProjects([demand({ projects: project() })], ROTTERDAM, resolves);
    expect(city[0]?.matchReason).toEqual({
      code: "city_exact",
      city: "Rotterdam",
      country: "NL",
    });
    const country = groupIntoProjects(
      [demand({ projects: project({ city: "Duisburg", country: "DE" }) })],
      { countryCode: "DE", precision: "country" },
      resolves,
    );
    expect(country[0]?.matchReason).toEqual({ code: "country_unresolved", country: "DE" });
  });
});

// ── W4.5 — the continuation to people ──────────────────────────────────────

describe("W4.5 — the continuation carries real structured context", () => {
  const evaluation = (over: Partial<ProjectEvaluation> = {}): ProjectEvaluation => ({
    state: "ok",
    geography: ROTTERDAM,
    geographyLabel: "Rotterdam, NL",
    row: groupIntoProjects([demand({ projects: project() })], ROTTERDAM, resolves)[0],
    demands: [],
    skillSlugs: ["mig-mag-welding", "tig-welding"],
    unresolvedSkillCount: 0,
    ...over,
  });

  it("includes every field the command names", () => {
    const ctx = buildPeopleContinuation(evaluation(), null);
    expect(ctx).not.toBeNull();
    expect(ctx?.projectId).toBe("p1");
    expect(ctx?.roles).toEqual(["Elektrikas"]);
    expect(ctx?.skillSlugs).toEqual(["mig-mag-welding", "tig-welding"]);
    expect(ctx?.geography).toEqual(ROTTERDAM);
    expect(ctx?.requestedHeadcount).toBe(4);
    expect(ctx).toHaveProperty("startDate");
    expect(ctx).toHaveProperty("workspace");
  });

  it("refuses to build a context from an evaluation that did not load", () => {
    expect(buildPeopleContinuation(evaluation({ state: "error", row: undefined }), null)).toBeNull();
    expect(buildPeopleContinuation(evaluation({ state: "not_found", row: undefined }), null)).toBeNull();
  });

  it("the control exists, is honest about not being delivered, and does nothing silently", () => {
    const src = read(DRILLDOWN);
    expect(src).toMatch(/data-testid="continue-to-people"/);
    // It opens a stated not-yet-delivered panel…
    expect(src).toMatch(/data-testid="people-continuation"/);
    expect(src).toMatch(/peopleNotYet/);
    // …and there is no invented people list anywhere behind it.
    expect(src).not.toMatch(/mockPeople|fakePeople|samplePeople|demoPeople/i);
  });
});

// ── no silent fallback, ever ───────────────────────────────────────────────

describe("a failed read is stated, never rendered as an empty market", () => {
  it("the project loader has an error state distinct from empty", () => {
    const src = read(LOADER);
    expect(src).toMatch(/state: "error"/);
    expect(src).toMatch(/state: rows\.length === 0 \? "empty" : "ok"/);
    // The driver message never leaves the loader: it can carry schema and
    // connection detail.
    expect(src).not.toMatch(/errorCode: error\.message|error\.message/);
  });

  it("the market loader no longer answers a failed read with 'no demand'", () => {
    // This was a real defect in the proven Goal 4 path: `if (error || !data)
    // return emptyResult()` made a broken read say the market was empty.
    const src = read(MARKET_RESULT);
    expect(src).toMatch(/failed: true/);
    expect(src).toMatch(/readonly failed: boolean/);
  });

  it("no loader can reach fixture, demo or landing data", () => {
    for (const file of [LOADER, MODEL, ACTIONS]) {
      const src = read(file);
      expect(src, `${file} must not import a scripted scenario`).not.toMatch(
        /landing-scenario|dev-fixtures|placeholders|\bdemo\b/i,
      );
    }
  });

  it("the UI renders the error branch INSTEAD of rows, not beside them", () => {
    const src = read(DRILLDOWN);
    // The error test comes first in the chain, so a stale list cannot survive
    // underneath a failure notice.
    const errorAt = src.indexOf('testId="projects-error"');
    const listAt = src.indexOf('data-testid="projects-list"');
    expect(errorAt).toBeGreaterThan(-1);
    expect(listAt).toBeGreaterThan(errorAt);
  });
});

// ── RLS is the authorization ───────────────────────────────────────────────

describe("the loader reads as the signed-in user", () => {
  it("uses the authenticated server client and nothing stronger", () => {
    const src = read(LOADER);
    expect(src).toMatch(/from "@\/lib\/supabase\/server"/);
    // A service-role client, an admin client or a security-definer RPC would
    // each replace RLS with our own judgement about who may see what.
    expect(src).not.toMatch(/SERVICE_ROLE|serviceRole|createAdminClient|\.rpc\(/);
  });

  it("reads only OPEN demand — the status a non-owning user may browse", () => {
    const src = read(LOADER);
    expect(src).toMatch(/\.eq\("status", input\.status \?\? "open"\)/);
    expect(src).toMatch(/\.eq\("status", "open"\)/);
  });

  it("re-validates the geography token on the server side of the boundary", () => {
    // A server action's arguments are a public entrypoint.
    const src = read(ACTIONS);
    expect(src).toMatch(/parseGeography\(geoToken\)/);
    expect(src).toMatch(/invalid_geography_token/);
  });

  it("never lets a non-uuid project id reach the database", () => {
    expect(read(LOADER)).toMatch(/UUID\.test\(projectId\)/);
  });
});

// ── one map, one panel ─────────────────────────────────────────────────────

describe("one map, at one depth", () => {
  it("the drill-down mounts exactly one <MarketMap>, in the market view", () => {
    // Count MOUNTS, not mentions: the header prose names the component too,
    // and a comment is not a second map.
    const src = read(DRILLDOWN);
    const mounts = (src.match(/^\s*<MarketMap$/gm) ?? []).length;
    expect(mounts).toBe(1);
    // …and it is inside the depth-0 view, not the project depths.
    const mapAt = src.search(/^\s*<MarketMap$/m);
    const projectsViewAt = src.indexOf("function ProjectsView");
    expect(mapAt).toBeGreaterThan(-1);
    expect(mapAt).toBeLessThan(projectsViewAt);
  });

  it("the panel still hides the workspace map whenever a result owns geography", () => {
    // The Goal 4 fix. Two maps in one column is the panel arguing with itself.
    //
    // Asserted as the INVARIANT, not as one line of source: W3 row 6 put the
    // pending-invitation control in the same `showsResult ? null :` branch
    // (attention before geography), so the map is no longer the first thing
    // inside it. What must stay true is that the map has exactly one mount and
    // that it is unreachable while a result is showing.
    const src = read(PANEL);
    const mounts = src.match(/<WorkspaceMap\b/g) ?? [];
    expect(mounts, "one map mount").toHaveLength(1);
    const branch = src.indexOf("showsResult ? null : (");
    expect(branch, "the map lives behind the showsResult gate").toBeGreaterThan(-1);
    expect(src.indexOf("<WorkspaceMap")).toBeGreaterThan(branch);
  });

  it("the deeper result widens the SAME panel instead of opening a second one", () => {
    const src = read(PANEL);
    expect(src).toMatch(/wide \? "lg:w-\[30rem\]/);
    // Still one <aside>, still not a dialog.
    expect(src.match(/<aside/g) ?? []).toHaveLength(1);
    expect(src).not.toMatch(/role=["']dialog["']|aria-modal/);
  });

  it("the client never value-imports the server-only loader", () => {
    const src = read(DRILLDOWN);
    // Type imports are erased; a value import would drag `server-only` into
    // the client bundle and fail at runtime, not at compile time.
    expect(src).not.toMatch(/^import \{[^}]*\} from "@\/lib\/market-map\/project-results";$/m);
    expect(src).toMatch(/from "@\/lib\/market-map\/project-results-model"/);
    expect(src).toMatch(/from "@\/lib\/market-map\/project-results-actions"/);
  });
});

// ── restorable state ───────────────────────────────────────────────────────

describe("every depth is a real, restorable address", () => {
  it("the hook validates `geo` and `project` before anyone sees them", () => {
    const src = read(HOOK);
    expect(src).toMatch(/parseGeography\(rawGeo\)/);
    // A project id without a geography is not a state this product has.
    expect(src).toMatch(/if \(!geography\) return null;/);
  });

  it("re-serializes the validated selection rather than passing the raw token", () => {
    // What the loader is asked for is then exactly what was validated.
    expect(read(HOOK)).toMatch(/geography \? serializeGeography\(geography\) : null/);
  });

  it("going deeper pushes so Back steps up, and closing replaces", () => {
    const src = read(HOOK);
    expect(src).toMatch(/serializeGeography\(g\), project: null \}, "push"\)/);
    expect(src).toMatch(/write\(\{ project: id \}, "push"\)/);
    expect(src).toMatch(/write\(\{ project: null \}, "replace"\)/);
    // W6 slice 3D added a THIRD depth (`interaction`, the experiences result's
    // submit step). Closing must clear every depth, so the list grew — the
    // rule is unchanged, and pinning it as a set rather than a literal string
    // is what keeps that true when a fourth depth arrives.
    //
    // W8 IS THAT FOURTH DEPTH (`demand`, the candidates result's per-need
    // step), and this literal is exactly the line that had to be edited for
    // it — which is the guard working: a new depth cannot be added without
    // someone confirming, here, that closing clears it too. The invariant
    // form lives in the next test and needed no edit at all.
    expect(src).toMatch(
      /result: null, geo: null, project: null, interaction: null, demand: null \}/,
    );
    expect(src).toMatch(/demand: null \},\s*"replace",?\s*\)/);
  });

  it("opening a result clears any stale depth — EVERY depth", () => {
    const src = read(HOOK);
    // W8 added `demand` as the fourth depth — see the note in the test above.
    expect(src).toMatch(
      /result: kind, geo: null, project: null, interaction: null, demand: null \}/,
    );
    // Stated as an invariant, not a snapshot: whatever `write` clears when a
    // result opens must also be cleared when it closes. A depth that survived
    // one but not the other is how a result reopens onto a stale answer.
    const openClears = /openResult[\s\S]{0,200}?write\(\s*\{([^}]*)\}/.exec(src)?.[1] ?? "";
    const closeClears = /closeResult[\s\S]{0,200}?write\(\s*\{([^}]*)\}/.exec(src)?.[1] ?? "";
    // `result` itself is not a DEPTH: closing nulls it, opening sets it to the
    // new kind. The invariant is about everything BELOW the result.
    const nulled = (block: string) =>
      [...block.matchAll(/(\w+):\s*null/g)]
        .map((m) => m[1])
        .filter((k) => k !== "result")
        .sort();
    expect(nulled(openClears).length).toBeGreaterThan(0);
    expect(nulled(openClears)).toEqual(nulled(closeClears));
  });

  it("the interaction depth pushes, so Back returns to the experiences list", () => {
    const src = read(HOOK);
    expect(src).toMatch(/interaction: token \},\s*"push",?\s*\)/);
    expect(src).toMatch(/write\(\{ interaction: null \}, "replace"\)/);
  });

  it("re-reads the live location on POPSTATE, not only when params change", () => {
    // A REAL DEFECT, found in the authenticated browser and fixed here. After a
    // reload the hook is in the empty-`useSearchParams` state, so the cached
    // `href` decides which depth renders — and `href` was refreshed only when
    // the params object changed identity. Browser Back fires `popstate` without
    // necessarily doing that, so the URL said "project list" while the panel
    // still showed the evaluation, and Back appeared to do nothing.
    const src = read(HOOK);
    expect(src).toMatch(/addEventListener\("popstate", sync\)/);
    expect(src).toMatch(/removeEventListener\("popstate", sync\)/);
    // …and once mounted the LIVE location wins, so the two sources can never
    // disagree about depth.
    expect(src).toMatch(/href !== null\s*\?\s*new URLSearchParams\(href\)\.get\(key\)/);
  });
});

// ── the explanation is a filter reporting itself ───────────────────────────

describe("the explanation never becomes a judgement", () => {
  it("is rendered from a code and the row's values, not from prose", () => {
    const src = read(DRILLDOWN);
    expect(src).toMatch(/reason\.code === "city_exact"/);
    expect(src).toMatch(/reasonCityExact|reasonCountryUnresolved/);
  });

  it("claims nothing about attractiveness, probability, suitability or quality", () => {
    for (const locale of RESULT_LOCALES) {
      const messages = JSON.parse(read(`messages/${locale}.json`)) as Record<
        string,
        Record<string, Record<string, unknown>>
      >;
      const results = messages.conversation?.results ?? {};
      const explanations = [
        results.reasonCityExact,
        results.reasonCountryUnresolved,
      ].map(String);
      for (const text of explanations) {
        // Deterministic rules must not be sold as AI, and a filter must not
        // grade the work it filtered.
        expect(text, `${locale}: ${text}`).not.toMatch(
          /\bAI\b|semantic|prediction|prognoz|dirbtin|künstlich|искусственн/i,
        );
        expect(text, `${locale}: ${text}`).not.toMatch(
          /best|top|recommend|ideal|geriaus|rekomend|empfohlen|aanbevolen|лучш|рекоменд/i,
        );
      }
      // And the boundary is stated on the surface itself.
      expect(String(results.evalNoJudgement).length).toBeGreaterThan(20);
    }
  });
});

// ── the copy exists ────────────────────────────────────────────────────────

describe("the copy exists in every locale that carries this namespace", () => {
  const REQUIRED = [
    "selectPlaceHint",
    "crumbMarket",
    "backToMarket",
    "backToProjects",
    "projectsError",
    "projectsEmpty",
    "projectsUnsupported",
    "projectsCount",
    "evaluationError",
    "evaluationNotFound",
    "notStated",
    "whyMatch",
    "missingTitle",
    "reasonCityExact",
    "reasonCountryUnresolved",
    "precisionCity",
    "precisionCountry",
    "evalDemand",
    "evalGeography",
    "evalTiming",
    "evalOrganization",
    "evalDataQuality",
    "evalExplanation",
    "evalOpenVsFilled",
    "evalVisibility",
    "evalTimingMissing",
    "evalUnresolvedGeography",
    "evalSkillsUnresolved",
    "evalNoJudgement",
    "findPeople",
    "peopleNotYet",
    "workspacePersonal",
  ];
  const MISSING_FIELDS = [
    "city",
    "startDate",
    "endDate",
    "roleTitle",
    "requiredSkills",
    "headcount",
    "organization",
  ];

  for (const locale of RESULT_LOCALES) {
    it(`${locale} has every key the drill-down renders`, () => {
      const messages = JSON.parse(read(`messages/${locale}.json`));
      const results = messages.conversation?.results ?? {};
      for (const key of REQUIRED) {
        expect(String(results[key] ?? "").trim(), `${locale}.${key}`).not.toBe("");
      }
      for (const key of MISSING_FIELDS) {
        expect(
          String(results.missing?.[key] ?? "").trim(),
          `${locale}.missing.${key}`,
        ).not.toBe("");
      }
    });
  }
});
