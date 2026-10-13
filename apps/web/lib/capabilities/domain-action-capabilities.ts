import { createHash } from "node:crypto";

import { z } from "zod";

import type { ExecResult } from "@/lib/conversation/executor-contract";
import { CONTRACT_STATUSES, PROPOSAL_STATUSES } from "@/lib/commercial/commercial-model";
import { ABSENCE_TYPES } from "@/lib/leave/absences-model";
import { LISTING_KINDS, LISTING_STATUSES } from "@/lib/marketplace/listings-model";
import { SERVICE_OFFERING_STATUSES } from "@/lib/services/service-offerings-shared";
import { RESPOND_DECISIONS } from "@/lib/marketplace/service-requests-shared";
import { REVIEW_DECISIONS } from "@/lib/journal/review-status";
import { LIVE_ROLE_IDS } from "@/lib/config/roles";

import type { CapabilityAnnotations, CapabilityCaller, CapabilityDescriptor } from "./contract";
import { mintCapabilityConfirmation, verifyCapabilityConfirmation } from "./confirmable";
import { scopedCallerRefusal } from "./conversation-action-bridge";

/**
 * DOMAIN ACTIONS — the web's typed canonical actions that neither the web chat
 * registry nor an earlier capability covered: organization identity and legal
 * data, the universal marketplace (service offerings, listings, service
 * requests), commercial proposals and contracts, bookings, notifications,
 * leave, the hours review, and the reports the web shows.
 *
 * NO NEW DOMAIN LOGIC. Each handler is ONE call to the function the web page
 * itself calls (a "use server" action or its server-only core), run through
 * the bearer caller scope as the same person under the same RLS. Validation
 * that the canonical function performs (closed enums, slugs, ownership, legal
 * checks) is not duplicated here; the zod schema is only the tool's shape.
 *
 * OPERATION CLASSES (the owner brief's A/B/C):
 *  - A `read`            — answers, writes nothing.
 *  - B `execute`         — a reversible, own-data change the web also makes in
 *                          one click (create a DRAFT offering, mark read, set a
 *                          preference, request leave).
 *  - C `_draft`/`_confirm` — anything that publishes, decides for someone
 *                          else, sends, deletes or sets legal identity. The
 *                          draft writes nothing and returns a one-time token
 *                          bound to the CURRENT state of what the write
 *                          changes (a hash of the canonical read the web shows
 *                          for it), so a confirm cannot run against a state the
 *                          person did not see, and a spent token is stale.
 */

const READ: CapabilityAnnotations = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false };

/** One result vocabulary for the two shapes the web actions return. */
export function normalizeActionResult(raw: unknown, okData?: Record<string, unknown>): ExecResult {
  const r = (raw ?? {}) as Record<string, unknown>;
  if (typeof r.ok === "boolean") {
    if (r.ok) return { ok: true, data: { ...r, ...okData } };
    const code = typeof r.code === "string" ? r.code.replace(/-/g, "_") : "error";
    return { ok: false, code, ...(typeof r.message === "string" ? { message: r.message } : {}) };
  }
  const kind = typeof r.kind === "string" ? r.kind : "error";
  switch (kind) {
    case "ok":
    case "persisted":
      return { ok: true, data: { ...r, ...okData } };
    case "not-authed":
    case "not-authenticated":
      return { ok: false, code: "auth" };
    case "needs-migration":
    case "feature_unavailable":
      return { ok: false, code: "needs_migration", message: "This part of the platform is not enabled yet. Nothing was changed." };
    case "not-owner":
    case "not-permitted":
      return { ok: false, code: "not_authorized", message: "The caller may not do this for that record. Nothing was changed." };
    case "no-company":
      return {
        ok: false,
        code: "no_organization_context",
        message: "The caller is not acting for an organization they manage (context_list / context_switch). Nothing was changed.",
      };
    case "error":
    case "unexpected_error":
      return { ok: false, code: "unavailable", message: "The platform could not complete this. Nothing is assumed to have changed — read it back." };
    default: {
      // invalid (+field), duplicate, inactive, legal-check-required,
      // restricted, invalid-country, multiple-companies…: the canonical
      // function's own refusal, passed through by name.
      const { kind: _k, ...rest } = r;
      return { ok: false, code: kind.replace(/-/g, "_"), ...(Object.keys(rest).length ? { message: JSON.stringify(rest) } : {}) };
    }
  }
}

