import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { activeLocales } from "@/lib/i18n/config";
import {
  cancelOutcomeView,
  deletionSectionMode,
  deletionStatusLabelKey,
  isMissingRpcError,
  parseCancelResult,
  parseDeletionStatus,
  type DeletionStatusView,
} from "./deletion-cancel-model";

const PENDING = {
  status: "pending",
  request_id: "00000000-0000-4000-8000-000000000001",
  submitted_at: "2026-11-09T08:00:00Z",
  confirmed_at: null,
  scheduled_erasure_at: "2026-11-09T09:00:00Z",
  cancellable: true,
};

describe("degrade rule — the RPC is not deployed yet", () => {
  it("PGRST202, 42883 and the PostgREST message all mean unavailable", () => {
    expect(isMissingRpcError({ code: "PGRST202" })).toBe(true);
    expect(isMissingRpcError({ code: "42883" })).toBe(true);
    expect(
      isMissingRpcError({
        code: "XX000",
        message: "Could not find the function public.privacy_account_deletion_status_v1",
      }),
    ).toBe(true);
    expect(isMissingRpcError({ code: "42501", message: "permission denied" })).toBe(false);
    expect(isMissingRpcError(null)).toBe(false);
  });

  it("status read: missing RPC → unavailable (no button, no date)", () => {
    expect(parseDeletionStatus(null, { code: "PGRST202", message: "x" })).toEqual({
      kind: "unavailable",
    });
  });

  it("status read: any other error or malformed payload → error, never a guess", () => {
    expect(parseDeletionStatus(null, { code: "57014", message: "timeout" })).toEqual({ kind: "error" });
    expect(parseDeletionStatus(null, null)).toEqual({ kind: "error" });
    expect(parseDeletionStatus([], null)).toEqual({ kind: "error" });
    expect(parseDeletionStatus({ status: "deleted_maybe" }, null)).toEqual({ kind: "error" });
    expect(parseDeletionStatus({ status: "pending" }, null)).toEqual({ kind: "error" });
  });

  it("cancel: missing RPC → unavailable; other error → error", () => {
    expect(parseCancelResult(null, { code: "PGRST202" })).toEqual({ kind: "unavailable" });
    expect(parseCancelResult(null, { code: "42883" })).toEqual({ kind: "unavailable" });
    expect(parseCancelResult(null, { code: "08006", message: "connection" })).toEqual({ kind: "error" });
    expect(parseCancelResult({ status: "maybe" }, null)).toEqual({ kind: "error" });
  });
});

describe("status contract → view", () => {
  it("none", () => {
    expect(parseDeletionStatus({ status: "none" }, null)).toEqual({ kind: "none" });
  });

  it("pending carries dates and the cancellable flag", () => {
    expect(parseDeletionStatus(PENDING, null)).toEqual({
      kind: "request",
      status: "pending",
      requestId: PENDING.request_id,
      submittedAt: PENDING.submitted_at,
      confirmedAt: null,
      scheduledErasureAt: PENDING.scheduled_erasure_at,
      cancellable: true,
    });
  });

  it("cancellable is never true outside pending, nor when not literally true", () => {
    for (const status of ["withdrawn", "in_progress", "done"]) {
      const v = parseDeletionStatus({ ...PENDING, status }, null);
      expect(v.kind === "request" && v.cancellable).toBe(false);
    }
    const v = parseDeletionStatus({ ...PENDING, cancellable: "true" }, null);
    expect(v.kind === "request" && v.cancellable).toBe(false);
  });

  it("label keys", () => {
    const view = (over: Record<string, unknown>) =>
      parseDeletionStatus({ ...PENDING, ...over }, null) as Extract<
        DeletionStatusView,
        { kind: "request" }
      >;
    expect(deletionStatusLabelKey(view({}))).toBe("pending");
    expect(deletionStatusLabelKey(view({ confirmed_at: "2026-11-09T08:05:00Z" }))).toBe(
      "pendingConfirmed",
    );
    expect(deletionStatusLabelKey(view({ status: "withdrawn" }))).toBe("withdrawn");
    expect(deletionStatusLabelKey(view({ status: "in_progress" }))).toBe("inProgress");
    expect(deletionStatusLabelKey(view({ status: "done" }))).toBe("done");
  });
});

