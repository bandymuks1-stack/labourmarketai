import { describe, expect, it } from "vitest";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";

const APP_ROOT = join(__dirname, "..", "..");
const LOCALE_ROOT = join(APP_ROOT, "app", "[locale]");

/**
 * THE ARCHITECTURAL INVARIANT THIS GUARD KEEPS.
 *
 *   A server `redirect()` used as a pre-render access or lifecycle gate must
 *   not sit BELOW a response-committing loading/Suspense boundary.
 *
 * `loading.tsx` wraps everything below it in a Suspense boundary. A
 * `redirect()` thrown inside a Suspense boundary can no longer set an HTTP
 * status — Next has already committed a 200 — so the browser performs the
 * redirect itself after painting Next's `__next_error__` shell ("Application
 * error: a client-side exception has occurred"). The gate is still CORRECT;
 * it just announces itself as a crash and ships the refused person the very
 * page they are being refused.
 *
 * Measured twice on the local production build, 2026-09-22 / 2026-09-23:
 *   worker → `/lt/dashboard/company`  : 200, 600 627 B, whole shell (PR #1841)
 *   onboarded → `/lt/onboarding`      : 200,  60 346 B, wizard + skeleton
 * Counter-proof both times: `/lt/live-market-review`, which has no
 * `loading.tsx` above it, answers a real 307 from the same kind of page-level
 * `redirect()`.
 *
 * WHAT THIS GUARD IS NOT. It does not pin a route list — "these four routes
 * redirect" is not the invariant and would rot on the first new page. It
 * derives the boundaries from the tree and the gates from the source, and asks
 * one question per boundary: for every kind of gate that exists BELOW it, does
 * the same kind of gate also exist ABOVE it? The frames above a boundary are
 * the segment's own `layout.tsx` plus its ancestors — the last places that can
 * still answer with a real status.
 *
 * The page-level gates are deliberately NOT removed anywhere; they are the
 * authority on a soft navigation (React reuses a layout, so it does not re-run)
 * and on any request where a middleware header never arrived. This guard checks
 * only that they are not the FIRST place the decision is made.
 *
 * THE SECOND INVARIANT, WHICH THE FIRST ONE QUIETLY ASSUMED (owner §27,
 * 2026-09-23): the middleware's `exp` fast path is never authentication
 * proof. `middleware.ts` base64-decodes the session cookie's `exp` and, when
 * it is comfortably in the future, returns without validating anything — so a
 * forged, revoked or deleted-user cookie reaches the RSC layer exactly like a
 * genuine one. A layout gate therefore protects something only when the `user`
 * it tests came from a getter Supabase Auth has VERIFIED. The original
 * "unauthenticated" check accepted any `if (!user) redirect(` above the
 * boundary; a layout that switched to `getSession()`, which reads the cookie
 * and trusts it, would still have passed. Three assertions close that:
 *   (a) an unauthenticated gate above a boundary counts only when ONE frame
 *       holds both a verified getter and the refusal, getter first;
 *   (b) every prefix in the middleware's `REQUIRES_AUTH` — parsed from the
 *       file, never copied — has a top layout that performs that gate, and no
 *       boundary sits above that layout;
 *   (c) `getSession()` is banned from server code, except one pinned use.
 * Each carries a negative control: a synthetic source that must be refused,
 * and for (a) one the old check admitted.
 */

const read = (abs: string): string => readFileSync(abs, "utf8");

/** Comments out, so a file may EXPLAIN a gate without counting as one. */
function code(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
}

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const abs = join(dir, entry);
    if (statSync(abs).isDirectory()) walk(abs, out);
    else out.push(abs);
  }
  return out;
}

/** `apps/web`-relative path with forward slashes, on every OS. */
const relOf = (abs: string): string => relative(APP_ROOT, abs).split(sep).join("/");

const ALL_FILES = walk(LOCALE_ROOT);

