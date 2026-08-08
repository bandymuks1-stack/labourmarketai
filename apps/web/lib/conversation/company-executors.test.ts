import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Employer-side executor adapters (PR-E) — unit tests.
 *
 * The canonical action layer is MOCKED: these tests pin that each executor is
 * a THIN adapter — it forwards the validated input to the ONE canonical server
 * action, and it NEVER claims success unless the canonical action returned it
 * (a mocked failure/throw must always surface as `ok: false`). Authorization
 * is pinned separately: it comes from dispatch-core's role gate over the
 * registry `allowedRoles`, never from the executor.
 */

vi.mock("@/lib/demand/demand-request-actions", () => ({
  submitDemandRequestAction: vi.fn(),
}));
vi.mock("@/lib/demand/demand-drafts-actions", () => ({
  saveDemandDraftAction: vi.fn(),
}));
vi.mock("@/lib/demand/demand-lifecycle-actions", () => ({
  confirmRecognizedNeedAction: vi.fn(),
  closeDemandAction: vi.fn(),
  reopenDemandAction: vi.fn(),
}));
vi.mock("@/lib/scouting/scouting-actions", () => ({ setShortlistAction: vi.fn() }));
vi.mock("@/lib/communication/request-worker-conversation", () => ({
  requestWorkerConversationAction: vi.fn(),
}));
vi.mock("@/lib/booking/booking-actions", () => ({ proposeBookingAction: vi.fn() }));
vi.mock("@/lib/projects/actions", () => ({ assignWorkerToProjectAction: vi.fn() }));
vi.mock("@/lib/agency/bridge-actions", () => ({
  inviteClientAction: vi.fn(),
  submitOfferAction: vi.fn(),
}));

import { COMPANY_EXECUTORS } from "@/lib/conversation/company-executors";
import {
  COMPANY_ACTION_SCHEMAS,
  type CompanyActionId,
} from "@/lib/conversation/company-schemas";
import { getConversationAction } from "@/lib/conversation/action-registry";
import { authorizeDispatch } from "@/lib/conversation/dispatch-core";
import type { Role } from "@/lib/auth/actions";
import { submitDemandRequestAction } from "@/lib/demand/demand-request-actions";
import { saveDemandDraftAction } from "@/lib/demand/demand-drafts-actions";
import {
  confirmRecognizedNeedAction,
  closeDemandAction,
  reopenDemandAction,
} from "@/lib/demand/demand-lifecycle-actions";
import { setShortlistAction } from "@/lib/scouting/scouting-actions";
import { requestWorkerConversationAction } from "@/lib/communication/request-worker-conversation";
import { proposeBookingAction } from "@/lib/booking/booking-actions";
import { assignWorkerToProjectAction } from "@/lib/projects/actions";
import { inviteClientAction, submitOfferAction } from "@/lib/agency/bridge-actions";

const UUID = "6f1d1a2e-9c1b-4f6e-8e2a-0a1b2c3d4e5f";
const UUID2 = "0f9e8d7c-6b5a-4f3e-9d1c-2b3a4c5d6e7f";
const UUID3 = "1a2b3c4d-5e6f-4a1b-8c2d-3e4f5a6b7c8d";
const ctx = { locale: "en" };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const asMock = (f: unknown) => f as any;

beforeEach(() => {
  vi.clearAllMocks();
});

describe("registry ↔ schema ↔ executor stay in lockstep", () => {
  it("every executable employer id has a registry descriptor, schema and executor", () => {
    const ids = Object.keys(COMPANY_ACTION_SCHEMAS) as CompanyActionId[];
    expect(ids.length).toBeGreaterThan(0);
    for (const id of ids) {
      expect(getConversationAction(id), `${id} missing from registry`).toBeDefined();
      expect(COMPANY_EXECUTORS[id], `${id} missing executor`).toBeTypeOf("function");
    }
    expect(Object.keys(COMPANY_EXECUTORS).sort()).toEqual([...ids].sort());
  });

  it("authorization comes from dispatch-core over registry allowedRoles — a plain worker is denied every employer action", () => {
    const worker = new Set<Role>(["worker"]);
    for (const id of Object.keys(COMPANY_ACTION_SCHEMAS)) {
      const decision = authorizeDispatch({
        descriptor: getConversationAction(id),
        heldRoles: worker,
        executable: true,
      });
      expect(decision, id).toEqual({ ok: false, code: "not_authorized" });
      // …and the subject role itself is allowed through the same gate.
      // Every EMPLOYER action's subject is a role (§7.1 widened `subject` to
      // `Role | "engagement"`, and the one relationship action is not in this
      // map) — asserted rather than assumed, so the cast cannot go stale.
      const subject = getConversationAction(id)!.subject;
      expect(subject, `${id} subject must be a role here`).not.toBe("engagement");
      expect(
        authorizeDispatch({
          descriptor: getConversationAction(id),
          heldRoles: new Set<Role>([subject as Role]),
          executable: true,
        }),
        id,
      ).toEqual({ ok: true });
    }
  });

  it("schemas reject garbage before any canonical action could run", () => {
    expect(
      COMPANY_ACTION_SCHEMAS["company.close-demand"].safeParse({ requestId: "not-a-uuid" })
        .success,
    ).toBe(false);
    expect(
      COMPANY_ACTION_SCHEMAS["company.shortlist-candidate"].safeParse({
        requestId: UUID,
        workerId: UUID2,
        status: "definitely-hired", // not in the closed set
      }).success,
    ).toBe(false);
    expect(
      COMPANY_ACTION_SCHEMAS["company.create-demand"].safeParse({ description: "" }).success,
    ).toBe(false);
    // drafts exist only for the hire_workers intent
    expect(
      COMPANY_ACTION_SCHEMAS["company.create-demand"].safeParse({
        intent: "partner",
        mode: "draft",
        description: "three tilers for Vilnius",
      }).success,
    ).toBe(false);
  });
});

