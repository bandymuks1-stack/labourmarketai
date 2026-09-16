"use server";

import "server-only";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import type { DomainCaller } from "@/lib/domain/caller";
import {
  ATTESTATION_ROLES,
  SOURCE_KINDS,
  SUPPLIER_ROLES,
  attestRecord,
  buildPreview,
  committableRows,
  commitImport,
  createImportSession,
  createRosterPerson,
  acknowledgeRows,
  resolveContextLabel,
  resolveRow,
  submitRows,
  withdrawImport,
  type EvidenceImportFailure,
} from "@/lib/organization-evidence/import-core";
import { fingerprintPayload } from "@/lib/organization-evidence/fingerprint";
import {
  readEvidenceSourceFile,
  SOURCE_FILE_MAX_BYTES,
} from "@/lib/organization-evidence/read-source-file";
import {
  MAX_ROWS_PER_SESSION,
  MAX_ROWS_PER_SUBMIT,
  type SourceWorkRow,
} from "@/lib/organization-evidence/source-rows";
import {
  detectHeaderLanguage,
  parseDelimited,
  rowsFromGrid,
} from "@/lib/organization-evidence/parse-tabular";
import { resolveEvidenceOrganization } from "@/lib/organization-evidence/evidence-org-context";
import { readOrganizationCapabilities } from "@/lib/organizations/capability-read";
import { activeLocales } from "@/lib/i18n/config";
import { getLocale } from "next-intl/server";
import { verifyCommitToken } from "@/lib/organization-evidence/commit-confirmation";
import { isReportedEvidenceState } from "@/lib/organization-evidence/evidence-state";

/**
 * THE HUMAN TRANSPORT for the organization evidence import.
 *
 * Every action here is a cookie-session wrapper — read the user, build the
 * canonical `DomainCaller`, call `lib/organization-evidence/import-core.ts`,
 * translate the tagged failure into a product state. The domain logic lives in
 * the core and NOWHERE else: an assistant calling the MCP capabilities reaches
 * the same functions, the same RLS, and the same commit gate.
 *
 * NOTHING here re-implements authority. The organization is resolved from the
 * caller's own memberships inside the core, and every statement still runs
 * under the caller's own RLS, where `manages_organization()` decides.
 *
 * Server actions ARE endpoints, so each one re-derives the caller rather than
 * trusting anything the form carries. The only ids a form supplies are a
 * session id, a row id and a person id — all of which the database validates
 * against the caller's own organization by composite foreign key and policy.
 */

/** A tagged result — never a thrown error across the server-action boundary
 *  (Next.js strips messages in production). */
export type EvidenceImportActionState =
  | { readonly kind: "idle" }
  | { readonly kind: "ok"; readonly sessionId?: string; readonly note?: string }
  | {
      readonly kind: "refused";
      /** A product-state name, never a Postgres code. */
      readonly reason: string;
      readonly detail?: string;
      readonly options?: readonly {
        readonly id: string;
        readonly name: string;
      }[];
    };

/** The workspace this section lives in. It is no longer a route of its own —
 *  see the section component's header for why. */
// The importer lives on the organization's HISTORY door (IA 2026-09-16).
const PATH = "/dashboard/company/history";

async function caller(): Promise<DomainCaller | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user ? { supabase, userId: user.id } : null;
}

/** ONE translation of the core's tagged failure. Each branch stays a distinct
 *  named state: an unprovisioned store, a refusal and an outage must never
 *  read as the same thing to the person looking at the screen. */
function refuse(f: EvidenceImportFailure): EvidenceImportActionState {
  switch (f.kind) {
    case "not-authorized":
      return { kind: "refused", reason: "not_authorized", detail: f.reason };
    case "choice-required":
      return { kind: "refused", reason: "choice_required", options: f.options };
    case "needs-migration":
      return { kind: "refused", reason: "needs_migration" };
    case "invalid":
      return {
        kind: "refused",
        reason: "invalid",
        detail: f.problems.join("; "),
      };
    case "not-found":
      return { kind: "refused", reason: "not_found" };
    case "too-many-rows":
      return {
        kind: "refused",
        reason: "too_many_rows",
        detail: String(f.limit),
      };
    case "error":
      return { kind: "refused", reason: "unavailable" };
  }
}