async function guarded(caller: CapabilityCaller, fn: () => Promise<ExecResult>): Promise<ExecResult> {
  const refused = await scopedCallerRefusal(caller);
  if (refused) return refused;
  return fn();
}

function read<S extends z.ZodTypeAny>(
  id: string,
  title: string,
  description: string,
  inputSchema: S,
  load: (input: z.infer<S>, caller: CapabilityCaller) => Promise<unknown>,
): CapabilityDescriptor {
  return {
    id,
    kind: "read",
    title,
    description: `${description} Same read the web page uses, under the caller's own permissions. Writes nothing.`,
    exposed: true,
    annotations: READ,
    inputSchema,
    run: (caller, input) =>
      guarded(caller, async () => {
        const result = await load(inputSchema.parse(input), caller);
        const r = (result ?? {}) as Record<string, unknown>;
        // A read's own failure states are never an empty answer.
        if (typeof r.kind === "string" && r.kind !== "ok" && r.kind !== "ready") {
          const n = normalizeActionResult(result);
          if (!n.ok) return n;
        }
        if (r.ok === false) return normalizeActionResult(result);
        // Some reads report their state in `status` (leave balances,
        // timesheets): a non-ok status is a failure, never an empty answer.
        if (typeof r.status === "string" && !["ok", "ready", "applied"].includes(r.status)) {
          const n = normalizeActionResult({ kind: r.status });
          if (!n.ok) return n;
        }
        return { ok: true, data: Array.isArray(result) ? { items: result } : { ...r } };
      }),
  };
}

function oneStep<S extends z.ZodTypeAny>(spec: {
  id: string;
  title: string;
  description: string;
  inputSchema: S;
  overwrites?: boolean;
  run: (input: z.infer<S>, caller: CapabilityCaller) => Promise<unknown>;
}): CapabilityDescriptor {
  return {
    id: spec.id,
    kind: "execute",
    title: spec.title,
    description: `${spec.description} Runs immediately: a reversible change the web also makes in one step.`,
    exposed: true,
    annotations: { readOnlyHint: false, destructiveHint: !!spec.overwrites, idempotentHint: !!spec.overwrites, openWorldHint: false },
    inputSchema: spec.inputSchema,
    run: (caller, input) => guarded(caller, async () => normalizeActionResult(await spec.run(spec.inputSchema.parse(input), caller))),
  };
}

/** sha256 of the canonical read a write changes — the state a token binds to. */
async function stateDigest(read: () => Promise<unknown>): Promise<string | null> {
  try {
    return createHash("sha256").update(JSON.stringify(await read())).digest("hex").slice(0, 32);
  } catch {
    // UNREADABLE IS NOT A STATE: a token bound to "unreadable" would match any
    // other failed read and confirm with no state binding at all.
    return null;
  }
}

/** The active workspace, so a token minted in one organization cannot be
 *  spent after switching to another (the bridge's dispatcher tokens bind it
 *  the same way). */
async function activeWorkspaceId(): Promise<string | null> {
  try {
    const { getWorkspaceContext } = await import("@/lib/company/active-organization");
    return (await getWorkspaceContext()).activeWorkspaceId;
  } catch {
    return null;
  }
}

const STATE_UNREADABLE: ExecResult = {
  ok: false,
  code: "unavailable",
  message: "The current state could not be read, so no confirmation can be bound to it. Nothing was changed — try again.",
};

