import "server-only";

import { confirmCvWorkHistoryAction } from "@/lib/profile/cv-section-import-actions";
import { saveWorkerLanguageAction } from "@/lib/worker/worker-languages-actions";
import { upsertWorkerDocumentAction } from "@/lib/documents/document-actions";
import { saveWorkerCardAction } from "@/lib/worker/work-card-actions";
import { saveWorkerAvailabilityPrefsAction } from "@/lib/worker/availability-prefs-actions";
import { saveWorkerEducationAction } from "@/lib/worker/worker-education-actions";
import { saveWorkerAchievementAction } from "@/lib/worker/worker-achievements-actions";
import { respondBookingAction } from "@/lib/booking/booking-actions";
import { expressInterestAction } from "@/lib/opportunities/interest-actions";
import { createJournalEntry } from "@/lib/journal/actions";
import { z } from "zod";

import {
  WORKER_ACTION_SCHEMAS,
  type WorkerActionId,
} from "@/lib/conversation/worker-schemas";
import {
  fd,
  mapKind,
  type ExecCtx,
  type ExecResult,
} from "@/lib/conversation/executor-contract";

/**
 * Worker executors (Phase B). Each is a THIN adapter that validates nothing new
 * of its own — the dispatcher already validated with the zod schema — and
 * delegates to the EXISTING canonical server action / RPC, then normalizes the
 * various native result shapes ({ok,code} / {kind} / throws) into one contract.
 *
 * These NEVER touch the DB directly and NEVER re-implement domain logic; the
 * real write, authorization (RLS + the canonical RPC), and audit stay put.
 *
 * The shared result contract + adapter helpers live in `executor-contract.ts`
 * (one convention for both executor maps); re-exported here for the existing
 * importers.
 */

export type { ExecCtx, ExecResult } from "@/lib/conversation/executor-contract";

type Infer<Id extends WorkerActionId> = z.infer<(typeof WORKER_ACTION_SCHEMAS)[Id]>;

