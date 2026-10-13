import { beforeEach, describe, expect, it, vi } from "vitest";

// The one-time spend (lib/security/confirmation-spend) is proven on its own;
// here every genuine token is spendable once.
vi.mock("@/lib/security/confirmation-spend", () => ({
  spendConfirmation: async () => "spent",
  spendConfirmationForRequest: async () => "spent",
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/env", () => ({
  env: { CONVERSATION_TOKEN_SECRET: "unit-test-secret-with-enough-length", SUPABASE_SERVICE_ROLE_KEY: undefined },
}));
vi.mock("next-intl/server", () => ({
  getTranslations: async () => Object.assign((key: string) => key, { has: () => false }),
}));

// THE CANONICAL FUNCTIONS the web services page calls. The tools must call exactly these.
let offerings: unknown = { kind: "ok", rows: [{ id: "o-1", status: "draft" }] };
const listOwn = vi.fn(async () => offerings);
const create = vi.fn(async (..._a: unknown[]): Promise<unknown> => ({ kind: "ok", id: "o-2" }));
const setStatus = vi.fn(async (..._a: unknown[]): Promise<unknown> => ({ kind: "ok" }));
vi.mock("@/lib/services/service-offerings", () => ({
  listOwnServiceOfferings: () => listOwn(),
  createServiceOffering: (...a: unknown[]) => create(...a),
  setServiceOfferingStatus: (...a: unknown[]) => setStatus(...a),
}));

let activeWorkspace: string | Error = "org-1";
vi.mock("@/lib/company/active-organization", () => ({
  getWorkspaceContext: async () => {
    if (activeWorkspace instanceof Error) throw activeWorkspace;
    return { workspaces: [], activeWorkspaceId: activeWorkspace, pointerAvailable: true };
  },
}));

import { runAsBearerCaller } from "@/lib/api/bearer-caller-scope";

import type { CapabilityCaller } from "./contract";
import { DOMAIN_ACTION_CAPABILITIES, normalizeActionResult } from "./domain-action-capabilities";
import { runCapability } from "./registry";

const supabase = {} as CapabilityCaller["supabase"];
const bearer: CapabilityCaller = { userId: "u-1", transport: "bearer", supabase, locale: "en", actorKind: "agent" };
const inScope = <T>(fn: () => Promise<T>) => runAsBearerCaller({ userId: "u-1", transport: "bearer", supabase }, fn);
const OFFER = "11111111-1111-4111-8111-111111111111";

beforeEach(() => {
  offerings = { kind: "ok", rows: [{ id: "o-1", status: "draft" }] };
  activeWorkspace = "org-1";
  listOwn.mockClear();
  create.mockClear();
  setStatus.mockClear();
});

describe("normalizeActionResult — one vocabulary, never a fabricated success", () => {
  it("maps both result shapes", () => {
    expect(normalizeActionResult({ ok: true })).toEqual({ ok: true, data: { ok: true } });
    expect(normalizeActionResult({ kind: "ok", id: "x" })).toMatchObject({ ok: true, data: { id: "x" } });
    expect(normalizeActionResult({ kind: "not-authed" })).toMatchObject({ ok: false, code: "auth" });
    expect(normalizeActionResult({ kind: "needs-migration" })).toMatchObject({ ok: false, code: "needs_migration" });
    expect(normalizeActionResult({ kind: "not-owner" })).toMatchObject({ ok: false, code: "not_authorized" });
    expect(normalizeActionResult({ kind: "error", message: "boom" })).toMatchObject({ ok: false, code: "unavailable" });
    expect(normalizeActionResult({ kind: "legal-check-required", legalCheckKey: "k" })).toMatchObject({ ok: false, code: "legal_check_required" });
    expect(normalizeActionResult({ ok: false, code: "not-permitted" })).toMatchObject({ ok: false, code: "not_permitted" });
    expect(normalizeActionResult(undefined)).toMatchObject({ ok: false, code: "unavailable" });
  });
});

describe("domain actions — shape", () => {
  it("every draft is read-only and has its confirm; every id is unique", () => {
    const ids = DOMAIN_ACTION_CAPABILITIES.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const c of DOMAIN_ACTION_CAPABILITIES) {
      if (c.kind === "draft") {
        expect(c.annotations.readOnlyHint, c.id).toBe(true);
        expect(ids).toContain(c.id.replace(/_draft$/, "_confirm"));
      }
      if (c.kind === "read") expect(c.annotations.readOnlyHint).toBe(true);
    }
  });

  it("publishing, deciding for others, sending, deleting and legal identity are never single-step", () => {
    const single = new Set(DOMAIN_ACTION_CAPABILITIES.filter((c) => c.kind === "execute").map((c) => c.id));
    for (const id of [
      "organization.setup",
      "organization.public_profile.set",
      "organization.capabilities.declare",
      "service_offering.status_set",
      "service_offering.delete",
      "service_request.create",
      "service_request.respond",
      "marketplace_listing.status_set",
      "proposal.status_set",
      "absence.review",
      "journal.review",
      "booking.withdraw",
      "absence.request",
    ]) {
      expect(single.has(id), id).toBe(false);
      expect(DOMAIN_ACTION_CAPABILITIES.some((c) => c.id === `${id}_confirm`), id).toBe(true);
    }
  });
});