/** Every response-committing boundary in the locale tree. */
const BOUNDARY_DIRS = ALL_FILES.filter(
  (f) => f.endsWith(`${sep}loading.tsx`) || f.endsWith(`${sep}template.tsx`),
).map((f) => dirname(f));

// ── What counts as a VERIFIED getter ────────────────────────────────────────

/**
 * Helpers that hand back a `user` only after calling `auth.getUser()`
 * themselves. Allowed BY NAME, and only while their own source still does that:
 * the "helpers stay verified" test re-reads each one, so an allowance cannot
 * outlive the fact it rests on. Add a helper here together with its file.
 */
const VERIFIED_HELPERS: readonly { name: string; file: string }[] = [
  { name: "getSessionProfile", file: "lib/auth/session-profile.ts" },
];

/**
 * `auth.getUser()` asks GoTrue for the user behind the token, which checks the
 * signature, the expiry and (for session tokens) that the session still
 * exists; `lib/supabase/server.ts` memoises it once per request, so a gate
 * costs no extra round-trip. `auth.getClaims()` verifies the signature too —
 * against the project's JWKS for asymmetric keys, through the same GoTrue call
 * for HS256 — although with asymmetric keys it cannot see a revoked session.
 * `getSession()` is deliberately absent: it decodes the cookie and trusts it,
 * which is exactly what the middleware fast path already did.
 */
const VERIFIED_GETTER = new RegExp(
  [
    String.raw`\.auth\.getUser\(`,
    String.raw`\.auth\.getClaims\(`,
    ...VERIFIED_HELPERS.map((h) => String.raw`\b${h.name}\(`),
  ].join("|"),
);

/**
 * `getSession` used as a call, a property read or a destructured name — not
 * the word in prose, and never `getSessionProfile`. A source string, because
 * the counter needs a fresh global regex each time (a shared `/g` regex keeps
 * `lastIndex` between calls).
 */
const SESSION_READ = String.raw`\.getSession\b|\bgetSession\b(?=\s*[(,}])`;
const sessionReads = (src: string): number =>
  (src.match(new RegExp(SESSION_READ, "g")) ?? []).length;