describe("company.create-demand delegates to the canonical §17 intake", () => {
  it("submit: returns the REAL request id + 'submitted' from the canonical action", async () => {
    asMock(submitDemandRequestAction).mockResolvedValue({ ok: true, requestId: UUID });
    const r = await COMPANY_EXECUTORS["company.create-demand"](
      COMPANY_ACTION_SCHEMAS["company.create-demand"].parse({
        description: "three tilers for a Vilnius site",
        role: "Tiler",
      }),
      ctx,
    );
    expect(submitDemandRequestAction).toHaveBeenCalledWith(
      "hire_workers",
      expect.objectContaining({ description: "three tilers for a Vilnius site", role: "Tiler" }),
    );
    expect(r).toEqual({ ok: true, data: { requestId: UUID, status: "submitted" } });
  });

  it("submit: a canonical failure is NEVER mapped to success (real code kept)", async () => {
    asMock(submitDemandRequestAction).mockResolvedValue({ ok: false, code: "needs_migration" });
    const r = await COMPANY_EXECUTORS["company.create-demand"](
      COMPANY_ACTION_SCHEMAS["company.create-demand"].parse({ description: "need workers" }),
      ctx,
    );
    expect(r).toEqual({ ok: false, code: "needs_migration" });
  });

  it("draft: returns the REAL draft row id + 'draft' from the canonical draft save", async () => {
    asMock(saveDemandDraftAction).mockResolvedValue({ id: UUID2 });
    const r = await COMPANY_EXECUTORS["company.create-demand"](
      COMPANY_ACTION_SCHEMAS["company.create-demand"].parse({
        mode: "draft",
        description: "still figuring out the team size",
      }),
      ctx,
    );
    expect(saveDemandDraftAction).toHaveBeenCalledWith(
      "company_request",
      expect.objectContaining({ capabilities: "still figuring out the team size" }),
    );
    expect(submitDemandRequestAction).not.toHaveBeenCalled();
    expect(r).toEqual({ ok: true, data: { requestId: UUID2, status: "draft" } });
  });

  it("draft: forwards the worker count — an employer reported it vanishing", async () => {
    // The employer filled 4 concrete workers, ticked "Išsaugoti kaip
    // juodraštį", was told "Išsaugota." — and the count was gone. The submit
    // leg had always passed `teamSize`; only the draft leg dropped it, so the
    // defect depended on a checkbox. `objectContaining` cannot catch a MISSING
    // field, which is why this asserts the value explicitly.
    asMock(saveDemandDraftAction).mockResolvedValue({ id: UUID2 });
    await COMPANY_EXECUTORS["company.create-demand"](
      COMPANY_ACTION_SCHEMAS["company.create-demand"].parse({
        mode: "draft",
        description: "Reikia 4 betonuotojų.",
        role: "Betonuotojai",
        location: "Peleniškiai, Pakruojis",
        teamSize: 4,
        urgency: "this_week",
      }),
      ctx,
    );
    const payload = asMock(saveDemandDraftAction).mock.calls[0][1] as Record<
      string,
      unknown
    >;
    expect(payload.teamSize).toBe("4");
    // and nothing else the employer typed is lost on the way either
    expect(payload).toMatchObject({
      title: "Betonuotojai",
      capabilities: "Reikia 4 betonuotojų.",
      location: "Peleniškiai, Pakruojis",
      timing: "this_week",
    });
  });

  it("draft: a canonical throw or null row is a failure, never success", async () => {
    asMock(saveDemandDraftAction).mockRejectedValue(new Error("save failed: RLS"));
    const input = COMPANY_ACTION_SCHEMAS["company.create-demand"].parse({
      mode: "draft",
      description: "still figuring out the team size",
    });
    expect(await COMPANY_EXECUTORS["company.create-demand"](input, ctx)).toEqual({
      ok: false,
      code: "save_failed",
    });
    asMock(saveDemandDraftAction).mockResolvedValue(null);
    expect(await COMPANY_EXECUTORS["company.create-demand"](input, ctx)).toEqual({
      ok: false,
      code: "save_failed",
    });
  });
});