function text(form: FormData, key: string): string {
  return String(form.get(key) ?? "").trim();
}

function oneOf<T extends string>(
  value: string,
  allowed: readonly T[],
): T | null {
  return (allowed as readonly string[]).includes(value) ? (value as T) : null;
}

/**
 * Step 1 — read a source and stage it.
 *
 * The file is parsed IN THIS PROCESS and only canonical rows are stored; the
 * verbatim source line travels with each row as `raw`, so nothing the source
 * said is discarded and nothing it did not say is invented. A guessed date
 * arrives from the parser already marked DERIVED — the import never promotes
 * it into `factFields`.
 */
export async function startEvidenceImportAction(
  _previous: EvidenceImportActionState,
  form: FormData,
): Promise<EvidenceImportActionState> {
  const c = await caller();
  if (!c) return { kind: "refused", reason: "unauthenticated" };

  // THE HUMAN CHOOSES A FILE; THE SYSTEM DERIVES THE REST (owner entry
  // contract 2026-09-16 P0-B/P0-C). Every field below is optional on the form
  // and lives behind "Papildoma informacija". An explicit value always wins;
  // an absent one is derived from evidence the request already carries —
  // the file's own type, the organization's own declared capability, the
  // source's own header words — and where nothing supports a derivation the
  // honest fallback is recorded as such, never a guess dressed as a fact.
  const explicitKind = oneOf(text(form, "source_kind"), SOURCE_KINDS);
  const explicitRole = oneOf(text(form, "supplier_role"), SUPPLIER_ROLES);
  const explicitLanguage = oneOf(text(form, "source_language"), activeLocales);

  // The source itself: an uploaded file — a delimited one OR a real .xlsx
  // workbook — or pasted text. `readEvidenceSourceFile` picks the audited
  // reader by filename and returns stageable rows either way; pasted text
  // stays on the delimited path it always used.
  const file = form.get("file");
  let filename = text(form, "source_filename") || null;
  let rows: readonly SourceWorkRow[] = [];
  let sourceFingerprint = "";
  let via = "delimited";
  let headers: readonly string[] = [];

  if (file instanceof File && file.size > 0) {
    if (file.size > SOURCE_FILE_MAX_BYTES)
      return { kind: "refused", reason: "file_too_large" };
    let bytes: Buffer;
    try {
      bytes = Buffer.from(await file.arrayBuffer());
    } catch {
      return { kind: "refused", reason: "file_unreadable" };
    }
    filename = filename ?? file.name;
    const read = await readEvidenceSourceFile(filename, bytes);
    switch (read.kind) {
      case "file-too-large":
        return { kind: "refused", reason: "file_too_large" };
      case "file-unreadable":
      case "unsupported-file":
        return { kind: "refused", reason: "file_unreadable" };
      case "month-not-stated":
        // A recognised timesheet grid whose month appears nowhere on the
        // sheet. Every date would have to be invented, so the sheet is
        // refused BY NAME rather than imported against a guessed month.
        return { kind: "refused", reason: "month_not_stated" };
      case "nothing-parsed":
        return { kind: "refused", reason: "nothing_parsed", detail: read.detail };
      default:
        rows = read.rows;
        sourceFingerprint = read.fingerprint;
        via = read.via;
        headers = read.headers;
    }
  } else {
    const pasted = text(form, "pasted");
    if (pasted.trim() === "")
      return { kind: "refused", reason: "no_source_supplied" };
    const parsed = rowsFromGrid(parseDelimited(pasted));
    if (parsed.rows.length === 0) {
      // The parser's own reason is shown — "no_header" and "no rows at all"
      // are different problems with different fixes.
      return {
        kind: "refused",
        reason: "nothing_parsed",
        detail: parsed.skipped[0]?.reason ?? "empty",
      };
    }
    rows = parsed.rows;
    sourceFingerprint = fingerprintPayload("web-source", { raw: pasted });
    headers = Object.keys(parsed.rows[0]?.raw ?? {});
  }

  // SOURCE KIND is a fact of the file, never a form default: an .xlsx is a
  // spreadsheet even though the engine reads it as a table underneath
  // (the owner saw "CSV / TSV" printed over a .xlsx — P0-C).
  const sourceKind =
    explicitKind ??
    (file instanceof File && file.size > 0
      ? /\.(xlsx|xlsm)$/i.test(filename ?? file.name)
        ? "xlsx"
        : "csv"
      : "manual");
  // SUPPLIER ROLE follows what the organization declared it DOES (the same
  // capability axis the doors read); "other" only when it declared nothing.
  let supplierRole = explicitRole;
  if (!supplierRole) {
    const org = await resolveEvidenceOrganization(c, null);
    const caps = org.ok ? await readOrganizationCapabilities(org.organizationId) : [];
    supplierRole = caps.includes("training_provider")
      ? "training_provider"
      : caps.includes("workforce_provider") || caps.includes("recruitment_partner")
        ? "agency"
        : caps.includes("employer") || caps.includes("project_operator")
          ? "employer"
          : "other";
  }
  // SOURCE LANGUAGE from the header words when they say so; otherwise the
  // caller's UI locale, which the advanced section shows and lets them change.
  const sourceLanguage =
    explicitLanguage ??
    detectHeaderLanguage(headers) ??
    (oneOf(await getLocale(), activeLocales) ?? "en");

  // The session is keyed on the SOURCE, so re-uploading the same file resolves
  // to the same session instead of importing it twice.
  const session = await createImportSession(c, {
    sourceKind,
    supplierRole,
    sourceLanguage,
    sourceFilename: filename,
    sourceReference: text(form, "source_reference") || null,
    sourceFingerprint,
    notes: text(form, "notes") || null,
    actorKind: "human",
  });
  if (session.kind !== "ok") return refuse(session);

  // Bounded batches, always — a year of a company's timesheets is thousands of
  // rows and one unbounded request is how an import dies half-done.
  let staged = 0;
  for (let i = 0; i < rows.length; i += MAX_ROWS_PER_SUBMIT) {
    const batch: readonly SourceWorkRow[] = rows.slice(i, i + MAX_ROWS_PER_SUBMIT);
    const res = await submitRows(c, session.session.id, batch);
    if (res.kind !== "ok") return refuse(res);
    staged += res.inserted;
    // The session cap is the core's, not this action's — stop staging when
    // the session is full rather than sending batches it will refuse.
    if (res.totalInSession >= MAX_ROWS_PER_SESSION) break;
  }

  revalidatePath(PATH);
  return {
    kind: "ok",
    sessionId: session.session.id,
    note: session.session.reused ? "reused_session" : `staged:${staged}:${via}`,
  };
}