// Frozen: the dispatcher indexes this record with a user-controlled action id
// (behind an own-property guard) — the record itself must never be mutable.
export const WORKER_EXECUTORS: {
  readonly [Id in WorkerActionId]: (input: Infer<Id>, ctx: ExecCtx) => Promise<ExecResult>;
} = Object.freeze({
  "worker.add-work-history": async (input) => {
    const r = await confirmCvWorkHistoryAction({
      title: input.title,
      relationship: input.relationship,
      startYear: input.startYear,
      endYear: input.endYear ?? null,
      start: { year: input.startYear, month: input.startMonth ?? null, day: null },
      end: input.isCurrent
        ? null
        : input.endYear != null
          ? { year: input.endYear, month: input.endMonth ?? null, day: null }
          : null,
      isCurrent: input.isCurrent,
    });
    return r.ok ? { ok: true } : { ok: false, code: r.code, existing: r.existing };
  },

  "worker.add-document": async (input, ctx) => {
    // The ONE document write (`upsert_worker_document` behind the canonical
    // action the documents page uses): type + country validated there.
    const r = await upsertWorkerDocumentAction(
      null,
      fd({
        document_type_slug: input.typeSlug,
        country: input.country ?? "",
        status: input.status,
        valid_from: input.validFrom ?? "",
        valid_until: input.validUntil ?? "",
        note: input.note ?? "",
        locale: ctx.locale,
      }),
    );
    if (r && r.ok) return { ok: true, data: { typeSlug: input.typeSlug } };
    const code = r ? r.code : "error";
    return { ok: false, code: code === "needs_migration" ? "needs_migration" : code === "invalid" ? "invalid" : code === "not_authenticated" || code === "no_worker" ? "not_authorized" : "error" };
  },

  "worker.add-language": async (input) => {
    const r = await saveWorkerLanguageAction(null, fd({ lang: input.lang, level: input.level }));
    return r.ok ? { ok: true } : { ok: false, code: r.code };
  },

  "worker.add-education": async (input) => {
    const r = await saveWorkerEducationAction(
      null,
      fd({
        institution_name: input.institution,
        program_or_field: input.program ?? "",
        education_type_slug: input.educationTypeSlug,
        start_year: input.startYear != null ? String(input.startYear) : "",
        end_year: input.endYear != null ? String(input.endYear) : "",
        is_current: input.isCurrent ? "true" : "",
        note: "",
      }),
    );
    return r.ok ? { ok: true, data: r.id ? { id: r.id } : undefined } : { ok: false, code: r.code };
  },

  "worker.add-achievement": async (input) => {
    const r = await saveWorkerAchievementAction(
      null,
      fd({
        title: input.title,
        description: input.description ?? "",
        achieved_at: input.achievedYear != null ? `${input.achievedYear}-01-01` : "",
        achievement_type_slug: input.kind,
      }),
    );
    return r.ok ? { ok: true, data: r.id ? { id: r.id } : undefined } : { ok: false, code: r.code };
  },

  "worker.save-work-card": async (input) => {
    const r = await saveWorkerCardAction(
      null,
      fd({
        availability_status: input.availabilityStatus ?? "",
        available_from: input.availableFrom ?? "",
        salary_min: input.salaryMin != null ? String(input.salaryMin) : "",
        salary_max: input.salaryMax != null ? String(input.salaryMax) : "",
        location_country: input.locationCountry ?? "",
        preferred_countries: (input.preferredCountries ?? []).join(","),
      }),
    );
    return r.ok ? { ok: true } : { ok: false, code: r.code, message: r.message };
  },

  "worker.save-preferences": async (input) => {
    const r = await saveWorkerAvailabilityPrefsAction(
      null,
      fd({
        willing_to_relocate: input.willingToRelocate ?? "not_stated",
        needs_accommodation: input.needsAccommodation ?? "not_stated",
        has_transport: input.hasTransport ?? "not_stated",
        team_available: input.teamAvailable ?? "not_stated",
        solo_available: input.soloAvailable ?? "not_stated",
        max_trip_days: input.maxTripDays != null ? String(input.maxTripDays) : "",
        preferred_contract_type: input.preferredContractType ?? "",
        availability_note: input.availabilityNote ?? "",
      }),
    );
    return r.ok ? { ok: true } : { ok: false, code: r.code, message: r.message };
  },

  "worker.respond-booking": async (input, ctx) => {
    const r = await respondBookingAction({
      locale: ctx.locale,
      bookingId: input.bookingId,
      decision: input.decision,
      reasonKind: input.reasonKind ?? null,
      reasonNote: input.reasonNote ?? null,
    });
    if (r.kind === "ok") {
      return {
        ok: true,
        data: {
          status: r.status,
          reasonStored: r.reasonStored ?? null,
          engagement: r.engagement ?? null,
        },
      };
    }
    return { ok: false, code: mapKind(r.kind) };
  },

  "worker.express-interest": async (input, ctx) => {
    const r = await expressInterestAction(ctx.locale, input.requestId, input.note ?? null);
    return r.kind === "ok" ? { ok: true, data: { status: r.status } } : { ok: false, code: mapKind(r.kind) };
  },

  "worker.log-work": async (input, ctx) => {
    // Delegate to the canonical journal save (create_journal_entry_full,
    // append-only + hash-chained). `notes` is the evidence text; date + site
    // become metrics. Skills are recognized from the notes by the journal's own
    // pipeline — this executor declares nothing.
    const r = await createJournalEntry(
      fd({
        locale: ctx.locale,
        engagement_context_id: input.engagementContextId,
        notes: input.notes,
        work_date: input.workDate,
        site_name: input.siteName ?? "",
      }),
    );
    if (!r.ok) return { ok: false, code: r.code, message: r.message };
    // PR-C "what changed" visibility: pass the REAL awaited pipeline outcome
    // through to the chat surface (a read-through of the canonical result —
    // nothing computed or invented here; §7 the UI may only show these facts).
    return {
      ok: true,
      data: {
        entryId: r.entryId,
        skills: {
          status: r.skills.status,
          addedSkills: r.skills.addedSkills.map((s) => s.slug),
          strengthenedSkills: r.skills.strengthenedSkills.map((s) => s.slug),
          // Confirmable candidates awaiting the worker (fuzzy/ambiguous/claim).
          pendingCandidates: r.skills.candidates.map((c) => ({
            label: c.label,
            slug: c.slug ?? null,
            kind: c.kind,
          })),
          cvUpdated: r.skills.cvUpdated,
        },
      },
    };
  },
});
