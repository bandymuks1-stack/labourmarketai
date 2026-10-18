"use server";

import "server-only";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { createWorkTaskCore, type CreateWorkTaskCoreResult, type CreateWorkTaskInput } from "@/lib/tasks/create-task-core";
import { setWorkTaskStatusCore, type SetWorkTaskStatusCoreResult } from "@/lib/tasks/set-task-status-core";

/**
 * The chat's entry to THE ONE work-task create (owner contract §5.5). The
 * tasks page's form action redirects with a notice; the conversation needs
 * the outcome back to say what really happened — same core, same RPC, same
 * rules, no redirect. Authorization stays inside `create_work_task_v2`.
 */
export async function createWorkTaskForChatAction(
  input: CreateWorkTaskInput,
): Promise<CreateWorkTaskCoreResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { kind: "not_authorized" };
  const result = await createWorkTaskCore(supabase, user.id, input);
  if (result.kind === "created") revalidatePath("/", "layout");
  return result;
}

/**
 * The chat's entry to THE ONE work-task status write (owner contract §14 —
 * WORK PERFORMED → RESULT by sentence). Same core as the tasks page's status
 * control, same RPC, same authority (creator / assignee / project manager,
 * re-checked in SQL); the outcome comes back in words instead of a redirect.
 */
export async function setWorkTaskStatusForChatAction(input: {
  taskId: string;
  status: string;
}): Promise<SetWorkTaskStatusCoreResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { kind: "not_authorized" };
  const result = await setWorkTaskStatusCore(supabase, input.taskId, input.status);
  if (result.kind === "updated") revalidatePath("/", "layout");
  return result;
}
