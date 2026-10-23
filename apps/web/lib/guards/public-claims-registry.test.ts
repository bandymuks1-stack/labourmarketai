import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";

import { activeLocales, type ActiveLocale } from "@/lib/i18n/config";
import { CAPABILITY_REGISTER } from "@/lib/product-gate/capability-register";
import { PRICING_READINESS_STATE } from "@/lib/billing/readiness";
import {
  PUBLIC_CLAIMS,
  pageLocales,
  parseMessageKey,
  renderFragment,
  messageAt,
  type MessageTree,
} from "@/lib/public-claims/registry";

/**
 * PUBLIC CLAIMS ↔ PRODUCT TRUTH — the permanent dev/QA rule.
 *
 * Agentai OS cites LabourMarket.ai claims in outreach only when the live page
 * still says them (`GET /api/public/claims/v1`). This guard makes the claim
 * registry (`lib/public-claims/registry.ts`) a contract with the pages and the
 * capability register, so a copy edit, a layout change or a removed key can
 * never silently break — or silently keep — a public claim:
 *
 *   1. claim ids are unique, well-formed, and never deleted (append-only pin);
 *   2. every LIVE page claim's keys exist, are non-empty, are not untranslated
 *      `[EN]` placeholders and resolve to text, in EVERY listed locale;
 *   3. every key is actually rendered by the page component of its path
 *      (static source check over the page's import tree);
 *   4. every capabilityId exists in the capability register, and a LIVE claim's
 *      capability is not unbuilt or withdrawn; BLOCKED needs a written caveat;
 *   5. pages cite `en` (except a claim scoped to one locale by its id) and only
 *      ACTIVE locales; structural claims list exactly the active locales;
 *   6. RETIRED claims carry no pages and no structural check.
 *
 * Changing or removing a message key a claim uses requires updating the
 * registry in the same PR (AGENTS.md § Public claims registry).
 */

const WEB_ROOT = join(__dirname, "..", "..");

const catalogs = new Map<ActiveLocale, MessageTree>();
function catalog(locale: ActiveLocale): MessageTree {
  let m = catalogs.get(locale);
  if (!m) {
    m = JSON.parse(readFileSync(join(WEB_ROOT, "messages", `${locale}.json`), "utf8")) as MessageTree;
    catalogs.set(locale, m);
  }
  return m;
}

/**
 * Every id the Agentai register has ever cited. Append-only: a claim that
 * stops being true is RETIRED, never removed — a consumer must be told.
 */
const PINNED_CLAIM_IDS = [
  "worker.skills-discoverable",
  "worker.profile-is-free",
  "worker.matched-across-europe",
  "employer.opportunity-flow",
  "employer.post-need-by-project",
  "employer.inquiry-cta",
  "employer.skills-compared-with-records",
  "employer.direct-contact",
  "employer.operator-checks-shortlist",
  "employer.work-journal-continues",
  "employer.organization-plan-price",
  "employer.fit-per-need",
  "employer.hire-on-records",
  "employer.on-site-records",
  "employer.inquiry-free",
  "employer.one-position-free",
  "employer.organization-plan-99-per-month",
  "employer.vat-via-stripe-tax",
  "partner.pool-in-motion",
  "partner.manage-post-broker",
  "platform.headline.en",
  "platform.headline.de",
  "platform.headline.lt",
  "platform.headline.ru",
  "platform.four-entry-paths",
  "platform.locales-live",
] as const;

/** A LIVE claim may not rest on a capability nobody can use. */
const STATUSES_THAT_CANNOT_BACK_A_LIVE_CLAIM = new Set([
  "MISSING",
  "ARCHITECTURE_ONLY",
  "RETIRED",
  "BUILT_NOT_CONNECTED",
]);

const liveClaims = PUBLIC_CLAIMS.filter((c) => c.status === "LIVE");
const pageClaims = liveClaims.filter((c) => c.pages.length > 0);