/** Step 2 — settle one ambiguous row by naming the person and/or the place. */
export async function resolveEvidenceRowAction(
  _previous: EvidenceImportActionState,
  form: FormData,
): Promise<EvidenceImportActionState> {
  const c = await caller();
  if (!c) return { kind: "refused", reason: "unauthenticated" };
  const rowId = text(form, "row_id");
  if (rowId === "")
    return { kind: "refused", reason: "invalid", detail: "row" };
  const res = await resolveRow(c, {
    rowId,
    organizationPersonId: text(form, "person_id") || undefined,
    workObjectId: text(form, "work_object_id") || undefined,
  });
  if (res.kind !== "ok") return refuse(res);
  revalidatePath(PATH);
  return { kind: "ok", sessionId: text(form, "session_id") || undefined };
}

/**
 * Step 2a' — settle one PLACE LABEL for every row that names it (owner
 * command §7: one question per genuine ambiguity, asked once). The choice
 * is an existing object, "create it under this name", or "not a place".
 * Staging only; the next preview carries the choice.
 */
export async function resolveEvidenceLabelAction(
  _previous: EvidenceImportActionState,
  form: FormData,
): Promise<EvidenceImportActionState> {
  const c = await caller();
  if (!c) return { kind: "refused", reason: "unauthenticated" };
  const sessionId = text(form, "session_id");
  const key = text(form, "label_key");
  if (sessionId === "" || key === "")
    return { kind: "refused", reason: "invalid", detail: "label" };
  const choice = text(form, "choice");
  const decision =
    choice === "ignore"
      ? ({ kind: "ignore" } as const)
      : choice === "create"
        ? ({ kind: "create", name: text(form, "name") || null } as const)
        : choice.startsWith("alias:")
          ? ({ kind: "alias", name: choice.slice("alias:".length) } as const)
          : choice !== ""
            ? ({ kind: "object", workObjectId: choice } as const)
            : null;
  if (!decision) return { kind: "refused", reason: "invalid", detail: "choice" };
  const res = await resolveContextLabel(c, { sessionId, key, decision });
  if (res.kind !== "ok") return refuse(res);
  revalidatePath(PATH);
  return { kind: "ok", sessionId, note: `updated:${res.updated}` };
}

