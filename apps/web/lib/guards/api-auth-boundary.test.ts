import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

import { classifyBearerHeader } from "@/lib/api/api-identity";

/**
 * AUTH-CORE API BOUNDARY — the guard.
 *
 * `app/api/**` is the only part of the product a non-browser client can reach.
 * Before the boundary existed, 8 of 9 routes resolved identity from `cookies()`
 * and NONE read an `Authorization` header, so the canonical domain had exactly
 * one transport. The boundary adds a second one without adding a second
 * product behind it.
 *
 * Three failure modes are worth failing CI over, and each has a test below.
 *
 *   1. A NEW route ships unclassified. "Is this reachable by a phone?" is a
 *      product decision; the danger is that nobody makes it. Every route file
 *      must appear in the table, so adding one forces the answer.
 *   2. A route starts parsing `Authorization` itself. Nine parsers is nine
 *      chances to forget expiry, to accept a token from another project, or to
 *      treat a failed verification as an anonymous request.
 *   3. "Present but unusable" is treated as "absent". That is the one bug that
 *      would silently serve a cookie identity to a caller who asked to be
 *      identified by a token.
 */

const APP_ROOT = join(__dirname, "..", "..");
const API_ROOT = join(APP_ROOT, "app", "api");

/**
 * EVERY route file, with the decision someone made about it.
 *
 *   `public`       — no identity at all (a signature, or an anonymous funnel).
 *   `cookie-only`  — authenticated, deliberately browser-only.
 *   `shared`       — reachable by cookie OR bearer; a client outside the
 *                    browser has a real product reason to call it.
 *   `shared-blocked` — SHOULD be shared, and cannot be yet, for a stated
 *                    reason that is about code and not about willingness.
 *
 * A route missing from this table fails the first test. That is the point:
 * the table is where the decision is recorded, not a mirror of the code.
 */
const CLASSIFICATION: Record<
  string,
  { class: "public" | "cookie-only" | "shared" | "shared-blocked"; why: string }
> = {
  "billing/webhook/route.ts": {
    class: "public",
    why: "Stripe delivers it; identity is the webhook signature, not a user.",
  },
  "waitlist/route.ts": {
    class: "public",
    why: "The pre-auth funnel. Anonymous by design, rate-limited, its own client.",
  },
  "billing/portal/route.ts": {
    class: "cookie-only",
    why: "Money surface. It redirects a BROWSER to Stripe's hosted portal, so a non-browser caller has nothing to do with the response. No product need, and billing is where a mistake is least recoverable.",
  },
  "billing/test-checkout/route.ts": {
    class: "cookie-only",
    why: "Same reasoning as the portal, and test-mode only on top of it: it starts a Stripe Checkout a browser then completes.",
  },
  "cv/extract/route.ts": {
    class: "shared",
    why: "Importing a CV from a phone is one of the first things a mobile client must do.",
  },
  "professions/[professionId]/skills/route.ts": {
    class: "shared",
    why: "Taxonomy read every client needs to render a skill picker.",
  },
  "workers/[workerId]/skills/route.ts": {
    class: "shared",
    why: "The representative canonical READ and WRITE. Authority stays with ownsWorker + RLS.",
  },
  "documents/file/[fileId]/route.ts": {
    class: "shared",
    why: "The one document download door, and the most authorization-heavy read in app/api — which is exactly why it is worth proving over the new transport rather than avoiding.",
  },
  "dashboard-search/route.ts": {
    class: "shared-blocked",
    why: "The route would be trivial to convert and it would be a LIE: getDashboardSearchGroups() takes no client and fans out to helpers that each call createClient() themselves, so the search would silently run as the cookie session (or as nobody) while the route reported the bearer caller's identity. The coupling is below the route layer — 257 of 892 lib modules resolve their own cookie client. Converting this route needs the shared-core refactor, not a header.",
  },
};

/** Every `route.ts` under app/api, as a path relative to app/api. */
function routeFiles(dir: string = API_ROOT, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) routeFiles(full, acc);
    else if (entry === "route.ts") acc.push(relative(API_ROOT, full).split("\\").join("/"));
  }
  return acc;
}

const read = (rel: string) => readFileSync(join(API_ROOT, rel), "utf8");

describe("every app/api route carries a transport decision", () => {
  it("no route is unclassified, and no classification names a route that is gone", () => {
    const onDisk = routeFiles().sort();
    const declared = Object.keys(CLASSIFICATION).sort();
    expect(
      onDisk,
      "a new app/api route must state whether a non-browser client may call it",
    ).toEqual(declared);
  });

  it("every classification carries a REASON, not just a label", () => {
    for (const [route, entry] of Object.entries(CLASSIFICATION)) {
      expect(entry.why.trim().length, `${route}: empty justification`).toBeGreaterThan(40);
    }
  });
});

