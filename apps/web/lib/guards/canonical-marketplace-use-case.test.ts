import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

import { MARKETPLACE_SURFACES } from "@/lib/marketplace/worker-opportunities-contract";

/**
 * Canonical Marketplace use-case boundary (Stage B).
 *
 * Owner decision: docs/owner-decisions/work-journal-conversation-architecture-v1.md
 * §10 ("Seen-state turi būti canonical domeno būsena, o ne keli atskiri UI
 * triukai") + §12 (UI → use case → domain → repository → RPC) + ADR 0014
 * invariant `CONVERSATION_AND_UI_SHARE_DOMAIN_USE_CASES`.
 *
 * This guard protects an ARCHITECTURAL BOUNDARY, not a set of filenames. It
 * pins layer directories (unavoidable — a layering rule has to know which
 * layers exist) and the mark-shown semantics. It deliberately does NOT pin
 * which component renders what, how many surfaces exist beyond the declared
 * set, or any presentation detail.
 *
 * The four rules:
 *
 *  1. STORAGE VOCABULARY IS INVISIBLE TO THE UI — nothing under `app/**` or
 *     `components/**` may import the seen repository, name the marker table or
 *     RPC, or interpret a Postgres / PostgREST error code.
 *  2. ONE OWNER OF THE REPOSITORY — only the marketplace application layer may
 *     reach the seen repository.
 *  3. SHOWN ≠ LOADED — a shown-marker may never be handed the full loaded
 *     board; it receives the rendered slice.
 *  4. EVERY DECLARED SURFACE IS REALLY WIRED — all four surface tags are used
 *     by real render surfaces, and every marker carries one.
 */

const APP_ROOT = join(__dirname, "..", "..");

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    const s = statSync(p);
    if (s.isDirectory()) {
      if (entry === "node_modules" || entry === ".next" || entry === ".turbo")
        continue;
      out.push(...walk(p));
    } else if (
      (p.endsWith(".ts") || p.endsWith(".tsx")) &&
      !p.endsWith(".test.ts") &&
      !p.endsWith(".test.tsx")
    ) {
      out.push(p);
    }
  }
  return out;
}

const rel = (p: string): string => relative(APP_ROOT, p).replaceAll("\\", "/");

/** Every non-test source file of the two UI roots. */
const UI_FILES = ["app", "components"].flatMap((d) => walk(join(APP_ROOT, d)));
/** Every non-test source file of the whole app. */
const ALL_FILES = ["app", "components", "lib"].flatMap((d) =>
  walk(join(APP_ROOT, d)),
);

const read = (p: string): string => readFileSync(p, "utf8");

/** The four "the owner-gated object is not applied yet" driver codes. Only the
 *  repository may know them. */
const DRIVER_CODES = /\b(42P01|42883|PGRST202|PGRST205)\b/;

const SEEN_REPOSITORY = "lib/opportunities/seen.ts";
const MARKETPLACE_LAYER = "lib/marketplace/";
/** The canonical worker-opportunity use-case module family. `lib/marketplace/`
 *  also holds older, unrelated marketplace capabilities (B2B listings, service
 *  requests) whose own repositories are out of scope here — the rules below
 *  apply to the use case this stage created. */
const USE_CASE_PREFIX = "lib/marketplace/worker-opportunities";
const useCaseFiles = (): string[] =>
  walk(join(APP_ROOT, "lib", "marketplace")).filter((p) =>
    rel(p).startsWith(USE_CASE_PREFIX),
  );

