import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  // The real `redirect` throws so nothing after it runs; the test double
  // does the same and carries the URL in the digest, as Next does.
  redirect: vi.fn((url: string) => {
    throw Object.assign(new Error("NEXT_REDIRECT"), { digest: `NEXT_REDIRECT;${url}` });
  }),
}));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/company/employer-company-context", () => ({
  resolveEmployerCompanyContext: vi.fn(),
}));
vi.mock("@/lib/communication/direct-conversation", () => ({
  getOrCreateDirectConversation: vi.fn(),
}));

import { createClient } from "@/lib/supabase/server";
import { resolveEmployerCompanyContext } from "@/lib/company/employer-company-context";
import { getOrCreateDirectConversation } from "@/lib/communication/direct-conversation";
import { openAgencyConnectionConversationAction } from "@/lib/agency/bridge-conversation";

/**
 * The agency ↔ client conversation opener (2026-09-24, review round 2):
 * the locale it interpolates into every redirect is a FORM field, so a
 * forged value must be clamped before it can become a protocol-relative
 * Location; and the grant is passed only after the server-side gate held.
 */
const AGENCY_CO = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const CLIENT_CO = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const CONNECTION = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const AGENCY_PERSON = "11111111-1111-4111-8111-111111111111";
const CLIENT_PERSON = "22222222-2222-4222-8222-222222222222";
const THREAD = "33333333-3333-4333-8333-333333333333";

const asMock = <T,>(fn: T) => fn as unknown as ReturnType<typeof vi.fn>;

function fd(entries: Record<string, string>): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries(entries)) f.set(k, v);
  return f;
}

type Row = {
  id: string;
  agency_company_id: string;
  client_company_id: string | null;
  status: string;
  invited_by: string | null;
  accepted_by: string | null;
};

const activeRow = (): Row => ({
  id: CONNECTION,
  agency_company_id: AGENCY_CO,
  client_company_id: CLIENT_CO,
  status: "active",
  invited_by: AGENCY_PERSON,
  accepted_by: CLIENT_PERSON,
});

function arrange(input: { userId: string; callerCompanyId: string | null; row: Row | null }) {
  asMock(createClient).mockResolvedValue({
    auth: { getUser: async () => ({ data: { user: { id: input.userId } } }) },
    from: () => ({
      select: () => ({
        eq: () => ({ maybeSingle: async () => ({ data: input.row, error: null }) }),
      }),
    }),
  });
  asMock(resolveEmployerCompanyContext).mockResolvedValue(
    input.callerCompanyId
      ? { kind: "ok", companyId: input.callerCompanyId }
      : { kind: "unavailable", reason: "personal-workspace", activeWorkspaceName: null },
  );
  asMock(getOrCreateDirectConversation).mockResolvedValue({ ok: true, data: { id: THREAD } });
}

/** The URL the action redirected to (the action always ends in a redirect). */
async function run(entries: Record<string, string>): Promise<string> {
  try {
    await openAgencyConnectionConversationAction(fd(entries));
  } catch (e) {
    const digest = String((e as { digest?: string }).digest ?? "");
    if (digest.startsWith("NEXT_REDIRECT;")) return digest.slice("NEXT_REDIRECT;".length);
    throw e;
  }
  throw new Error("the action returned without redirecting");
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("the locale is clamped before it reaches a redirect", () => {
  it("a forged `/evil.com` on the refusal path clamps to the default — never `//evil.com/…`", async () => {
    arrange({ userId: AGENCY_PERSON, callerCompanyId: AGENCY_CO, row: activeRow() });
    const url = await run({ connectionId: "not-a-uuid", locale: "/evil.com" });
    expect(url).toBe("/lt/dashboard/communication?notice=cannot_open");
    expect(url.startsWith("//")).toBe(false);
  });

  it("a forged `//evil.com` on the success path clamps too, and the grant carries the clamped locale", async () => {
    arrange({ userId: AGENCY_PERSON, callerCompanyId: AGENCY_CO, row: activeRow() });
    const url = await run({ connectionId: CONNECTION, locale: "//evil.com" });
    expect(url).toBe(`/lt/dashboard/communication/${THREAD}`);
    expect(getOrCreateDirectConversation).toHaveBeenCalledWith(
      CLIENT_PERSON,
      "lt",
      null,
      "allowed_agency_connection",
    );
  });

  it("an active locale is kept", async () => {
    arrange({ userId: AGENCY_PERSON, callerCompanyId: AGENCY_CO, row: activeRow() });
    const url = await run({ connectionId: CONNECTION, locale: "de" });
    expect(url).toBe(`/de/dashboard/communication/${THREAD}`);
  });
});

describe("the counterpart is the OTHER side's consenting person, after the gate", () => {
  it("agency side → the client member who accepted", async () => {
    arrange({ userId: AGENCY_PERSON, callerCompanyId: AGENCY_CO, row: activeRow() });
    await run({ connectionId: CONNECTION, locale: "lt" });
    expect(asMock(getOrCreateDirectConversation).mock.calls[0][0]).toBe(CLIENT_PERSON);
  });

  it("client side → the agency member who invited", async () => {
    arrange({ userId: CLIENT_PERSON, callerCompanyId: CLIENT_CO, row: activeRow() });
    await run({ connectionId: CONNECTION, locale: "lt" });
    expect(asMock(getOrCreateDirectConversation).mock.calls[0][0]).toBe(AGENCY_PERSON);
  });

  it("NEGATIVE: a pending connection grants nothing", async () => {
    arrange({
      userId: AGENCY_PERSON,
      callerCompanyId: AGENCY_CO,
      row: { ...activeRow(), status: "pending", client_company_id: null, accepted_by: null },
    });
    const url = await run({ connectionId: CONNECTION, locale: "lt" });
    expect(url).toBe("/lt/dashboard/communication?notice=cannot_open");
    expect(getOrCreateDirectConversation).not.toHaveBeenCalled();
  });

  it("NEGATIVE: a company that is neither party grants nothing", async () => {
    arrange({
      userId: AGENCY_PERSON,
      callerCompanyId: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
      row: activeRow(),
    });
    const url = await run({ connectionId: CONNECTION, locale: "lt" });
    expect(url).toBe("/lt/dashboard/communication?notice=cannot_open");
    expect(getOrCreateDirectConversation).not.toHaveBeenCalled();
  });

  it("NEGATIVE: no company context (a personal workspace) grants nothing", async () => {
    arrange({ userId: AGENCY_PERSON, callerCompanyId: null, row: activeRow() });
    const url = await run({ connectionId: CONNECTION, locale: "lt" });
    expect(url).toBe("/lt/dashboard/communication?notice=cannot_open");
    expect(getOrCreateDirectConversation).not.toHaveBeenCalled();
  });

  it("NEGATIVE: a row nobody can see (RLS) grants nothing", async () => {
    arrange({ userId: AGENCY_PERSON, callerCompanyId: AGENCY_CO, row: null });
    const url = await run({ connectionId: CONNECTION, locale: "lt" });
    expect(url).toBe("/lt/dashboard/communication?notice=cannot_open");
    expect(getOrCreateDirectConversation).not.toHaveBeenCalled();
  });
});
