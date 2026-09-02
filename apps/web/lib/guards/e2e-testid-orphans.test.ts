/**
 * ORPHANED E2E SELECTORS — the rot class this guard exists to stop.
 *
 * Playwright specs are NOT run by vitest and are not run by the `quality`
 * workflow at all, and every authenticated spec skips itself when no session
 * has been minted. A `getByTestId("…")` whose UI was deleted therefore goes on
 * "passing" indefinitely: nothing red, nothing to notice, no coverage.
 *
 * That is not hypothetical. `tests/e2e/conversation-authenticated.spec.ts`
 * carried FIVE dead ids at once — `chat-advanced-link` and
 * `conversation-bottom-nav` (retired by owner ruling), `msg-employer-match`
 * (the chat's job card, deleted when matches became a Context Panel result)
 * and two more — and `msg-employer-match` in particular made a whole
 * actionable-match assertion unreachable, which is worse than a red test.
 *
 * WHAT THIS CHECKS. Every LITERAL testid a spec asks for must be producible by
 * the product source. "Producible" deliberately includes generated ids: the
 * app builds testids from template literals all over
 * (``data-testid={`opportunities-row-${id}`}``), so the source scan collects
 * both literal ids and DYNAMIC PREFIXES, and a spec id that starts with a
 * known prefix resolves. Without that, `chat-chip-cv` — a perfectly live
 * control — would read as an orphan, and the guard would be pressure to stop
 * generating testids rather than pressure to keep specs honest.
 *
 * WHAT THIS CANNOT CHECK. Reachability. `chat-chip-profile` resolves here (the
 * `profile` chip id is real) yet was still broken in practice, because the
 * chip is no longer rendered on the opening screen. Static analysis sees the
 * vocabulary, never the journey — only a real authenticated run catches that,
 * which is why `E2E_REQUIRE_AUTH=1` (asserted below) matters too.
 */
import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { extname, join, relative, resolve, sep } from "node:path";

const webRoot = resolve(__dirname, "..", "..");
const SOURCE_DIRS = ["components", "app", "lib"];
const SPEC_DIR = "tests/e2e";

function walk(dir: string, out: string[] = []): string[] {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const entry of entries) {
    if (entry === "node_modules" || entry === ".next") continue;
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) walk(p, out);
    // Guards and unit tests are not product source: a testid quoted inside an
    // assertion must never make a dead selector look alive.
    else if ([".ts", ".tsx"].includes(extname(p)) && !/\.test\.tsx?$/.test(p)) out.push(p);
  }
  return out;
}

/** `data-testid="foo"`, `data-testid={"foo"}` — and the same for a `testId` prop. */
const LITERAL_ATTR =
  /data-testid=(?:"([^"{}$`]+)"|'([^'{}$`]+)'|\{\s*"([^"]+)"\s*\}|\{\s*'([^']+)'\s*\})/g;
const LITERAL_PROP =
  /\btestId=(?:"([^"{}$`]+)"|'([^'{}$`]+)'|\{\s*"([^"]+)"\s*\}|\{\s*'([^']+)'\s*\})/g;
/** `testId: "foo"` — the same id handed through an options object. */
const LITERAL_PROP_OBJ = /\btestId:\s*(?:"([^"]+)"|'([^']+)')/g;
/**
 * `testId = "foo"` — a DESTRUCTURED DEFAULT, i.e. the id a component renders
 * when the caller passes none (`<HeaderSearch />`). Missing this made the
 * guard's first run report five live controls as orphans, which is exactly
 * the brittleness that would train people to delete real assertions.
 * Includes the renamed form `"data-testid": testId = "foo"`.
 */
