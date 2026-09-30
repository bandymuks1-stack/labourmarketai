import "server-only";

import { z } from "zod";

import { requireEmployerCompanyForCaller } from "@/lib/company/employer-company-context";
import { hasOrganizationCapability } from "@/lib/company/role-capabilities";
import { listActiveCompanyWorkers } from "@/lib/company/company-workers";
import {
  runScoutingCore,
  setShortlistCore,
  type ShortlistStatus,
  type ShortlistWriteResult,
} from "@/lib/scouting/scouting";
import { isSyntheticFixtureLabel } from "@/lib/qa/synthetic-fixture";
import type { ExecResult } from "@/lib/conversation/executor-contract";

import {
  mintCapabilityConfirmation,
  verifyCapabilityConfirmation,
} from "./confirmable";
import type { CapabilityCaller, CapabilityDescriptor } from "./contract";
import { demandContextRefusal } from "./employer-context-refusal";

/**
 * MARKETPLACE — the meeting of a need and the people who could meet it, for
 * an authorized assistant.
 *
 *   candidate.search          the SAME scouting core the web page runs
 *                             (`runScoutingCore`: staged retrieval, match-v1,
 *                             actionability) — not a second search
 *   shortlist.get / add / remove
 *                             the SAME shortlist write core
 *                             (`setShortlistCore`), draft → confirm, then a
 *                             canonical read-back
 *   worker.activation_queue.get
 *                             which recorded facts keep a person from being
 *                             matchable or discoverable — facts only, never a
 *                             score
 *
 * Candidates are the company-safe, anonymized shape the web page renders
 * (`ScoutSafeCandidate`): no name, no contact. Discovery is decided by the
 * database (`can_view_worker` — an employer sees a person only with a
 * CURRENT granted `profile_discoverability` consent, or an active work
 * relationship).
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function asAny(c: CapabilityCaller["supabase"]): any {
  return c;
}

const readOnly = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
} as const;

// ── candidate.search ───────────────────────────────────────────────────────

const candidateSearchInput = z
  .object({
    requestId: z.string().uuid(),
    limit: z.number().int().min(1).max(50).optional(),
  })
  .strict();

const candidateSearch: CapabilityDescriptor = {
  id: "candidate.search",
  kind: "read",
  title: "Find candidates for one of this organization's needs",
  description:
    "Runs the product's own candidate search for ONE need of the organization " +
    "the caller is acting for (requestId from demand.list) — the same " +
    "retrieval, match and ranking the web scouting page uses. Candidates are " +
    "anonymized (no name, no contact) and ranked by fit to THIS need; each " +
    "carries the match status, the reasons and gaps, evidence tiers (manager " +
    "confirmed / journal supported / self declared), availability and whether " +
    "contact may start. There is no global person score and no percentage. " +
    "Only people who made themselves discoverable (or already work with the " +
    "organization) can appear; `retrieval` says whether the pool was capped. " +
    "Writes nothing.",
  exposed: true,
  annotations: readOnly,
  inputSchema: candidateSearchInput,
  run: async (caller, input): Promise<ExecResult> => {
    const parsed = candidateSearchInput.parse(input);
    const employer = await requireEmployerCompanyForCaller(caller);
    if (!employer.ok) return demandContextRefusal(employer.reason);
    const result = await runScoutingCore(caller, employer, parsed.requestId);
    switch (result.kind) {
      case "ok": {
        const limit = parsed.limit ?? 20;
        return {
          ok: true,
          data: {
            actingFor: employer.organizationName,
            need: { id: result.demand.id, title: result.demand.title, status: result.demand.status },
            totalCandidates: result.candidates.length,
            candidates: result.candidates.slice(0, limit).map((c) => ({
              workerId: c.workerId,
              profession: c.professionSlug,
              preview: c.preview,
              match: {
                status: c.match.status,
                evidenceConfidence: c.match.evidenceConfidence,
                evidence: c.match.evidence,
                reasons: c.match.reasons,
                gaps: c.match.gaps,
                missingData: c.match.missingData,
                availability: c.match.availability,
                nextAction: c.match.nextAction,
              },
              canContact: c.canContact,
              actionability: c.actionability,
              shortlistStatus: c.shortlistStatus,
              lastActive: c.lastActiveBucket,
            })),
            retrieval: result.retrieval,
            structuredDestination: `/dashboard/company/scouting?request=${result.demand.id}`,
          },
        };
      }
      case "not-structured":
        return {
          ok: false,
          code: "not_structured",
          message:
            "This need carries nothing a match can be derived from (no profession, skills or structure). Add structure to the need first.",
        };
      case "not-found":
        return { ok: false, code: "not_found", message: "No such need in the organization the caller is acting for." };
      case "no-company-context":
        return demandContextRefusal(result.reason);
      case "needs-migration":
        return { ok: false, code: "needs_migration", message: "Scouting is not enabled on this environment." };
      default:
        return { ok: false, code: "unavailable", message: "The candidate search failed." };
    }
  },
};

// ── shortlist.get ──────────────────────────────────────────────────────────

const shortlistGetInput = z.object({ requestId: z.string().uuid() }).strict();

type ShortlistRow = {
  worker_id: string;
  owner_id: string;
  status: ShortlistStatus;
  note: string | null;
  updated_at: string | null;
};

async function readShortlist(
  caller: CapabilityCaller,
  requestId: string,
  workerId?: string,
): Promise<{ ok: true; rows: ShortlistRow[] } | { ok: false }> {
  let q = asAny(caller.supabase)
    .from("demand_shortlist")
    .select("worker_id, owner_id, status, note, updated_at")
    .eq("request_id", requestId);
  if (workerId) q = q.eq("worker_id", workerId);
  const { data, error } = await q.order("updated_at", { ascending: false });
  if (error) return { ok: false };
  return { ok: true, rows: (data ?? []) as ShortlistRow[] };
}

const shortlistGet: CapabilityDescriptor = {
  id: "shortlist.get",
  kind: "read",
  title: "The shortlist of one need",
  description:
    "Every shortlist decision on ONE need of the organization the caller is " +
    "acting for: the caller's own and authorized colleagues' (the database " +
    "admits both), each marked decidedBy 'you' or 'colleague', with status " +
    "(saved / interested / not_fit / reviewed), the internal note, and when. " +
    "Decisions are kept as history; nothing is ever deleted. Writes nothing.",
  exposed: true,
  annotations: readOnly,
  inputSchema: shortlistGetInput,
  run: async (caller, input): Promise<ExecResult> => {
    const { requestId } = shortlistGetInput.parse(input);
    const employer = await requireEmployerCompanyForCaller(caller);
    if (!employer.ok) return demandContextRefusal(employer.reason);
    const need = await readNeed(caller, employer.organizationId, requestId);
    if (!need) return { ok: false, code: "not_found", message: "No such need in the organization the caller is acting for." };
    const sl = await readShortlist(caller, requestId);
    if (!sl.ok) return { ok: false, code: "unavailable", message: "The shortlist read failed." };
    return {
      ok: true,
      data: {
        actingFor: employer.organizationName,
        need: { id: need.id, title: need.title, status: need.status },
        decisions: sl.rows.map((r) => ({
          workerId: r.worker_id,
          status: r.status,
          note: r.note,
          decidedBy: r.owner_id === caller.userId ? "you" : "colleague",
          updatedAt: r.updated_at,
        })),
      },
    };
  },
};

async function readNeed(
  caller: CapabilityCaller,
  organizationId: string,
  requestId: string,
): Promise<{ id: string; title: string | null; status: string | null; profile_id: string } | null> {
  const { data } = await asAny(caller.supabase)
    .from("customer_requests")
    .select("id, title, status, profile_id")
    .eq("id", requestId)
    .or(`profile_id.eq.${caller.userId},organization_id.eq.${organizationId}`)
    .maybeSingle();
  return (data as { id: string; title: string | null; status: string | null; profile_id: string } | null) ?? null;
}

// ── shortlist.add_* / shortlist.remove_* ───────────────────────────────────

const shortlistAddFields = z
  .object({
    requestId: z.string().uuid(),
    workerId: z.string().uuid(),
    status: z.enum(["saved", "interested"]).optional(),
    note: z.string().trim().max(500).nullish(),
  })
  .strict();

const shortlistRemoveFields = z
  .object({
    requestId: z.string().uuid(),
    workerId: z.string().uuid(),
    /** Taking someone off is a decision with a reason, kept as history. */
    reason: z.string().trim().min(3).max(500),
  })
  .strict();