/**
 * Step 2a'' — a human keeps a flagged figure AS STATED (owner command §11).
 * The 800 h day stays 800 h; what changes is that a named person accepted
 * it, and the row may now commit. Staging only.
 */
export async function acknowledgeEvidenceRowsAction(
  _previous: EvidenceImportActionState,
  form: FormData,
): Promise<EvidenceImportActionState> {
  const c = await caller();
  if (!c) return { kind: "refused", reason: "unauthenticated" };
  const sessionId = text(form, "session_id");
  if (sessionId === "") return { kind: "refused", reason: "invalid", detail: "session" };
  const rowIds = form
    .getAll("row_id")
    .map((v) => (typeof v === "string" ? v.trim() : ""))
    .filter((v) => v !== "");
  const problem = text(form, "problem");
  const res = await acknowledgeRows(c, {
    sessionId,
    rowIds: rowIds.length > 0 ? rowIds : undefined,
    problem: problem === "hours_exceed_day" ? "hours_exceed_day" : undefined,
  });
  if (res.kind !== "ok") return refuse(res);
  revalidatePath(PATH);
  return { kind: "ok", sessionId, note: `updated:${res.updated}` };
}

/**
 * Step 2b — add a person the organization knows but the roster did not hold.
 *
 * The record is created UNLINKED: it is not a platform identity and asserts
 * nothing about who the human is. The real person may later claim it — they
 * propose, a manager confirms — which is why people WITHOUT accounts are
 * first-class here rather than a gap to be filled by inventing accounts.
 */
export async function createEvidencePersonAction(
  _previous: EvidenceImportActionState,
  form: FormData,
): Promise<EvidenceImportActionState> {
  const c = await caller();
  if (!c) return { kind: "refused", reason: "unauthenticated" };
  const displayName = text(form, "display_name");
  if (displayName === "")
    return { kind: "refused", reason: "invalid", detail: "name" };
  const person = await createRosterPerson(c, {
    displayName,
    externalRef: text(form, "external_ref") || null,
    relationshipKind: text(form, "relationship_kind") || "other",
    sourceNote: text(form, "source_note") || null,
  });
  if (person.kind !== "ok") return refuse(person);

  // Created FROM a row → point that row at the new person immediately, so the
  // human does not have to re-find it in a list they just left.
  const rowId = text(form, "row_id");
  if (rowId !== "") {
    const linked = await resolveRow(c, {
      rowId,
      organizationPersonId: person.personId,
    });
    if (linked.kind !== "ok") return refuse(linked);
  }
  revalidatePath(PATH);
  return { kind: "ok", sessionId: text(form, "session_id") || undefined };
}

/**
 * Step 3 — commit.
 *
 * The token came from the preview the human just looked at and is verified
 * against the row set re-derived HERE, now — so approving a screen that has
 * since changed is refused rather than silently committing something else.
 * This is the SAME gate `evidence.import.commit` applies to an agent.
 */
