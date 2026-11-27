import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { emitWorkflowStepPendingNotifications } from "@/lib/notifications/event-emitters";

/** One bounded pass. SQL owns atomicity/authority; the existing emitter owns recipients/consent/dedupe. */
export async function runTimesheetSchedules() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const client = createAdminClient() as any;
  const { data, error } = await client.rpc("run_due_timesheet_schedules_v1");
  if (error) return null;
  const started = Date.now();
  const rows = (data ?? []) as { outcome: string }[];
  const pending = await client.rpc(
    "pending_timesheet_schedule_notifications_v1",
  );
  if (pending.error) return null;
  let notified = 0;
  const notices = (pending.data ?? []) as {
    schedule_id: string;
    instance_id: string;
  }[];
  for (const row of notices) {
    if (Date.now() - started > 45_000) break;
    const complete = await emitWorkflowStepPendingNotifications(
      row.instance_id,
    );
    const ack = await client.rpc("ack_timesheet_schedule_notification_v1", {
      p_schedule_id: row.schedule_id,
      p_instance_id: row.instance_id,
      p_delivered: complete,
    });
    if (complete && !ack.error) notified++;
  }
  const notificationPending = notices.length - notified;
  return {
    processed: rows.length,
    submitted: rows.filter((r) => r.outcome === "submitted").length,
    blocked: rows.filter((r) =>
      ["overlap", "not_allowed", "no_template", "error"].includes(r.outcome),
    ).length,
    notified,
    notificationPending,
  };
}
