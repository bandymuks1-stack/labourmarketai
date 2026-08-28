import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";

import { resolveApiIdentity } from "@/lib/api/api-identity";
import {
  DOCUMENT_FILES_BUCKET,
  DOCUMENT_FILE_SIGNED_URL_TTL_SECONDS,
  isDocumentFileAbsentCode,
} from "@/lib/documents/document-file-model";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/documents/file/:fileId — the ONE document download door
 * (Document & Evidence Engine v1).
 *
 * Authority chain, all with the CALLER's OWN client (no service role):
 *   1. the `document_files` row must answer under RLS (worker-owner /
 *      org-read predicate / admin — the same truth the storage policies
 *      delegate to);
 *   2. classified org documents get their download RECORDED first via the
 *      gated `record_org_document_download_v1` (append-only event) — a
 *      failed recording denies the download rather than skipping the log;
 *   3. a SHORT-LIVED signed URL (60 s) is minted — storage RLS enforces the
 *      same predicate again at signing time — and the response redirects.
 *
 * No public URLs, no long-lived links, no path guessing: an unauthorized
 * caller gets 404 whether the file exists or not (no existence oracle).
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function asAny(c: SupabaseClient): any {
  return c;
}

const UUID_RX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(
  req: Request,
  { params }: { params: Promise<{ fileId: string }> },
) {
  const { fileId } = await params;
  if (!UUID_RX.test(fileId)) {
    return NextResponse.json({ ok: false }, { status: 404 });
  }

  // SHARED AUTHENTICATED API — cookie session OR bearer token, one resolver.
  // Every authority below (the RLS read, the gated download recording, the
  // signed-URL mint) is untouched and still runs as the CALLER.
  const auth = await resolveApiIdentity(req);
  if (!auth.ok) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }
  const { supabase } = auth.identity;

  // RLS answers or it does not — one 404 for "missing" and "not yours".
  const { data, error } = await asAny(supabase)
    .from("document_files")
    .select(
      "id, storage_path, org_document_id, org_documents(classification)",
    )
    .eq("id", fileId)
    .maybeSingle();
  if (error) {
    const status = isDocumentFileAbsentCode(error.code) ? 404 : 500;
    return NextResponse.json({ ok: false }, { status });
  }
  const row = data as {
    id: string;
    storage_path: string;
    org_document_id: string | null;
    org_documents: { classification?: string } | null;
  } | null;
  if (!row) {
    return NextResponse.json({ ok: false }, { status: 404 });
  }

  // Classified org documents: the download is logged BEFORE the URL exists.
  if (
    row.org_document_id &&
    row.org_documents?.classification === "classified"
  ) {
    const rec = await asAny(supabase).rpc("record_org_document_download_v1", {
      p_document_file_id: row.id,
    });
    if (rec.error || String(rec.data ?? "") !== "recorded") {
      return NextResponse.json({ ok: false }, { status: 403 });
    }
  }

  const signed = await supabase.storage
    .from(DOCUMENT_FILES_BUCKET)
    .createSignedUrl(row.storage_path, DOCUMENT_FILE_SIGNED_URL_TTL_SECONDS);
  if (signed.error || !signed.data?.signedUrl) {
    return NextResponse.json({ ok: false }, { status: 404 });
  }

  return NextResponse.redirect(signed.data.signedUrl, 302);
}
