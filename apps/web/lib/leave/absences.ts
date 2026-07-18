import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { createClient } from "@/lib/supabase/server";
import {
  ABSENCE_STATUSES,
  ABSENCE_TYPES,
  type AbsenceStatus,
  type AbsenceType,
  type ManagerAbsencesData,
  type MyAbsencesData,
  type WorkerAbsence,
} from "@/lib/leave/absences-model";

/**
 * Leave & absence read models (Wagon 7 slice). RLS scopes every row to the
 * worker themselves or a real manager of that worker. Honest degradation: a
 * missing relation (owner-gated migration unapplied) returns { applied: false }.
 */

export {
  ABSENCE_STATUSES,
  ABSENCE_TYPES,
  type AbsenceStatus,
  type AbsenceType,
  type ManagerAbsencesData,
  type MyAbsencesData,
  type WorkerAbsence,
} from "@/lib/leave/absences-model";

const RELATION_NOT_FOUND = "42P01";
const UNDEFINED_COLUMN = "42703";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function asAny(c: SupabaseClient): any {
  return c;
}

type Row = {
  id: string;
  worker_id: string;
  absence_type: string;
  start_date: string;
  end_date: string;
  half_day: boolean;
  note: string | null;
  status: string;
};

function toAbsence(r: Row, workerName: string | null): WorkerAbsence | null {
  if (!(ABSENCE_TYPES as readonly string[]).includes(r.absence_type)) return null;
  if (!(ABSENCE_STATUSES as readonly string[]).includes(r.status)) return null;
  return {
    id: r.id,
    workerId: r.worker_id,
    workerName,
    absenceType: r.absence_type as AbsenceType,
    startDate: r.start_date,
    endDate: r.end_date,
    halfDay: !!r.half_day,
    note: r.note,
    status: r.status as AbsenceStatus,
  };
}

/** The signed-in worker's own absences (+ their worker_id for the request form). */
export async function getMyAbsences(): Promise<MyAbsencesData> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { applied: false };

  const { data: worker } = await asAny(supabase)
    .from("workers")
    .select("id")
    .eq("profile_id", user.id)
    .maybeSingle();
  const workerId: string | null = worker?.id ?? null;
  if (!workerId) return { applied: true, workerId: null, absences: [] };

  const res = await asAny(supabase)
    .from("worker_absences")
    .select("id, worker_id, absence_type, start_date, end_date, half_day, note, status")
    .eq("worker_id", workerId)
    .order("start_date", { ascending: false })
    .limit(100);

  if (res.error) {
    if (res.error.code === RELATION_NOT_FOUND || res.error.code === UNDEFINED_COLUMN) {
      return { applied: false };
    }
    return { applied: true, workerId, absences: [] };
  }
  const absences = ((res.data ?? []) as Row[])
    .map((r) => toAbsence(r, null))
    .filter((a): a is WorkerAbsence => a !== null);
  return { applied: true, workerId, absences };
}

/** Pending absence requests for workers the caller manages (RLS-scoped). */
export async function getManagerPendingAbsences(): Promise<ManagerAbsencesData> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { applied: false };

  const res = await asAny(supabase)
    .from("worker_absences")
    .select("id, worker_id, absence_type, start_date, end_date, half_day, note, status, workers(display_name)")
    .eq("status", "requested")
    .order("start_date", { ascending: true })
    .limit(200);

  if (res.error) {
    if (res.error.code === RELATION_NOT_FOUND || res.error.code === UNDEFINED_COLUMN) {
      return { applied: false };
    }
    return { applied: true, pending: [] };
  }
  const pending = ((res.data ?? []) as (Row & { workers?: { display_name?: string | null } })[])
    .map((r) => toAbsence(r, r.workers?.display_name ?? null))
    .filter((a): a is WorkerAbsence => a !== null);
  return { applied: true, pending };
}