type ShortlistOp = "add" | "remove";

function shortlistWriteFailure(r: Exclude<ShortlistWriteResult, { kind: "ok" }>): ExecResult {
  switch (r.kind) {
    case "closed":
      return { ok: false, code: "need_closed", message: "This need is closed; its candidates are history, not decisions." };
    case "not-owner":
      return {
        ok: false,
        code: "not_authorized",
        message:
          "Only the need's creator, or a colleague whose role in this organization includes managing demand (owner, admin, manager, external manager), may decide on its shortlist.",
      };
    case "reason-required":
      return { ok: false, code: "reason_required", message: "Taking a candidate off needs a short reason." };
    case "needs-migration":
      return { ok: false, code: "needs_migration", message: "The shortlist is not enabled on this environment." };
    case "invalid":
      return { ok: false, code: "invalid", message: "Invalid need, person or status." };
    default:
      return { ok: false, code: "unavailable", message: "The shortlist write failed." };
  }
}

function makeShortlistPair(op: ShortlistOp): [CapabilityDescriptor, CapabilityDescriptor] {
  const fields = op === "add" ? shortlistAddFields : shortlistRemoveFields;
  const draftId = `shortlist.${op}_draft`;
  const confirmId = `shortlist.${op}_confirm`;
  const confirmInput = fields.extend({ confirmationToken: z.string().min(10) });

  /** What the write will be, in the core's vocabulary. */
  const intended = (d: Record<string, unknown>): { status: ShortlistStatus; note: string | null | undefined } =>
    op === "add"
      ? { status: ((d.status as ShortlistStatus | undefined) ?? "saved"), note: (d.note as string | null | undefined) ?? undefined }
      : { status: "not_fit", note: d.reason as string };

  const normalized = (d: Record<string, unknown>) => {
    const i = intended(d);
    return { requestId: d.requestId, workerId: d.workerId, status: i.status, note: i.note ?? null };
  };

  /** Everything the draft checks, re-checked at confirm. */
  async function precheck(
    caller: CapabilityCaller,
    d: Record<string, unknown>,
  ): Promise<
    | { ok: true; employerName: string; organizationId: string; need: { id: string; title: string | null }; fingerprint: string }
    | { ok: false; result: ExecResult }
  > {
    const employer = await requireEmployerCompanyForCaller(caller);
    if (!employer.ok) return { ok: false, result: demandContextRefusal(employer.reason) };
    const need = await readNeed(caller, employer.organizationId, d.requestId as string);
    if (!need) {
      return { ok: false, result: { ok: false, code: "not_found", message: "No such need in the organization the caller is acting for." } };
    }
    if (need.profile_id !== caller.userId && !hasOrganizationCapability(employer.role, "manage-demand")) {
      return { ok: false, result: shortlistWriteFailure({ kind: "not-owner" }) };
    }
    if (need.status === "closed") return { ok: false, result: shortlistWriteFailure({ kind: "closed" }) };
    // The person must be someone this caller may SEE (can_view_worker) — a
    // shortlist is never a way to reach a person discovery does not admit.
    const { data: worker } = await asAny(caller.supabase)
      .from("workers")
      .select("id")
      .eq("id", d.workerId as string)
      .maybeSingle();
    if (!worker) {
      return { ok: false, result: { ok: false, code: "not_found", message: "No such candidate visible to this organization." } };
    }
    const own = await readShortlist(caller, need.id, d.workerId as string);
    if (!own.ok) return { ok: false, result: { ok: false, code: "unavailable", message: "The shortlist read failed." } };
    const mine = own.rows.find((r) => r.owner_id === caller.userId) ?? null;
    if (op === "remove" && !own.rows.some((r) => r.status === "saved" || r.status === "interested")) {
      return { ok: false, result: { ok: false, code: "not_shortlisted", message: "This person is not on the shortlist of this need." } };
    }
    return {
      ok: true,
      employerName: employer.organizationName,
      organizationId: employer.organizationId,
      need: { id: need.id, title: need.title },
      fingerprint: `shortlist:${employer.organizationId}:${need.id}:${d.workerId as string}:${mine?.status ?? "none"}:${mine?.updated_at ?? "-"}`,
    };
  }

  const draft: CapabilityDescriptor = {
    id: draftId,
    kind: "draft",
    title: op === "add" ? "Draft adding a candidate to a need's shortlist" : "Draft taking a candidate off a need's shortlist",
    description:
      (op === "add"
        ? "Checks the need belongs to the organization the caller is acting for, the caller may decide on it, the need is open and the candidate is visible to this organization (workerId from candidate.search), then previews the decision (saved or interested, optional internal note). "
        : "Checks the same, and that the candidate is currently shortlisted, then previews taking them off: the decision becomes not_fit with the stated reason, kept as history — nothing is deleted. ") +
      `Returns a one-time token. NOTHING is written. Confirming requires ${confirmId}.`,
    exposed: true,
    annotations: readOnly,
    inputSchema: fields,
    run: async (caller, input): Promise<ExecResult> => {
      const d = fields.parse(input) as Record<string, unknown>;
      const pre = await precheck(caller, d);
      if (!pre.ok) return pre.result;
      const n = normalized(d);
      const token = mintCapabilityConfirmation({
        actionId: confirmId,
        input: n,
        userId: caller.userId,
        stateFingerprint: pre.fingerprint,
      });
      return {
        ok: true,
        data: {
          preview: { actingFor: pre.employerName, need: pre.need, workerId: n.workerId, decision: n.status, note: n.note },
          confirmationToken: token,
          note: `Nothing was written. Confirming requires ${confirmId} with this exact input and token.`,
        },
      };
    },
  };

  const confirm: CapabilityDescriptor = {
    id: confirmId,
    kind: "confirm",
    title: op === "add" ? "Confirm adding the candidate to the shortlist" : "Confirm taking the candidate off the shortlist",
    description:
      "Verifies the token against the exact input, the caller's CURRENT organization and the CURRENT shortlist state " +
      "(a change in between invalidates it), writes through the same shortlist core the web scouting page uses, and " +
      "reads the decision back.",
    exposed: true,
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    inputSchema: confirmInput,
    run: async (caller, input): Promise<ExecResult> => {
      const { confirmationToken, ...rest } = confirmInput.parse(input) as Record<string, unknown> & {
        confirmationToken: string;
      };
      const pre = await precheck(caller, rest);
      if (!pre.ok) return pre.result;
      const n = normalized(rest);
      const verdict = verifyCapabilityConfirmation({
        actionId: confirmId,
        token: confirmationToken,
        input: n,
        userId: caller.userId,
        currentStateFingerprint: pre.fingerprint,
      });
      if (!verdict.ok) {
        return { ok: false, code: "confirmation_rejected", message: `Confirmation token rejected (${verdict.reason}). Draft again.` };
      }
      const employer = await requireEmployerCompanyForCaller(caller);
      if (!employer.ok) return demandContextRefusal(employer.reason);
      const i = intended(rest);
      const written = await setShortlistCore(caller, employer, {
        requestId: n.requestId as string,
        workerId: n.workerId as string,
        status: i.status,
        note: i.note,
      });
      if (written.kind !== "ok") return shortlistWriteFailure(written);
      // CANONICAL READ-BACK — the row as the database now holds it.
      const back = await readShortlist(caller, n.requestId as string, n.workerId as string);
      const mine = back.ok ? (back.rows.find((r) => r.owner_id === caller.userId) ?? null) : null;
      return {
        ok: true,
        data: {
          status: op === "add" ? "shortlisted" : "taken_off",
          actingFor: pre.employerName,
          need: pre.need,
          readBack: mine
            ? { workerId: mine.worker_id, status: mine.status, note: mine.note, updatedAt: mine.updated_at }
            : null,
        },
      };
    },
  };
  return [draft, confirm];
}

