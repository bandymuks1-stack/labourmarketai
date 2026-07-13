/**
 * Adapter contract — only anthropic is active, sora is unavailable, inactive
 * seams are never selectable, ids unique. Pure — no env, no network.
 */
import { describe, it, expect } from "vitest";
import {
  PROVIDER_ADAPTER_REGISTRY,
  selectAdapterForRoute,
} from "./adapter-contract";
import { resolveTaskRoute } from "../task-routing";

describe("PROVIDER_ADAPTER_REGISTRY", () => {
  it("has unique adapter ids", () => {
    const ids = PROVIDER_ADAPTER_REGISTRY.map((a) => a.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("anthropic is the ONLY active adapter", () => {
    const active = PROVIDER_ADAPTER_REGISTRY.filter((a) => a.status === "active");
    expect(active.map((a) => a.id)).toEqual(["anthropic"]);
  });

  it("openai/deepl/meta_llama/xai are declared_inactive seams", () => {
    for (const id of ["openai", "deepl", "meta_llama", "xai"] as const) {
      const a = PROVIDER_ADAPTER_REGISTRY.find((x) => x.id === id);
      expect(a?.status, id).toBe("declared_inactive");
    }
  });

  it("sora is unavailable with no capabilities (video — explicitly not usable)", () => {
    const sora = PROVIDER_ADAPTER_REGISTRY.find((a) => a.id === "sora");
    expect(sora?.status).toBe("unavailable");
    expect(sora?.capabilities).toEqual([]);
  });

  it("every descriptor is fully described", () => {
    for (const a of PROVIDER_ADAPTER_REGISTRY) {
      expect(a.displayName.length).toBeGreaterThan(0);
      expect(a.notes.length).toBeGreaterThan(0);
    }
  });
});

describe("selectAdapterForRoute", () => {
  it("returns the active anthropic adapter for an LLM route", () => {
    const sel = selectAdapterForRoute(resolveTaskRoute("explain_match", { attempt: 1 }));
    expect(sel.kind).toBe("adapter");
    if (sel.kind === "adapter") {
      expect(sel.adapter.id).toBe("anthropic");
      expect(sel.adapter.status).toBe("active");
    }
  });

  it("never returns an inactive adapter — inactive seams are unreachable", () => {
    // Every possible task route selection resolves to anthropic or no_adapter.
    for (const t of [
      "structure_future_work",
      "derive_workforce_requirements",
      "normalize_work_scope",
      "normalize_external_profile",
      "extract_cv",
      "explain_match",
      "translate_message",
      "draft_follow_up",
    ] as const) {
      const sel = selectAdapterForRoute(resolveTaskRoute(t, { attempt: 1 }));
      if (sel.kind === "adapter") expect(sel.adapter.status).toBe("active");
    }
  });

  it("deterministic routes get an honest no_adapter result", () => {
    const sel = selectAdapterForRoute(resolveTaskRoute("detect_capacity_gap", { attempt: 1 }));
    expect(sel.kind).toBe("no_adapter");
    if (sel.kind === "no_adapter") expect(sel.reason).toMatch(/deterministic/);
  });

  it("blocked routes get an honest no_adapter result", () => {
    const sel = selectAdapterForRoute(
      resolveTaskRoute("explain_match", { attempt: 1, estimatedCostUsd: 100 }),
    );
    expect(sel.kind).toBe("no_adapter");
    if (sel.kind === "no_adapter") expect(sel.reason).toMatch(/cost_ceiling/);
  });
});