describe("cancel contract → outcome shown to the person", () => {
  const id = { request_id: PENDING.request_id };
  it("ok and ok_already both confirm the account stays active", () => {
    for (const status of ["ok", "ok_already"]) {
      expect(cancelOutcomeView(parseCancelResult({ status, ...id }, null))).toEqual({
        messageKey: "cancelled",
        tone: "success",
        withdrawn: true,
      });
    }
  });

  it("not_cancellable, not_found, not_signed_in, unavailable, error", () => {
    const key = (data: unknown, error: { code: string } | null = null) =>
      cancelOutcomeView(parseCancelResult(data, error));
    expect(key({ status: "not_cancellable", ...id })).toEqual({
      messageKey: "notCancellable",
      tone: "warning",
      withdrawn: false,
    });
    expect(key({ status: "not_found" }).messageKey).toBe("notFound");
    expect(key({ status: "not_signed_in" }).messageKey).toBe("notSignedIn");
    expect(key(null, { code: "PGRST202" }).messageKey).toBe("unavailable");
    expect(key(null, { code: "XX000" }).messageKey).toBe("error");
    for (const k of ["not_found", "not_signed_in"]) {
      expect(key({ status: k }).withdrawn).toBe(false);
    }
  });
});

describe("deletion section mode", () => {
  const unavailable: DeletionStatusView = { kind: "unavailable" };
  const req = (over: Record<string, unknown>) => parseDeletionStatus({ ...PENDING, ...over }, null);

  it("without a status it is exactly the pre-existing rule", () => {
    for (const view of [unavailable, { kind: "none" } as const, { kind: "error" } as const]) {
      expect(deletionSectionMode(view, null)).toBe("request-form");
      expect(deletionSectionMode(view, "submitted")).toBe("confirm-step");
      expect(deletionSectionMode(view, "approved")).toBe("confirm-step");
      expect(deletionSectionMode(view, "needs_followup")).toBe("in-review");
    }
  });

  it("with a status", () => {
    expect(deletionSectionMode(req({}), "submitted")).toBe("confirm-step");
    expect(deletionSectionMode(req({ confirmed_at: "2026-11-09T08:05:00Z" }), "approved")).toBe(
      "status-only",
    );
    expect(deletionSectionMode(req({}), "needs_followup")).toBe("in-review");
    expect(deletionSectionMode(req({ status: "withdrawn" }), null)).toBe("request-form");
    expect(deletionSectionMode(req({ status: "in_progress" }), "approved")).toBe("status-only");
    expect(deletionSectionMode(req({ status: "done" }), null)).toBe("status-only");
  });
});

describe("every key the model can return exists in every active locale", () => {
  // The page builds `deletion.status.${key}` dynamically, which a static key
  // scan cannot see — so the model's own key sets are checked here.
  const STATUS_KEYS = ["pending", "pendingConfirmed", "withdrawn", "inProgress", "done"];
  const CANCEL_KEYS = ["cancelled", "notCancellable", "notFound", "notSignedIn", "unavailable", "error"];
  for (const locale of activeLocales) {
    it(locale, () => {
      const messages = JSON.parse(
        readFileSync(join(__dirname, "..", "..", "messages", `${locale}.json`), "utf8"),
      );
      const deletion = messages.privacySelfService.deletion;
      for (const k of [...STATUS_KEYS, "submittedAt", "scheduledAt", "cancelUntil", "loadError"]) {
        expect(typeof deletion.status[k], `${locale} status.${k}`).toBe("string");
      }
      for (const k of [...CANCEL_KEYS, "button", "question", "confirm", "keep", "working"]) {
        expect(typeof deletion.cancel[k], `${locale} cancel.${k}`).toBe("string");
      }
      expect(deletion.status.scheduledAt).toContain("{date}");
      expect(deletion.status.scheduledAt).toContain("30");
    });
  }
});
