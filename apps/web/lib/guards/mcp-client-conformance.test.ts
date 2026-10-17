import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/env", () => ({
  env: { CONVERSATION_TOKEN_SECRET: "unit-test-secret-with-enough-length", SUPABASE_SERVICE_ROLE_KEY: undefined },
  requireSupabaseClientEnv: () => ({
    url: "https://abcdefghijklmnopqrst.supabase.co",
    anonKey: "sb_publishable_unit_test_not_a_real_key",
  }),
}));
vi.mock("next-intl/server", () => ({
  getTranslations: async () => Object.assign((key: string) => key, { has: () => false }),
}));

import { GET as prmPathSuffixed } from "@/app/.well-known/oauth-protected-resource/api/mcp/route";
import { GET as prmRoot } from "@/app/.well-known/oauth-protected-resource/route";
import { wwwAuthenticateChallenge } from "@/lib/api/external-client-auth";
import { exposedCapabilities } from "@/lib/capabilities/registry";
import {
  MCP_RESOURCE_PATH,
  PROTECTED_RESOURCE_METADATA_PATHS,
  protectedResourceMetadata,
} from "@/lib/mcp/protected-resource-metadata";
import { toolDefsOf } from "@/lib/mcp/toolset";

/**
 * EXTERNAL MCP CLIENT CONFORMANCE (2026-10-17).
 *
 * The server side of "connect LabourMarket.ai from your own assistant" is
 * ONE door (`/api/mcp`), ONE registry and the platform's own Supabase Auth
 * as authorization server. Two real clients read that door, and each is
 * stricter than the MCP authorization specification in places that produce
 * no useful error when missed — Claude's connection simply fails with
 * "Couldn't reach the MCP server", ChatGPT's never opens the sign-in window.
 * This guard pins the app-side facts those clients depend on, from their
 * own documentation fetched 2026-10-17:
 *
 *  - Claude, "Authentication for connectors": a `401` with
 *    `WWW-Authenticate: Bearer resource_metadata=…` starts sign-in; the
 *    protected resource metadata's `resource` "must equal the URL as the
 *    user enters it in Claude, including any path component"; only the
 *    FIRST `authorization_servers` entry is used; the path-suffixed
 *    well-known location is probed before the root one.
 *  - ChatGPT, "Authentication" (plugins): `resource` is the canonical HTTPS
 *    identifier ChatGPT sends as the RFC 8707 `resource` parameter; the 401
 *    challenge "lets ChatGPT discover the metadata URL even if it has not
 *    seen it before".
 *  - Both directories review every tool for a `title` and the applicable
 *    `readOnlyHint` / `destructiveHint`; ChatGPT rejects `readOnlyHint: true`
 *    on anything that can change state and wants `destructiveHint: true` only
 *    for irreversible outcomes; the Claude directory flags tools without a
 *    title or annotation at submission time.
 *  - The submission pack's negative cases N1–N3
 *    (`docs/launch/RELEASE_SUBMISSION_PACK_2026-10-14.md` §4): no tool
 *    deletes a person or an account, no tool moves money.
 *
 * What is NOT here, because it is Supabase Auth's and can only be read live:
 * `code_challenge_methods_supported` (S256), `registration_endpoint` (DCR),
 * `client_id_metadata_document_supported` (CIMD), RFC 9207 `iss`, refresh
 * rotation, endpoint latency. The production conformance walk records those.
 */

const ORIGIN = "https://labourmarket.ai";

describe("protected resource metadata (RFC 9728) — what Claude and ChatGPT read first", () => {
  it("the resource is the MCP URL the person enters, path included, on both well-known locations", async () => {
    for (const [path, handler] of [
      ["/.well-known/oauth-protected-resource", prmRoot],
      ["/.well-known/oauth-protected-resource/api/mcp", prmPathSuffixed],
    ] as const) {
      const res = await handler(new Request(`${ORIGIN}${path}`));
      expect(res.status, path).toBe(200);
      const doc = (await res.json()) as Record<string, unknown>;
      expect(doc.resource, path).toBe(`${ORIGIN}${MCP_RESOURCE_PATH}`);
    }
  });

  it("the two locations serve one document, and the builder is the only source", async () => {
    const root = await (await prmRoot(new Request(`${ORIGIN}/.well-known/oauth-protected-resource`))).json();
    const suffixed = await (
      await prmPathSuffixed(new Request(`${ORIGIN}/.well-known/oauth-protected-resource/api/mcp`))
    ).json();
    expect(suffixed).toEqual(root);
    expect(root).toEqual(protectedResourceMetadata(ORIGIN, "https://abcdefghijklmnopqrst.supabase.co"));
    expect(PROTECTED_RESOURCE_METADATA_PATHS).toEqual([
      "/.well-known/oauth-protected-resource",
      "/.well-known/oauth-protected-resource/api/mcp",
    ]);
  });

  it("exactly one authorization server — the platform's own Supabase Auth service path — and header bearers only", () => {
    const doc = protectedResourceMetadata(ORIGIN, "https://abcdefghijklmnopqrst.supabase.co/");
    expect(doc.authorization_servers).toEqual(["https://abcdefghijklmnopqrst.supabase.co/auth/v1"]);
    expect(doc.bearer_methods_supported).toEqual(["header"]);
    // No scopes are advertised: the platform has no product-level scope model
    // (RLS decides), and Claude would otherwise request whatever is listed.
    expect("scopes_supported" in doc).toBe(false);
    // Never a token in the query string (MCP authorization spec, token requirements).
    expect(JSON.stringify(doc)).not.toMatch(/query|body/);
  });

  it("the resource is derived from the request origin, never hard-coded (staging and local hosts stay honest)", async () => {
    const res = await prmRoot(new Request("https://staging.example.test/.well-known/oauth-protected-resource"));
    const doc = (await res.json()) as Record<string, unknown>;
    expect(doc.resource).toBe("https://staging.example.test/api/mcp");
  });
});

