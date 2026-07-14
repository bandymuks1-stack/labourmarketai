import "server-only";
import { createClient } from "@/lib/supabase/server";
import {
  parseJournalTemplateRow,
  type JournalTemplateOption,
} from "./journal-templates-model";

/**
 * Server read for ACTIVE journal profession templates (Journal Proof Engine
 * v1). Registry: `journal_profession_templates` (DRAFT migration
 * 20260714180000 — owner-gated). RLS already limits the read to active rows
 * for normal users; the `active` filter here keeps admin sessions from being
 * offered draft templates in the composer.
 *
 * Scope: templates matching one of the worker's profession slugs PLUS
 * profession-agnostic templates (profession_slug null). Honest degradation:
 * table missing (42P01 / PGRST205) or any read failure → [] — the composer
 * shows nothing (no RUOŠIAMA banner; an unavailable template registry is
 * simply absent, §18).
 */
export async function listActiveJournalTemplates(
  professionSlugs: readonly string[],
  locale: string,
): Promise<JournalTemplateOption[]> {
  const supabase = await createClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const res = await (supabase as any)
    .from("journal_profession_templates")
    .select("slug, profession_slug, field_schema")
    .eq("active", true)
    .order("slug");
  if (res.error) return [];
  const rows = (res.data ?? []) as {
    slug: string;
    profession_slug: string | null;
    field_schema: unknown;
  }[];
  const mine = new Set(professionSlugs);
  return rows
    .filter((r) => r.profession_slug === null || mine.has(r.profession_slug))
    .map((r) => parseJournalTemplateRow(r, locale))
    .filter((t): t is JournalTemplateOption => t !== null)
    .slice(0, 10);
}