describe("domain actions — execution", () => {
  it("a one-step create calls the web's own function once", async () => {
    const r = await inScope(() => runCapability("service_offering.create", bearer, { title: "Tiling crew" }));
    expect(create).toHaveBeenCalledWith({ title: "Tiling crew" });
    expect(r).toMatchObject({ ok: true, data: { id: "o-2" } });
  });

  it("draft writes nothing; confirm with the token runs the canonical function once", async () => {
    const input = { offeringId: OFFER, status: "active" };
    const draft = await inScope(() => runCapability("service_offering.status_set_draft", bearer, input));
    expect(draft.ok).toBe(true);
    expect(setStatus).not.toHaveBeenCalled();
    const token = (draft as unknown as { data: { confirmationToken: string } }).data.confirmationToken;
    const done = await inScope(() => runCapability("service_offering.status_set_confirm", bearer, { ...input, confirmationToken: token }));
    expect(done).toMatchObject({ ok: true });
    expect(setStatus).toHaveBeenCalledWith(OFFER, "active");
  });

  it("a confirm whose own-row write matched nothing is refused as not_found, never ok (prod walk 2026-10-13)", async () => {
    const input = { offeringId: OFFER, status: "active" };
    const draft = await inScope(() => runCapability("service_offering.status_set_draft", bearer, input));
    const token = (draft as unknown as { data: { confirmationToken: string } }).data.confirmationToken;
    setStatus.mockResolvedValueOnce({ kind: "not-found" });
    const r = await inScope(() => runCapability("service_offering.status_set_confirm", bearer, { ...input, confirmationToken: token }));
    expect(r).toMatchObject({ ok: false, code: "not_found" });
    expect((r as { message?: string }).message).toMatch(/Nothing was changed/);
  });

  it("a token minted for one state is refused once that state changed (a spent token is stale)", async () => {
    const input = { offeringId: OFFER, status: "active" };
    const draft = await inScope(() => runCapability("service_offering.status_set_draft", bearer, input));
    const token = (draft as unknown as { data: { confirmationToken: string } }).data.confirmationToken;
    offerings = { kind: "ok", rows: [{ id: "o-1", status: "active" }] }; // the write happened elsewhere
    const r = await inScope(() => runCapability("service_offering.status_set_confirm", bearer, { ...input, confirmationToken: token }));
    expect(r).toMatchObject({ ok: false, code: "confirmation_rejected" });
    expect(setStatus).not.toHaveBeenCalled();
  });

  it("a token cannot be reused for a different input", async () => {
    const draft = await inScope(() => runCapability("service_offering.status_set_draft", bearer, { offeringId: OFFER, status: "paused" }));
    const token = (draft as unknown as { data: { confirmationToken: string } }).data.confirmationToken;
    const r = await inScope(() =>
      runCapability("service_offering.status_set_confirm", bearer, { offeringId: OFFER, status: "active", confirmationToken: token }),
    );
    expect(r).toMatchObject({ ok: false, code: "confirmation_rejected" });
    expect(setStatus).not.toHaveBeenCalled();
  });

  it("a token minted in one workspace is refused after switching to another", async () => {
    const input = { offeringId: OFFER, status: "active" };
    const draft = await inScope(() => runCapability("service_offering.status_set_draft", bearer, input));
    const token = (draft as unknown as { data: { confirmationToken: string } }).data.confirmationToken;
    activeWorkspace = "org-2";
    const r = await inScope(() => runCapability("service_offering.status_set_confirm", bearer, { ...input, confirmationToken: token }));
    expect(r).toMatchObject({ ok: false, code: "confirmation_rejected" });
    expect(setStatus).not.toHaveBeenCalled();
  });

  it("no token is minted, and nothing confirms, when the state cannot be read", async () => {
    listOwn.mockRejectedValueOnce(new Error("db down"));
    const r = await inScope(() => runCapability("service_offering.status_set_draft", bearer, { offeringId: OFFER, status: "active" }));
    expect(r).toMatchObject({ ok: false, code: "unavailable" });
    activeWorkspace = new Error("unreadable");
    const c = await inScope(() =>
      runCapability("service_offering.status_set_confirm", bearer, { offeringId: OFFER, status: "active", confirmationToken: "x".repeat(40) }),
    );
    expect(c).toMatchObject({ ok: false, code: "unavailable" });
    expect(setStatus).not.toHaveBeenCalled();
  });

  it("a bearer caller outside the scope is refused before anything runs", async () => {
    const r = await runCapability("service_offering.create", bearer, { title: "Tiling crew" });
    expect(r).toMatchObject({ ok: false, code: "not_supported" });
    expect(create).not.toHaveBeenCalled();
  });

  it("a read's own failure is not an empty answer", async () => {
    offerings = { kind: "needs-migration" };
    const r = await inScope(() => runCapability("service_offering.list_own", bearer, {}));
    expect(r).toMatchObject({ ok: false, code: "needs_migration" });
  });
});