// ── the page source tree (static) ───────────────────────────────────────────

function pageFileFor(path: string): string {
  const candidates = [
    join(WEB_ROOT, "app", "[locale]", ...path.split("/").filter(Boolean), "page.tsx"),
    join(WEB_ROOT, "app", "[locale]", "(marketing)", ...path.split("/").filter(Boolean), "page.tsx"),
  ].filter((f) => existsSync(f));
  if (candidates.length !== 1) {
    throw new Error(`public-claims: path "${path}" resolves to ${candidates.length} page files`);
  }
  return candidates[0];
}

function resolveImport(fromFile: string, spec: string): string | null {
  let base: string;
  if (spec.startsWith("@/")) base = join(WEB_ROOT, spec.slice(2));
  else if (spec.startsWith(".")) base = join(dirname(fromFile), spec);
  else return null;
  for (const f of [base, `${base}.tsx`, `${base}.ts`, join(base, "index.tsx"), join(base, "index.ts")]) {
    if (/\.tsx?$/.test(f) && existsSync(f)) return f;
  }
  return null;
}

/** Only rendering code is followed: the app tree and components. */
const RENDER_ROOTS = [join(WEB_ROOT, "app") + sep, join(WEB_ROOT, "components") + sep];

function sourceTree(entry: string): Map<string, string> {
  const seen = new Map<string, string>();
  const stack = [entry];
  while (stack.length) {
    const file = stack.pop()!;
    if (seen.has(file)) continue;
    const src = readFileSync(file, "utf8");
    seen.set(file, src);
    for (const m of src.matchAll(/(?:import|export)\s[^;]*?from\s+["']([^"']+)["']|import\(\s*["']([^"']+)["']\s*\)/g)) {
      const target = resolveImport(file, m[1] ?? m[2]);
      if (target && RENDER_ROOTS.some((r) => target.startsWith(r))) stack.push(target);
    }
  }
  return seen;
}

function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`\\])\/\/[^\n]*/g, "$1");
}

/** Every string / template literal, templates as regexes (`${…}` = one segment). */
function literalPatterns(sources: Iterable<string>): { patterns: RegExp[]; literals: Set<string> } {
  const out = new Map<string, RegExp>();
  const literals = new Set<string>();
  for (const raw of sources) {
    const src = stripComments(raw);
    for (const m of src.matchAll(/"((?:[^"\\\n]|\\.)*)"|'((?:[^'\\\n]|\\.)*)'|`((?:[^`\\]|\\.)*)`/g)) {
      const body = m[1] ?? m[2] ?? m[3] ?? "";
      if (!body || body.length > 200) continue;
      const parts = body.split(/\$\{[^}]*\}/);
      const literalChars = parts.join("").replace(/\./g, "");
      if (literalChars.length < 2) continue; // a pure placeholder proves nothing
      if (parts.length === 1) literals.add(body);
      const re = new RegExp(
        `^${parts.map((p) => p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("[^.]+")}$`,
      );
      out.set(re.source, re);
    }
  }
  return { patterns: [...out.values()], literals };
}

/**
 * True when the source tree can render `key`: some split `ns + rest` where `ns`
 * appears as a literal (a `getTranslations("ns")` call or a `root="ns"` prop)
 * and a literal matches a whole-segment prefix of `rest` (`t("rest")`,
 * `t.raw("journey.steps")`, `` t(`${previewKey}.bullets`) ``).
 */
function sourceRendersKey(patterns: RegExp[], literals: Set<string>, key: string): boolean {
  const segs = parseMessageKey(key).filter((s): s is string => typeof s === "string");
  for (let i = 1; i < segs.length; i++) {
    const ns = segs.slice(0, i).join(".");
    if (!literals.has(ns)) continue;
    const rest = segs.slice(i);
    for (let j = 1; j <= rest.length; j++) {
      const prefix = rest.slice(0, j).join(".");
      if (patterns.some((re) => re.test(prefix))) return true;
    }
  }
  return false;
}