describe("one resolver, never nine parsers", () => {
  it("no route file reads the Authorization header itself", () => {
    const offenders = routeFiles().filter((r) =>
      /headers\s*\.\s*get\(\s*["'`][Aa]uthorization/.test(read(r)),
    );
    expect(
      offenders,
      "parse the header in lib/api/api-identity.ts, not in a route",
    ).toEqual([]);
  });

  it("shared routes go through resolveApiIdentity and not the cookie client", () => {
    for (const [route, entry] of Object.entries(CLASSIFICATION)) {
      if (entry.class !== "shared") continue;
      const src = read(route);
      expect(src, `${route} must resolve identity through the boundary`).toMatch(
        /resolveApiIdentity/,
      );
      expect(
        src.includes('from "@/lib/supabase/server"'),
        `${route} must not also build a cookie-bound client — that is the second identity path`,
      ).toBe(false);
    }
  });

  it("cookie-only and public routes do NOT quietly gain the bearer transport", () => {
    for (const [route, entry] of Object.entries(CLASSIFICATION)) {
      if (entry.class === "shared") continue;
      expect(
        read(route).includes("resolveApiIdentity"),
        `${route} is classified ${entry.class} — widening it is a product decision, so change the table in the same commit`,
      ).toBe(false);
    }
  });

  it("the boundary never reaches for the service-role key", () => {
    const boundary = readFileSync(
      join(APP_ROOT, "lib", "api", "api-identity.ts"),
      "utf8",
    );
    expect(boundary).not.toMatch(/SERVICE_ROLE|serviceRole|createAdminClient/);
    // …and it uses the anon key path, so RLS is the thing deciding.
    expect(boundary).toMatch(/requireSupabaseClientEnv/);
  });
});

describe("present-but-unusable is never absent", () => {
  const JWT = "aaa.bbb.ccc";

  it("no header at all is the ONLY thing that falls through to cookies", () => {
    expect(classifyBearerHeader(null).kind).toBe("absent");
    expect(classifyBearerHeader("").kind).toBe("absent");
    expect(classifyBearerHeader("   ").kind).toBe("absent");
  });

  it.each([
    ["Bearer", "scheme with no token"],
    ["Bearer ", "scheme with empty token"],
    ["Bearer not-a-jwt", "not three segments"],
    ["Bearer aaa.bbb", "two segments"],
    ["Bearer aaa..ccc", "empty middle segment"],
    ["Basic dXNlcjpwYXNz", "a different scheme entirely"],
    [`Token ${JWT}`, "an unknown scheme carrying a real-looking JWT"],
    [`Bearer ${JWT} extra`, "trailing junk"],
    [`Bearer Bearer ${JWT}`, "doubled scheme"],
    [`Bearer ${JWT},Bearer ddd.eee.fff`, "comma-separated credentials"],
    // Base64url is the ONLY alphabet a real JWS compact token can use
    // (RFC 7515). The stricter charset is the graft from #1336's review.
    ["Bearer aa+a.bbb.ccc", "standard-base64 '+' is not base64url"],
    ["Bearer aaa.bb/b.ccc", "standard-base64 '/' is not base64url"],
    ["Bearer aaa.bbb.cc=", "padding '=' never appears in a JWS segment"],
    ["Bearer aaa.bbb.ccc.ddd", "four segments"],
  ])("%s → malformed, NOT absent (%s)", (header) => {
    const got = classifyBearerHeader(header);
    expect(
      got.kind,
      "a caller who sent an Authorization header must never be served a cookie identity",
    ).toBe("malformed");
  });

  it("a well-formed bearer yields the token, and the scheme is case-insensitive", () => {
    for (const scheme of ["Bearer", "bearer", "BEARER"]) {
      const got = classifyBearerHeader(`${scheme} ${JWT}`);
      expect(got.kind).toBe("token");
      if (got.kind === "token") expect(got.token).toBe(JWT);
    }
  });

  it("classification never verifies — a syntactically fine token is still unverified here", () => {
    // The shape check is a cheap pre-filter, not authentication. If this ever
    // started returning "verified" the whole boundary would be decorative.
    const got = classifyBearerHeader(`Bearer ${JWT}`);
    expect(Object.keys(got)).toEqual(["kind", "token"]);
  });
});