const [shortlistAddDraft, shortlistAddConfirm] = makeShortlistPair("add");
const [shortlistRemoveDraft, shortlistRemoveConfirm] = makeShortlistPair("remove");

// ── worker.activation_queue.get ───────────────────────────────────────────

/**
 * The named conditions. Each is a RECORDED FACT about the worker row, never a
 * judgement; none is weighted and there is no total score.
 *
 * Consent is read from the canonical ledger (`privacy_consent_events`,
 * purpose `profile_discoverability`, current text version) through
 * `worker_profile_discoverable`. The legacy `profiles.consent_data_processing`
 * boolean never had a write path and is NOT read here.
 */
export const ACTIVATION_CODES = [
  "MISSING_PROFESSION",
  "MISSING_CURRENT_COUNTRY",
  "MISSING_PREFERRED_COUNTRY",
  "MISSING_AVAILABILITY",
  "MISSING_SKILLS",
  "MISSING_LANGUAGE",
  "MISSING_CONTACT",
  "NOT_DISCOVERABLE",
  "CONSENT_STATE_UNKNOWN",
] as const;
export type ActivationCode = (typeof ACTIVATION_CODES)[number];

/** A person is MATCHABLE when a need can be judged against them at all. */
const MATCHABLE_BLOCKERS: readonly ActivationCode[] = [
  "MISSING_PROFESSION",
  "MISSING_CURRENT_COUNTRY",
  "MISSING_AVAILABILITY",
];