const treeCache = new Map<string, { patterns: RegExp[]; literals: Set<string>; files: string[] }>();
function pageSource(path: string) {
  let t = treeCache.get(path);
  if (!t) {
    const tree = sourceTree(pageFileFor(path));
    const { patterns, literals } = literalPatterns(tree.values());
    t = { patterns, literals, files: [...tree.keys()].map((f) => relative(WEB_ROOT, f)) };
    treeCache.set(path, t);
  }
  return t;
}

// ── the rules ───────────────────────────────────────────────────────────────

describe("public claims registry — identity", () => {
  it("claim ids are unique and well-formed", () => {
    const ids = PUBLIC_CLAIMS.map((c) => c.claimId);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(/^(worker|employer|partner|platform)\.[a-z0-9]+(?:[.-][a-z0-9]+)*$/);
  });

  it("no claim the consumer ever cited has been deleted (retire, never remove)", () => {
    const ids = new Set(PUBLIC_CLAIMS.map((c) => c.claimId));
    const missing = PINNED_CLAIM_IDS.filter((id) => !ids.has(id));
    expect(missing).toEqual([]);
  });

  it("the audience matches the id's prefix", () => {
    const prefix = { worker: "WORKER", employer: "EMPLOYER", partner: "PARTNER", platform: "PLATFORM" } as const;
    for (const c of PUBLIC_CLAIMS) {
      expect(c.audience, c.claimId).toBe(prefix[c.claimId.split(".")[0] as keyof typeof prefix]);
    }
  });
});

describe("public claims registry — capabilities", () => {
  const byId = new Map(CAPABILITY_REGISTER.map((r) => [r.id, r]));

  it("every capabilityId exists in the capability register", () => {
    const unknown = PUBLIC_CLAIMS.filter((c) => c.capabilityId !== null && !byId.has(c.capabilityId)).map(
      (c) => `${c.claimId} → ${c.capabilityId}`,
    );
    expect(unknown).toEqual([]);
  });

  it("a LIVE claim never rests on an unbuilt, disconnected or withdrawn capability", () => {
    const bad = liveClaims
      .filter((c) => c.capabilityId !== null && STATUSES_THAT_CANNOT_BACK_A_LIVE_CLAIM.has(byId.get(c.capabilityId)!.status))
      .map((c) => `${c.claimId} → ${c.capabilityId} (${byId.get(c.capabilityId!)!.status})`);
    expect(bad).toEqual([]);
  });

  it("a LIVE claim on a BLOCKED capability states why it is still true", () => {
    const bad = liveClaims
      .filter((c) => c.capabilityId !== null && byId.get(c.capabilityId)!.status === "BLOCKED")
      .filter((c) => !c.capabilityCaveat || c.capabilityCaveat.trim().length < 40)
      .map((c) => c.claimId);
    expect(bad).toEqual([]);
  });

  it("a null capability is reserved for pure platform facts", () => {
    const bad = PUBLIC_CLAIMS.filter((c) => c.capabilityId === null && c.audience !== "PLATFORM").map((c) => c.claimId);
    expect(bad).toEqual([]);
  });
});

