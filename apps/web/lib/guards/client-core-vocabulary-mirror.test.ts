import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * THE MIRROR IS PINNED — `@labourmarket/client-core` may not drift from web.
 *
 * `packages/client-core` restates two vocabularies that the web app owns: the
 * locale set (PLATFORM_DOCTRINE §2.4, `lib/i18n/config.ts`) and the live
 * participation modes (`lib/config/roles.ts`). A mobile client needs both and
 * cannot import a Next.js module to get them — see the long note at the top of
 * `packages/client-core/src/locales.ts` for why a mirror was chosen over the
 * two alternatives.
 *
 * A mirror without a guard is a duplicate, and a duplicate of a doctrine list
 * is exactly how a language quietly disappears from one client. This test is
 * the guard, and it runs inside the REQUIRED merge gate (`pnpm -F web test`),
 * so the two files cannot disagree for longer than one pull request.
 *
 * It compares PARSED SETS, not file text: the files are formatted differently
 * on purpose, and an assertion on formatting would fail for reasons that do
 * not matter while missing the one that does.
 *
 * ## The end state this is holding the door open for
 *
 * The right architecture is the inverse — `lib/i18n/config.ts` re-exports from
 * the package, and there is one list. That makes `apps/web` depend on a
 * workspace package, which means `transpilePackages` in `next.config.ts` and a
 * lockfile edge into this gate. It is a separate, reviewable slice; until it
 * lands, this test is what makes the mirror safe.
 */

const REPO_ROOT = join(process.cwd(), "..", "..");
const CORE_SRC = join(REPO_ROOT, "packages", "client-core", "src");

/**
 * Read a `const NAME = [ ... ] as const;` string array from a TypeScript
 * source file. Tolerant of formatting; line endings are already normalised by
 * `readSource`.
 */
function readStringArray(source: string, name: string): string[] {
  const pattern = new RegExp(
    "(?:export\\s+)?const\\s+" + name + "\\s*=\\s*\\[([\\s\\S]*?)\\]\\s*as const",
  );
  const match = pattern.exec(source);
  if (match === null) {
    throw new Error(`could not find "const ${name} = [...] as const" to compare`);
  }
  return [...match[1].matchAll(/"([^"]+)"/g)].map((m) => m[1]);
}

/**
 * Read a file with line endings normalised.
 *
 * Normalising HERE rather than at each assertion is deliberate. This
 * repository has been bitten twice by guards that reached a different verdict
 * on a CRLF checkout than in CI — once too lenient, once too strict — and the
 * fix each time was to normalise at one point instead of remembering to do it
 * at every regex.
 */
function readSource(...segments: string[]): string {
  const path = join(...segments);
  if (!existsSync(path)) {
    throw new Error(`expected file is missing: ${path}`);
  }
  return readFileSync(path, "utf8").replace(/\r\n/g, "\n");
}

describe("the client-core package exists where the architecture says it does", () => {
  it("is a workspace package, so a second client can consume it", () => {
    const workspace = readSource(REPO_ROOT, "pnpm-workspace.yaml");
    expect(workspace).toMatch(/^\s*-\s*"packages\/\*"/m);
  });
});

describe("the locale vocabulary is one vocabulary", () => {
  const web = readSource(process.cwd(), "lib", "i18n", "config.ts");
  const core = readSource(CORE_SRC, "locales.ts");

  it("the full doctrine set matches, in the same order", () => {
    // Order matters here only because a diff is easier to read; the set is
    // what is binding, and §2.4 says it never shrinks.
    expect(readStringArray(core, "LOCALES")).toEqual(
      readStringArray(web, "locales"),
    );
  });

  it("the active set matches — a client must not offer an unverified language", () => {
    expect(readStringArray(core, "ACTIVE_LOCALES")).toEqual(
      readStringArray(web, "activeLocales"),
    );
  });

  it("the human-verified tier matches, so 'preview' means the same thing on both", () => {
    expect(readStringArray(core, "TIER1_LOCALES")).toEqual(
      readStringArray(web, "tier1Locales"),
    );
  });

  it("the default locale matches", () => {
    const of = (src: string, decl: string) => {
      const m = new RegExp(decl + "[^=]*=\\s*\"([a-z]{2})\"").exec(src);
      return m === null ? null : m[1];
    };
    const webDefault = of(web, "defaultLocale");
    expect(webDefault).not.toBeNull();
    expect(of(core, "DEFAULT_LOCALE")).toBe(webDefault);
  });
});

