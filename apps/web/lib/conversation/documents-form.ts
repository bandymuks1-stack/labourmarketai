"use server";

import "server-only";

import { getLocale, getTranslations } from "next-intl/server";

import { DOCUMENT_COUNTRIES } from "@/lib/config/documents";
import { countryDisplayName } from "@/lib/location/country-model";
import { createClient } from "@/lib/supabase/server";

/**
 * The options the "record a document" form is BUILT from, per turn (owner
 * contract 2026-09-04 §12/§14 — documents first-class, by sentence):
 *   - types: the active WORKER document types from the canonical
 *     `document_types` catalogue (organisation-only kinds excluded), labelled
 *     by the same `documents.types` catalogue the documents page uses;
 *   - countries: the closed `DOCUMENT_COUNTRIES` set the upsert validates.
 * No new list anywhere. A failed catalogue read yields an empty type list and
 * the chat says the form is unavailable — never a guessed set.
 */
export async function loadDocumentFormOptionsForChat(): Promise<{
  readonly types: ReadonlyArray<{ value: string; label: string }>;
  readonly countries: ReadonlyArray<{ value: string; label: string }>;
}> {
  const locale = await getLocale();
  const t = await getTranslations("documents.types");
  const supabase = await createClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from("document_types")
    .select("slug, category")
    .eq("is_active", true)
    .neq("category", "organization")
    .order("slug");
  const types = error || !Array.isArray(data)
    ? []
    : (data as Array<{ slug: string }>).map((r) => ({ value: r.slug, label: t.has(r.slug) ? t(r.slug) : r.slug }));
  types.sort((a, b) => a.label.localeCompare(b.label, locale));
  const countries = (DOCUMENT_COUNTRIES as readonly string[]).map((code) => ({
    value: code,
    label: countryDisplayName(code, locale) || code,
  }));
  return { types, countries };
}