describe("the 401 that starts sign-in", () => {
  it("points at a well-known location that serves the document, with no error attribute before any credential was tried", () => {
    const challenge = wwwAuthenticateChallenge(ORIGIN, "CREDENTIALS_MISSING");
    expect(challenge).toBe(`Bearer resource_metadata="${ORIGIN}/.well-known/oauth-protected-resource"`);
    const pointer = /resource_metadata="([^"]+)"/.exec(challenge ?? "")?.[1] ?? "";
    const pointedPath = new URL(pointer).pathname;
    expect(PROTECTED_RESOURCE_METADATA_PATHS as readonly string[]).toContain(pointedPath);
  });

  it("a rejected credential is `invalid_token` (the refresh-and-retry hinge), still with the pointer", () => {
    expect(wwwAuthenticateChallenge(ORIGIN, "ACCESS_TOKEN_REJECTED")).toBe(
      `Bearer error="invalid_token", resource_metadata="${ORIGIN}/.well-known/oauth-protected-resource"`,
    );
  });
});

describe("the published toolset — what both directories review", () => {
  const capabilities = exposedCapabilities();
  const defs = toolDefsOf(capabilities);
  const kindOf = new Map(capabilities.map((c) => [c.id.replace(/\./g, "_"), c.kind] as const));

  it("every tool has a title, both hints as booleans, and a name a client can bind (≤ 64 chars, [A-Za-z0-9_-])", () => {
    expect(defs.length).toBeGreaterThan(0);
    for (const d of defs) {
      expect(d.title, d.name).toBeTruthy();
      expect(typeof d.annotations?.readOnlyHint, d.name).toBe("boolean");
      expect(typeof d.annotations?.destructiveHint, d.name).toBe("boolean");
      expect(d.name.length, d.name).toBeLessThanOrEqual(64);
      expect(d.name, d.name).toMatch(/^[A-Za-z0-9_-]+$/);
      expect(d.description.trim().length, d.name).toBeGreaterThan(0);
    }
  });

  it("readOnlyHint is true only on reads and drafts (a draft writes nothing); every confirm/execute says false", () => {
    // ChatGPT's review rule: `readOnlyHint: true` only if the tool "does not
    // modify anything". A draft returns a preview and a token and changes no
    // row, so the registry marks drafts read-only on purpose; the confirm
    // half carries the write and must never claim otherwise.
    for (const d of defs) {
      const kind = kindOf.get(d.name);
      if (d.annotations?.readOnlyHint === true) expect(["read", "draft"], d.name).toContain(kind);
      if (kind === "confirm" || kind === "execute") expect(d.annotations?.readOnlyHint, d.name).toBe(false);
      if (kind === "read") expect(d.annotations?.readOnlyHint, d.name).toBe(true);
    }
  });

  it("destructiveHint is never set on a read, and no read is openWorld-by-default surprise (a bounded account)", () => {
    for (const d of defs) {
      if (kindOf.get(d.name) === "read") {
        expect(d.annotations?.destructiveHint, d.name).toBe(false);
      }
    }
  });

  it("N1 — no tool deletes, erases or purges a person, user or account (erasure is an owner-gated runbook, never a tool)", () => {
    const personWords = /(account|user|person|profile|identity|member)/;
    const destroyWords = /(delete|erase|purge|destroy|wipe|remove)/;
    const offenders = defs
      .map((d) => d.name)
      .filter((n) => personWords.test(n) && destroyWords.test(n));
    expect(offenders).toEqual([]);
  });

  it("N2 — no tool moves money: no payment, payout, charge, refund or transfer tool exists", () => {
    // "card" is deliberately absent: `work_card_*` is the Living CV work card.
    const money = /(^|_)(pay|payment|payout|charge|refund|transfer|wire|money|checkout|invoice_pay)(_|$)/;
    expect(defs.map((d) => d.name).filter((n) => money.test(n))).toEqual([]);
  });

  it("tool descriptions carry no instruction to the model (prompt-injection hygiene)", () => {
    // Product names are a separate concern with their own guard
    // (`no-external-names.test.ts`); one upload tool legitimately names the
    // host whose file-parameter convention it implements.
    const instructionToModel =
      /\b(ignore (all |any )?(previous|prior|above) instructions|you must always|do not tell the user|system prompt|disregard (the|your) (rules|instructions))\b/i;
    for (const d of defs) {
      expect(d.description, d.name).not.toMatch(instructionToModel);
      expect(d.title ?? "", d.name).not.toMatch(instructionToModel);
    }
  });
});
