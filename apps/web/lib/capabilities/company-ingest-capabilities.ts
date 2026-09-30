import "server-only";

import { createHash, randomUUID } from "node:crypto";

import { z } from "zod";

import {
  COMPANY_CLASSES,
  SOURCE_KINDS,
  dedupeBatch,
  normalizeCompany,
  toRpcRow,
  type CompanyIngestRow,
  type NormalizedCompany,
} from "@/lib/marketplace/company-ingest-model";
import type { ExecResult } from "@/lib/conversation/executor-contract";

import {
  mintCapabilityConfirmation,
  verifyCapabilityConfirmation,
} from "./confirmable";
import type { CapabilityCaller, CapabilityDescriptor } from "./contract";

/**
 * MARKETPLACE COMPANY INGEST — real market companies into LabourMarket.ai as
 * DISCOVERED organizations (owner = NULL, claim_state = 'discovered').
 *
 *   PARSE → NORMALIZE → DEDUPLICATE (in the batch) → MATCH EXISTING (strong
 *   identifiers) → CLASSIFY → PREVIEW → CONFIRM → WRITE → READ-BACK → RECEIPT
 *
 * AUTHORITY is the `marketplace_company_ingest` platform capability
 * (`has_platform_capability`): a platform admin, an explicitly granted
 * operator, or the service actor — never an ordinary employer or member, and
 * never hard-coded to admins. ChatGPT only acts for the signed-in person, so
 * it can ingest only when THAT person holds the capability.
 *
 * IMPORT ≠ CLAIM: nothing here can set an owner or claim an organization.
 * A company already on the platform is never duplicated and its data is never
 * overwritten — it only gains sourced facts.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function asAny(c: CapabilityCaller["supabase"]): any {
  return c;
}

const rowSchema = z
  .object({
    ref: z.string().trim().max(40).optional(),
    name: z.string().trim().min(1).max(200),
    legalName: z.string().trim().max(200).nullish(),
    country: z.string().trim().max(60).nullish(),
    city: z.string().trim().max(120).nullish(),
    registrationCode: z.string().trim().max(60).nullish(),
    vat: z.string().trim().max(40).nullish(),
    website: z.string().trim().max(300).nullish(),
    publicEmail: z.string().trim().max(200).nullish(),
    publicPhone: z.string().trim().max(40).nullish(),
    sector: z.string().trim().max(120).nullish(),
    classes: z.array(z.enum(COMPANY_CLASSES)).max(7).optional(),
    demandSignal: z.string().trim().max(1000).nullish(),
    source: z
      .object({
        kind: z.enum(SOURCE_KINDS),
        ref: z.string().trim().max(500).nullish(),
        observedAt: z.string().trim().max(10),
      })
      .strict(),
  })
  .strict();

const ingestFields = z
  .object({
    rows: z.array(rowSchema).min(1).max(500),
    /** Row refs the caller explicitly decided to add despite a weak name
     *  match with an existing organization (possible duplicate). */
    includePossibleDuplicates: z.array(z.string().max(40)).max(500).optional(),
  })
  .strict();

type Plan = {
  ref: string;
  name: string;
  action: "create" | "add_facts_to_known" | "possible_duplicate" | "skip_invalid" | "skip_duplicate_in_batch";
  classes: readonly string[];
  knownOrganizationId?: string;
  possibleMatches?: string[];
  problems?: readonly string[];
  duplicateOf?: string;
  normalized: NormalizedCompany;
};

async function authority(caller: CapabilityCaller): Promise<ExecResult | null> {
  const { data, error } = await asAny(caller.supabase).rpc("has_platform_capability", {
    p_capability: "marketplace_company_ingest",
  });
  if (error) {
    return ["42883", "PGRST202"].includes(error.code ?? "")
      ? { ok: false, code: "needs_migration", message: "Company ingest is not enabled on this environment." }
      : { ok: false, code: "unavailable", message: "The authority check failed." };
  }
  if (data !== true) {
    return {
      ok: false,
      code: "not_authorized",
      message:
        "Importing market companies needs the marketplace_company_ingest capability (platform admin or an explicitly authorized marketplace operator). Importing never makes anyone a company's owner.",
    };
  }
  return null;
}