export type ActivationFacts = {
  hasProfession: boolean;
  currentCountry: string | null;
  preferredCountries: readonly string[];
  availabilityStatus: string | null;
  hasSkills: boolean | null;
  hasLanguage: boolean | null;
  /** null = not readable by this caller (UNKNOWN, never "missing"). */
  hasContact: boolean | null;
  /** null = the consent read failed. */
  discoverable: boolean | null;
};

/** Pure: facts → the conditions that are actually missing. */
export function activationConditions(f: ActivationFacts): {
  missing: ActivationCode[];
  matchable: boolean;
  discoverable: boolean | null;
} {
  const missing: ActivationCode[] = [];
  if (!f.hasProfession) missing.push("MISSING_PROFESSION");
  if (!f.currentCountry) missing.push("MISSING_CURRENT_COUNTRY");
  if (f.preferredCountries.length === 0) missing.push("MISSING_PREFERRED_COUNTRY");
  if (!f.availabilityStatus) missing.push("MISSING_AVAILABILITY");
  if (f.hasSkills === false) missing.push("MISSING_SKILLS");
  if (f.hasLanguage === false) missing.push("MISSING_LANGUAGE");
  if (f.hasContact === false) missing.push("MISSING_CONTACT");
  if (f.discoverable === false) missing.push("NOT_DISCOVERABLE");
  if (f.discoverable === null) missing.push("CONSENT_STATE_UNKNOWN");
  return {
    missing,
    matchable: !missing.some((m) => MATCHABLE_BLOCKERS.includes(m)),
    discoverable: f.discoverable,
  };
}

