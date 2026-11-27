import "server-only";

import { createClient } from "@/lib/supabase/server";

export type TimesheetSchedule = {
  id: string;
  organization_id: string;
  definition_id: string;
  frequency: "daily" | "weekly" | "monthly";
  local_time: string;
  time_zone: string;
  weekday: number;
  enabled: boolean;
  next_run_at: string;
  last_outcome: string | null;
  last_run_at: string | null;
};
export type TimesheetScheduleTemplate = {
  id: string;
  organization_id: string;
  name: string;
};

/** Own opt-ins and existing published templates; the request-scoped client keeps RLS. */
export async function getTimesheetSchedules(
  organizationIds: readonly string[],
) {
  const client = await createClient();
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) return { available: false, schedules: [], templates: [] };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = client as any;
  const [settings, templates] = await Promise.all([
    db
      .from("timesheet_schedules")
      .select(
        "id,organization_id,definition_id,frequency,local_time,time_zone,weekday,enabled,next_run_at,last_outcome,last_run_at",
      )
      .eq("profile_id", user.id)
      .order("updated_at", { ascending: false })
      .limit(100),
    organizationIds.length
      ? db
          .from("workflow_definitions")
          .select(
            "id,organization_id,name,workflow_definition_versions!inner(published_at)",
          )
          .in("organization_id", organizationIds)
          .eq("context_entity_type", "timesheet")
          .eq("is_active", true)
          .not("workflow_definition_versions.published_at", "is", null)
          .order("name")
          .limit(100)
      : Promise.resolve({ data: [], error: null }),
  ]);
  return {
    available: !settings.error && !templates.error,
    schedules: (settings.error
      ? []
      : (settings.data ?? [])) as TimesheetSchedule[],
    templates: (templates.error
      ? []
      : (templates.data ?? [])) as TimesheetScheduleTemplate[],
  };
}
