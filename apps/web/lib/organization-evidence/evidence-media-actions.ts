"use server";

import "server-only";

import { revalidatePath } from "next/cache";

import { displayedWorkspaceOf, refuseStaleWorkspace } from "@/lib/company/stale-workspace";
import { createClient } from "@/lib/supabase/server";
import { resolveEvidenceOrganization } from "./evidence-org-context";
import { registerEvidenceMedia, type EvidenceMediaWriteResult } from "./evidence-media-write";

/**
 * Upload ONE historical work photo with its STATED anchors and provenance.
 *
 * The organization is resolved SERVER-SIDE from the caller's active workspace
 * (`resolveEvidenceOrganization`) - never taken from the form. Every anchor and
 * date is explicit; none is inferred. The target is the ACTIVE organization, so the
 * first statement refuses a stale screen (displayed-workspace binding). Returns a result code; nothing redirects
 * and nothing is sent to anyone.
 */
export async function uploadEvidenceMediaAction(formData: FormData): Promise<EvidenceMediaWriteResult> {
  await refuseStaleWorkspace(displayedWorkspaceOf(formData));
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, code: "not_allowed" };
  const caller = { supabase, userId: user.id, locale: undefined };

  const org = await resolveEvidenceOrganization(caller, null);
  if (!org.ok) return { ok: false, code: "not_allowed" };

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { ok: false, code: "invalid" };
  const bytes = new Uint8Array(await file.arrayBuffer());

  const text = (k: string) => {
    const v = formData.get(k);
    return typeof v === "string" ? v : null;
  };

  const result = await registerEvidenceMedia(caller, {
    organizationId: org.organizationId,
    bytes,
    anchors: {
      evidenceRecordId: text("evidenceRecordId"),
      workObjectId: text("workObjectId"),
      organizationPersonId: text("organizationPersonId"),
      organizationLevel: text("organizationLevel") === "true",
    },
    sourceSystem: text("sourceSystem") ?? "",
    sourceReference: text("sourceReference"),
    originalFilename: file.name || null,
    originalTakenAt: text("originalTakenAt"),
    takenAtBasis: text("takenAtBasis"),
    caption: text("caption"),
    visibility: text("visibility") === "subject" ? "subject" : "private",
  });
  if (result.ok && result.outcome === "registered") revalidatePath("/", "layout");
  return result;
}