function confirmed<S extends z.ZodObject>(spec: {
  id: string;
  title: string;
  description: string;
  inputSchema: S;
  destructive?: boolean;
  /** The canonical read whose answer the write changes. */
  state: (input: z.infer<S>, caller: CapabilityCaller) => Promise<unknown>;
  run: (input: z.infer<S>, caller: CapabilityCaller) => Promise<unknown>;
}): [CapabilityDescriptor, CapabilityDescriptor] {
  const draftId = `${spec.id}_draft`;
  const confirmId = `${spec.id}_confirm`;
  const confirmTool = confirmId.replace(/\./g, "_");
  const confirmInput = spec.inputSchema.extend({ confirmationToken: z.string().min(10) });
  const fingerprint = async (input: z.infer<S>, caller: CapabilityCaller): Promise<string | null> => {
    const [digest, workspace] = await Promise.all([stateDigest(() => spec.state(input, caller)), activeWorkspaceId()]);
    return digest === null || workspace === null ? null : `${spec.id}:${workspace}:${digest}`;
  };
  return [
    {
      id: draftId,
      kind: "draft",
      title: `Prepare: ${spec.title}`,
      description:
        `${spec.description} PREPARE step: validates the shape and returns a one-time token bound to the current state. ` +
        `NOTHING is written. Show the person what will happen, then call ${confirmTool} with the same input plus confirmationToken.`,
      exposed: true,
      annotations: READ,
      inputSchema: spec.inputSchema,
      run: (caller, raw) =>
        guarded(caller, async () => {
          const input = spec.inputSchema.parse(raw);
          const fp = await fingerprint(input, caller);
          if (fp === null) return STATE_UNREADABLE;
          const token = mintCapabilityConfirmation({
            actionId: confirmId,
            input,
            userId: caller.userId,
            stateFingerprint: fp,
          });
          return {
            ok: true,
            data: {
              preview: { action: spec.title, input },
              confirmationToken: token,
              confirmWith: confirmTool,
              note: `Nothing was written. Confirming requires ${confirmTool} with this exact input and token.`,
            },
          };
        }),
    },
    {
      id: confirmId,
      kind: "confirm",
      title: `Confirm: ${spec.title}`,
      description: `Carries out "${spec.title}" after its prepare step: verifies the token against the caller, the exact input and the CURRENT state, then runs the same canonical action the web runs, once.`,
      exposed: true,
      annotations: { readOnlyHint: false, destructiveHint: !!spec.destructive, idempotentHint: true, openWorldHint: false },
      inputSchema: confirmInput,
      run: (caller, raw) =>
        guarded(caller, async () => {
          const { confirmationToken, ...rest } = confirmInput.parse(raw) as z.infer<S> & { confirmationToken: string };
          const input = spec.inputSchema.parse(rest);
          const fp = await fingerprint(input, caller);
          if (fp === null) return STATE_UNREADABLE;
          const verdict = verifyCapabilityConfirmation({
            actionId: confirmId,
            token: confirmationToken,
            input,
            userId: caller.userId,
            currentStateFingerprint: fp,
          });
          if (!verdict.ok) {
            return {
              ok: false,
              code: "confirmation_rejected",
              message: `Confirmation token rejected (${verdict.reason}): the state changed, it was already used, or the input differs. Prepare again. Nothing was changed.`,
            };
          }
          return normalizeActionResult(await spec.run(input, caller));
        }),
    },
  ];
}

const uuid = z.string().uuid();
const isoDay = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const country = z.string().length(2);
const none = z.object({}).strict();

// ── shapes (tool shape only; the canonical function validates the rest) ────
const companySetup = z
  .object({
    /** Omit to CREATE a new company; give an id to EDIT a company you own. */
    companyId: uuid.optional(),
    legalName: z.string().trim().min(2).max(200),
    companyType: z.string().max(40).optional(),
    country: country.optional(),
    registrationCode: z.string().max(60).optional(),
    address: z.string().max(300).optional(),
    website: z.string().max(200).optional(),
    contactEmail: z.string().max(200).optional(),
    contactPhone: z.string().max(60).optional(),
    requesterRole: z.string().max(80).optional(),
  })
  .strict();

const serviceOffering = z
  .object({
    title: z.string().trim().min(2).max(200),
    description: z.string().max(4000).nullable().optional(),
    categorySlug: z.string().max(64).nullable().optional(),
    locationCountry: country.nullable().optional(),
    remote: z.boolean().optional(),
    rateText: z.string().max(200).nullable().optional(),
  })
  .strict();

const listing = z
  .object({
    listingKind: z.enum(LISTING_KINDS),
    category: z.string().max(64),
    title: z.string().trim().min(2).max(200),
    description: z.string().max(4000).nullable().optional(),
    locationCountry: country.nullable().optional(),
    locationLabel: z.string().max(200).nullable().optional(),
    priceText: z.string().max(200).nullable().optional(),
    priceAmount: z.number().nonnegative().nullable().optional(),
    currency: z.string().length(3).nullable().optional(),
    quantity: z.number().nonnegative().nullable().optional(),
    unit: z.string().max(40).nullable().optional(),
    expiresAt: z.string().max(40).nullable().optional(),
    organizationId: uuid.nullable().optional(),
    projectId: uuid.nullable().optional(),
  })
  .strict();

