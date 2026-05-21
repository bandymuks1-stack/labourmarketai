import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { ownsWorker, uuidSchema } from "@/lib/skills";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** DELETE /api/workers/:workerId/skills/:skillId — remove one declared skill. */
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ workerId: string; skillId: string }> },
) {
  const { workerId, skillId } = await params;
  if (
    !uuidSchema.safeParse(workerId).success ||
    !uuidSchema.safeParse(skillId).success
  ) {
    return NextResponse.json({ ok: false, message: "Invalid id" }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ ok: false, message: "Unauthorized" }, { status: 401 });
  }
  if (!(await ownsWorker(supabase, workerId, user.id))) {
    return NextResponse.json({ ok: false, message: "Forbidden" }, { status: 403 });
  }

  const { error } = await supabase
    .from("worker_skills")
    .delete()
    .eq("worker_id", workerId)
    .eq("skill_id", skillId);
  if (error) {
    console.error("[api/workers/skills DELETE] failed:", error.message);
    return NextResponse.json({ ok: false, message: "Failed to delete" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
