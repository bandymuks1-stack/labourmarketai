"use server";

import "server-only";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { createWorkTaskCore, type CreateWorkTaskCoreResult, type CreateWorkTaskInput } from "@/lib/tasks/create-task-core";

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