describe("demand lifecycle executors delegate to lib/demand/demand-lifecycle-actions", () => {
  it("close: forwards locale + id and returns the canonical status", async () => {
    asMock(closeDemandAction).mockResolvedValue({ kind: "ok", status: "closed" });
    const r = await COMPANY_EXECUTORS["company.close-demand"]({ requestId: UUID }, ctx);
    expect(closeDemandAction).toHaveBeenCalledWith("en", UUID);
    expect(r).toEqual({ ok: true, data: { status: "closed" } });
  });

  it("reopen: returns the canonical 'submitted' status", async () => {
    asMock(reopenDemandAction).mockResolvedValue({ kind: "ok", status: "submitted" });
    const r = await COMPANY_EXECUTORS["company.reopen-demand"]({ requestId: UUID }, ctx);
    expect(r).toEqual({ ok: true, data: { status: "submitted" } });
  });

  it("confirm-need: ok passes through; the honest no-op is NOT success", async () => {
    asMock(confirmRecognizedNeedAction).mockResolvedValue({ kind: "ok" });
    expect(await COMPANY_EXECUTORS["company.confirm-need"]({ requestId: UUID }, ctx)).toEqual({
      ok: true,
    });
    asMock(confirmRecognizedNeedAction).mockResolvedValue({ kind: "nothing-to-confirm" });
    expect(await COMPANY_EXECUTORS["company.confirm-need"]({ requestId: UUID }, ctx)).toEqual({
      ok: false,
      code: "nothing_to_confirm",
    });
  });

  it("not-owner / invalid / error map to honest failure codes", async () => {
    asMock(closeDemandAction).mockResolvedValue({ kind: "not-owner" });
    expect(await COMPANY_EXECUTORS["company.close-demand"]({ requestId: UUID }, ctx)).toEqual({
      ok: false,
      code: "not_authorized",
    });
    asMock(reopenDemandAction).mockResolvedValue({ kind: "invalid" });
    expect(await COMPANY_EXECUTORS["company.reopen-demand"]({ requestId: UUID }, ctx)).toEqual({
      ok: false,
      code: "invalid",
    });
    asMock(closeDemandAction).mockResolvedValue({ kind: "error", message: "boom" });
    expect(await COMPANY_EXECUTORS["company.close-demand"]({ requestId: UUID }, ctx)).toEqual({
      ok: false,
      code: "error",
      message: "boom",
    });
  });
});

