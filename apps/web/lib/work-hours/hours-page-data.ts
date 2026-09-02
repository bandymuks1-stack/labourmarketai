import "server-only";

import { resolveEmployerCompanyContext } from "@/lib/company/employer-company-context";
import { listActiveCompanyWorkers } from "@/lib/company/company-workers";
import { getOrgWorkObjects } from "@/lib/objects/objects";
import { getAllocationsForDate } from "@/lib/work-hours/allocations";
import {
  objectTint,
  workerDayTotals,
  type WorkHourAllocation,
} from "@/lib/work-hours/allocations-model";

/**
 * Everything one day of the hours surface needs, assembled server-side.
 *
 * Composed from the EXISTING readers — `listActiveCompanyWorkers`,
 * `getOrgWorkObjects` — rather than new queries, so the crew and the objects
 * shown here are byte-identical to the ones the company page and the task
 * picker show. A second worker list would be a second answer to "who works
 * here".
 *
 * Every branch degrades honestly. "No objects configured yet" and "the
 * migration is not applied" are different sentences, because they need
 * different actions from the person reading them.
 */

export type HoursPageWorker = {
  readonly workerId: string;
  readonly name: string;
  /** Hours already recorded for this worker on this date — the number an
   *  operator checks before moving to the next person. */
  readonly dayTotal: number;
};

export type HoursPageObject = {
  readonly id: string;
  readonly name: string;
  /** Resolved tint: configured colour, else a deterministic fallback so
   *  objects stay distinguishable before anyone sets one. */
  readonly tint: string;
};

export type HoursPageEntry = {
  readonly id: string;
  readonly workerName: string;
  readonly objectName: string;
  readonly objectTint: string;
  readonly hours: number;
  readonly note: string | null;
  /** True when somebody OTHER than the worker recorded it. Shown, because a
   *  record entered on a person's behalf should say so. */
  readonly enteredForSomeoneElse: boolean;
};

export type HoursPageData =
  | {
      readonly kind: "ok";
      readonly organizationId: string;
      readonly workDate: string;
      readonly workers: readonly HoursPageWorker[];
      readonly objects: readonly HoursPageObject[];
      readonly entries: readonly HoursPageEntry[];
      readonly dayTotal: number;
    }
  | { readonly kind: "needs-migration" }
  | { readonly kind: "no-company" }
  | { readonly kind: "no-objects"; readonly organizationId: string }
  | { readonly kind: "error" };

/** Today in UTC — the same day key the rest of the platform files work under
 *  (W12), so an entry never lands on a different day than the journal. */
export function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

export async function getHoursPageData(workDate: string): Promise<HoursPageData> {
  const ctx = await resolveEmployerCompanyContext();
  if (ctx.kind !== "ok") return { kind: "no-company" };

  const [objectsRes, allocationsRes] = await Promise.all([
    getOrgWorkObjects(),
    getAllocationsForDate(workDate),
  ]);

  if (allocationsRes.kind === "needs-migration") return { kind: "needs-migration" };
  if (allocationsRes.kind === "no-company") return { kind: "no-company" };
  if (allocationsRes.kind === "error") return { kind: "error" };

  if (objectsRes.kind === "needs-migration") return { kind: "needs-migration" };
  if (objectsRes.kind === "no-company") return { kind: "no-company" };
  if (objectsRes.kind === "error") return { kind: "error" };

  const activeObjects = objectsRes.rows.filter((o) => o.status === "active");
  if (activeObjects.length === 0) {
    // Distinct from an error: the company simply has no sites yet, and the
    // fix is to add one — a sentence, not a stack trace.
    return { kind: "no-objects", organizationId: ctx.organizationId };
  }

  const objects: HoursPageObject[] = activeObjects.map((o) => ({
    id: o.id,
    name: o.name,
    tint: objectTint(o.id, o.colorHex),
  }));
  const objectById = new Map(objects.map((o) => [o.id, o]));

  // The crew, from the canonical company-workers reader.
  const workersRes = await listActiveCompanyWorkers(ctx.companyId);
  const workerRows = workersRes.kind === "ok" ? workersRes.rows : [];
  const workerName = new Map(
    workerRows.map((w) => [
      w.workerId,
      w.displayName?.trim() || w.email?.split("@")[0] || "—",
    ]),
  );
  const workerProfile = new Map(workerRows.map((w) => [w.workerId, w.profileId]));

  const allocations: readonly WorkHourAllocation[] = allocationsRes.rows;
  const totals = new Map(
    workerDayTotals(allocations).map((t) => [t.workerId, t.hours]),
  );

  const workers: HoursPageWorker[] = workerRows
    .map((w) => ({
      workerId: w.workerId,
      name: workerName.get(w.workerId) ?? "—",
      dayTotal: totals.get(w.workerId) ?? 0,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  const entries: HoursPageEntry[] = allocations.map((a) => {
    const obj = objectById.get(a.workObjectId);
    return {
      id: a.id,
      workerName: workerName.get(a.workerId) ?? "—",
      objectName: obj?.name ?? "—",
      objectTint: obj?.tint ?? objectTint(a.workObjectId, null),
      hours: a.hours,
      note: a.note,
      enteredForSomeoneElse: workerProfile.get(a.workerId) !== a.enteredBy,
    };
  });

  return {
    kind: "ok",
    organizationId: ctx.organizationId,
    workDate,
    workers,
    objects,
    entries,
    dayTotal: allocations.reduce(
      (acc, a) => Math.round(acc * 100 + a.hours * 100) / 100,
      0,
    ),
  };
}