const DEFAULT_PARAM = /\btestId\s*=\s*(?:"([^"]+)"|'([^']+)')/g;
/** ``data-testid={`foo-${id}`}`` → the dynamic prefix `foo-`. */
const TEMPLATE_ATTR = /(?:data-testid|\btestId)=\{\s*`([^`$]*)\$\{/g;
const TEMPLATE_PROP_OBJ = /\btestId:\s*`([^`$]*)\$\{/g;

function collectSourceVocabulary(): { literals: Set<string>; prefixes: Set<string> } {
  const literals = new Set<string>();
  const prefixes = new Set<string>();
  for (const dir of SOURCE_DIRS) {
    for (const file of walk(join(webRoot, dir))) {
      const src = readFileSync(file, "utf8");
      for (const re of [LITERAL_ATTR, LITERAL_PROP, LITERAL_PROP_OBJ, DEFAULT_PARAM]) {
        re.lastIndex = 0;
        let m: RegExpExecArray | null;
        while ((m = re.exec(src))) {
          const value = m[1] ?? m[2] ?? m[3] ?? m[4];
          if (value) literals.add(value);
        }
      }
      for (const re of [TEMPLATE_ATTR, TEMPLATE_PROP_OBJ]) {
        re.lastIndex = 0;
        let m: RegExpExecArray | null;
        while ((m = re.exec(src))) if (m[1]) prefixes.add(m[1]);
      }
    }
  }
  return { literals, prefixes };
}

/** `getByTestId("foo")` — literal argument only; a computed one is skipped. */
const SPEC_GET_BY = /getByTestId\(\s*(?:"([^"]+)"|'([^']+)')\s*\)/g;
/** `[data-testid="foo"]` inside a locator string. */
const SPEC_EXACT_SELECTOR = /data-testid=\\?["']([^"'\]\\]+)\\?["']\]/g;
/** `[data-testid^="foo"]` — a deliberate prefix query, checked as a prefix. */
const SPEC_PREFIX_SELECTOR = /data-testid\^=\\?["']([^"'\]\\]+)\\?["']\]/g;

function specTestIds(src: string): { exact: Set<string>; prefix: Set<string> } {
  const exact = new Set<string>();
  for (const re of [SPEC_GET_BY, SPEC_EXACT_SELECTOR]) {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(src))) {
      const value = m[1] ?? m[2];
      if (value) exact.add(value);
    }
  }
  const prefix = new Set<string>();
  SPEC_PREFIX_SELECTOR.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = SPEC_PREFIX_SELECTOR.exec(src))) if (m[1]) prefix.add(m[1]);
  return { exact, prefix };
}

/**
 * PRE-EXISTING ORPHANS, recorded 2026-08-28.
 *
 * These are NOT sanctioned — they are the same rot, measured across the rest
 * of the suite while repairing the authenticated conversation spec, and left
 * untouched so that repair stays one reviewable slice. Recording them is what
 * makes the guard deployable today: any NEW orphan fails immediately, and the
 * list can only shrink (an entry that has been fixed must be deleted from
 * here, or the "no stale waiver" test fails).
 *
 * Fixing one means the same work done here: find what the flow looks like now
 * and repoint the assertion, or delete it if the behaviour was retired.
 */
const KNOWN_ORPHANS: Record<string, string[]> = {
  "after-shots-shell.spec.ts": ["live-product-demo"],
  "ai-first-intent-coverage.spec.ts": ["msg-employer-match"],
  "one-authenticated-shell.spec.ts": ["account-menu-profile-link", "notification-bell"],
  "pr-i-reality-chat.spec.ts": ["msg-employer-match"],
  "pr-i-reality-landing.spec.ts": ["live-product-demo"],
  "pr250-company-multisector-smoke.spec.ts": [
    "my-spaces",
    "my-spaces-available",
    "my-spaces-coming-later",
  ],
  "ux-2-0-visual-evidence.spec.ts": ["chat-theme-toggle", "conversation-bottom-nav"],
  "w3-row16-identity-actions.spec.ts": ["account-menu-profile-link"],
  "w3-second-dashboard.spec.ts": [
    "chat-employer-match-card",
    "chat-employer-match-open",
    "chat-player-card",
    "msg-employer-match",
  ],
  "w5-live-profile.spec.ts": [
    "live-profile-complete",
    "live-profile-missing",
    "live-profile-section",
  ],
  "w6-experience-domain.spec.ts": ["experience-counts-disputed", "experience-counts-meaning"],
  "w6-experience-fail-closed.spec.ts": ["experience-counts-positive"],
  "w6-tier-lexicon.spec.ts": ["trust-block"],
  "w6-workspace-map.spec.ts": ["chat-employer-match-card", "chat-employer-match-open"],
};

/** The spec this guard was written alongside — it stays at zero, always. */
const REPAIRED_SPEC = "conversation-authenticated.spec.ts";

const { literals, prefixes } = collectSourceVocabulary();
const prefixList = [...prefixes];
const literalList = [...literals];

const resolvesExact = (id: string): boolean =>
  literals.has(id) || prefixList.some((p) => id.startsWith(p));

/** A `^=` query is satisfied by any producible id that could start with it. */
const resolvesPrefix = (p: string): boolean =>
  literalList.some((l) => l.startsWith(p)) ||
  prefixList.some((q) => q.startsWith(p) || p.startsWith(q));

