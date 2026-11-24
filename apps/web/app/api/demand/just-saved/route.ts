import { NextResponse } from "next/server";

import { findOwnJustSubmittedDemand, type DemandIntent } from "@/lib/demand/demand-request";

/**
 * WAS THE NEED SAVED? — the need form's question after the submit's answer was
 * lost (owner order 2026-11-23, production run 45241051644).
 *
 * A plain route, NOT a server action, on purpose: server actions share the App
 * Router's one action queue, and the answer that was lost came through that
 * queue. A follow-up server action can wait behind it indefinitely (seen in CI:
 * no request was sent for 30 s), so the recovery must not depend on it.
 *
 * Read-only. The caller's own open need of this kind with exactly the title and
 * description just sent, created since the send, in the caller's active
 * organization (RLS + the employer workspace gate in the reader). Answers the
 * id or null — nothing else is echoed.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ id: null }, { status: 400 });
  }
  const b = (body ?? {}) as Record<string, unknown>;
  const intent: DemandIntent | null = b.intent === "hire_workers" || b.intent === "partner" ? b.intent : null;
  if (!intent || typeof b.description !== "string" || typeof b.sentAt !== "string") {
    return NextResponse.json({ id: null }, { status: 400 });
  }
  const id = await findOwnJustSubmittedDemand(
    intent,
    { role: typeof b.role === "string" ? b.role : undefined, description: b.description },
    b.sentAt,
  ).catch(() => null);
  return NextResponse.json({ id }, { headers: { "Cache-Control": "no-store" } });
}
