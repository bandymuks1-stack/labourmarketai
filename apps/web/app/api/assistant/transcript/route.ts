import { NextResponse } from "next/server";

import { appendAssistantTurn } from "@/lib/assistant/transcript";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Transcript append door for the chat surface (P0, 2026-10-14).
 *
 * WHY A ROUTE AND NOT THE SERVER ACTION: Next.js runs one page's server
 * actions ONE AT A TIME. The transcript append used to queue behind every
 * other action the chat fires (capability reads, the intent proposal, …), so
 * a person who sent a message and closed or left the page within seconds lost
 * it for good — production 2026-10-14: the question and its answer were never
 * written. A plain `fetch(…, { keepalive: true })` to this route runs beside
 * that queue and is completed by the browser even after the page unloads.
 *
 * SAME THING, ONE CORE: it calls `appendAssistantTurn` — the same writer, the
 * same hash-chaining RPC, the same server-side (person, workspace) thread
 * resolution. No second store, no buffering.
 *
 * GUARDS: cookie session only (the RPC refuses anyone but the thread owner);
 * same-origin only (a cross-site page cannot write into someone's transcript
 * with their cookies); JSON only; bounded body. Failures answer
 * `{ saved: false }` — never a claimed success.
 */
const MAX_BODY = 16 * 1024;

function sameOrigin(req: Request): boolean {
  const site = req.headers.get("sec-fetch-site");
  if (site && site !== "same-origin") return false;
  const origin = req.headers.get("origin");
  if (origin === null) return site === "same-origin";
  try {
    return new URL(origin).host === new URL(req.url).host;
  } catch {
    return false;
  }
}

export async function POST(req: Request) {
  if (!sameOrigin(req)) return NextResponse.json({ saved: false }, { status: 403 });
  if (!(req.headers.get("content-type") ?? "").toLowerCase().includes("application/json")) {
    return NextResponse.json({ saved: false }, { status: 415 });
  }
  const raw = await req.text();
  if (raw.length > MAX_BODY) return NextResponse.json({ saved: false }, { status: 413 });

  let body: { role?: unknown; text?: unknown; language?: unknown; conversationId?: unknown };
  try {
    body = JSON.parse(raw);
  } catch {
    return NextResponse.json({ saved: false }, { status: 400 });
  }
  const role = body.role === "user" || body.role === "assistant" ? body.role : null;
  const text = typeof body.text === "string" ? body.text : "";
  if (!role || !text.trim()) return NextResponse.json({ saved: false }, { status: 400 });

  const res = await appendAssistantTurn({
    conversationId: typeof body.conversationId === "string" ? body.conversationId : null,
    role,
    text,
    language: typeof body.language === "string" ? body.language : "en",
  });
  if (!res.available) return NextResponse.json({ saved: false }, { status: 200 });
  return NextResponse.json({ saved: true, conversationId: res.conversationId, seq: res.seq });
}