export async function commitEvidenceImportAction(
  _previous: EvidenceImportActionState,
  form: FormData,
): Promise<EvidenceImportActionState> {
  const c = await caller();
  if (!c) return { kind: "refused", reason: "unauthenticated" };
  const sessionId = text(form, "session_id");
  const token = text(form, "confirmation_token");
  if (sessionId === "" || token === "") {
    return { kind: "refused", reason: "invalid", detail: "session" };
  }

  const preview = await buildPreview(c, sessionId);
  if (preview.kind !== "ok") return refuse(preview);
  // The set the token was minted against: ready rows plus the rows the PLAN
  // makes ready — the same selection the page showed as "will be written".
  const committable = committableRows(preview.preview);

  let verdict: { ok: true } | { ok: false; reason: string };
  try {
    verdict = verifyCommitToken({
      token,
      sessionId,
      userId: c.userId,
      readyRows: committable,
    });
  } catch {
    // The signing secret is absent in this environment. Refuse honestly —
    // never fall back to committing without the gate.
    return { kind: "refused", reason: "confirmation_unavailable" };
  }
  if (!verdict.ok) {
    return {
      kind: "refused",
      reason: "confirmation_rejected",
      detail: verdict.reason,
    };
  }

  const requested = text(form, "evidence_state");
  // The reviewed plan: both boxes default to checked on the page; an unchecked
  // box arrives as an absent field. The relationship is validated against the
  // same closed vocabulary the page offers.
  const relationship = text(form, "plan_relationship");
  const res = await commitImport(c, sessionId, {
    evidenceState: isReportedEvidenceState(requested) ? requested : undefined,
    plan: {
      createPeople: text(form, "plan_people") === "1",
      createObjects: text(form, "plan_objects") === "1",
      relationshipKind: /^[a-z_]{1,40}$/.test(relationship) ? relationship : null,
    },
  });
  if (res.kind !== "ok") return refuse(res);
  revalidatePath(PATH);
  return {
    kind: "ok",
    sessionId,
    note:
      `written:${res.written}:skipped:${res.skippedDuplicates}:notReady:${res.notReady}` +
      `:createdPeople:${res.createdPeople}:createdObjects:${res.createdObjects}`,
  };
}

/**
 * The rollback path. It DELETES NOTHING: each record gains an append-only
 * `withdrawn` event, so the evidence and the reason both stay readable and the
 * withdrawal is itself auditable.
 */
export async function withdrawEvidenceImportAction(
  _previous: EvidenceImportActionState,
  form: FormData,
): Promise<EvidenceImportActionState> {
  const c = await caller();
  if (!c) return { kind: "refused", reason: "unauthenticated" };
  const sessionId = text(form, "session_id");
  if (sessionId === "")
    return { kind: "refused", reason: "invalid", detail: "session" };
  const res = await withdrawImport(c, sessionId, text(form, "note") || null);
  if (res.kind !== "ok") return refuse(res);
  revalidatePath(PATH);
  return { kind: "ok", sessionId, note: `withdrawn:${res.affected}` };
}

/**
 * Attest a committed record in the organization's name.
 *
 * Attesting one's OWN work is allowed — a sole trader has nobody above them —
 * and the read side permanently derives SELF_ATTESTED for it, which never
 * counts as independent verification. The UI offers no "verify" control at
 * all: independent verification is a different act by a different party.
 */
export async function attestEvidenceRecordAction(
  _previous: EvidenceImportActionState,
  form: FormData,
): Promise<EvidenceImportActionState> {
  const c = await caller();
  if (!c) return { kind: "refused", reason: "unauthenticated" };
  const recordId = text(form, "record_id");
  const actorRole = oneOf(text(form, "actor_role"), ATTESTATION_ROLES);
  if (recordId === "" || !actorRole) {
    return { kind: "refused", reason: "invalid", detail: "record" };
  }
  const res = await attestRecord(c, {
    recordId,
    actorRole,
    note: text(form, "note") || null,
  });
  if (res.kind !== "ok") return refuse(res);
  revalidatePath(PATH);
  return { kind: "ok", sessionId: text(form, "session_id") || undefined };
}
