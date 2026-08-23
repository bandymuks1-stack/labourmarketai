import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { extractCvText, MAX_CV_BYTES } from "@/lib/cv/extract";
import { rateLimit } from "@/lib/security/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/cv/extract — turn an uploaded CV file into raw text.
 *
 * Auth-gated: only a logged-in user may extract, and the text is returned ONLY
 * to that caller (they then review + save it into THEIR OWN profile via the
 * existing owner-only flow). This route stores nothing and writes no DB row.
 *
 * Security:
 *   - requires an authenticated session (401 otherwise);
 *   - hard 5 MB size cap (413 otherwise) — checked before reading the body fully;
 *   - never logs the CV text (only a coarse error code);
 *   - returns a typed error code, never the underlying parser message;
 *   - per-user rate limit (SEC-16): each call runs a PDF/DOCX parser, which is
 *     CPU amplification an authenticated caller could otherwise drive freely.
 *     In-memory per-instance — a brake on naive abuse, not a distributed quota.
 */
const RATE_LIMIT = { limit: 10, windowMs: 10 * 60 * 1000 } as const;

export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ ok: false, code: "unauthorized" }, { status: 401 });
  }

  const decision = rateLimit({ name: "cv-extract", key: user.id, ...RATE_LIMIT });
  if (decision.limited) {
    return NextResponse.json(
      { ok: false, code: "rate-limited" },
      {
        status: 429,
        headers: { "retry-after": String(decision.retryAfterSeconds) },
      },
    );
  }

  // Cheap pre-check via Content-Length so an oversized upload is rejected
  // before we buffer it. The real cap is re-checked on the actual bytes below.
  const declared = Number(req.headers.get("content-length") ?? "0");
  if (declared && declared > MAX_CV_BYTES + 1024) {
    return NextResponse.json({ ok: false, code: "too-large" }, { status: 413 });
  }

  let file: File | null = null;
  try {
    const form = await req.formData();
    const f = form.get("file");
    if (f instanceof File) file = f;
  } catch {
    return NextResponse.json({ ok: false, code: "bad-request" }, { status: 400 });
  }
  if (!file) {
    return NextResponse.json({ ok: false, code: "bad-request" }, { status: 400 });
  }
  if (file.size > MAX_CV_BYTES) {
    return NextResponse.json({ ok: false, code: "too-large" }, { status: 413 });
  }

  const buffer = await file.arrayBuffer();
  const result = await extractCvText(buffer, file.name, file.type);

  switch (result.kind) {
    case "ok":
      // Return ONLY the text + format. No persistence here; no logging of text.
      return NextResponse.json({ ok: true, text: result.text, format: result.format });
    case "unsupported":
      return NextResponse.json({ ok: false, code: "unsupported" }, { status: 415 });
    case "too-large":
      return NextResponse.json({ ok: false, code: "too-large" }, { status: 413 });
    case "empty":
      return NextResponse.json({ ok: false, code: "empty" }, { status: 422 });
    case "failed":
    default:
      // Coarse code only — the parser error may echo document bytes, so it is
      // deliberately not surfaced or logged in full.
      console.error("[api/cv/extract] extraction failed for an uploaded file");
      return NextResponse.json({ ok: false, code: "failed" }, { status: 422 });
  }
}
