import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { requireSupabaseClientEnv } from "@/lib/env";
import type { Database } from "@/lib/supabase/types";

// Companies / agencies waitlist (PV §10 honesty): M1 only ships worker
// functionality, so non-worker visitors land here. Inserts run as the
// `anon` Postgres role and rely on the `waitlist_insert_anon` RLS policy
// from migration 0005 — no service-role key needed.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Schema = z.object({
  email: z.string().email().max(254),
  locale: z.string().trim().max(8).optional().nullable(),
  source: z.string().trim().max(60).default("landing_company_modal"),
});

const PG_UNIQUE_VIOLATION = "23505";

export async function POST(req: Request) {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch (err) {
    console.error("[waitlist] invalid JSON body", err);
    return NextResponse.json(
      { ok: false, message: "Invalid request body" },
      { status: 400 },
    );
  }

  // PRIVACY: never log the raw body — it carries the visitor's email (PII).
  const parsed = Schema.safeParse(raw);
  if (!parsed.success) {
    console.error("[waitlist] schema validation failed", parsed.error.flatten());
    return NextResponse.json(
      { ok: false, message: "Please provide a valid email" },
      { status: 422 },
    );
  }

  const { url, anonKey } = requireSupabaseClientEnv();
  const supabase = createSupabaseClient<Database>(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { error } = await supabase.from("waitlist").insert({
    email: parsed.data.email,
    locale: parsed.data.locale ?? null,
    source: parsed.data.source,
  });

  if (error) {
    if (error.code === PG_UNIQUE_VIOLATION) {
      console.log("[waitlist] duplicate email [redacted]");
      return NextResponse.json({ ok: true, duplicate: true });
    }
    console.error("[waitlist] insert failed", {
      code: error.code,
      message: error.message,
      details: error.details,
      hint: error.hint,
    });
    return NextResponse.json(
      { ok: false, message: "Could not save right now" },
      { status: 502 },
    );
  }

  console.log("[waitlist] inserted (email redacted), source:", parsed.data.source);
  return NextResponse.json({ ok: true });
}