describe("scouting / communication / booking / project executors", () => {
  it("shortlist: forwards all args and returns the canonical stored state", async () => {
    asMock(setShortlistAction).mockResolvedValue({ kind: "ok", status: "interested", note: null });
    const r = await COMPANY_EXECUTORS["company.shortlist-candidate"](
      { requestId: UUID, workerId: UUID2, status: "interested", note: undefined },
      ctx,
    );
    expect(setShortlistAction).toHaveBeenCalledWith("en", UUID, UUID2, "interested", undefined);
    expect(r).toEqual({ ok: true, data: { status: "interested", note: null } });
  });

  it("shortlist: the server-enforced not_fit reason rule surfaces honestly", async () => {
    asMock(setShortlistAction).mockResolvedValue({ kind: "reason-required" });
    const r = await COMPANY_EXECUTORS["company.shortlist-candidate"](
      { requestId: UUID, workerId: UUID2, status: "not_fit", note: undefined },
      ctx,
    );
    expect(r).toEqual({ ok: false, code: "reason_required" });
  });

  it("contact-worker: returns the REAL conversation id; canonical deny reasons pass through", async () => {
    asMock(requestWorkerConversationAction).mockResolvedValue({ ok: true, conversationId: UUID3 });
    const okr = await COMPANY_EXECUTORS["company.contact-worker"](
      { requestId: UUID, workerId: UUID2 },
      ctx,
    );
    expect(requestWorkerConversationAction).toHaveBeenCalledWith({
      locale: "en",
      requestId: UUID,
      workerId: UUID2,
    });
    expect(okr).toEqual({ ok: true, data: { conversationId: UUID3 } });

    asMock(requestWorkerConversationAction).mockResolvedValue({ ok: false, reason: "rate_limited" });
    expect(
      await COMPANY_EXECUTORS["company.contact-worker"]({ requestId: UUID, workerId: UUID2 }, ctx),
    ).toEqual({ ok: false, code: "rate_limited" });
  });

  it("propose-booking: kind-tagged canonical result normalized, never invented", async () => {
    asMock(proposeBookingAction).mockResolvedValue({ kind: "ok", status: "proposed" });
    const r = await COMPANY_EXECUTORS["company.propose-booking"](
      COMPANY_ACTION_SCHEMAS["company.propose-booking"].parse({
        requestId: UUID,
        workerId: UUID2,
        startDate: "2026-08-01",
      }),
      ctx,
    );
    expect(proposeBookingAction).toHaveBeenCalledWith(
      expect.objectContaining({ locale: "en", requestId: UUID, workerId: UUID2, startDate: "2026-08-01" }),
    );
    expect(r).toEqual({ ok: true, data: { status: "proposed" } });

    asMock(proposeBookingAction).mockResolvedValue({ kind: "not-entitled" });
    expect(
      await COMPANY_EXECUTORS["company.propose-booking"](
        COMPANY_ACTION_SCHEMAS["company.propose-booking"].parse({ requestId: UUID, workerId: UUID2 }),
        ctx,
      ),
    ).toEqual({ ok: false, code: "not_authorized" });
  });

  it("assign-worker: formData adapter over the canonical project action", async () => {
    asMock(assignWorkerToProjectAction).mockResolvedValue({ ok: true });
    const r = await COMPANY_EXECUTORS["company.assign-worker"](
      { projectId: UUID, workerProfileId: UUID2 },
      ctx,
    );
    const [prev, formData] = asMock(assignWorkerToProjectAction).mock.calls[0];
    expect(prev).toBeNull();
    expect(formData.get("project_id")).toBe(UUID);
    expect(formData.get("worker_profile_id")).toBe(UUID2);
    expect(r).toEqual({ ok: true });

    asMock(assignWorkerToProjectAction).mockResolvedValue({ ok: false, code: "not_authorized" });
    expect(
      await COMPANY_EXECUTORS["company.assign-worker"](
        { projectId: UUID, workerProfileId: UUID2 },
        ctx,
      ),
    ).toEqual({ ok: false, code: "not_authorized" });
  });
});

describe("agency bridge executors", () => {
  it("invite-client: delegates via formData; bridge states map honestly", async () => {
    asMock(inviteClientAction).mockResolvedValue({ status: "ok" });
    const r = await COMPANY_EXECUTORS["agency.invite-client"](
      { agencyCompanyId: UUID, email: "client@example.com" },
      ctx,
    );
    const [, formData] = asMock(inviteClientAction).mock.calls[0];
    expect(formData.get("agencyCompanyId")).toBe(UUID);
    expect(formData.get("email")).toBe("client@example.com");
    expect(r).toEqual({ ok: true });

    asMock(inviteClientAction).mockResolvedValue({ status: "needs-migration" });
    expect(
      await COMPANY_EXECUTORS["agency.invite-client"](
        { agencyCompanyId: UUID, email: "client@example.com" },
        ctx,
      ),
    ).toEqual({ ok: false, code: "needs_migration" });
  });

  it("propose-candidate: forbidden/not-found/error never become success", async () => {
    for (const [status, code] of [
      ["forbidden", "not_authorized"],
      ["not-found", "not_found"],
      ["invalid", "invalid"],
    ] as const) {
      asMock(submitOfferAction).mockResolvedValue({ status });
      expect(
        await COMPANY_EXECUTORS["agency.propose-candidate"](
          { shareId: UUID, workerId: UUID2, note: undefined },
          ctx,
        ),
        status,
      ).toEqual({ ok: false, code });
    }
    asMock(submitOfferAction).mockResolvedValue({ status: "error", reason: "23505" });
    expect(
      await COMPANY_EXECUTORS["agency.propose-candidate"](
        { shareId: UUID, workerId: UUID2, note: "solid tiler" },
        ctx,
      ),
    ).toEqual({ ok: false, code: "error", message: "23505" });

    asMock(submitOfferAction).mockResolvedValue({ status: "ok" });
    const r = await COMPANY_EXECUTORS["agency.propose-candidate"](
      { shareId: UUID, workerId: UUID2, note: "solid tiler" },
      ctx,
    );
    const [, formData] = asMock(submitOfferAction).mock.calls.at(-1);
    expect(formData.get("shareId")).toBe(UUID);
    expect(formData.get("workerId")).toBe(UUID2);
    expect(formData.get("note")).toBe("solid tiler");
    expect(r).toEqual({ ok: true });
  });
});
