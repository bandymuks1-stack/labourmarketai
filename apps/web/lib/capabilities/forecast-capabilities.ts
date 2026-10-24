import { z } from "zod";

import type { ExecResult } from "@/lib/conversation/executor-contract";
import type { ProjectForecast } from "@/lib/forecast/forecast-engine";
import { actualFromVersions, measureForecastError, type StoredForecastVersion } from "@/lib/forecast/forecast-history";
import { DEFAULT_FORECAST_MODE, FORECAST_MODES, isForecastMode } from "@/lib/forecast/forecast-modes";

import type { CapabilityAnnotations, CapabilityCaller, CapabilityDescriptor } from "./contract";
import { mintCapabilityConfirmation, verifyCapabilityConfirmation } from "./confirmable";
import { scopedCallerRefusal } from "./conversation-action-bridge";

/**
 * PROJECT FORECASTS for an authorized assistant (Stage 7, owner order
 * 2026-10-24) — the control layer IS the existing chat/MCP door: same
 * identity boundary, same RLS, same draft → confirm, same audit. No second
 * owner control system.
 *
 *   project.forecast.get        the latest forecast(s) + version history with
 *                               the comparison to the previous version and,
 *                               once the work is finished, actual vs forecast
 *   forecast.mode.set_draft     preview a cadence change for an organization
 *   forecast.mode.set_confirm   apply it (forecast_set_mode_v1: platform
 *                               administrators only, written to audit_logs)
 *
 * Everything returned is a FORECAST (SEP-1) and says so. Mode ids are the
 * internal technical ids (weekly / daily / hourly / live) — not public labels.
 */

const READ: CapabilityAnnotations = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false };
const PG_UNDEFINED = new Set(["42P01", "42883", "PGRST202", "PGRST205"]);
const NOT_A_FACT = "A forecast is a reading of the recorded facts under stated assumptions — never a fact, a promise or a confirmation.";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any;

type ForecastRow = {
  project_id: string;
  organization_id: string | null;
  version: number;
  mode: string;
  reason: string;
  computed_at: string;
  as_of: string;
  engine_version: string;
  forecast: ProjectForecast;
  comparison: Record<string, unknown> | null;
  facts_summary: Record<string, unknown> | null;
};

const FORECAST_SELECT =
  "project_id, organization_id, version, mode, reason, computed_at, as_of, engine_version, forecast, comparison, facts_summary";

function unavailable(code?: string): ExecResult {
  if (code && PG_UNDEFINED.has(code)) {
    return { ok: false, code: "needs_migration", message: "Project forecasts are not enabled on this environment yet. Nothing was read." };
  }
  return { ok: false, code: "unavailable", message: "Forecasts could not be read right now. That is not the same as 'no forecast' — try again." };
}

function headline(row: ForecastRow) {
  const f = row.forecast;
  return {
    projectId: row.project_id,
    version: row.version,
    computedAt: row.computed_at,
    asOf: row.as_of,
    mode: row.mode,
    engineVersion: row.engine_version,
    status: f.status,
    confidence: f.confidence,
    completionDate: f.completion.date,
    plannedEnd: f.deadline.plannedEnd,
    slackDays: f.deadline.slackDays,
    deadlineRisk: f.deadline.risk,
    requiredHours: f.requiredHours,
    remaining: f.remaining,
    workerGap: f.workforce.workerGap,
    partnerNeed: f.workforce.partnerNeed,
    qualityRisk: f.quality.risk,
    possibleExtraCostCents: f.cost.possibleExtraCostCents,
    lateDays: f.losses.lateDays,
    actions: f.actions,
  };
}

async function modesFor(db: Db, organizationIds: readonly string[]): Promise<Record<string, { mode: string; enabled: boolean }>> {
  const out: Record<string, { mode: string; enabled: boolean }> = {};
  for (const id of organizationIds) out[id] = { mode: DEFAULT_FORECAST_MODE, enabled: true };
  if (organizationIds.length === 0) return out;
  const { data, error } = await db
    .from("organization_forecast_settings")
    .select("organization_id, mode, enabled")
    .in("organization_id", organizationIds as string[]);
  if (error) return out;
  for (const r of (data ?? []) as { organization_id: string; mode: string; enabled: boolean }[]) {
    out[r.organization_id] = { mode: r.mode, enabled: r.enabled };
  }
  return out;
}

// ── project.forecast.get ───────────────────────────────────────────────────

const forecastGetInput = z.object({ projectId: z.string().uuid().optional() }).strict();

