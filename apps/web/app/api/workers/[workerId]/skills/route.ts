import { NextResponse } from "next/server";
import { resolveApiIdentity, refusalStatus } from "@/lib/auth/api-identity";
import {
  ownsWorker,
  workerProfessionSkillIds,
  saveSkillsSchema,
  uuidSchema,
} from "@/lib/skills";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/workers/:workerId/skills — the worker's declared skills. */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ workerId: string }> },
) {
  const { workerId } = await params;
  if (!uuidSchema.safeParse(workerId).success) {
    return NextResponse.json({ ok: false, message: "Invalid worker id" }, { status: 400 });
  }

  const identity = await resolveApiIdentity(req);
  if (!identity.ok) {
    return NextResponse.json(
      { ok: false, message: "Unauthorized" },
      { status: refusalStatus(identity.reason) },
    );
  }
  // The caller's OWN RLS-scoped client — ownership and visibility are still
  // decided by the database, exactly as before. This seam establishes WHO.
  const { supabase, userId } = identity;
  if (!(await ownsWorker(supabase, workerId, userId))) {
    return NextResponse.json({ ok: false, message: "Forbidden" }, { status: 403 });
  }

  const { data, error } = await supabase
    .from("worker_skills")
    .select("skill_id, verified, source, verified_at")
    .eq("worker_id", workerId);

  if (error) {
    console.error("[api/workers/skills GET] failed:", error.message);
    return NextResponse.json({ ok: false, message: "Failed to load" }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    skills: (data ?? []).map((r) => ({
      skillId: r.skill_id,
      verified: r.verified,
      source: r.source,
      verifiedAt: r.verified_at,
    })),
  });
}

/**
 * POST /api/workers/:workerId/skills  body: { skillIds: string[] }
 * Replaces the worker's full skill set (idempotent). Rejects ids not linked to
 * the worker's PRIMARY profession (can't pick welder skills as a plasterer).
 * Owner-only in M1 (manager flow = M2; see lib/skills ownsWorker).
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ workerId: string }> },
) {
  const { workerId } = await params;
  if (!uuidSchema.safeParse(workerId).success) {
    return NextResponse.json({ ok: false, message: "Invalid worker id" }, { status: 400 });
  }

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ ok: false, message: "Invalid body" }, { status: 400 });
  }
  const parsed = saveSkillsSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, message: "skillIds must be an array of uuids" },
      { status: 400 },
    );
  }
  const requested = [...new Set(parsed.data.skillIds)];

  const identity = await resolveApiIdentity(req);
  if (!identity.ok) {
    return NextResponse.json(
      { ok: false, message: "Unauthorized" },
      { status: refusalStatus(identity.reason) },
    );
  }
  // The caller's OWN RLS-scoped client — ownership and visibility are still
  // decided by the database, exactly as before. This seam establishes WHO.
  const { supabase, userId } = identity;
  if (!(await ownsWorker(supabase, workerId, userId))) {
    return NextResponse.json({ ok: false, message: "Forbidden" }, { status: 403 });
  }

  // Current saved set (also the diff baseline below).
  const { data: existingRows, error: exErr } = await supabase
    .from("worker_skills")
    .select("skill_id")
    .eq("worker_id", workerId);
  if (exErr) {
    console.error("[api/workers/skills POST] read failed:", exErr.message);
    return NextResponse.json({ ok: false, message: "Failed to save" }, { status: 500 });
  }
  const existing = new Set((existingRows ?? []).map((r) => r.skill_id));

  // Scope guard: a NEW skill must belong to ANY of the worker's directions
  // (primary + additional) — non-locking (§1). Already-saved skills are always
  // allowed (so removing a direction never blocks a save or silently drops
  // unrelated skills — the worker keeps or deselects them deliberately).
  const allowed = await workerProfessionSkillIds(supabase, workerId);
  if (allowed.size === 0 && existing.size === 0) {
    return NextResponse.json(
      { ok: false, message: "Add a work direction before adding skills" },
      { status: 400 },
    );
  }
  const offending = requested.filter(
    (id) => !allowed.has(id) && !existing.has(id),
  );
  if (offending.length > 0) {
    return NextResponse.json(
      { ok: false, message: "Some skills are not valid for your directions", offending },
      { status: 400 },
    );
  }
  const requestedSet = new Set(requested);
  const toInsert = requested.filter((id) => !existing.has(id));
  const toDelete = [...existing].filter(
    (id): id is string => id !== null && !requestedSet.has(id),
  );

  if (toDelete.length > 0) {
    const { error } = await supabase
      .from("worker_skills")
      .delete()
      .eq("worker_id", workerId)
      .in("skill_id", toDelete);
    if (error) {
      console.error("[api/workers/skills POST] delete failed:", error.message);
      return NextResponse.json({ ok: false, message: "Failed to save" }, { status: 500 });
    }
  }
  if (toInsert.length > 0) {
    // source/verified take their column defaults (self_declared / false).
    const { error } = await supabase
      .from("worker_skills")
      .insert(toInsert.map((skill_id) => ({ worker_id: workerId, skill_id })));
    if (error) {
      console.error("[api/workers/skills POST] insert failed:", error.message);
      return NextResponse.json({ ok: false, message: "Failed to save" }, { status: 500 });
    }
  }

  return NextResponse.json({ ok: true, count: requested.length });
}
