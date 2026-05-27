"use server";

import "server-only";

import { revalidatePath } from "next/cache";

import {
  createJobPosting,
  updateJobPostingStatus,
} from "./job-postings";
import type {
  JobPostingInput,
  JobPostingResult,
  JobPostingStatus,
} from "./types";

/** Thin pass-through wrappers so client components can call mutating
 *  functions via the Next.js server-action boundary. Each wrapper
 *  revalidates the company dashboard path on success so the new
 *  posting / status appears without a manual refresh. */

export async function createJobPostingAction(
  locale: string,
  input: JobPostingInput,
): Promise<JobPostingResult<{ id: string; projectId: string }>> {
  const result = await createJobPosting(input);
  if (result.ok) {
    revalidatePath(`/${locale}/dashboard/company`);
  }
  return result;
}

export async function updateJobPostingStatusAction(
  locale: string,
  id: string,
  nextStatus: JobPostingStatus,
): Promise<JobPostingResult> {
  const result = await updateJobPostingStatus(id, nextStatus);
  if (result.ok) {
    revalidatePath(`/${locale}/dashboard/company`);
  }
  return result;
}