const forecastGet: CapabilityDescriptor = {
  id: "project.forecast.get",
  kind: "read",
  title: "Project forecast and its history",
  description:
    "The latest FORECAST of a project the caller manages (remaining scope, required hours, completion date, worker and " +
    "partner need, capacity gap, productivity, deadline-miss risk, quality risk, possible extra cost, prevention actions), " +
    "with its version, computed_at, sources, assumptions and confidence; the earlier versions with how each moved against " +
    "the previous one; and, once the work is finished, how far each version was from the actual. Without projectId: the " +
    "latest forecast of each managed project. Also the organization's recompute cadence. " +
    NOT_A_FACT +
    " Reads only what the caller may see in the web app (RLS). Writes nothing.",
  exposed: true,
  annotations: READ,
  inputSchema: forecastGetInput,
  run: async (caller, input): Promise<ExecResult> => {
    const refused = await scopedCallerRefusal(caller);
    if (refused) return refused;
    const { projectId } = forecastGetInput.parse(input);
    const db = caller.supabase as Db;

    if (projectId) {
      const { data, error } = await db
        .from("project_forecasts")
        .select(FORECAST_SELECT)
        .eq("project_id", projectId)
        .order("version", { ascending: false })
        .limit(50);
      if (error) return unavailable(error.code);
      const rows = (data ?? []) as ForecastRow[];
      if (rows.length === 0) {
        return {
          ok: true,
          data: {
            projectId,
            forecast: null,
            note: "No forecast has been computed for this project yet (or the caller does not manage it). Forecasts are recomputed on the organization's cadence.",
          },
        };
      }
      const latest = rows[0];
      const versions: StoredForecastVersion[] = rows.map((r) => ({ version: r.version, computedAt: r.computed_at, mode: r.mode, forecast: r.forecast }));
      const actual = actualFromVersions(rows.map((r) => ({ version: r.version, factsSummary: r.facts_summary ?? {} })));
      const spent = new Map(rows.map((r) => [r.version, typeof r.facts_summary?.totalHours === "number" ? (r.facts_summary.totalHours as number) : null]));
      const cadence = latest.organization_id ? (await modesFor(db, [latest.organization_id]))[latest.organization_id] : null;
      return {
        ok: true,
        data: {
          kind: "forecast",
          note: NOT_A_FACT,
          cadence,
          latest: { ...headline(latest), forecast: latest.forecast, comparisonWithPrevious: latest.comparison },
          history: rows.slice(1, 20).map((r) => ({ ...headline(r), comparisonWithPrevious: r.comparison })),
          actualVsForecast: actual ? { actual, ...measureForecastError(versions, actual, (v) => spent.get(v.version) ?? null) } : null,
        },
      };
    }

    const { data, error } = await db
      .from("project_forecasts")
      .select(FORECAST_SELECT)
      .order("computed_at", { ascending: false })
      .limit(300);
    if (error) return unavailable(error.code);
    const latestByProject = new Map<string, ForecastRow>();
    for (const r of (data ?? []) as ForecastRow[]) {
      const seen = latestByProject.get(r.project_id);
      if (!seen || r.version > seen.version) latestByProject.set(r.project_id, r);
    }
    const rows = [...latestByProject.values()].slice(0, 25);
    const orgs = [...new Set(rows.map((r) => r.organization_id).filter((x): x is string => !!x))];
    return {
      ok: true,
      data: {
        kind: "forecast",
        note: NOT_A_FACT,
        projects: rows.map(headline),
        cadenceByOrganization: await modesFor(db, orgs),
      },
    };
  },
};

// ── forecast.mode.set: draft → confirm ─────────────────────────────────────

const modeFields = z
  .object({
    mode: z.enum(FORECAST_MODES),
    enabled: z.boolean().optional(),
    organizationId: z.string().uuid().optional(),
  })
  .strict();
const modeConfirmInput = modeFields.extend({ confirmationToken: z.string().min(1) }).strict();

async function targetOrganization(caller: CapabilityCaller, given: string | undefined): Promise<{ ok: true; id: string } | { ok: false; result: ExecResult }> {
  if (given) return { ok: true, id: given };
  const { requireEmployerCompanyForCaller } = await import("@/lib/company/employer-company-context");
  const ctx = await requireEmployerCompanyForCaller(caller);
  if (!ctx.ok) {
    return {
      ok: false,
      result: {
        ok: false,
        code: "no_organization_context",
        message: "Name the organization (organizationId), or act for one with context_switch first. Nothing was changed.",
      },
    };
  }
  return { ok: true, id: ctx.organizationId };
}

async function currentSetting(db: Db, organizationId: string): Promise<{ ok: true; mode: string; enabled: boolean } | { ok: false; code?: string }> {
  const { data, error } = await db
    .from("organization_forecast_settings")
    .select("mode, enabled")
    .eq("organization_id", organizationId)
    .maybeSingle();
  if (error) return { ok: false, code: error.code };
  return { ok: true, mode: data?.mode ?? DEFAULT_FORECAST_MODE, enabled: data?.enabled ?? true };
}

