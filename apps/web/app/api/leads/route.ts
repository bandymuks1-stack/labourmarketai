import { NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";

// Inserts into `leads` via the service-role client (RLS-bypassing) — the
// ONLY real DB write on public M0 pages (brief §10.4). Always returns JSON;
// never throws to the client. Degrades gracefully when the service key is
// not configured yet (preview before the founder sets Vercel env).
export const runtime = "nodejs";

const Schema = z.object({
  email: z.string().email().max(254),
  full_name: z.string().trim().max(120).optional().nullable(),
  intent: z
    .enum(["hire_workers", "find_job", "partner", "unknown"])
    .default("unknown"),
  source: z.string().trim().max(60).default("landing_cta"),
});

export async function POST(req: Request) {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json(
      { ok: false, message: "Invalid request body" },
      { status: 400 },
    );
  }

  const parsed = Schema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, message: "Please provide a valid email" },
      { status: 422 },
    );
  }

  try {
    const admin = createAdminClient();
    const { error } = await admin.from("leads").insert({
      email: parsed.data.email,
      full_name: parsed.data.full_name ?? null,
      intent: parsed.data.intent,
      source: parsed.data.source,
      status: "new",
    });
    if (error) {
      return NextResponse.json(
        { ok: false, message: "Could not save right now" },
        { status: 502 },
      );
    }
    return NextResponse.json({ ok: true });
  } catch {
    // createAdminClient throws if SUPABASE_SERVICE_ROLE_KEY is missing.
    return NextResponse.json(
      { ok: false, message: "Lead capture is not configured yet" },
      { status: 503 },
    );
  }
}