// ── lazy module loaders (keep the MCP route's cold start small) ────────────
const companySetupMod = () => import("@/lib/company/company-setup");
const offeringsMod = () => import("@/lib/services/service-offerings");
const requestsMod = () => import("@/lib/marketplace/service-requests");
const listingsMod = () => import("@/lib/marketplace/listings");
const commercialMod = () => import("@/lib/commercial/commercial-actions");
const commercialRead = () => import("@/lib/commercial/commercial");
const bookingMod = () => import("@/lib/booking/booking-actions");
const absenceMod = () => import("@/lib/leave/absences-actions");
const absenceRead = () => import("@/lib/leave/absences");

export const DOMAIN_ACTION_CAPABILITIES: readonly CapabilityDescriptor[] = [
  // ── ORGANIZATION: identity, legal data, activity, public profile ──────────
  read("organization.companies.list", "Companies I own", "The companies the caller created/owns, with their legal fields as recorded (legal name, type, country, registration code, verification status).", none, async () =>
    (await companySetupMod()).listOwnedCompanies(),
  ),
  ...confirmed({
    id: "organization.setup",
    title: "Save company legal/registry data",
    description:
      "Creates a company (no companyId) or edits the legal and registry data of a company the caller owns: legal name, company type, country, registration code, address, website, contact e-mail and phone — the same save as the company settings page. A VERIFIED company's legal fields stay locked. Saved as active (unverified); never submitted for manual review from here.",
    inputSchema: companySetup,
    state: async () => (await companySetupMod()).listOwnedCompanies(),
    run: async (input) =>
      (await companySetupMod()).saveCompanySetup({ ...input, companyId: input.companyId ?? null, submit: false }),
  }),
  oneStep({
    id: "organization.description.set",
    title: "Set the organization description",
    description: "Replaces the description of the organization the caller is acting for (owner/manager).",
    inputSchema: z.object({ description: z.string().max(4000) }).strict(),
    overwrites: true,
    run: async ({ description }, caller) =>
      (await import("@/lib/company/description-actions")).saveOrganizationDescriptionAction(description, caller.locale),
  }),
  read("organization.capabilities.get", "Organization activity categories", "The capability/activity categories an organization has declared (employer, agency, education provider, client …).", z.object({ organizationId: uuid }).strict(), async ({ organizationId }) => ({
    organizationId,
    capabilities: await (await import("@/lib/organizations/capability-read")).readOrganizationCapabilities(organizationId),
  })),
  ...confirmed({
    id: "organization.capabilities.declare",
    title: "Declare organization activity categories",
    description:
      "Adds self-declarable activity/capability categories to an organization the caller governs (additive — this never removes one). The same declaration as the company settings page.",
    inputSchema: z.object({ organizationId: uuid, capabilities: z.array(z.string().max(64)).min(1).max(20) }).strict(),
    state: async ({ organizationId }) => (await import("@/lib/organizations/capability-read")).readOrganizationCapabilities(organizationId),
    run: async ({ organizationId, capabilities }) =>
      (await import("@/lib/organizations/capability-actions")).declareOrganizationCapabilities(organizationId, capabilities),
  }),
  read("organization.public_profile.get", "Public business profile settings", "Whether an organization's public business page is published, its slug, tagline and public contacts.", z.object({ organizationId: uuid }).strict(), async ({ organizationId }) =>
    (await import("@/lib/company/public-profile")).getBusinessPublicSettings(organizationId),
  ),
  ...confirmed({
    id: "organization.public_profile.set",
    title: "Publish or unpublish the public business page",
    description: "Publishes (enabled=true, with a slug) or unpublishes the organization's public business page at /business/<slug>. Public on the internet once published.",
    inputSchema: z
      .object({
        organizationId: uuid,
        enabled: z.boolean(),
        slug: z.string().max(50).nullable().optional(),
        tagline: z.string().max(200).nullable().optional(),
        contactEmail: z.string().max(200).nullable().optional(),
        contactPhone: z.string().max(60).nullable().optional(),
      })
      .strict(),
    state: async ({ organizationId }) => (await import("@/lib/company/public-profile")).getBusinessPublicSettings(organizationId),
    run: async ({ organizationId, ...rest }) =>
      (await import("@/lib/company/public-profile")).setBusinessPublicProfileAction({ orgId: organizationId, ...rest }),
  }),

  // ── MARKETPLACE: service offerings ────────────────────────────────────────
  read("service_offering.list_own", "My service offerings", "The caller's own service offerings in every status (draft, active, paused).", none, async () => (await offeringsMod()).listOwnServiceOfferings()),
  read("service_offering.discover", "Discover services", "Active service offerings other providers publish, optionally in one country.", z.object({ country: country.optional() }).strict(), async ({ country: c }) =>
    (await requestsMod()).listDiscoverableOfferings(c ? { country: c.toUpperCase() } : undefined),
  ),
  oneStep({
    id: "service_offering.create",
    title: "Create a service offering (draft)",
    description: "Creates a service offering as a DRAFT (not visible to anyone until published with service_offering_status_set_draft/confirm).",
    inputSchema: serviceOffering,
    run: async (input) => (await offeringsMod()).createServiceOffering(input),
  }),
  oneStep({
    id: "service_offering.update",
    title: "Edit a service offering",
    description: "Replaces the fields of one of the caller's own service offerings.",
    inputSchema: serviceOffering.extend({ offeringId: uuid }),
    overwrites: true,
    run: async ({ offeringId, ...input }) => (await offeringsMod()).updateServiceOffering(offeringId, input),
  }),
  ...confirmed({
    id: "service_offering.status_set",
    title: "Publish, pause or unpublish a service",
    description: "Sets one of the caller's service offerings to active (PUBLISHED in the marketplace), paused or draft.",
    inputSchema: z.object({ offeringId: uuid, status: z.enum(SERVICE_OFFERING_STATUSES) }).strict(),
    state: async () => (await offeringsMod()).listOwnServiceOfferings(),
    run: async ({ offeringId, status }) => (await offeringsMod()).setServiceOfferingStatus(offeringId, status),
  }),
  ...confirmed({
    id: "service_offering.delete",
    title: "Delete a service offering",
    description: "Deletes one of the caller's service offerings.",
    inputSchema: z.object({ offeringId: uuid }).strict(),
    destructive: true,
    state: async () => (await offeringsMod()).listOwnServiceOfferings(),
    run: async ({ offeringId }) => (await offeringsMod()).deleteServiceOffering(offeringId),
  }),

  // ── MARKETPLACE: service requests (enquiry → answer) ──────────────────────
  read("service_request.outgoing.list", "Service requests I sent", "Requests the caller sent to service providers and their answers.", none, async () => (await requestsMod()).listOutgoingRequests()),
  read("service_request.incoming.list", "Service requests I received", "Requests other people sent to the caller's service offerings.", none, async () => (await requestsMod()).listIncomingRequests()),
  ...confirmed({
    id: "service_request.create",
    title: "Request a service",
    description: "Sends a request to a provider's active service offering, with an optional message. The provider is notified.",
    inputSchema: z.object({ offeringId: uuid, message: z.string().max(2000).optional() }).strict(),
    state: async () => (await requestsMod()).listOutgoingRequests(),
    run: async ({ offeringId, message }) => (await requestsMod()).requestServiceOffering(offeringId, message),
  }),
  ...confirmed({
    id: "service_request.respond",
    title: "Answer a service request",
    description: "Accepts or declines a request someone sent to one of the caller's service offerings, with an optional note.",
    inputSchema: z.object({ requestId: uuid, decision: z.enum(RESPOND_DECISIONS), note: z.string().max(2000).optional() }).strict(),
    state: async () => (await requestsMod()).listIncomingRequests(),
    run: async ({ requestId, decision, note }) => (await requestsMod()).respondToRequest(requestId, decision, note),
  }),
  ...confirmed({
    id: "service_request.withdraw",
    title: "Withdraw a service request",
    description: "Withdraws a request the caller sent.",
    inputSchema: z.object({ requestId: uuid }).strict(),
    state: async () => (await requestsMod()).listOutgoingRequests(),
    run: async ({ requestId }) => (await requestsMod()).withdrawRequest(requestId),
  }),

  // ── MARKETPLACE: listings (sale / rental / wanted) ────────────────────────
  read("marketplace_listing.list_own", "My marketplace listings", "The caller's own listings (sale, rental, wanted) in every status.", none, async () => (await listingsMod()).listMyMarketplaceListings()),
  read(
    "marketplace_listing.discover",
    "Discover marketplace listings",
    "Active listings in the universal marketplace, optionally filtered by domain, category or listing kind.",
    z.object({ domain: z.string().max(64).optional(), category: z.string().max(64).optional(), listingKind: z.enum(LISTING_KINDS).optional() }).strict(),
    async (f) => (await listingsMod()).discoverMarketplaceListings(f),
  ),
  oneStep({
    id: "marketplace_listing.create",
    title: "Create a marketplace listing (draft)",
    description: "Creates a sale, rental or wanted listing as a draft. Publish with marketplace_listing_status_set_draft/confirm.",
    inputSchema: listing,
    run: async (input) => (await listingsMod()).createMarketplaceListingAction(input),
  }),
  oneStep({
    id: "marketplace_listing.update",
    title: "Edit a marketplace listing",
    description: "Replaces the fields of one of the caller's listings. If the listing is published and the policy asks for a legal check, the refusal names it.",
    inputSchema: listing.extend({ listingId: uuid }),
    overwrites: true,
    run: async ({ listingId, ...input }) => (await listingsMod()).updateMarketplaceListingAction(listingId, input),
  }),
  ...confirmed({
    id: "marketplace_listing.status_set",
    title: "Publish, pause or close a listing",
    description:
      "Sets one of the caller's listings to active (PUBLISHED), paused, closed or draft. If the category requires a legal check before publishing, the first attempt is refused with legal_check_required; repeat with legalCheckAcknowledged=true only after the person confirms it.",
    inputSchema: z.object({ listingId: uuid, status: z.enum(LISTING_STATUSES), legalCheckAcknowledged: z.boolean().optional() }).strict(),
    state: async () => (await listingsMod()).listMyMarketplaceListings(),
    run: async ({ listingId, status, legalCheckAcknowledged }) =>
      (await listingsMod()).setMarketplaceListingStatusAction(listingId, status, legalCheckAcknowledged ?? false),
  }),
  ...confirmed({
    id: "marketplace_listing.delete",
    title: "Delete a marketplace listing",
    description: "Deletes one of the caller's listings.",
    inputSchema: z.object({ listingId: uuid }).strict(),
    destructive: true,
    state: async () => (await listingsMod()).listMyMarketplaceListings(),
    run: async ({ listingId }) => (await listingsMod()).deleteMarketplaceListingAction(listingId),
  }),

  // ── COMMERCIAL: proposals and contracts ───────────────────────────────────
  read("commercial.get", "Proposals and contracts", "The caller's commercial proposals and contracts with their status and amounts.", none, async () => (await commercialRead()).getMyCommercial()),
  oneStep({
    id: "proposal.create",
    title: "Create a commercial proposal (draft)",
    description: "Creates a proposal record in draft (amount in cents), optionally linked to a customer need or a project. Mark it sent/accepted with proposal_status_set_draft/confirm.",
    inputSchema: z.object({ title: z.string().trim().min(2).max(200), amountCents: z.number().int().min(0), customerRequestId: uuid.optional(), projectId: uuid.optional() }).strict(),
    run: async (input) => (await commercialMod()).createProposalAction(input),
  }),
  ...confirmed({
    id: "proposal.status_set",
    title: "Change a proposal's status",
    description: "Marks a proposal draft, sent, accepted, rejected or withdrawn (a rejection may carry a reason). Records the status; it does not e-mail anyone.",
    inputSchema: z.object({ proposalId: uuid, status: z.enum(PROPOSAL_STATUSES), rejectionReason: z.string().max(1000).optional() }).strict(),
    state: async () => (await commercialRead()).getMyCommercial(),
    run: async (input) => (await commercialMod()).setProposalStatusAction(input),
  }),
  ...confirmed({
    id: "proposal.delete",
    title: "Delete a proposal",
    description: "Deletes a proposal record.",
    inputSchema: z.object({ proposalId: uuid }).strict(),
    destructive: true,
    state: async () => (await commercialRead()).getMyCommercial(),
    run: async (input) => (await commercialMod()).deleteProposalAction(input),
  }),
  oneStep({
    id: "contract.create",
    title: "Record a contract (draft)",
    description: "Records a contract in draft (value in cents), optionally from a proposal or for a project, with the parties and a signed-document reference.",
    inputSchema: z
      .object({
        title: z.string().trim().min(2).max(200),
        valueCents: z.number().int().min(0),
        proposalId: uuid.optional(),
        projectId: uuid.optional(),
        parties: z.string().max(500).optional(),
        signedDocumentRef: z.string().max(500).optional(),
      })
      .strict(),
    run: async (input) => (await commercialMod()).createContractAction(input),
  }),
  ...confirmed({
    id: "contract.status_set",
    title: "Change a contract's status",
    description: "Marks a contract draft, active, completed or cancelled.",
    inputSchema: z.object({ contractId: uuid, status: z.enum(CONTRACT_STATUSES) }).strict(),
    state: async () => (await commercialRead()).getMyCommercial(),
    run: async (input) => (await commercialMod()).setContractStatusAction(input),
  }),
  ...confirmed({
    id: "contract.delete",
    title: "Delete a contract record",
    description: "Deletes a contract record.",
    inputSchema: z.object({ contractId: uuid }).strict(),
    destructive: true,
    state: async () => (await commercialRead()).getMyCommercial(),
    run: async (input) => (await commercialMod()).deleteContractAction(input),
  }),

  // ── BOOKINGS (job proposals between an employer and a worker) ─────────────
  read("booking.list", "My bookings", "Job proposals (bookings) the caller sent or received, with their status and dates.", none, async () => (await bookingMod()).listMyBookings()),
  ...confirmed({
    id: "booking.withdraw",
    title: "Withdraw a booking proposal",
    description: "Withdraws a booking the caller proposed, with an optional reason. The worker is notified.",
    inputSchema: z.object({ bookingId: uuid, reasonKind: z.string().max(40).optional(), reasonNote: z.string().max(1000).optional() }).strict(),
    state: async () => (await bookingMod()).listMyBookings(),
    run: async (input, caller) => (await bookingMod()).withdrawBookingAction({ ...input, locale: caller.locale }),
  }),
  ...confirmed({
    id: "booking.reschedule",
    title: "Reschedule a booking",
    description: "Proposes new dates for a booking. The other party is notified.",
    inputSchema: z.object({ bookingId: uuid, startDate: isoDay, endDate: isoDay.nullable().optional(), note: z.string().max(1000).nullable().optional() }).strict(),
    state: async () => (await bookingMod()).listMyBookings(),
    run: async (input, caller) => (await bookingMod()).rescheduleBookingAction({ ...input, locale: caller.locale }),
  }),
  oneStep({
    id: "booking.deadline_set",
    title: "Set a booking's answer deadline",
    description: "Sets by when the worker should answer a booking the caller proposed.",
    inputSchema: z.object({ bookingId: uuid, deadline: isoDay }).strict(),
    overwrites: true,
    run: async (input, caller) => (await bookingMod()).setBookingDeadlineAction({ ...input, locale: caller.locale }),
  }),

  // ── NOTIFICATIONS ─────────────────────────────────────────────────────────
  read("notification.list", "My notifications", "The caller's notifications, newest first, with read state and the screen each one is about.", z.object({ limit: z.number().int().min(1).max(100).optional() }).strict(), async ({ limit }) =>
    (await import("@/lib/notifications/spine")).getDurableNotifications(limit),
  ),
  oneStep({
    id: "notification.mark_read",
    title: "Mark a notification read",
    description: "Marks one of the caller's notifications read.",
    inputSchema: z.object({ notificationId: uuid }).strict(),
    overwrites: true,
    run: async ({ notificationId }) => (await import("@/lib/notifications/events-actions")).markNotificationEventReadAction(notificationId),
  }),
  oneStep({
    id: "notification.mark_all_read",
    title: "Mark all notifications read",
    description: "Marks all of the caller's notifications read.",
    inputSchema: none,
    overwrites: true,
    run: async () => (await import("@/lib/notifications/events-actions")).markAllNotificationEventsReadAction(),
  }),
  oneStep({
    id: "notification.preference_set",
    title: "Turn a notification on or off",
    description: "Turns one notification type on or off for in-app or e-mail delivery (the notification settings page).",
    inputSchema: z.object({ notificationType: z.string().max(80), channel: z.enum(["in_app", "email"]), enabled: z.boolean() }).strict(),
    overwrites: true,
    run: async (input) => (await import("@/lib/notifications/preferences-actions")).setNotificationPreferenceAction(input),
  }),

  // ── LEAVE / ABSENCE ───────────────────────────────────────────────────────
  read("absence.mine.list", "My leave and absences", "The caller's own absence requests and their decisions.", none, async () => (await absenceRead()).getMyAbsences()),
  read("absence.pending_review.list", "Leave waiting for my decision", "Absence requests of workers the caller manages that wait for a decision.", none, async () => (await absenceRead()).getManagerPendingAbsences()),
  read("leave.balances.get", "My leave balances", "The caller's leave balances per policy.", none, async () => (await import("@/lib/leave/balances")).getMyLeaveBalances()),
  ...confirmed({
    id: "absence.request",
    title: "Request leave",
    description: "Requests an absence (annual leave, sickness, unpaid, training, other) for a worker record the caller holds. The manager is notified, so it is confirmed first. Cancel with absence_cancel_draft/confirm.",
    inputSchema: z
      .object({ workerId: uuid, absenceType: z.enum(ABSENCE_TYPES), startDate: isoDay, endDate: isoDay, halfDay: z.boolean().optional(), note: z.string().max(500).optional() })
      .strict(),
    state: async () => (await absenceRead()).getMyAbsences(),
    run: async (input) => (await absenceMod()).requestAbsenceAction(input),
  }),
  ...confirmed({
    id: "absence.review",
    title: "Approve or reject leave",
    description: "A manager approves or rejects one pending absence request. The worker is notified.",
    inputSchema: z.object({ absenceId: uuid, decision: z.enum(["approved", "rejected"]) }).strict(),
    state: async () => (await absenceRead()).getManagerPendingAbsences(),
    run: async (input) => (await absenceMod()).reviewAbsenceAction(input),
  }),
  ...confirmed({
    id: "absence.cancel",
    title: "Cancel a leave request",
    description: "Cancels one of the caller's absence requests.",
    inputSchema: z.object({ absenceId: uuid }).strict(),
    state: async () => (await absenceRead()).getMyAbsences(),
    run: async (input) => (await absenceMod()).cancelAbsenceAction(input),
  }),

  // ── HOURS: review of logged work ──────────────────────────────────────────
  ...confirmed({
    id: "journal.review",
    title: "Approve or reject logged work",
    description:
      "A manager decides on one logged work entry from journal_review_queue_get (approve, reject or ask for changes), with an optional note — the same review as the web inbox. Self-review is refused by the platform.",
    inputSchema: z.object({ entryId: uuid, decision: z.enum(REVIEW_DECISIONS), note: z.string().max(2000).optional() }).strict(),
    state: async ({ entryId }, caller) => {
      const { data, error } = await (caller.supabase as unknown as { rpc: (n: string) => Promise<{ data: unknown; error: unknown }> }).rpc(
        "reviewable_journal_entry_ids",
      );
      if (error) return "unreadable";
      // Same row shape handling as journal.review_queue.get.
      const ids = (Array.isArray(data) ? data : []).map((r: unknown) =>
        typeof r === "string"
          ? r
          : ((r as { reviewable_journal_entry_ids?: string; id?: string } | null)?.reviewable_journal_entry_ids ??
            (r as { id?: string } | null)?.id ??
            null),
      );
      return `${entryId}:${ids.includes(entryId) ? "reviewable" : "not-reviewable"}`;
    },
    run: async ({ entryId, decision, note }, caller) => {
      const fd = new FormData();
      fd.set("entry_id", entryId);
      fd.set("decision", decision);
      if (note) fd.set("note", note);
      fd.set("locale", caller.locale);
      return (await import("@/lib/journal/review-actions")).reviewJournalEntry(null, fd);
    },
  }),

  // ── REPORTS / EXPORT (as data; the CSV routes stay browser downloads) ──────
  read(
    "reports.get",
    "Reports",
    "The reports hub for a role the caller holds (worker, company, agency, customer): project counts, work-window report, evidence report and finance summary as the web reports page shows them.",
    z.object({ role: z.enum(LIVE_ROLE_IDS) }).strict(),
    async ({ role }) => (await import("@/lib/reports/reports-hub")).getReportsView(role),
  ),
  read("timesheets.overview.get", "Timesheets", "The caller's timesheets and their approval state.", none, async () => (await import("@/lib/timesheets/timesheets")).getTimesheetsOverview()),
  read("finance.records.list", "Finance records", "The caller's finance records (costs, invoices, expenses) and the summary.", none, async () => {
    const f = await import("@/lib/finance/finance");
    const [records, summary] = await Promise.all([f.listMyFinanceRecords(), f.getFinanceSummary()]);
    return { kind: "ok", records, summary };
  }),
  read("cv.verified.get", "My verified CV (export data)", "The caller's verified Living CV as structured data — the same content the printable CV page renders — with each item's evidence state.", none, async () =>
    (await import("@/lib/cv-export/verified-cv")).buildVerifiedCv(),
  ),
];
