"use server";

import "server-only";

import { createClient } from "@/lib/supabase/server";
import { readWorkerProfessionRows } from "@/lib/data/worker-core";
import {
  addOwnProfession,
  addWorkerDirection,
  setPrimaryProfessionBySlug,
} from "@/lib/worker/actions";

/**
 * A PROFESSION SAID IN CHAT, SAVED THROUGH THE ONE PROFESSION PATH (owner
 * continuation 2026-09-29, item 1). "Esu pastolininkas" was answered with a
 * link to the profile page; nothing offered to record it. This module adds no
 * model: it reads the person's own `worker_professions` rows and writes them
 * only through the existing profile actions (`setPrimaryProfessionBySlug`,
 * `addWorkerDirection`, `addOwnProfession`), then reads them BACK so the chat
 * says what persisted, never what was asked.
 */

export type MyProfessionState =
  | {
      readonly kind: "ok";
      /** Catalogue slug of the primary profession, if one is set. */
      readonly primarySlug: string | null;
      /** Every catalogue slug held (primary first). */
      readonly slugs: readonly string[];
      /** The person's own words, where the catalogue has no entry. */
      readonly ownLabels: readonly string[];
    }
  | { readonly kind: "no-worker" }
  | { readonly kind: "error" };

export async function readMyProfessions(): Promise<MyProfessionState> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { kind: "error" };
    const { data: worker } = await supabase
      .from("workers")
      .select("id")
      .eq("profile_id", user.id)
      .maybeSingle();
    if (!worker) return { kind: "no-worker" };
    const read = await readWorkerProfessionRows({ supabase, userId: user.id }, worker.id);
    if (!read.ok) return { kind: "error" };
    const rows = read.value;
    return {
      kind: "ok",
      primarySlug: rows.find((r) => r.is_primary === true)?.professions?.slug ?? null,
      slugs: rows.map((r) => r.professions?.slug).filter((s): s is string => Boolean(s)),
      ownLabels: rows.map((r) => r.label).filter((l): l is string => Boolean(l)),
    };
  } catch {
    return { kind: "error" };
  }
}

export type SaveStatedProfession =
  | { readonly mode: "primary"; readonly slug: string }
  | { readonly mode: "direction"; readonly slug: string }
  | { readonly mode: "own"; readonly label: string; readonly locale: string };

export type SaveStatedProfessionResult =
  | { readonly ok: true; readonly state: MyProfessionState }
  | { readonly ok: false; readonly reason: "invalid" | "duplicate" | "failed" };

export async function saveStatedProfessionAction(
  input: SaveStatedProfession,
): Promise<SaveStatedProfessionResult> {
  try {
    if (input.mode === "primary") {
      if (!(await setPrimaryProfessionBySlug(input.slug))) return { ok: false, reason: "invalid" };
    } else if (input.mode === "direction") {
      if (!/^[a-z0-9_]{2,64}$/.test(input.slug)) return { ok: false, reason: "invalid" };
      const supabase = await createClient();
      const { data: row } = await supabase
        .from("professions")
        .select("id")
        .eq("slug", input.slug)
        .eq("is_active", true)
        .maybeSingle();
      const id = (row as { id?: string } | null)?.id ?? null;
      if (!id) return { ok: false, reason: "invalid" };
      await addWorkerDirection(id);
    } else {
      const fd = new FormData();
      fd.set("label", input.label);
      fd.set("locale", input.locale);
      const res = await addOwnProfession(fd);
      if (!res.ok && res.reason !== "duplicate") return { ok: false, reason: res.reason ?? "failed" };
    }
    // THE READ-BACK: what the chat reports is what the table now holds.
    return { ok: true, state: await readMyProfessions() };
  } catch {
    return { ok: false, reason: "failed" };
  }
}