async function isPlatformAdmin(db: Db): Promise<boolean | null> {
  const { data, error } = await db.rpc("is_admin");
  if (error) return null;
  return data === true;
}

const normalizedMode = (p: { mode: string; enabled?: boolean }, organizationId: string) => ({
  organizationId,
  mode: p.mode,
  enabled: p.enabled ?? true,
});

const NOT_ADMIN: ExecResult = {
  ok: false,
  code: "not_authorized",
  message:
    "Only a platform administrator may change an organization's forecast cadence — it follows the organization's plan. Facts (journal, hours, Living CV, project state) update immediately in every plan. Nothing was changed.",
};

const modeSetDraft: CapabilityDescriptor = {
  id: "forecast.mode.set_draft",
  kind: "draft",
  title: "Draft a change of an organization's forecast recompute cadence",
  description:
    "Previews switching an organization's FORECAST recompute cadence (weekly = Sundays · daily · hourly · live = after " +
    "each significant change, debounced) or switching forecasting off (enabled=false), and returns a one-time token. " +
    "Without organizationId the organization the caller is acting for is used. Only platform administrators may confirm. " +
    "The cadence changes how fresh the forecast is, never the facts or the rules. NOTHING is written by the draft.",
  exposed: true,
  annotations: READ,
  inputSchema: modeFields,
  run: async (caller, input): Promise<ExecResult> => {
    const refused = await scopedCallerRefusal(caller);
    if (refused) return refused;
    const parsed = modeFields.parse(input);
    const db = caller.supabase as Db;
    const admin = await isPlatformAdmin(db);
    if (admin === null) return unavailable();
    if (!admin) return NOT_ADMIN;
    const org = await targetOrganization(caller, parsed.organizationId);
    if (!org.ok) return org.result;
    const current = await currentSetting(db, org.id);
    if (!current.ok) return unavailable(current.code);
    const normalized = normalizedMode(parsed, org.id);
    const token = mintCapabilityConfirmation({
      actionId: "forecast.mode.set_confirm",
      input: normalized,
      userId: caller.userId,
      stateFingerprint: `${current.mode}|${current.enabled}`,
    });
    return {
      ok: true,
      data: {
        preview: {
          organizationId: org.id,
          from: { mode: current.mode, enabled: current.enabled },
          to: { mode: normalized.mode, enabled: normalized.enabled },
        },
        confirmationToken: token,
        note: "Nothing was written. Confirming requires forecast.mode.set_confirm with this exact input and token.",
      },
    };
  },
};

const modeSetConfirm: CapabilityDescriptor = {
  id: "forecast.mode.set_confirm",
  kind: "confirm",
  title: "Confirm the organization's forecast recompute cadence",
  description:
    "Verifies the token against the exact input, the caller and the CURRENT setting, then applies it through " +
    "forecast_set_mode_v1 (platform administrators only; every change is written to the audit log). The next scheduler " +
    "pass uses the new cadence. Facts are never touched.",
  exposed: true,
  annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
  inputSchema: modeConfirmInput,
  run: async (caller, input): Promise<ExecResult> => {
    const refused = await scopedCallerRefusal(caller);
    if (refused) return refused;
    const { confirmationToken, ...parsed } = modeConfirmInput.parse(input);
    if (!isForecastMode(parsed.mode)) return { ok: false, code: "invalid", message: "Unknown mode. Nothing was changed." };
    const db = caller.supabase as Db;
    const org = await targetOrganization(caller, parsed.organizationId);
    if (!org.ok) return org.result;
    const current = await currentSetting(db, org.id);
    if (!current.ok) return unavailable(current.code);
    const normalized = normalizedMode(parsed, org.id);
    const verdict = await verifyCapabilityConfirmation({
      actionId: "forecast.mode.set_confirm",
      token: confirmationToken,
      input: normalized,
      userId: caller.userId,
      currentStateFingerprint: `${current.mode}|${current.enabled}`,
    });
    if (!verdict.ok) {
      return { ok: false, code: "confirmation_invalid", message: `The confirmation was refused (${verdict.reason}). Draft again.` };
    }
    const { data, error } = await db.rpc("forecast_set_mode_v1", {
      p_organization_id: org.id,
      p_mode: normalized.mode,
      p_enabled: normalized.enabled,
      p_note: null,
    });
    if (error) {
      if (error.code === "42501") return NOT_ADMIN;
      return unavailable(error.code);
    }
    return { ok: true, data: { applied: data ?? normalized } };
  },
};

export const FORECAST_CAPABILITIES: readonly CapabilityDescriptor[] = [forecastGet, modeSetDraft, modeSetConfirm];
