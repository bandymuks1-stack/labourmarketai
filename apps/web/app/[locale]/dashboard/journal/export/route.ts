import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";

import { createClient } from "@/lib/supabase/server";
import {
  buildJournalCsv,
  journalCsvFilename,
  type JournalExportRow,
} from "@/lib/journal/journal-export";

/**
 * GET — download the caller's OWN work journal as CSV (quality-train PR I).
 * Same honesty contract as the privacy export: every read is an RLS-scoped
 * query as the signed-in worker; no service role; skills appear as LINKED
 * evidence slugs (journal_entry_skills), never as verification claims.
 */
export const dynamic = "force-dynamic";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function asAny(c: SupabaseClient): any {
  return c;
}

export async function GET(): Promise<NextResponse> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "not_authenticated" }, { status: 401 });
  }

  const { data: worker } = await supabase
    .from("workers")
    .select("id")
    .eq("profile_id", user.id)
    .maybeSingle();
  if (!worker?.id) {
    return NextResponse.json({ error: "no_worker" }, { status: 403 });
  }

  const [entriesRes, linksRes] = await Promise.all([
    supabase
      .from("journal_entries")
      .select("id, created_at, entry_type_slug, original_language, original_text")
      .eq("worker_id", worker.id)
      .order("created_at", { ascending: true }),
    asAny(supabase)
      .from("journal_entry_skills")
      .select("journal_entry_id, skills(slug)")
      .eq("worker_id", worker.id),
  ]);

  const slugsByEntry = new Map<string, string[]>();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const link of (linksRes.data ?? []) as any[]) {
    const slug = link.skills?.slug as string | undefined;
    if (!slug) continue;
    const list = slugsByEntry.get(link.journal_entry_id) ?? [];
    list.push(slug);
    slugsByEntry.set(link.journal_entry_id, list);
  }

  const rows: JournalExportRow[] = (entriesRes.data ?? []).map((e) => ({
    createdAt: e.created_at ?? "",
    entryType: e.entry_type_slug ?? "",
    language: e.original_language ?? "",
    text: e.original_text ?? "",
    linkedSkillSlugs: slugsByEntry.get(e.id) ?? [],
  }));

  const day = new Date().toISOString().slice(0, 10);
  return new NextResponse(buildJournalCsv(rows), {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${journalCsvFilename(day)}"`,
      "Cache-Control": "no-store",
    },
  });
}
