import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(url);
  },
}));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/notifications/event-emitters", () => ({
  emitWorkflowStepPendingNotifications: vi.fn(),
}));

import { createClient } from "@/lib/supabase/server";
import { emitWorkflowStepPendingNotifications } from "@/lib/notifications/event-emitters";
import {
  installTimesheetApprovalPackAction,
  submitTimesheetAction,
} from "./timesheets-actions";

const ORG = "00000000-0000-4000-8000-000000000001";
const SHEET = "00000000-0000-4000-8000-000000000002";
const INSTANCE = "00000000-0000-4000-8000-000000000003";
const PUBLISHED = "00000000-0000-4000-8000-000000000004";
type Definition = {
  id: string;
  organization_id: string;
  context_entity_type: string;
  is_active: boolean;
  created_at: number;
  workflow_definition_versions: { id: string; published_at: string | null }[];
};
let definitions: Definition[];
let readFailure: boolean;
let submitOutcome: string;
const rpcCalls: { name: string; args: Record<string, unknown> }[] = [];

function definition(
  id: string,
  createdAt: number,
  published: boolean,
): Definition {
  return {
    id,
    created_at: createdAt,
    organization_id: ORG,
    context_entity_type: "timesheet",
    is_active: true,
    workflow_definition_versions: [
      {
        id: `${id}-version`,
        published_at: published ? "2026-01-01T00:00:00Z" : null,
      },
    ],
  };
}

/** The real client builds REST requests; this in-memory endpoint applies
 * parent/embedded filters BEFORE the requested row limit, as PostgREST does.
 * No network, production credentials or production data are used. */
const fetchFixture: typeof fetch = async (input, init) => {
  const url = new URL(
    typeof input === "string"
      ? input
      : input instanceof URL
        ? input.href
        : input.url,
  );
  const resource = url.pathname.split("/").at(-1)!;
  const json = (data: unknown, status = 200) =>
    new Response(JSON.stringify(data), {
      status,
      headers: { "Content-Type": "application/json" },
    });
  if (url.pathname.includes("/rpc/")) {
    const args = JSON.parse(String(init?.body ?? "{}"));
    rpcCalls.push({ name: resource, args });
    if (resource === "start_workflow_instance_v1") return json(INSTANCE);
    if (resource === "submit_timesheet_v1") return json(submitOutcome);
    if (resource === "withdraw_workflow_instance_v1") return json("withdrawn");
    if (resource === "install_default_workflow_pack_v1")
      return json({ outcome: "all_skipped" });
    throw new Error(`Unexpected RPC ${resource}`);
  }
  if (resource === "timesheets")
    return json({
      id: SHEET,
      organization_id: ORG,
      period_start: "2026-01-01",
      period_end: "2026-01-07",
      status: "draft",
    });
  if (resource !== "workflow_definitions")
    throw new Error(`Unexpected table ${resource}`);
  if (readFailure) return json({ code: "42501", message: "read refused" }, 403);
  const params = url.searchParams;
  let rows = definitions
    .filter(
      (row) =>
        params.get("organization_id") === `eq.${row.organization_id}` &&
        params.get("context_entity_type") === `eq.${row.context_entity_type}` &&
        params.get("is_active") === `eq.${row.is_active}`,
    )
    .map((row) => ({
      ...row,
      workflow_definition_versions: [...row.workflow_definition_versions],
    }));
  if (
    params.get("workflow_definition_versions.published_at") === "not.is.null"
  ) {
    rows = rows.map((row) => ({
      ...row,
      workflow_definition_versions: row.workflow_definition_versions.filter(
        (v) => v.published_at !== null,
      ),
    }));
  }
  if (params.get("select")?.includes("workflow_definition_versions!inner")) {
    rows = rows.filter((row) => row.workflow_definition_versions.length > 0);
  }
  if (params.get("order") === "created_at.desc")
    rows.sort((a, b) => b.created_at - a.created_at);
  const limit = Number(params.get("limit") ?? rows.length);
  return json(rows.slice(0, limit));
};

afterEach(() => vi.unstubAllGlobals());