async function buildPlan(
  caller: CapabilityCaller,
  input: z.infer<typeof ingestFields>,
): Promise<{ ok: true; plan: Plan[] } | { ok: false; result: ExecResult }> {
  const normalized = input.rows.map((r, i) => normalizeCompany(r as CompanyIngestRow, i));
  const verdicts = dedupeBatch(normalized);
  const include = new Set(input.includePossibleDuplicates ?? []);

  const strongValues = [
    ...new Set(normalized.flatMap((n) => [n.registrationCode, n.vat, n.webDomain]).filter((v): v is string => !!v)),
  ];
  const nameKeys = [...new Set(normalized.map((n) => n.nameKey).filter(Boolean))];
  type IdRow = { organization_id: string; scheme: string; country: string; value_normalized: string };
  let ids: IdRow[] = [];
  if (strongValues.length + nameKeys.length > 0) {
    const { data, error } = await asAny(caller.supabase)
      .from("organization_identifiers")
      .select("organization_id, scheme, country, value_normalized")
      .in("value_normalized", [...strongValues, ...nameKeys]);
    if (error) {
      return {
        ok: false,
        result: ["42P01"].includes(error.code ?? "")
          ? { ok: false, code: "needs_migration", message: "Company ingest is not enabled on this environment." }
          : { ok: false, code: "unavailable", message: "The existing-company match read failed." },
      };
    }
    ids = (data ?? []) as IdRow[];
  }

  const plan = normalized.map((n, i): Plan => {
    const base = { ref: n.ref, name: n.displayName, classes: n.classes, normalized: n };
    const v = verdicts[i];
    if (v.kind === "invalid") return { ...base, action: "skip_invalid", problems: v.problems };
    if (v.kind === "duplicate_in_batch") return { ...base, action: "skip_duplicate_in_batch", duplicateOf: v.of };
    const strongHits = new Set(
      ids
        .filter(
          (x) =>
            (x.scheme === "registration_code" && x.value_normalized === n.registrationCode && x.country === (n.country ?? "")) ||
            (x.scheme === "vat" && x.value_normalized === n.vat) ||
            (x.scheme === "web_domain" && x.value_normalized === n.webDomain),
        )
        .map((x) => x.organization_id),
    );
    if (strongHits.size === 1) return { ...base, action: "add_facts_to_known", knownOrganizationId: [...strongHits][0] };
    if (strongHits.size > 1) return { ...base, action: "skip_invalid", problems: ["identifiers_match_two_organizations"] };
    const weakHits = [
      ...new Set(
        ids
          .filter((x) => x.scheme === "name_country" && x.value_normalized === n.nameKey && x.country === (n.country ?? ""))
          .map((x) => x.organization_id),
      ),
    ];
    if ((weakHits.length > 0 || v.kind === "possible_duplicate_in_batch") && !include.has(n.ref)) {
      return { ...base, action: "possible_duplicate", possibleMatches: weakHits };
    }
    return { ...base, action: "create" };
  });
  return { ok: true, plan };
}

function planHash(plan: Plan[]): string {
  return createHash("sha256")
    .update(JSON.stringify(plan.map((p) => [p.ref, p.action, p.knownOrganizationId ?? null, toRpcRow(p.normalized)])))
    .digest("hex");
}

function summarize(plan: Plan[]) {
  const count = (a: Plan["action"]) => plan.filter((p) => p.action === a).length;
  return {
    total: plan.length,
    create: count("create"),
    addFactsToKnown: count("add_facts_to_known"),
    possibleDuplicate: count("possible_duplicate"),
    invalid: count("skip_invalid"),
    duplicateInBatch: count("skip_duplicate_in_batch"),
    directEmployersOrContractors: plan.filter((p) =>
      p.classes.some((c) => c === "direct_employer" || c === "contractor" || c === "subcontractor"),
    ).length,
    agencies: plan.filter((p) => p.classes.some((c) => c === "staffing_agency" || c === "recruitment_agency")).length,
  };
}

const companyIngestPreview: CapabilityDescriptor = {
  id: "company.ingest.preview",
  kind: "draft",
  title: "Preview importing market companies (nothing is written)",
  description:
    "For a marketplace operator (the marketplace_company_ingest capability). " +
    "Takes up to 500 structured company rows parsed from CSV/XLSX/JSON — name, " +
    "optional legal name, country, city, registration code, VAT, website, " +
    "PUBLIC business email/phone, sector, market classes (direct_employer, " +
    "contractor, subcontractor, staffing_agency, recruitment_agency, client, " +
    "supplier — agencies stay a separate class), a real demand signal, and the " +
    "SOURCE (kind, reference, observed date — required). Normalizes, removes " +
    "duplicates inside the batch, matches companies ALREADY on the platform by " +
    "registration code / VAT / web domain (those only gain sourced facts — " +
    "never duplicated, never overwritten) and flags weak name matches as " +
    "possible duplicates (skipped unless listed in includePossibleDuplicates). " +
    "New companies become DISCOVERED organizations with NO owner — importing " +
    "never makes anyone a company's owner or representative. Returns the plan " +
    "and a one-time token; company.ingest.confirm writes it.",
  exposed: true,
  annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  inputSchema: ingestFields,
  run: async (caller, input): Promise<ExecResult> => {
    const parsed = ingestFields.parse(input);
    const denied = await authority(caller);
    if (denied) return denied;
    const built = await buildPlan(caller, parsed);
    if (!built.ok) return built.result;
    const token = mintCapabilityConfirmation({
      actionId: "company.ingest.confirm",
      input: { planHash: planHash(built.plan) },
      userId: caller.userId,
      stateFingerprint: `company-ingest:${planHash(built.plan)}`,
    });
    return {
      ok: true,
      data: {
        summary: summarize(built.plan),
        rows: built.plan.map((p) => ({
          ref: p.ref,
          name: p.name,
          action: p.action,
          classes: p.classes,
          knownOrganizationId: p.knownOrganizationId ?? null,
          possibleMatches: p.possibleMatches ?? [],
          problems: p.problems ?? [],
          duplicateOf: p.duplicateOf ?? null,
          identifiers: {
            country: p.normalized.country,
            registrationCode: p.normalized.registrationCode,
            vat: p.normalized.vat,
            webDomain: p.normalized.webDomain,
          },
        })),
        confirmationToken: token,
        note: "Nothing was written. company.ingest.confirm with the SAME rows and this token writes the plan above; any change to the rows or to what is already on the platform voids the token.",
      },
    };
  },
};

