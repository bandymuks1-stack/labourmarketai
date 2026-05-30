import { NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";

// Anonymous pre-auth funnel — inserts into `leads` via the service-role client
// (RLS-bypassing) for a landing/waitlist email capture (brief §10.4). This is
// DELIBERATELY NOT the demand intake: an authenticated structured need goes to
// `customer_requests` via submit_demand_request (PLATFORM_DOCTRINE §17.2). Since
// the dashboard pilot-request CTA was repointed onto the canonical intake
// (Slice 3.1), this endpoint is currently dormant — kept for a future genuinely
// anonymous landing CTA. Always returns JSON; never throws to the client.
// Degrades gracefully when the service key is not configured yet.
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