beforeEach(() => {
  vi.stubGlobal("WebSocket", undefined);
  vi.clearAllMocks();
  rpcCalls.length = 0;
  readFailure = false;
  submitOutcome = "submitted";
  definitions = [
    definition(PUBLISHED, 1, true),
    ...Array.from({ length: 6 }, (_, i) =>
      definition(`draft-${i}`, i + 2, false),
    ),
  ];
  const client = createSupabaseClient(
    "https://fixture.example.test",
    "fixture-anon-key",
    {
      global: { fetch: fetchFixture },
      realtime: {
        transport: class {
          constructor() {
            throw new Error("Realtime is not part of this REST-only test");
          }
        } as unknown as typeof WebSocket,
      },
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    },
  );
  vi.spyOn(client.auth, "getUser").mockResolvedValue({
    data: { user: { id: "fixture-user" } },
    error: null,
  } as Awaited<ReturnType<typeof client.auth.getUser>>);
  vi.mocked(createClient).mockResolvedValue(
    client as Awaited<ReturnType<typeof createClient>>,
  );
});

function form(): FormData {
  const data = new FormData();
  data.set("locale", "lt");
  data.set("timesheetId", SHEET);
  data.set("organizationId", ORG);
  return data;
}

describe("timesheet submission uses a published template, not a window of recent drafts", () => {
  it("finds the older published template behind six newer drafts and notifies its workflow", async () => {
    await expect(submitTimesheetAction(form())).rejects.toThrow(
      "?ts=submitted#timesheets",
    );
    expect(rpcCalls.map((call) => call.name)).toEqual([
      "start_workflow_instance_v1",
      "submit_timesheet_v1",
    ]);
    expect(rpcCalls[0].args.p_definition_id).toBe(PUBLISHED);
    expect(emitWorkflowStepPendingNotifications).toHaveBeenCalledWith(INSTANCE);
  });

  it("chooses the newest eligible published definition, ignoring other organizations, contexts and inactive templates", async () => {
    definitions.push(
      definition("new-published", 20, true),
      { ...definition("foreign", 30, true), organization_id: "another-org" },
      { ...definition("inactive", 40, true), is_active: false },
      {
        ...definition("other-context", 50, true),
        context_entity_type: "booking",
      },
    );
    await expect(submitTimesheetAction(form())).rejects.toThrow(
      "?ts=submitted#timesheets",
    );
    expect(rpcCalls[0].args.p_definition_id).toBe("new-published");
  });

  it("never starts approval or notifies when only drafts exist", async () => {
    definitions = definitions.filter((row) => row.id !== PUBLISHED);
    await expect(submitTimesheetAction(form())).rejects.toThrow(
      "?ts=no_template#timesheets",
    );
    expect(rpcCalls).toEqual([]);
    expect(emitWorkflowStepPendingNotifications).not.toHaveBeenCalled();
  });

  it("stops before writes when the template read fails", async () => {
    readFailure = true;
    await expect(submitTimesheetAction(form())).rejects.toThrow(
      "?ts=error#timesheets",
    );
    expect(rpcCalls).toEqual([]);
  });

  it("still withdraws a newly started approval if the snapshot cannot be submitted", async () => {
    submitOutcome = "not_editable";
    await expect(submitTimesheetAction(form())).rejects.toThrow(
      "?ts=not_editable#timesheets",
    );
    expect(rpcCalls.map((call) => call.name)).toEqual([
      "start_workflow_instance_v1",
      "submit_timesheet_v1",
      "withdraw_workflow_instance_v1",
    ]);
    expect(emitWorkflowStepPendingNotifications).not.toHaveBeenCalled();
  });

  it("the existing pack install post-check also finds the published template behind newer drafts", async () => {
    await expect(installTimesheetApprovalPackAction(form())).rejects.toThrow(
      "?ts=template_created#timesheets",
    );
    expect(rpcCalls.map((call) => call.name)).toEqual([
      "install_default_workflow_pack_v1",
    ]);
  });

  it("a skipped pack without a published template never claims success", async () => {
    definitions = definitions.filter((row) => row.id !== PUBLISHED);
    await expect(installTimesheetApprovalPackAction(form())).rejects.toThrow(
      "?ts=no_template#timesheets",
    );
  });
});