const specFiles = walk(join(webRoot, SPEC_DIR)).filter((f) => f.endsWith(".spec.ts"));

/** spec basename → the ids it asks for that the product cannot produce. */
const found = new Map<string, string[]>();
for (const file of specFiles) {
  const name = relative(join(webRoot, SPEC_DIR), file).split(sep).join("/");
  const { exact, prefix } = specTestIds(readFileSync(file, "utf8"));
  const orphans = [
    ...[...exact].filter((id) => !resolvesExact(id)),
    ...[...prefix].filter((p) => !resolvesPrefix(p)),
  ].sort();
  if (orphans.length > 0) found.set(name, orphans);
}

describe("e2e specs never wait on a testid the product cannot render", () => {
  it("the source scan actually found the product's testid vocabulary", () => {
    // A broken scan would report every spec as clean — the silent failure this
    // guard is supposed to prevent, reproduced inside the guard itself.
    expect(literals.size).toBeGreaterThan(500);
    expect(prefixes.size).toBeGreaterThan(50);
    expect(specFiles.length).toBeGreaterThan(20);
    // Known-good sentinels: one literal, one generated.
    expect(resolvesExact("conversation-chat")).toBe(true);
    expect(resolvesExact("chat-chip-cv")).toBe(true);
    // Negative control: a plausible id nothing renders must NOT resolve.
    expect(resolvesExact("chat-advanced-link")).toBe(false);
  });

  it("no spec introduces a NEW orphaned testid", () => {
    const unexpected: string[] = [];
    for (const [spec, ids] of found) {
      const waived = KNOWN_ORPHANS[spec] ?? [];
      for (const id of ids) {
        if (!waived.includes(id)) unexpected.push(`${spec} → ${id}`);
      }
    }
    expect(
      unexpected,
      "These e2e selectors match nothing the product can render. Repoint them " +
        "at the control that performs the flow today, or delete the assertion " +
        "if the behaviour was retired — do NOT add them to KNOWN_ORPHANS:\n" +
        unexpected.map((u) => `  ${u}`).join("\n"),
    ).toEqual([]);
  });

  it("KNOWN_ORPHANS holds no stale waiver (the list may only shrink)", () => {
    const stale: string[] = [];
    for (const [spec, ids] of Object.entries(KNOWN_ORPHANS)) {
      const current = found.get(spec) ?? [];
      for (const id of ids) {
        if (!current.includes(id)) stale.push(`${spec} → ${id}`);
      }
    }
    expect(
      stale,
      "These waivers no longer describe anything — the selector was fixed or " +
        "removed. Delete them from KNOWN_ORPHANS:\n" +
        stale.map((s) => `  ${s}`).join("\n"),
    ).toEqual([]);
  });

  it("the repaired authenticated conversation spec has zero orphans", () => {
    expect(found.get(REPAIRED_SPEC) ?? []).toEqual([]);
    expect(KNOWN_ORPHANS[REPAIRED_SPEC]).toBeUndefined();
  });
});

describe("the authenticated conversation spec cannot report 'did not run' as 'passed'", () => {
  const spec = readFileSync(join(webRoot, SPEC_DIR, REPAIRED_SPEC), "utf8");

  it("fails closed when E2E_REQUIRE_AUTH=1 and no session was minted", () => {
    expect(spec).toContain('process.env.E2E_REQUIRE_AUTH === "1"');
    // A throw at module scope — Playwright reports the file as failed and the
    // run exits non-zero. A `test.skip` here would be the original hole.
    // `\s*` rather than an explicit `\n`: this file is checked out CRLF on
    // Windows, and a guard that asserts text must not pass in CI while failing
    // on a maintainer's machine (or the reverse).
    expect(spec).toMatch(/if\s*\(REQUIRE_SESSION\s*&&\s*!HAS_SESSION\)\s*\{\s*throw new Error/);
  });

  it("still skips honestly for a developer without the local stack", () => {
    expect(spec).toMatch(/test\.skip\(\s*\n?\s*!HAS_SESSION,/);
  });

  it("asserts the find-work answer where it actually renders (the panel)", () => {
    // The thread's own job card is gone; a helper that waits on it can only
    // ever report "no matches", which is how this coverage died silently. The
    // id may still be NAMED in the comment that records why it went — what
    // must never come back is a locator asking for it.
    expect(spec).not.toMatch(/getByTestId\(\s*["']msg-employer-match["']\s*\)/);
    expect(spec).toContain("opportunities-view");
    expect(spec).toContain("opportunities-match-interest");
  });
});
