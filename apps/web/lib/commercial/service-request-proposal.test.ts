import type { SupabaseClient } from "@supabase/supabase-js";
import { createElement, type ComponentProps, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { MarketplaceLoopSection, type MarketplaceLabels } from "@/components/app/marketplace-loop-section";
import {
  createProposalAction,
  createServiceRequestProposalAction,
} from "@/lib/commercial/commercial-actions";
import { findOpenServiceRequestProposal, getMyCommercial, supportsServiceRequestProposals } from "@/lib/commercial/commercial";
import { PERSONAL_WORKSPACE_ID } from "@/lib/company/organization-switch";
import { getAcceptedServiceRequestForProposal } from "@/lib/marketplace/service-requests";

const { getUser, from, rpc, getWorkspaceContext, revalidatePath } = vi.hoisted(() => ({
  getUser: vi.fn(),
  from: vi.fn(),
  rpc: vi.fn(),
  getWorkspaceContext: vi.fn(),
  revalidatePath: vi.fn(),
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ auth: { getUser }, from, rpc }),
}));
vi.mock("@/lib/company/active-organization", () => ({ getWorkspaceContext }));
vi.mock("next/cache", () => ({ revalidatePath }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: () => {} }) }));
vi.mock("next-intl", () => ({ useLocale: () => "lt" }));
vi.mock("@/lib/i18n/navigation", async () => {
  const { createElement } = await import("react");
  return {
    Link: ({
      href,
      children,
      ...props
    }: { href: string | { pathname: string; query: { serviceRequest: string }; hash: string }; children: ReactNode }) => {
      const path = typeof href === "string"
        ? href
        : `${href.pathname}?serviceRequest=${href.query.serviceRequest}#${href.hash}`;
      return createElement("a", { href: `/lt${path}`, ...props }, children);
    },
  };
});

const requestId = "4b80c57b-3477-4660-9012-2f607071c8a6";
const input = { serviceRequestId: requestId, title: "  Window installation  ", amountCents: 7650 };

beforeEach(() => {
  vi.resetAllMocks();
  getUser.mockResolvedValue({ data: { user: { id: "provider" } } });
  getWorkspaceContext.mockResolvedValue({ activeWorkspaceId: PERSONAL_WORKSPACE_ID });
  rpc.mockResolvedValue({ data: "proposal", error: null });
});

describe("creating a proposal for an accepted service request", () => {
  it("uses the linked draft RPC and keeps the existing standalone proposal action", async () => {
    await expect(createServiceRequestProposalAction(input)).resolves.toEqual({ ok: true });
    expect(rpc).toHaveBeenNthCalledWith(1, "create_proposal_from_service_request_v1", {
      p_request_id: requestId,
      p_title: "Window installation",
      p_amount_cents: 7650,
    });
    expect(revalidatePath).toHaveBeenCalledWith("/", "layout");

    await expect(createProposalAction({ title: "Standalone", amountCents: 8000 })).resolves.toEqual({ ok: true });
    expect(rpc).toHaveBeenNthCalledWith(2, "create_proposal_v1", {
      p_title: "Standalone",
      p_amount_cents: 8000,
      p_customer_request_id: null,
      p_project_id: null,
    });
  });

  it("requires the signed-in provider's personal workspace before calling the RPC", async () => {
    getWorkspaceContext.mockResolvedValue({ activeWorkspaceId: "organization" });
    await expect(createServiceRequestProposalAction(input)).resolves.toEqual({ ok: false, code: "not_authorized" });
    getUser.mockResolvedValue({ data: { user: null } });
    await expect(createServiceRequestProposalAction(input)).resolves.toEqual({ ok: false, code: "auth" });
    expect(rpc).not.toHaveBeenCalled();
  });

  it.each([
    ["PGRST202", "needs_migration"],
    ["42501", "not_authorized"],
    ["22023", "invalid"],
  ])("keeps the linked action closed on RPC refusal %s", async (code, outcome) => {
    rpc.mockResolvedValue({ data: null, error: { code } });
    await expect(createServiceRequestProposalAction(input)).resolves.toEqual({ ok: false, code: outcome });
    expect(rpc).toHaveBeenCalledOnce();
    expect(revalidatePath).not.toHaveBeenCalled();
  });
});