const activationInput = z
  .object({
    scope: z.enum(["self", "roster", "platform"]).optional(),
  })
  .strict();

type WorkerRow = {
  id: string;
  profile_id: string | null;
  display_name: string | null;
  headline: string | null;
  current_location_country: string | null;
  preferred_countries: string[] | null;
  availability_status: string | null;
};

async function activationFor(
  caller: CapabilityCaller,
  workers: WorkerRow[],
  contactReadable: boolean,
): Promise<{ ok: true; rows: Array<{ worker: WorkerRow } & ReturnType<typeof activationConditions>> } | { ok: false }> {
  if (workers.length === 0) return { ok: true, rows: [] };
  const ids = workers.map((w) => w.id);
  const [prof, skills, langs] = await Promise.all([
    asAny(caller.supabase).from("worker_professions").select("worker_id").in("worker_id", ids),
    asAny(caller.supabase).from("worker_skills").select("worker_id").in("worker_id", ids),
    asAny(caller.supabase).from("worker_languages").select("worker_id").in("worker_id", ids),
  ]);
  // The profession read gates matchability, so a failure is a failure.
  if (prof.error) return { ok: false };
  const set = (r: { data: { worker_id: string }[] | null; error: unknown }) =>
    r.error ? null : new Set((r.data ?? []).map((x) => x.worker_id));
  const profSet = set(prof)!;
  const skillSet = set(skills);
  const langSet = set(langs);

  let contact: Map<string, boolean> | null = null;
  if (contactReadable) {
    const pids = workers.map((w) => w.profile_id).filter((p): p is string => !!p);
    const { data, error } = await asAny(caller.supabase).from("profiles").select("id, email, phone").in("id", pids);
    if (!error) {
      contact = new Map(
        ((data ?? []) as { id: string; email: string | null; phone: string | null }[]).map((p) => [
          p.id,
          !!(p.email || p.phone),
        ]),
      );
    }
  }

  const discoverable = await Promise.all(
    workers.map(async (w) => {
      if (!w.profile_id) return false;
      const { data, error } = await asAny(caller.supabase).rpc("worker_profile_discoverable", {
        p_profile: w.profile_id,
      });
      return error ? null : data === true;
    }),
  );

  return {
    ok: true,
    rows: workers.map((w, i) => ({
      worker: w,
      ...activationConditions({
        hasProfession: profSet.has(w.id),
        currentCountry: w.current_location_country,
        preferredCountries: w.preferred_countries ?? [],
        availabilityStatus: w.availability_status,
        hasSkills: skillSet ? skillSet.has(w.id) : null,
        hasLanguage: langSet ? langSet.has(w.id) : null,
        hasContact: contact && w.profile_id ? (contact.get(w.profile_id) ?? null) : null,
        discoverable: discoverable[i],
      }),
    })),
  };
}

const WORKER_COLS =
  "id, profile_id, display_name, headline, current_location_country, preferred_countries, availability_status";

