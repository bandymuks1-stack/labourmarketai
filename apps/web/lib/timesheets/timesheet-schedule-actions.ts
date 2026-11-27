"use server";

import "server-only";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { isValidTimeZone } from "@/lib/time/local-day";

/** Self-only opt-in; SQL re-checks the actor, membership and published template. */
export async function saveTimesheetScheduleAction(
  form: FormData,
): Promise<never> {
  const rawLocale = String(form.get("locale") ?? "lt");
  const locale = /^[a-z]{2}$/.test(rawLocale) ? rawLocale : "lt";
  const finish = (notice: string): never =>
    redirect("/" + locale + "/dashboard/planning?ts=" + notice + "#timesheets");
  const id = String(form.get("organizationId") ?? "");
  const definition = String(form.get("definitionId") ?? "");
  const enabled = form.get("enabled") === "true";
  const frequency = String(form.get("frequency") ?? "");
  const localTime = String(form.get("localTime") ?? "");
  const zone = String(form.get("timeZone") ?? "");
  const weekday = Number(form.get("weekday"));
  const uuid =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (
    !uuid.test(id) ||
    (enabled &&
      (!uuid.test(definition) ||
        !["daily", "weekly", "monthly"].includes(frequency) ||
        !/^([01][0-9]|2[0-3]):[0-5][0-9]$/.test(localTime) ||
        !isValidTimeZone(zone) ||
        !Number.isInteger(weekday) ||
        weekday < 1 ||
        weekday > 7))
  )
    finish("invalid");
  const client = await createClient();
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) finish("not_authorized");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (client as any).rpc(
    "save_timesheet_schedule_v1",
    {
      p_organization_id: id,
      p_definition_id: enabled ? definition : null,
      p_frequency: frequency,
      p_local_time: localTime,
      p_time_zone: zone,
      p_weekday: enabled ? weekday : 1,
      p_enabled: enabled,
    },
  );
  if (error) finish("error");
  if (data !== "saved")
    finish(
      data === "no_template"
        ? "no_template"
        : data === "invalid"
          ? "invalid"
          : "not_authorized",
    );
  revalidatePath("/", "layout");
  return finish("schedule_saved");
}