/** The refusal itself — the exact shape the original check looked for. */
const NO_USER_REFUSAL = /if\s*\(!(?:user|session\.user)\)\s*redirect\(/;

/**
 * Does this ONE frame decide "no verified user → login" on its own?
 *
 * The same frame, because a getter in one layout and a refusal in another say
 * nothing about which `user` the refusal tested. Getter first, because a
 * refusal that runs before the only verified call is testing something else.
 * And no `getSession` in the frame at all, because then `user` may be the
 * cookie's own unverified claim.
 */
function verifiedAuthGate(frameSrc: string): boolean {
  const src = code(frameSrc);
  const getter = src.search(VERIFIED_GETTER);
  const refusal = src.search(NO_USER_REFUSAL);
  return (
    getter !== -1 && refusal !== -1 && getter < refusal && sessionReads(src) === 0
  );
}

/** Does `name`, as defined in `src`, verify with `auth.getUser()` and never
 *  read `getSession`? */
function helperVerifies(name: string, src: string): boolean {
  const c = code(src);
  const def = c.search(
    new RegExp(String.raw`function\s+${name}\b|\b(?:const|let)\s+${name}\s*=`),
  );
  return def !== -1 && /\.auth\.getUser\(/.test(c.slice(def)) && sessionReads(c) === 0;
}

/**
 * The kinds of gate a route can perform before it renders.
 *
 * `below` is what the gate looks like in a page (or in a nested layout that is
 * itself inside the boundary). `above` asks whether ONE frame that can still
 * set a status makes the SAME decision — sometimes literally the same code,
 * and sometimes the form the decision takes once it is hoisted (a role gate
 * becomes a `routeRequirement` table lookup, because a layout is told the path
 * rather than calling the page's own helper).
 */
const GATE_KINDS: readonly {
  id: string;
  what: string;
  below: RegExp;
  above: (frame: string) => boolean;
  /** What "the same decision" requires, when that is more than a pattern. */
  requirement?: string;
}[] = [
  {
    id: "unauthenticated",
    what: "bounce an unauthenticated visitor to login",
    below: /if\s*\(!user\)\s*\n?\s*redirect\(|["']not_authenticated["']/,
    above: verifiedAuthGate,
    requirement:
      "The layout must obtain the user from a VERIFIED getter " +
      "(`auth.getUser()`, `auth.getClaims()` or " +
      VERIFIED_HELPERS.map((h) => `\`${h.name}()\``).join(", ") +
      ") and refuse with `if (!user) redirect(` in that SAME file, getter " +
      "first — never from `getSession()`, which trusts the cookie.",
  },
  {
    id: "not-onboarded",
    what: "route on whether onboarding is finished",
    below: /onboarded_at/,
    above: (frame) => /onboarded_at/.test(frame),
  },
  {
    id: "role",
    what: "refuse a route the held role does not reach",
    below: /requireRoleOrRedirect\(|requireSuperadmin\(/,
    above: (frame) => /routeRequirement\(/.test(frame),
  },
];

const UNAUTHENTICATED = GATE_KINDS.find((k) => k.id === "unauthenticated")!;

/** `…/app/[locale]/onboarding` → `/onboarding`. */
function routeOf(dir: string): string {
  const rel = relative(LOCALE_ROOT, dir).split(sep).filter(Boolean);
  const segments = rel.filter((s) => !(s.startsWith("(") && s.endsWith(")")));
  return "/" + segments.join("/");
}

/** Files INSIDE the boundary: the segment's own page and everything nested,
 *  minus the segment's own layout — which is the last frame ABOVE it. */
function filesBelow(dir: string): string[] {
  const ownLayout = join(dir, "layout.tsx");
  return ALL_FILES.filter(
    (f) =>
      f.startsWith(dir + sep) &&
      (f.endsWith(`${sep}page.tsx`) || f.endsWith(`${sep}layout.tsx`)) &&
      f !== ownLayout,
  );
}

/** Frames that can still answer with a real HTTP status: the segment's own
 *  layout, then every ancestor layout up to the app root. */
function filesAbove(dir: string): string[] {
  const out: string[] = [];
  let cur = dir;
  for (;;) {
    const layout = join(cur, "layout.tsx");
    if (existsSync(layout)) out.push(layout);
    if (cur === APP_ROOT) break;
    const parent = dirname(cur);
    if (parent === cur) break;
    cur = parent;
  }
  const appLayout = join(APP_ROOT, "app", "layout.tsx");
  if (existsSync(appLayout) && !out.includes(appLayout)) out.push(appLayout);
  return out;
}

/** The code of each frame above a boundary — one entry per file, so a
 *  decision is judged inside the frame that makes it. */
const framesAbove = (dir: string): string[] =>
  filesAbove(dir).map((f) => code(read(f)));

describe("Guard: the scan itself is not vacuous", () => {
  it("finds the boundaries and the files around them", () => {
    // A scan that matched nothing would make every assertion below pass while
    // proving nothing — the failure mode that makes source guards worthless.
    expect(BOUNDARY_DIRS.length).toBeGreaterThanOrEqual(3);
    for (const dir of BOUNDARY_DIRS) {
      expect(filesBelow(dir).length, `${routeOf(dir)}: nothing below`).toBeGreaterThan(0);
      expect(filesAbove(dir).length, `${routeOf(dir)}: nothing above`).toBeGreaterThan(0);
    }
  });

  it("detects at least one real gate below each boundary", () => {
    for (const dir of BOUNDARY_DIRS) {
      const below = filesBelow(dir).map((f) => code(read(f))).join("\n");
      const kinds = GATE_KINDS.filter((k) => k.below.test(below)).map((k) => k.id);
      expect(
        kinds.length,
        `${routeOf(dir)}: the gate patterns matched nothing below the boundary — ` +
          "either the tree moved or a pattern rotted, and the assertions below " +
          "would then be checking nothing",
      ).toBeGreaterThan(0);
    }
  });

  it("the dashboard boundary exercises every gate kind (the known-good case)", () => {
    // PR #1841 put all three above the dashboard boundary. If this stops
    // holding, the patterns have drifted away from the code they describe.
    const dir = BOUNDARY_DIRS.find((d) => routeOf(d) === "/dashboard");
    expect(dir, "the /dashboard boundary disappeared").toBeTruthy();
    const below = filesBelow(dir!).map((f) => code(read(f))).join("\n");
    const above = framesAbove(dir!);
    for (const kind of GATE_KINDS) {
      expect(kind.below.test(below), `below /dashboard: ${kind.id}`).toBe(true);
      expect(above.some(kind.above), `above /dashboard: ${kind.id}`).toBe(true);
    }
  });
});

describe("Guard: every pre-render gate is decided ABOVE its Suspense boundary", () => {
  it("no boundary streams a 200 where a gate should have set a status", () => {
    const violations: string[] = [];
    for (const dir of BOUNDARY_DIRS) {
      const route = routeOf(dir);
      const below = filesBelow(dir).map((f) => code(read(f))).join("\n");
      const above = framesAbove(dir);
      for (const kind of GATE_KINDS) {
        if (!kind.below.test(below)) continue;
        if (above.some(kind.above)) continue;
        violations.push(
          `${route}: a gate that would ${kind.what} (${kind.id}) runs only ` +
            `BELOW ${route}/loading.tsx. A redirect() there cannot set an HTTP ` +
            `status — it becomes a 200 that streams the page to the person ` +
            `being turned away, then redirects on the client behind Next's ` +
            `"Application error" shell. Decide it in ${route}/layout.tsx (or an ` +
            `ancestor layout), which is the last frame above the boundary. ` +
            `Do not delete ${route}/loading.tsx to satisfy this.` +
            (kind.requirement ? ` ${kind.requirement}` : ""),
        );
      }
    }
    expect(violations, violations.join("\n\n")).toEqual([]);
  });
});

// ── (a) the user a gate tests must be a VERIFIED user ───────────────────────

/** The shape the original check admitted: the right refusal, the wrong user. */
const GET_SESSION_GATE = [
  "const supabase = await createClient();",
  "const { data: { session } } = await supabase.auth.getSession();",
  "const user = session?.user;",
  "if (!user) redirect(`/${locale}/auth/login`);",
].join("\n");

describe("Guard: an unauthenticated gate counts only when its user is VERIFIED (owner §27)", () => {
  it("every helper allowed by name still verifies with auth.getUser() itself", () => {
    for (const helper of VERIFIED_HELPERS) {
      const abs = join(APP_ROOT, helper.file);
      expect(existsSync(abs), `${helper.file} is gone — drop ${helper.name} from VERIFIED_HELPERS`).toBe(true);
      expect(
        helperVerifies(helper.name, read(abs)),
        `${helper.file}: ${helper.name} no longer calls auth.getUser() (or now reads getSession), ` +
          "so a layout gating on it is no longer gating on a verified user",
      ).toBe(true);
    }
  });

  it("negative control: the old check admitted a getSession() gate; this one refuses it", () => {
    // Re-anchoring proof: the pattern this guard used before 2026-09-23 matches…
    expect(NO_USER_REFUSAL.test(GET_SESSION_GATE)).toBe(true);
    // …and the verified-gate rule does not.
    expect(verifiedAuthGate(GET_SESSION_GATE)).toBe(false);
    expect([GET_SESSION_GATE].some(UNAUTHENTICATED.above)).toBe(false);
    // Calling getUser() somewhere in the same frame does not launder a user
    // that was read from getSession().
    const mixed = [
      "const { data: { user: verified } } = await supabase.auth.getUser();",
      "const { data: { session } } = await supabase.auth.getSession();",
      "const user = session?.user;",
      "if (!user) redirect(`/${locale}/auth/login`);",
    ].join("\n");
    expect(verifiedAuthGate(mixed)).toBe(false);
  });

  it("negative control: getter and refusal in different frames do not add up to a gate", () => {
    const frames = [
      "const { data: { user } } = await supabase.auth.getUser();",
      "if (!user) redirect(`/${locale}/auth/login`);",
    ];
    // The old check tested the frames concatenated, and would have passed this.
    expect(NO_USER_REFUSAL.test(frames.join("\n"))).toBe(true);
    expect(frames.some(UNAUTHENTICATED.above)).toBe(false);
  });

  it("negative control: a refusal before the verified call, or a getter in a comment, does not count", () => {
    expect(
      verifiedAuthGate(
        "if (!user) redirect(`/${locale}/auth/login`);\n" +
          "const { data } = await supabase.auth.getUser();",
      ),
    ).toBe(false);
    expect(
      verifiedAuthGate(
        "// const { data: { user } } = await supabase.auth.getUser();\n" +
          "if (!user) redirect(`/${locale}/auth/login`);",
      ),
    ).toBe(false);
  });

  it("positive control: each verified form is accepted, so the refusals above are not refusing everything", () => {
    expect(
      verifiedAuthGate(
        "const { data: { user } } = await supabase.auth.getUser();\n" +
          "if (!user) redirect(`/${locale}/auth/login`);",
      ),
    ).toBe(true);
    expect(
      verifiedAuthGate(
        "const session = await getSessionProfile();\n" +
          "if (!session.user) redirect(`/${locale}/auth/login`);",
      ),
    ).toBe(true);
    expect(
      verifiedAuthGate(
        "const { data } = await supabase.auth.getClaims();\n" +
          "const user = data?.claims ?? null;\n" +
          "if (!user) redirect(`/${locale}/auth/login`);",
      ),
    ).toBe(true);
  });

  it("negative control: a helper that stopped verifying loses its allowance", () => {
    const drifted = [
      "export const getSessionProfile = cache(async () => {",
      "  const supabase = await createClient();",
      "  const { data: { session } } = await supabase.auth.getSession();",
      "  return { user: session?.user ?? null, profile: null, profileRead: 'ok' };",
      "});",
    ].join("\n");
    expect(helperVerifies("getSessionProfile", drifted)).toBe(false);
    expect(helperVerifies("getSessionProfile", "export const somethingElse = 1;")).toBe(false);
  });
});

// ── (b) every REQUIRES_AUTH tree carries that gate above its boundary ──────

const MIDDLEWARE_SRC = read(join(APP_ROOT, "middleware.ts"));

/** The prefixes `middleware.ts` sends an anonymous visitor to login for — read
 *  from its CODE, so a comment can neither add a prefix nor hide one. */
function requiresAuthPrefixes(middlewareSrc: string): string[] {
  const list = code(middlewareSrc).match(/\bconst\s+REQUIRES_AUTH\s*=\s*\[([^\]]*)\]/);
  if (!list) return [];
  return [...list[1].matchAll(/["'`]([^"'`]+)["'`]/g)].map((m) => m[1]);
}

/** What the check needs to know about the tree — injectable, so the negative
 *  controls can describe a tree that does not exist. */
type TreeView = {
  /** The source of `app/[locale]/<prefix>/layout.tsx`, or null when absent. */
  topLayout: (prefix: string) => string | null;
  /** A boundary file in a STRICT ancestor of the prefix's directory, or null. */
  boundaryAbove: (prefix: string) => string | null;
};

const prefixDir = (prefix: string): string =>
  join(LOCALE_ROOT, ...prefix.split("/").filter(Boolean));

const REAL_TREE: TreeView = {
  topLayout: (prefix) => {
    const f = join(prefixDir(prefix), "layout.tsx");
    return existsSync(f) ? read(f) : null;
  },
  boundaryAbove: (prefix) => {
    const appDir = join(APP_ROOT, "app");
    let cur = dirname(prefixDir(prefix));
    for (;;) {
      for (const name of ["loading.tsx", "template.tsx"]) {
        if (existsSync(join(cur, name))) return relOf(join(cur, name));
      }
      if (cur === appDir || dirname(cur) === cur) return null;
      cur = dirname(cur);
    }
  },
};

function requiresAuthViolations(prefixes: readonly string[], tree: TreeView): string[] {
  const out: string[] = [];
  for (const prefix of prefixes) {
    const at = `app/[locale]${prefix}/layout.tsx`;
    const layout = tree.topLayout(prefix);
    if (layout === null) {
      out.push(
        `${prefix}: middleware.ts lists it in REQUIRES_AUTH, but ${at} does not ` +
          "exist. The middleware's fast path admits any cookie whose unverified " +
          "`exp` looks fresh — forged or revoked included — so without a verified " +
          "gate of its own this tree has no authentication boundary above its " +
          `loading.tsx. Add ${at} with ${UNAUTHENTICATED.requirement}`,
      );
      continue;
    }
    if (!verifiedAuthGate(layout)) {
      out.push(
        `${prefix}: ${at} does not refuse a visitor without a VERIFIED user. ` +
          "REQUIRES_AUTH in middleware.ts is an anonymous-visitor convenience " +
          "redirect, not proof: a forged or revoked cookie with a fresh `exp` " +
          `skips it and reaches this layout. ${UNAUTHENTICATED.requirement}`,
      );
    }
    const boundary = tree.boundaryAbove(prefix);
    if (boundary) {
      out.push(
        `${prefix}: ${boundary} sits ABOVE ${at}, so a refusal there can no ` +
          "longer set an HTTP status — it streams a 200 first. Move the " +
          "boundary below the tree's layout.",
      );
    }
  }
  return out;
}

describe("Guard: every REQUIRES_AUTH tree is verified above its boundary (middleware exp is never auth proof)", () => {
  it("parses the list from middleware.ts, and the middleware still decides on it", () => {
    const prefixes = requiresAuthPrefixes(MIDDLEWARE_SRC);
    // Non-vacuity: /dashboard, /onboarding and /cv today. Fewer than three means
    // the parser lost the array, not that the product lost its protected trees.
    expect(prefixes.length, `parsed REQUIRES_AUTH = ${JSON.stringify(prefixes)}`).toBeGreaterThanOrEqual(3);
    for (const p of prefixes) expect(p, "a prefix is a rooted path").toMatch(/^\/[^/]/);
    // The parsed array must be the one the anonymous redirect actually reads.
    expect(code(MIDDLEWARE_SRC)).toMatch(/\bREQUIRES_AUTH\.some\(/);
  });

  it("each listed tree's top layout performs the verified gate, with no boundary above it", () => {
    const violations = requiresAuthViolations(requiresAuthPrefixes(MIDDLEWARE_SRC), REAL_TREE);
    expect(violations, violations.join("\n\n")).toEqual([]);
  });

  it("negative control: a listed tree with no layout, an unverified layout or a boundary above it is refused", () => {
    const verified =
      "const { data: { user } } = await supabase.auth.getUser();\n" +
      "if (!user) redirect(`/${locale}/auth/login`);";
    const synthetic: TreeView = {
      topLayout: (p) =>
        p === "/ghost"
          ? null
          : p === "/cookie-trusting"
            ? GET_SESSION_GATE
            : p === "/greeting-only"
              ? "const { data: { user } } = await supabase.auth.getUser();\nreturn <p>{user?.email}</p>;"
              : verified,
      boundaryAbove: (p) => (p === "/under-a-boundary" ? "app/[locale]/loading.tsx" : null),
    };
    const refused = (p: string) => requiresAuthViolations([p], synthetic);
    expect(refused("/ghost").join(" ")).toMatch(/does not exist/);
    expect(refused("/cookie-trusting").join(" ")).toMatch(/VERIFIED user/);
    expect(refused("/greeting-only").join(" ")).toMatch(/VERIFIED user/);
    expect(refused("/under-a-boundary").join(" ")).toMatch(/sits ABOVE/);
    // …and a correctly gated tree passes the same check.
    expect(refused("/fine")).toEqual([]);
  });

  it("negative control: the parser reads code, not comments", () => {
    expect(
      requiresAuthPrefixes('const REQUIRES_AUTH = ["/dashboard", "/ghost"];'),
    ).toEqual(["/dashboard", "/ghost"]);
    expect(requiresAuthPrefixes('// const REQUIRES_AUTH = ["/dashboard"];')).toEqual([]);
    expect(requiresAuthPrefixes('const PUBLIC = ["/jobs"];')).toEqual([]);
  });
});

// ── (c) getSession() is never authentication in server code ─────────────────

/**
 * The ONE server-side `getSession()` that is allowed, pinned to the exact file
 * and count. Anything else — a second read here included — fails.
 */
const GET_SESSION_PINNED: readonly { file: string; uses: number; reason: string }[] = [
  {
    file: "app/[locale]/auth/callback/route.ts",
    uses: 1,
    reason:
      "PKCE-race fallback: after a failed exchangeCodeForSession it asks only " +
      "whether a session cookie exists at all, and the verified auth.getUser() " +
      "below it decides who the person is before anything is trusted " +
      "(the fallback is pinned by auth-stability-pkce-logout.test.ts).",
  },
];

/** Server code: `app/`, `lib/`, `components/` and the middleware — minus tests
 *  and `"use client"` modules, which run in the browser and prove nothing to
 *  the server either way. */
const SERVER_SCAN_ROOTS = ["app", "lib", "components"] as const;
const SCRIPT_FILE = /\.[cm]?[jt]sx?$/;
const TEST_FILE = /\.(?:test|spec)\.[cm]?[jt]sx?$/;

/**
 * Does the module open with the `"use client"` directive? Only whitespace and
 * comments may precede it. A loop rather than one regex: a repeated group of
 * lazy block-comment matches backtracks exponentially on a file whose header
 * is several comments long, which hung this very scan on its first run.
 */
function isClientModule(src: string): boolean {
  let s = src;
  for (;;) {
    s = s.trimStart();
    if (s.startsWith("//")) {
      const nl = s.indexOf("\n");
      s = nl === -1 ? "" : s.slice(nl + 1);
    } else if (s.startsWith("/*")) {
      const end = s.indexOf("*/");
      s = end === -1 ? "" : s.slice(end + 2);
    } else {
      return /^["']use client["']/.test(s);
    }
  }
}

function serverSources(): { rel: string; src: string }[] {
  return [
    ...SERVER_SCAN_ROOTS.flatMap((root) => walk(join(APP_ROOT, root))),
    join(APP_ROOT, "middleware.ts"),
  ]
    .filter((f) => SCRIPT_FILE.test(f) && !TEST_FILE.test(f))
    .map((f) => ({ rel: relOf(f), src: read(f) }))
    .filter(({ src }) => !isClientModule(src));
}

/** After the LAST `getSession` read, the file verifies with `auth.getUser()`
 *  and refuses on its answer. */
function verifiesAfterSessionRead(src: string): boolean {
  let last = -1;
  for (const m of src.matchAll(new RegExp(SESSION_READ, "g"))) last = m.index ?? last;
  return last !== -1 && /\.auth\.getUser\([\s\S]*?if\s*\(\s*!user\s*\)/.test(src.slice(last));
}

/**
 * Comments are NOT stripped for this scan, on purpose. Stripping is where a
 * scanner goes blind — a `/*` inside a string swallows real code up to the
 * next comment end — and for a ban a false alarm is cheaper than a miss. Prose
 * that names `getSession` without call syntax is never matched.
 */
function getSessionViolations(sources: readonly { rel: string; src: string }[]): string[] {
  const out: string[] = [];
  for (const { rel, src } of sources) {
    if (isClientModule(src)) continue;
    const uses = sessionReads(src);
    if (uses === 0) continue;
    const pin = GET_SESSION_PINNED.find((p) => p.file === rel);
    if (!pin) {
      out.push(
        `${rel}: reads getSession() (${uses}×) in server code. getSession() decodes ` +
          "the session cookie and trusts it — the same unverified read the " +
          "middleware fast path makes — so it proves nothing about who is asking. " +
          "Use auth.getUser() (memoised per request in lib/supabase/server.ts) or " +
          "getSessionProfile().",
      );
      continue;
    }
    if (uses !== pin.uses) {
      out.push(
        `${rel}: pinned for exactly ${pin.uses} getSession() read(s), found ${uses}. ` +
          `The pin covers one reviewed use (${pin.reason}), not the file.`,
      );
    }
    if (!verifiesAfterSessionRead(src)) {
      out.push(
        `${rel}: the pinned getSession() is no longer followed by a verified ` +
          "auth.getUser() and an `if (!user)` refusal, which is the only reason it " +
          "was allowed.",
      );
    }
  }
  return out;
}

describe("Guard: getSession() is never authentication in server code", () => {
  const sources = serverSources();

  it("the scan is not vacuous", () => {
    expect(sources.length).toBeGreaterThan(100);
    const rels = new Set(sources.map((s) => s.rel));
    expect(rels.has("middleware.ts")).toBe(true);
    expect(rels.has("lib/supabase/server.ts")).toBe(true);
    for (const pin of GET_SESSION_PINNED) expect(rels.has(pin.file), pin.file).toBe(true);
  });

  it("no server file reads getSession() outside the pinned exception", () => {
    const violations = getSessionViolations(sources);
    expect(violations, violations.join("\n\n")).toEqual([]);
  });

  it("the pinned exception is still exactly what it claims to be", () => {
    // A pin that no longer matches must be removed, not left to cover a future
    // reintroduction in the same file.
    for (const pin of GET_SESSION_PINNED) {
      const src = sources.find((s) => s.rel === pin.file)!.src;
      expect(sessionReads(src), `${pin.file}: getSession() reads`).toBe(pin.uses);
      expect(verifiesAfterSessionRead(src), `${pin.file}: verified after`).toBe(true);
    }
  });

  it("negative controls: every spelling is caught; client files, prose and getSessionProfile are not", () => {
    const caught = (src: string) =>
      getSessionViolations([{ rel: "app/[locale]/somewhere/layout.tsx", src }]).length > 0;
    expect(
      caught(
        "const { data: { session } } = await supabase.auth.getSession();\n" +
          "if (!session) redirect('/lt/auth/login');",
      ),
    ).toBe(true);
    expect(caught("const { getSession } = supabase.auth;\nconst s = await getSession();")).toBe(true);
    expect(caught("const peek = supabase.auth.getSession;\nawait peek();")).toBe(true);
    expect(caught('"use client";\nconst { data } = await supabase.auth.getSession();')).toBe(false);
    expect(
      caught('// browser-only readiness check\n"use client";\nawait supabase.auth.getSession();'),
    ).toBe(false);
    expect(caught("const session = await getSessionProfile();")).toBe(false);
    expect(caught("// the cookie's getSession answer is not proof of anything")).toBe(false);
  });

  it("negative control: the pinned exception can neither grow nor lose its verification", () => {
    const pinned = GET_SESSION_PINNED[0].file;
    const real = sources.find((s) => s.rel === pinned)!.src;
    expect(
      getSessionViolations([{ rel: pinned, src: real + "\nawait supabase.auth.getSession();" }]),
    ).not.toEqual([]);
    expect(
      getSessionViolations([
        {
          rel: pinned,
          src: "const { data } = await supabase.auth.getSession();\nif (!data.session) return;",
        },
      ]),
    ).not.toEqual([]);
  });
});