const workerActivationQueue: CapabilityDescriptor = {
  id: "worker.activation_queue.get",
  kind: "read",
  title: "What keeps people from being matchable",
  description:
    "For each person in scope, the RECORDED conditions that are missing, by " +
    "name: MISSING_PROFESSION, MISSING_CURRENT_COUNTRY, " +
    "MISSING_PREFERRED_COUNTRY, MISSING_AVAILABILITY, MISSING_SKILLS, " +
    "MISSING_LANGUAGE, MISSING_CONTACT, NOT_DISCOVERABLE (no current granted " +
    "discoverability consent in the consent ledger — employers cannot find " +
    "them), CONSENT_STATE_UNKNOWN (the consent read failed). `matchable` = " +
    "profession, current country and availability are all recorded. No " +
    "score, no ranking. scope: 'self' (default — the caller's own profile), " +
    "'roster' (the active roster of the organization the caller acts for), " +
    "'platform' (every worker — platform administrators only; test fixtures " +
    "carrying a documented marker are flagged). Writes nothing.",
  exposed: true,
  annotations: readOnly,
  inputSchema: activationInput,
  run: async (caller, input): Promise<ExecResult> => {
    const scope = activationInput.parse(input).scope ?? "self";
    let workers: WorkerRow[] = [];
    let contactReadable = false;
    let actingFor: string | null = null;

    if (scope === "self") {
      const { data, error } = await asAny(caller.supabase)
        .from("workers")
        .select(WORKER_COLS)
        .eq("profile_id", caller.userId)
        .maybeSingle();
      if (error) return { ok: false, code: "unavailable", message: "The worker profile read failed." };
      if (!data) {
        return { ok: true, data: { scope, people: [], note: "This account has no worker profile." } };
      }
      workers = [data as WorkerRow];
      contactReadable = true;
    } else if (scope === "roster") {
      const employer = await requireEmployerCompanyForCaller(caller);
      if (!employer.ok) return demandContextRefusal(employer.reason);
      actingFor = employer.organizationName;
      const roster = await listActiveCompanyWorkers(employer.companyId, caller);
      if (roster.kind !== "ok") return { ok: false, code: "unavailable", message: "The roster read failed." };
      const ids = roster.rows.filter((r) => r.status === "active").map((r) => r.workerId);
      if (ids.length > 0) {
        const { data, error } = await asAny(caller.supabase).from("workers").select(WORKER_COLS).in("id", ids);
        if (error) return { ok: false, code: "unavailable", message: "The worker read failed." };
        workers = (data ?? []) as WorkerRow[];
      }
    } else {
      const { data: admin, error: adminErr } = await asAny(caller.supabase).rpc("is_admin");
      if (adminErr) return { ok: false, code: "unavailable", message: "The authority check failed." };
      if (admin !== true) {
        return { ok: false, code: "not_authorized", message: "The platform scope is for platform administrators only." };
      }
      const { data, error } = await asAny(caller.supabase)
        .from("workers")
        .select(WORKER_COLS)
        .order("created_at", { ascending: true })
        .limit(1000);
      if (error) return { ok: false, code: "unavailable", message: "The worker read failed." };
      workers = (data ?? []) as WorkerRow[];
      contactReadable = true;
    }

    const res = await activationFor(caller, workers, contactReadable);
    if (!res.ok) return { ok: false, code: "unavailable", message: "An activation read failed." };
    const counts: Record<string, number> = {};
    for (const r of res.rows) for (const m of r.missing) counts[m] = (counts[m] ?? 0) + 1;
    return {
      ok: true,
      data: {
        scope,
        actingFor,
        total: res.rows.length,
        matchable: res.rows.filter((r) => r.matchable).length,
        discoverable: res.rows.filter((r) => r.discoverable === true).length,
        missingCounts: counts,
        people: res.rows.map((r) => ({
          workerId: r.worker.id,
          name: r.worker.display_name,
          fixtureMarked: isSyntheticFixtureLabel(r.worker.display_name, r.worker.headline),
          matchable: r.matchable,
          discoverable: r.discoverable,
          missing: r.missing,
        })),
      },
    };
  },
};

export const MARKETPLACE_CAPABILITIES: readonly CapabilityDescriptor[] = [
  candidateSearch,
  shortlistGet,
  shortlistAddDraft,
  shortlistAddConfirm,
  shortlistRemoveDraft,
  shortlistRemoveConfirm,
  workerActivationQueue,
];