describe("service request proposal readback", () => {
  it("loads only the selected accepted request for the signed-in provider", async () => {
    const maybeSingle = vi.fn()
      .mockResolvedValueOnce({ data: { id: requestId, service_offerings: { title: "Installation" } }, error: null })
      .mockResolvedValueOnce({ data: null, error: null })
      .mockResolvedValueOnce({ data: null, error: { code: "42P01" } });
    const eq = vi.fn().mockReturnThis();
    const select = vi.fn(() => ({ eq, maybeSingle }));
    from.mockReturnValue({ select });

    await expect(getAcceptedServiceRequestForProposal(requestId))
      .resolves.toEqual({ id: requestId, offeringTitle: "Installation" });
    await expect(getAcceptedServiceRequestForProposal(requestId)).resolves.toBeNull();
    await expect(getAcceptedServiceRequestForProposal(requestId)).resolves.toBeNull();
    expect(from).toHaveBeenCalledWith("service_offering_requests");
    expect(select).toHaveBeenCalledWith("id, service_offerings(title)");
    expect(eq).toHaveBeenCalledWith("id", requestId);
    expect(eq).toHaveBeenCalledWith("provider_id", "provider");
    expect(eq).toHaveBeenCalledWith("status", "accepted");
  });

  it("unlocks the CTA only after a successful no-row migration probe", async () => {
    const limit = vi.fn()
      .mockResolvedValueOnce({ error: { code: "42703" } })
      .mockResolvedValueOnce({ error: null });
    const select = vi.fn(() => ({ limit }));
    const from = vi.fn(() => ({ select }));
    const supabase = { from } as unknown as SupabaseClient;

    await expect(supportsServiceRequestProposals(supabase)).resolves.toBe(false);
    await expect(supportsServiceRequestProposals(supabase)).resolves.toBe(true);
    expect(from).toHaveBeenCalledWith("proposals");
    expect(select).toHaveBeenCalledWith("service_offering_request_id");
    expect(limit).toHaveBeenCalledWith(0);
  });

  it("separates an existing open proposal from no link and an unavailable read", async () => {
    const maybeSingle = vi.fn()
      .mockResolvedValueOnce({ data: { id: "existing", title: "Existing draft", amount_cents: 8050, status: "draft" }, error: null })
      .mockResolvedValueOnce({ data: null, error: null })
      .mockResolvedValueOnce({ data: null, error: { code: "42703" } });
    const query = { eq: vi.fn().mockReturnThis(), in: vi.fn().mockReturnThis(), maybeSingle };
    const supabase = { from: () => ({ select: () => query }) } as unknown as SupabaseClient;
    const read = () => findOpenServiceRequestProposal(supabase, "provider", requestId);

    await expect(read()).resolves.toMatchObject({ proposal: { id: "existing", status: "draft", amountCents: 8050 } });
    await expect(read()).resolves.toEqual({ proposal: null });
    await expect(read()).resolves.toBeNull();
    expect(query.eq).toHaveBeenCalledWith("owner_id", "provider");
    expect(query.eq).toHaveBeenCalledWith("service_offering_request_id", requestId);
    expect(query.in).toHaveBeenCalledWith("status", ["draft", "sent", "accepted"]);
  });

  it("keeps the linked proposal in the commercial view when it is outside the recent list", async () => {
    const select = () => ({
      order: () => ({ limit: async () => ({ data: [], error: null }) }),
    });
    from.mockReturnValue({ select });
    const proposal = {
      id: "older",
      number: null,
      title: "Older draft",
      amountCents: 8050,
      status: "draft" as const,
      validityUntil: null,
    };

    await expect(getMyCommercial(proposal)).resolves.toMatchObject({
      applied: true,
      proposals: [proposal],
    });
  });
});

describe("the service request card", () => {
  const acceptedRequest = {
    id: requestId,
    offeringId: "offering",
    offeringTitle: "Installation",
    status: "accepted" as const,
    message: null,
    responseNote: null,
    respondedAt: null,
    createdAt: "2026-11-28",
  };
  const incoming = { ...acceptedRequest, requesterDisplayName: null };

  function renderCard(
    proposalCta: string | null,
    status: ComponentProps<typeof MarketplaceLoopSection>["incoming"][number]["status"],
  ) {
    const labels = {
      proposalCta,
      status: { sent: "Sent", accepted: "Accepted", declined: "Declined", withdrawn: "Withdrawn" },
    } as MarketplaceLabels;
    return renderToStaticMarkup(createElement(MarketplaceLoopSection, {
      discoverable: [],
      outgoing: [acceptedRequest],
      incoming: [{ ...incoming, status }],
      needsMigration: false,
      labels,
    }));
  }

  it("links only the accepted provider row to the same request in the existing commercial page", () => {
    const markup = renderCard("Pasiūlymai", "accepted");
    expect(markup.match(/data-testid="marketplace-incoming-proposal-cta"/g)).toHaveLength(1);
    expect(markup).toContain(`/lt/dashboard/commercial?serviceRequest=${requestId}#proposals-panel`);
    expect(markup).toContain("marketplace-incoming-message-cta");
  });

  it("hides the proposal action before the migration and for requests awaiting acceptance", () => {
    expect(renderCard(null, "accepted")).not.toContain("marketplace-incoming-proposal-cta");
    expect(renderCard("Pasiūlymai", "sent")).not.toContain("marketplace-incoming-proposal-cta");
  });
});
