"use server";

import "server-only";

import { getLocale, getTranslations } from "next-intl/server";

import { loadWorkerOpportunityBoard } from "@/lib/marketplace/worker-opportunities";
import { listManagedProjects } from "@/lib/projects/projects";
import { resolveLocation } from "@/lib/location/city-coordinates";
import { buildWorkTypeLabelMap } from "@/lib/taxonomy/work-categories";
import {
  clusterWorkspaceEntities,
  type WorkspaceMapEntity,
  type WorkspaceMapView,
} from "./workspace-map-model";

/**
 * WORKSPACE MAP — the server read (W6).
 *
 * Feeds the map that lives INSIDE the one workspace. Everything comes from
 * the canonical, RLS-scoped use cases that already exist:
 *
 *   - the worker's visible opportunities → `loadWorkerOpportunityBoard`
 *     (the gated board RPC — the SAME rows the chat and the panel show);
 *   - the person's managed projects      → `listManagedProjects`.
 *
 * Coordinates come from the deterministic city resolver (`resolveLocation`)
 * over each row's REAL country + coarse place label — city precision when the
 * city is known, country centroid (marked approximate) when only the country
 * is. No row is geocoded externally, no worker's private location is read,
 * and a row that cannot be placed is COUNTED as unmapped rather than dropped
 * silently or pinned somewhere invented (§20 privacy + §7 honesty).
 */
export async function loadWorkspaceMap(): Promise<WorkspaceMapView> {
  const locale = await getLocale();
  const tOpp = await getTranslations("opportunities");
  const workLabels = buildWorkTypeLabelMap(locale);

  const entities: WorkspaceMapEntity[] = [];
  let unmapped = 0;

  // ── visible opportunities (worker side) ──────────────────────────────────
  try {
    const board = await loadWorkerOpportunityBoard("conversation");
    if (board.kind === "ready" && board.capabilities.boardAvailable) {
      for (const card of board.opportunities) {
        const need = card.need;
        const resolved = resolveLocation({
          country: need.country,
          region: need.locationLabel ?? null,
        });
        if (!resolved.coord) {
          unmapped += 1;
          continue;
        }
        entities.push({
          ref: { type: "job", id: need.id },
          label:
            need.companyName ??
            (need.roleText ? (workLabels[need.roleText] ?? need.roleText) : tOpp("fieldRoleUnknown")),
          lat: resolved.coord.lat,
          lng: resolved.coord.lng,
          precision: resolved.precision === "city" ? "city" : "country",
          placeLabel: need.locationLabel ?? need.country ?? "",
        });
      }
    }
  } catch {
    /* the board being unavailable contributes nothing — never a fake pin */
  }

  // ── managed projects (employer side; empty for a pure worker) ───────────
  try {
    const projects = await listManagedProjects();
    for (const p of projects) {
      const resolved = resolveLocation({ country: p.country, region: p.city ?? null });
      if (!resolved.coord) {
        unmapped += p.city ? 1 : 0; // a project with no place at all is not "unmapped", it is placeless
        continue;
      }
      entities.push({
        ref: { type: "project", id: p.id },
        label: p.title ?? p.city ?? "",
        lat: resolved.coord.lat,
        lng: resolved.coord.lng,
        precision: resolved.precision === "city" ? "city" : "country",
        placeLabel: p.city ?? "",
      });
    }
  } catch {
    /* nothing */
  }

  return clusterWorkspaceEntities(entities, unmapped);
}