describe("public claims registry — shape", () => {
  it("RETIRED claims carry no pages and no structural check", () => {
    const bad = PUBLIC_CLAIMS.filter((c) => c.status === "RETIRED" && (c.pages.length > 0 || c.structural !== null));
    expect(bad.map((c) => c.claimId)).toEqual([]);
  });

  it("every LIVE claim is checkable: pages, or a structural check — exactly one", () => {
    const bad = liveClaims.filter((c) => (c.pages.length > 0) === (c.structural !== null));
    expect(bad.map((c) => c.claimId)).toEqual([]);
  });

  it("structural locale-roots claims list exactly the active locales", () => {
    for (const c of liveClaims.filter((x) => x.structural)) {
      expect(c.structural!.kind).toBe("locale-roots");
      expect([...c.structural!.locales].sort()).toEqual([...activeLocales].sort());
    }
  });

  it("pages cite only active locales, and `en` unless the id scopes the claim to one locale", () => {
    const active = new Set<string>(activeLocales);
    for (const c of pageClaims) {
      const scoped = c.claimId.split(".").pop()!;
      const isScoped = active.has(scoped);
      for (const page of c.pages) {
        const locales = pageLocales(page);
        expect(locales.length, c.claimId).toBeGreaterThan(0);
        for (const l of locales) expect(active.has(l), `${c.claimId} ${l}`).toBe(true);
        if (isScoped) expect(locales, c.claimId).toEqual([scoped]);
        else expect(locales, c.claimId).toContain("en");
        expect(page.fragments.length, c.claimId).toBeGreaterThan(0);
        expect(page.path === "" || /^\/[a-z0-9-]+(?:\/[a-z0-9-]+)*$/.test(page.path), page.path).toBe(true);
      }
    }
  });
});

describe("public claims registry — message keys", () => {
  it("every LIVE claim's keys exist, are non-empty and resolve in every listed locale", () => {
    const problems: string[] = [];
    for (const c of pageClaims) {
      for (const page of c.pages) {
        for (const locale of pageLocales(page)) {
          const messages = catalog(locale);
          const seen = new Set<string>();
          for (const f of page.fragments) {
            const raw = messageAt(messages, f.key);
            if (raw === undefined || !raw.trim()) {
              problems.push(`${c.claimId} ${locale}: ${f.key} missing or empty`);
              continue;
            }
            if (locale !== "en" && /^\s*\[EN\]/.test(raw)) {
              problems.push(`${c.claimId} ${locale}: ${f.key} is an untranslated [EN] placeholder`);
            }
            try {
              const text = renderFragment(messages, f);
              if (seen.has(text)) problems.push(`${c.claimId} ${locale}: duplicate fragment from ${f.key}`);
              seen.add(text);
            } catch (e) {
              problems.push(`${c.claimId} ${locale}: ${(e as Error).message}`);
            }
          }
        }
      }
    }
    expect(problems).toEqual([]);
  });

  it("every key is rendered by the page component of its path", () => {
    const problems: string[] = [];
    for (const c of pageClaims) {
      for (const page of c.pages) {
        const src = pageSource(page.path);
        for (const f of page.fragments) {
          if (!sourceRendersKey(src.patterns, src.literals, f.key)) {
            problems.push(`${c.claimId}: ${f.key} is not rendered by ${page.path || "/"} (${src.files[0]} + ${src.files.length - 1} imports)`);
          }
        }
      }
    }
    expect(problems).toEqual([]);
  });

  it("the source check is not vacuous — a key no page renders is refused", () => {
    const src = pageSource("/for-companies");
    expect(sourceRendersKey(src.patterns, src.literals, "pages.companies.subcopy")).toBe(true);
    expect(sourceRendersKey(src.patterns, src.literals, "companies.journey.steps[1].desc")).toBe(true);
    expect(sourceRendersKey(src.patterns, src.literals, "pages.workers.subcopy")).toBe(false);
    expect(sourceRendersKey(src.patterns, src.literals, "pricing.faq[1].a")).toBe(false);
    expect(sourceRendersKey(src.patterns, src.literals, "companies.doesNotExist")).toBe(false);
  });
});

describe("public claims registry — values a page supplies", () => {
  it("a price fragment is claimed only while the plan table is owner-confirmed", () => {
    const priced = pageClaims.filter((c) => c.pages.some((p) => p.fragments.some((f) => f.key === "pricing.pricePerMonth")));
    if (priced.length > 0) expect(PRICING_READINESS_STATE).toBe("owner_confirmed");
  });
});
