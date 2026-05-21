import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { uuidSchema } from "@/lib/skills";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/professions/:professionId/skills
 * Curated skills linked to a profession, sorted by display_order, with the
 * `isCore` flag. Auth required (taxonomy is for logged-in users); RLS makes
 * profession_skills + skills readable to any authenticated user.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ professionId: string }> },
) {
  const { professionId } = await params;
  if (!uuidSchema.safeParse(professionId).success) {
    return NextResponse.json(
      { ok: false, message: "Invalid profession id" },
      { status: 400 },
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json(
      { ok: false, message: "Unauthorized" },
      { status: 401 },
    );
  }

  const { data, error } = await supabase
    .from("profession_skills")
    .select(
      "is_core, display_order, skills(id, slug, name_lt, name_en, category, is_active)",
    )
    .eq("profession_id", professionId)
    .order("display_order", { ascending: true });

  if (error) {
    console.error("[api/professions/skills] query failed:", error.message);
    return NextResponse.json(
      { ok: false, message: "Failed to load skills" },
      { status: 500 },
    );
  }

  const skills = (data ?? [])
    .map((row) => {
      const s = row.skills;
      if (!s || s.is_active === false) return null;
      return {
        id: s.id,
        slug: s.slug,
        name_lt: s.name_lt,
        name_en: s.name_en,
        category: s.category,
        isCore: row.is_core,
        displayOrder: row.display_order,
      };
    })
    .filter((s): s is NonNullable<typeof s> => s !== null);

  return NextResponse.json({ ok: true, skills });
}
