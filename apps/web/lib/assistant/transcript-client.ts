/**
 * Client half of transcript persistence (P0 2026-10-14).
 *
 * One keepalive POST to `/api/assistant/transcript` — beside the page's
 * server-action queue, and finished by the browser even after the page is
 * closed or left. Answers the thread the server wrote into, or null when
 * nothing was saved (never a claimed success).
 */
export async function postTranscriptTurn(input: {
  conversationId: string | null;
  role: "user" | "assistant";
  text: string;
  language: string;
}): Promise<string | null> {
  const res = await fetch("/api/assistant/transcript", {
    method: "POST",
    keepalive: true,
    credentials: "same-origin",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ ...input, text: input.text.slice(0, 8000) }),
  });
  if (!res.ok) return null;
  const out = (await res.json().catch(() => null)) as { saved?: boolean; conversationId?: string } | null;
  return out?.saved && out.conversationId ? out.conversationId : null;
}
