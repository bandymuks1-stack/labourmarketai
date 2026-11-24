import { NextResponse } from "next/server";
import { refusalStatus, resolveApiIdentity } from "@/lib/api/api-identity";
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
  req: Request,
  { params }: { params: Promise<{ professionId: string }> },
) {
  const { professionId } = await params;
  if (!uuidSchema.safeParse(professionId).success) {
    return NextResponse.json(
      { ok: false, message: "Invalid profession id" },
      { status: 400 },
    );
  }

  // SHARED AUTHENTICATED API — cookie session OR bearer token, one resolver.
  const auth = await resolveApiIdentity(req);
  if (!auth.ok) {
    return NextResponse.json(
      { ok: false, message: "Unauthorized" },
      { status: refusalStatus(auth.reason) },
    );
  }
  // RLS decides what this taxonomy read returns, exactly as before; the
  // transport only decided WHO is asking.
  const { supabase } = auth.identity;

  // Names are NOT returned — they live in JSON keyed by slug
  // (PLATFORM_DOCTRINE §2). The client renders t(`skillNames.${slug}`).
  const { data, error } = await supabase
    .from("profession_skills")
    .select("is_core, display_order, skills(id, slug, category, is_active)")
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
      if (!s || s.is_active === false || !s.slug) return null;
      return {
        id: s.id,
        slug: s.slug,
        category: s.category,
        isCore: row.is_core,
        displayOrder: row.display_order,
      };
    })
    .filter((s): s is NonNullable<typeof s> => s !== null);

  return NextResponse.json({ ok: true, skills });
}