describe("the participation-mode vocabulary is one vocabulary", () => {
  it("the live modes match LIVE_ROLE_IDS", () => {
    // #1335 separated actor type, participation mode, permission and plan.
    // The client mirrors the participation modes ONLY — it holds no opinion
    // about permission, which is RLS's to decide.
    const web = readSource(process.cwd(), "lib", "config", "roles.ts");
    const core = readSource(CORE_SRC, "actor-context.ts");
    expect(readStringArray(core, "PARTICIPATION_MODES")).toEqual(
      readStringArray(web, "LIVE_ROLE_IDS"),
    );
  });
});

describe("the shared package stays shareable", () => {
  const sources = [
    "locales.ts",
    "config.ts",
    "session.ts",
    "transport.ts",
    "actor-context.ts",
    "index.ts",
  ].map((name) => ({ name, src: readSource(CORE_SRC, name) }));

  it("no framework imports — that is the whole reason it can be shared", () => {
    // The moment one `next/headers` or one `react` import lands here, the
    // package stops being consumable by a phone and nothing else would notice.
    for (const { name, src } of sources) {
      expect(src, `${name} must not import next`).not.toMatch(/from "next\//);
      expect(src, `${name} must not import react`).not.toMatch(
        /from "react(-dom)?"/,
      );
      expect(src, `${name} must not be server-only`).not.toContain(
        '"server-only"',
      );
      expect(src, `${name} must not import react-native`).not.toMatch(
        /from "react-native/,
      );
    }
  });

  it("no runtime dependencies at all", () => {
    const manifest: { dependencies?: Record<string, string> } = JSON.parse(
      readSource(REPO_ROOT, "packages", "client-core", "package.json"),
    );
    expect(manifest.dependencies ?? {}).toEqual({});
  });

  it("reaches storage through the injected store, never a platform global", () => {
    // `localStorage` does not exist on a phone, and `document` does not exist
    // in a server component. Either would silently break one of the clients
    // this package is supposed to serve.
    for (const { name, src } of sources) {
      const body = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
      for (const forbidden of ["localStorage", "sessionStorage", "document.", "window."]) {
        expect(body, `${name} must not use ${forbidden}`).not.toContain(forbidden);
      }
    }
  });
});

describe("the canonical transport gate has not been opened by accident", () => {
  it("client-core still reports the API boundary as cookie-only", () => {
    // Opening this is an owner-gated auth-core change (PR #1336). If it has
    // legitimately merged, flip the constant AND update
    // docs/APP_READINESS_MAP.md §6 and docs/MOBILE_ARCHITECTURE.md — this
    // assertion is what forces both to happen in the same pull request.
    const transport = readSource(CORE_SRC, "transport.ts");
    expect(transport).toMatch(
      /export const DOMAIN_TRANSPORT_STATUS: TransportStatus = \{\s*open: false,/,
    );
  });

  it("and the web boundary still resolves identity from cookies only", () => {
    // The same property `app-shared-core.test.ts` pins, restated from the
    // mobile side: if a bearer path appears in the request-scoped client, the
    // mobile foundation's assumptions have changed and must be re-read.
    const server = readSource(process.cwd(), "lib", "supabase", "server.ts");
    expect(server).toMatch(/from "next\/headers"/);
    expect(server).not.toMatch(/authorization|bearer/i);
  });
});
