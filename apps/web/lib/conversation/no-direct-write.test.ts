import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * Conversation-control guard: the conversation layer is an ORCHESTRATION +
 * PRESENTATION surface only. It may READ (RLS-scoped selects) to compose the
 * view, but it must NEVER perform a direct data write — every mutation goes
 * through an existing canonical server action / RPC (which owns authorization,
 * validation, audit and the real result). This pins that invariant so a future
 * change cannot smuggle a write into the conversation layer.
 */

const APP_ROOT = process.cwd();

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else if (/\.(ts|tsx)$/.test(name) && !/\.test\.(ts|tsx)$/.test(name)) out.push(p);
  }
  return out;
}

const CONVERSATION_FILES = [
  ...walk(join(APP_ROOT, "lib", "conversation")),
  ...walk(join(APP_ROOT, "components", "app", "conversation")),
  ...walk(join(APP_ROOT, "app", "[locale]", "dashboard", "assistant")),
];

describe("conversation layer performs no direct data write", () => {
  it("scans a non-trivial set of conversation files", () => {
    expect(CONVERSATION_FILES.length).toBeGreaterThan(2);
  });

  for (const file of CONVERSATION_FILES) {
    const rel = file.slice(APP_ROOT.length + 1).replace(/\\/g, "/");
    it(`${rel} contains no direct insert/update/delete/upsert/rpc`, () => {
      const src = readFileSync(file, "utf8");
      // Direct table mutations and RPC calls are forbidden in the WHOLE layer:
      // every write must go through an existing canonical server action / RPC.
      // `.insert`/`.upsert`/`.rpc` are unambiguous; `.update`/`.delete` are only
      // flagged when chained off a supabase `.from(...)` builder so crypto
      // `hash.update(...)` is not a false positive.
      expect(src, rel).not.toMatch(/\.(insert|upsert)\s*\(/);
      expect(src, rel).not.toMatch(/\.rpc\s*\(/);
      expect(src, rel).not.toMatch(/\.from\([^)]*\)[^;]{0,300}\.(update|delete)\s*\(/);
      // The PURE modules (declarative registry, schemas, token, decision core)
      // must not even touch the DB client — they carry zero IO. The server
      // dispatcher + executors MAY read supabase for authz/state (reads only,
      // enforced by the no-write rule above), so they are exempt from this.
      const PURE = [
        "lib/conversation/action-registry.ts",
        "lib/conversation/worker-schemas.ts",
        "lib/conversation/confirmation-token.ts",
        "lib/conversation/dispatch-core.ts",
      ];
      if (PURE.includes(rel)) {
        expect(src, rel).not.toMatch(/from\s+["']@\/lib\/supabase/);
      }
    });
  }
});