const companyIngestConfirmInput = ingestFields.extend({ confirmationToken: z.string().min(10) });

const companyIngestConfirm: CapabilityDescriptor = {
  id: "company.ingest.confirm",
  kind: "confirm",
  title: "Confirm importing the previewed market companies",
  description:
    "Recomputes the plan from the same rows, verifies the token (a change in " +
    "the rows or on the platform voids it), writes new companies as DISCOVERED " +
    "organizations (owner NULL) with identifiers, market roles and sourced " +
    "facts, adds sourced facts to companies already known, reads every written " +
    "organization back and returns the receipt (batch id, created, known, " +
    "skipped). Requires the marketplace_company_ingest capability.",
  exposed: true,
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  inputSchema: companyIngestConfirmInput,
  run: async (caller, input): Promise<ExecResult> => {
    const { confirmationToken, ...parsed } = companyIngestConfirmInput.parse(input);
    const denied = await authority(caller);
    if (denied) return denied;
    const built = await buildPlan(caller, parsed);
    if (!built.ok) return built.result;
    const hash = planHash(built.plan);
    const verdict = verifyCapabilityConfirmation({
      actionId: "company.ingest.confirm",
      token: confirmationToken,
      input: { planHash: hash },
      userId: caller.userId,
      currentStateFingerprint: `company-ingest:${hash}`,
    });
    if (!verdict.ok) {
      return { ok: false, code: "confirmation_rejected", message: `Confirmation token rejected (${verdict.reason}). Preview again.` };
    }
    const toWrite = built.plan.filter((p) => p.action === "create" || p.action === "add_facts_to_known");
    const batchId = randomUUID();
    if (toWrite.length === 0) {
      return { ok: true, data: { batchId, summary: summarize(built.plan), written: [], note: "Nothing to write." } };
    }
    const { data, error } = await asAny(caller.supabase).rpc("ingest_discovered_organizations_v1", {
      p_batch_id: batchId,
      p_rows: toWrite.map((p) => toRpcRow(p.normalized)),
    });
    if (error) {
      if (error.code === "42501") return { ok: false, code: "not_authorized", message: "The database refused: capability required." };
      if (["42883", "PGRST202"].includes(error.code ?? "")) {
        return { ok: false, code: "needs_migration", message: "Company ingest is not enabled on this environment." };
      }
      return { ok: false, code: "unavailable", message: "The import failed; nothing was written (one transaction)." };
    }
    const result = data as {
      created: number;
      known: number;
      conflict: number;
      rows: { ref: string; outcome: string; organization_id?: string }[];
    };
    // CANONICAL READ-BACK — the organizations as the database now holds them.
    const orgIds = [...new Set(result.rows.map((r) => r.organization_id).filter((v): v is string => !!v))];
    const { data: back } = orgIds.length
      ? await asAny(caller.supabase)
          .from("organizations")
          .select("id, display_name, claim_state, owner_profile_id, country")
          .in("id", orgIds)
      : { data: [] };
    const { count: factCount } = await asAny(caller.supabase)
      .from("organization_facts")
      .select("id", { count: "exact", head: true })
      .eq("import_batch_id", batchId);
    return {
      ok: true,
      data: {
        batchId,
        created: result.created,
        known: result.known,
        conflict: result.conflict,
        skipped: built.plan.length - toWrite.length,
        factsRecorded: factCount ?? null,
        rows: result.rows,
        readBack: ((back ?? []) as {
          id: string;
          display_name: string;
          claim_state: string;
          owner_profile_id: string | null;
          country: string | null;
        }[]).map((o) => ({
          id: o.id,
          name: o.display_name,
          claimState: o.claim_state,
          ownerAssigned: o.owner_profile_id !== null,
          country: o.country,
        })),
      },
    };
  },
};

export const COMPANY_INGEST_CAPABILITIES: readonly CapabilityDescriptor[] = [
  companyIngestPreview,
  companyIngestConfirm,
];