describe("rule 1 — storage vocabulary is invisible to the UI", () => {
  it("no UI file imports the seen repository", () => {
    const offenders = UI_FILES.filter((p) =>
      /from\s+["']@\/lib\/opportunities\/seen["']/.test(read(p)),
    ).map(rel);
    expect(
      offenders,
      "UI must go through lib/marketplace, never the repository",
    ).toEqual([]);
  });

  it("no UI file names the marker table or the write RPC", () => {
    const offenders = UI_FILES.filter((p) =>
      /worker_opportunity_seen|mark_worker_opportunities_seen_v1/.test(read(p)),
    ).map(rel);
    expect(offenders).toEqual([]);
  });

  it("no marketplace UI file interprets a Postgres / PostgREST error code", () => {
    // Scoped to the marketplace boundary this stage owns. Other capabilities
    // (invites, pilots, inbox) still classify driver codes in their pages —
    // that is a pre-existing, separately-scoped gap, not something Stage B may
    // silently rewrite.
    const offenders = UI_FILES.filter((p) => {
      const src = read(p);
      const touchesMarketplace =
        /from\s+["']@\/lib\/marketplace\//.test(src) ||
        /from\s+["']@\/lib\/opportunities\//.test(src);
      if (!touchesMarketplace) return false;
      // Comments may explain a degradation; only real CODE may not classify.
      const code = src
        .replace(/\/\*[\s\S]*?\*\//g, " ")
        .replace(/(^|[^:])\/\/[^\n]*/g, "$1");
      return DRIVER_CODES.test(code);
    }).map(rel);
    expect(
      offenders,
      "classifying driver errors is the repository's single job",
    ).toEqual([]);
  });
});

describe("rule 2 — the repository has exactly one owner", () => {
  it("only the marketplace application layer imports the seen repository", () => {
    const importers = ALL_FILES.filter((p) =>
      /from\s+["']@\/lib\/opportunities\/seen["']|from\s+["']\.\/seen["']/.test(
        read(p),
      ),
    )
      .map(rel)
      .filter((p) => p !== SEEN_REPOSITORY);

    for (const p of importers) {
      const allowed =
        p.startsWith(MARKETPLACE_LAYER) ||
        // The recommendation read model is the domain read the use case
        // composes; it consumes the repository's classified result and is
        // itself only reachable through lib/marketplace.
        p === "lib/opportunities/recommendations.ts";
      expect(allowed, `${p} may not reach the seen repository`).toBe(true);
    }
  });

  it("the marketplace contract stays pure — no IO, no server-only, no driver knowledge", () => {
    const contract = read(
      join(APP_ROOT, "lib", "marketplace", "worker-opportunities-contract.ts"),
    );
    expect(contract).not.toMatch(/["']server-only["']/);
    expect(contract).not.toMatch(/from\s+["']@\/lib\/supabase/);
    expect(contract).not.toMatch(/\.rpc\(/);
    expect(contract).not.toMatch(/\.from\(/);
    expect(contract).not.toMatch(DRIVER_CODES);
  });

  it("the use case never touches the database directly — it delegates", () => {
    const files = useCaseFiles();
    expect(files.length, "the use-case module family must exist").toBeGreaterThan(0);
    for (const p of files) {
      const src = read(p);
      expect(src, rel(p)).not.toMatch(/\.(insert|update|delete|upsert)\(/);
      expect(src, rel(p)).not.toMatch(/\.rpc\(/);
      expect(src, rel(p)).not.toMatch(/\.from\(["']/);
    }
  });
});

/** Every `<OpportunitiesShownMarker ... />` occurrence in the UI, with its
 *  props text, wherever it lives. */
function shownMarkerUsages(): { file: string; props: string }[] {
  const out: { file: string; props: string }[] = [];
  for (const p of UI_FILES) {
    const src = read(p);
    const re = /<OpportunitiesShownMarker\b([\s\S]*?)\/>/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(src)) !== null) {
      out.push({ file: rel(p), props: m[1] });
    }
  }
  return out;
}

describe("rule 3 — shown is not loaded", () => {
  it("at least one real surface reports shown opportunities", () => {
    expect(shownMarkerUsages().length).toBeGreaterThan(0);
  });

  it("no marker is handed the full loaded board", () => {
    // `.opportunities` is the loader's complete authorized result set. A
    // surface that narrows (filters, slices, connects) must report the narrowed
    // rows — reporting the loaded set silently retires matches the worker
    // never saw.
    for (const u of shownMarkerUsages()) {
      const ids = /requestIds=\{([\s\S]*?)\}\s*$/.exec(u.props.trim());
      expect(ids, `${u.file}: marker must pass requestIds`).not.toBeNull();
      expect(
        ids![1],
        `${u.file}: mark-shown received the LOADED board, not the rendered rows`,
      ).not.toMatch(/\.opportunities\b/);
    }
  });
});

describe("rule 4 — every declared surface is really wired", () => {
  it("each marker declares which surface it speaks for", () => {
    for (const u of shownMarkerUsages()) {
      const m = /surface=(?:"([a-z_]+)"|\{"([a-z_]+)"\})/.exec(u.props);
      expect(m, `${u.file}: marker must declare a surface`).not.toBeNull();
      const value = (m![1] ?? m![2]) as (typeof MARKETPLACE_SURFACES)[number];
      expect(
        MARKETPLACE_SURFACES.includes(value),
        `${u.file}: unknown surface "${value}"`,
      ).toBe(true);
    }
  });

  it("every declared surface exists in the product, not just in the type", () => {
    const used = new Set(
      shownMarkerUsages()
        .map((u) => /surface=(?:"([a-z_]+)"|\{"([a-z_]+)"\})/.exec(u.props))
        .filter((m): m is RegExpExecArray => m !== null)
        .map((m) => m[1] ?? m[2]),
    );
    for (const s of MARKETPLACE_SURFACES) {
      expect(
        used.has(s),
        `surface "${s}" is declared but no render surface reports it`,
      ).toBe(true);
    }
  });

  it("no UI file re-derives worker recommendations", () => {
    // Deriving or re-ranking the worker recommendation set belongs to the use
    // case and the pure domain below it. (The company-side / admin matching
    // inspectors are a DIFFERENT capability and legitimately call the match
    // engine directly — this rule targets the worker recommendation pipeline.)
    const offenders = UI_FILES.filter((p) => {
      const src = read(p)
        .replace(/\/\*[\s\S]*?\*\//g, " ")
        .replace(/(^|[^:])\/\/[^\n]*/g, "$1");
      return /\b(deriveJobRecommendations|countUnseenRecommendations)\s*\(/.test(
        src,
      );
    }).map(rel);
    expect(offenders).toEqual([]);
  });

  it("no surface that reports shown opportunities runs the match engine itself", () => {
    for (const f of new Set(shownMarkerUsages().map((u) => u.file))) {
      const src = read(join(APP_ROOT, f))
        .replace(/\/\*[\s\S]*?\*\//g, " ")
        .replace(/(^|[^:])\/\/[^\n]*/g, "$1");
      expect(src, f).not.toMatch(/\b(matchWorkerToNeed|compareMatches)\s*\(/);
    }
  });

  it("the use case exposes no aggregate score — only the §19 basis", () => {
    for (const p of useCaseFiles()) {
      const src = read(p);
      expect(src, rel(p)).not.toMatch(/\b(aiScore|overallScore|matchScore)\b/);
    }
  });
});

/**
 * Rule 5 — the conversation layer is inside the boundary.
 *
 * `lib/conversation/**` is neither `app/**` nor `components/**`, so rules 1–4
 * never saw it. The conversation is the PRIMARY work journal, which makes it
 * the surface most likely to grow its own marketplace — the invariant
 * `CONVERSATION_AND_UI_SHARE_DOMAIN_USE_CASES` exists precisely to stop that.
 *
 * These rules constrain marketplace vocabulary only. Unrelated conversation
 * capabilities (intent routing, work-log extraction, forms, dispatch) are
 * untouched: nothing outside a marketplace path has any reason to name the
 * match engine, the recommendation derivation, or the seen store.
 */
describe("rule 5 — the conversation layer shares the marketplace use case", () => {
  const CONVERSATION_DIR = join(APP_ROOT, "lib", "conversation");
  const conversationFiles = (): string[] => walk(CONVERSATION_DIR);
  const codeOf = (p: string): string =>
    read(p)
      .replace(/\/\*[\s\S]*?\*\//g, " ")
      .replace(/(^|[^:])\/\/[^\n]*/g, "$1");

  it("never loads the board itself — it goes through the use case", () => {
    const offenders = conversationFiles()
      .filter((p) => /\bloadWorkerOpportunities\s*\(/.test(codeOf(p)))
      .map(rel);
    expect(
      offenders,
      "the conversation must call lib/marketplace, not the loader",
    ).toEqual([]);
  });

  it("never ranks or derives marketplace results itself", () => {
    const offenders = conversationFiles()
      .filter((p) =>
        /\b(compareMatches|matchWorkerToNeed|deriveJobRecommendations|countUnseenRecommendations)\s*\(/.test(
          codeOf(p),
        ),
      )
      .map(rel);
    expect(
      offenders,
      "ranking and derivation belong to the use case and the pure domain",
    ).toEqual([]);
  });

  it("never reaches the seen repository, the store or a driver code", () => {
    for (const p of conversationFiles()) {
      const src = read(p);
      expect(src, rel(p)).not.toMatch(
        /from\s+["']@\/lib\/opportunities\/seen["']/,
      );
      expect(src, rel(p)).not.toMatch(
        /worker_opportunity_seen|mark_worker_opportunities_seen_v1/,
      );
      expect(codeOf(p), rel(p)).not.toMatch(DRIVER_CODES);
    }
  });

  it("never builds an opportunity id out of a list position", () => {
    // A positional id cannot open an opportunity, cannot be reported as shown,
    // and cannot later carry provenance — it is the tell-tale of a surface that
    // never received the real demand id.
    const POSITIONAL_ID =
      /\bid:\s*(?:`\$\{\s*(?:i|idx|index|n|pos|position)\s*\}`|String\(\s*(?:i|idx|index|pos|position)\s*\)|(?:i|idx|index|pos|position)\.toString\(\))/;
    const offenders = conversationFiles()
      .filter((p) => POSITIONAL_ID.test(codeOf(p)))
      .map(rel);
    expect(
      offenders,
      "an opportunity id must be the real demand id from the use case",
    ).toEqual([]);
  });

  it("the conversation's find-work path really imports the canonical use case", () => {
    // Locate the conversation module that PRODUCES marketplace results by what
    // it does — it deals in chat matches AND actually runs something — rather
    // than by a hard-coded filename. A pure contract/type module names the same
    // shapes but performs no work, so it is correctly not a producer.
    const marketplaceModules = conversationFiles().filter((p) => {
      const src = read(p);
      return (
        /ChatEmployerMatch|FindWorkResult/.test(src) &&
        /\basync\s+function\b/.test(src)
      );
    });
    expect(
      marketplaceModules.length,
      "expected a conversation module that produces marketplace matches",
    ).toBeGreaterThan(0);
    for (const p of marketplaceModules) {
      expect(read(p), rel(p)).toMatch(
        /from\s+["']@\/lib\/marketplace\/worker-opportunities["']/,
      );
      expect(read(p), rel(p)).toMatch(/surface:\s*["']conversation["']/);
    }
  });

  it("the conversation reports the SAME array it renders", () => {
    // The strongest available static form of "shown, not loaded" for the chat:
    // the marker's `requestIds` and the rendered card list must be built from
    // one and the same message array. Two different expressions is precisely
    // how a surface starts reporting rows it never drew.
    const mounts = shownMarkerUsages().filter((u) =>
      /surface=(?:"conversation"|\{"conversation"\})/.test(u.props),
    );
    expect(
      mounts.length,
      "the conversation surface must mount the shown-marker",
    ).toBeGreaterThan(0);

    for (const u of mounts) {
      const ids = /requestIds=\{([\s\S]*?)\}\s*$/.exec(u.props.trim());
      expect(ids, `${u.file}: marker must pass requestIds`).not.toBeNull();
      const expr = ids![1];
      // The array being reported…
      const reported = /([A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*)\.map\(/.exec(
        expr,
      );
      expect(reported, `${u.file}: requestIds must map an array`).not.toBeNull();
      const arrayName = reported![1];
      // …must be the same array the cards are drawn from in that file. The
      // marker's OWN element is stripped first: leaving it in would let the
      // rule satisfy itself from the very line it is meant to check.
      const src = read(join(APP_ROOT, u.file)).replace(
        /<OpportunitiesShownMarker\b[\s\S]*?\/>/g,
        " ",
      );
      expect(
        src.includes(`{${arrayName}.map(`),
        `${u.file}: marker reports "${arrayName}" but the cards are rendered from a different array`,
      ).toBe(true);
    }
  });

  it("no aggregate score or bare percentage is assembled in the conversation", () => {
    for (const p of conversationFiles()) {
      const src = codeOf(p);
      expect(src, rel(p)).not.toMatch(/\b(aiScore|overallScore|matchScore)\b/);
      // A percentage may only travel inside the canonical basis, which the use
      // case produces — the conversation must not interpolate one itself.
      expect(src, rel(p)).not.toMatch(/\bpct:\s*[a-zA-Z]/);
    }
  });
});
