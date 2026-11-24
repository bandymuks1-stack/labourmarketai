import { describe, expect, it } from "vitest";

import { WORLD_STATE_SLOTS, AI_OPERATOR_ACTIONS } from "@/lib/product-gate/world-state";
import {
  INITIAL_WORLD_STATE,
  SLOT_FIELDS,
  SLOTS_WRITTEN_IN_PRODUCTION,
  entityKey,
  panelShowsEntity,
  sameEntity,
  worldStateReducer,
  type WorldState,
} from "./world-state";

/**
 * World State — the runtime object against its own lock (W3).
 *
 * These are behaviour tests, not shape tests: the point is that the world can
 * only change in the ways the owner's lock allows, and that the panel and the
 * conversation can never disagree about what is selected.
 */

const JOB = { type: "job", id: "req-1" } as const;
const OTHER = { type: "job", id: "req-2" } as const;

describe("World State — slot coverage against the lock", () => {
  it("has a field for every slot the lock defines", () => {
    for (const slot of WORLD_STATE_SLOTS) {
      expect(SLOT_FIELDS[slot], `slot ${slot} has no field`).toBeTruthy();
      expect(INITIAL_WORLD_STATE).toHaveProperty(SLOT_FIELDS[slot]);
    }
  });

  it("declares honestly which slots production actually writes", () => {
    // The claim in the file header is testable: everything the file says it
    // does not write must still be at its empty value after the actions
    // production code can produce.
    let state: WorldState = INITIAL_WORLD_STATE;
    state = worldStateReducer(state, { kind: "set_avatar", avatarId: "u1" });
    state = worldStateReducer(state, { kind: "open_object", ref: JOB });
    state = worldStateReducer(state, { kind: "show_information", actions: ["express_interest"] });

    expect(state.activeFilters).toEqual({});
    expect(state.aiGoal).toBeNull();
    expect(state.mapState).toBeNull();
    expect(state.selectedEntities).toEqual([]);

    for (const slot of SLOTS_WRITTEN_IN_PRODUCTION) {
      expect(WORLD_STATE_SLOTS).toContain(slot);
    }
  });
});

describe("World State — the AI may never change the page", () => {
  it("has no action that could navigate", () => {
    // The alphabet IS the guarantee. Every reducer action maps onto one of the
    // lock's operator actions plus `set_avatar` (who the world belongs to);
    // there is no route, page or workspace action to reach for.
    const kinds = [
      "set_avatar",
      "open_object",
      "close_object",
      "change_world_state",
      "show_information",
      "return_to_conversation",
    ];
    for (const k of kinds) {
      if (k === "set_avatar") continue;
      expect(AI_OPERATOR_ACTIONS, `${k} is not an operator action`).toContain(
        k === "change_world_state" ? "change_world_state" : k,
      );
    }
    expect(kinds).not.toContain("navigate");
    expect(kinds).not.toContain("open_page");
  });
});

describe("World State — selection", () => {
  it("open_object focuses the entity, opens the panel on it and scopes the conversation", () => {
    const state = worldStateReducer(INITIAL_WORLD_STATE, { kind: "open_object", ref: JOB });
    expect(state.activeEntity).toEqual(JOB);
    expect(state.contextPanel).toEqual({ mode: "entity", ref: JOB });
    // The panel and the conversation must never disagree about the subject.
    expect(state.conversationState.aboutEntity).toEqual(JOB);
    expect(panelShowsEntity(state)).toBe(true);
  });

  it("re-opening the SAME entity is a no-op (identity, not a new object)", () => {
    const first = worldStateReducer(INITIAL_WORLD_STATE, { kind: "open_object", ref: JOB });
    const again = worldStateReducer(first, { kind: "open_object", ref: { ...JOB } });
    expect(again).toBe(first);
  });

  it("switching entity drops the previous entity's actions", () => {
    let state = worldStateReducer(INITIAL_WORLD_STATE, { kind: "open_object", ref: JOB });
    state = worldStateReducer(state, { kind: "show_information", actions: ["express_interest"] });
    expect(state.activeActions).toEqual(["express_interest"]);

    state = worldStateReducer(state, { kind: "open_object", ref: OTHER });
    // Offering the previous demand's action against a different demand is the
    // exact class of bug this clears.
    expect(state.activeActions).toEqual([]);
    expect(state.activeEntity).toEqual(OTHER);
  });

  it("close_object returns the panel to the work context and unscopes the conversation", () => {
    let state = worldStateReducer(INITIAL_WORLD_STATE, { kind: "open_object", ref: JOB });
    state = worldStateReducer(state, { kind: "close_object" });
    expect(state.activeEntity).toBeNull();
    expect(state.contextPanel).toEqual({ mode: "work_context" });
    expect(state.conversationState.aboutEntity).toBeNull();
    expect(panelShowsEntity(state)).toBe(false);
  });

  it("closing when nothing is open is a no-op", () => {
    const closed = worldStateReducer(INITIAL_WORLD_STATE, { kind: "close_object" });
    expect(closed).toBe(INITIAL_WORLD_STATE);
  });

  it("return_to_conversation KEEPS the selection", () => {
    const open = worldStateReducer(INITIAL_WORLD_STATE, { kind: "open_object", ref: JOB });
    const back = worldStateReducer(open, { kind: "return_to_conversation" });
    // "Tolimesnis pokalbis vyksta apie pasirinktą objektą" — going back to the
    // conversation must not silently forget what the conversation is about.
    expect(back.activeEntity).toEqual(JOB);
    expect(back).toBe(open);
  });
});

describe("World State — filters (the mechanism exists; nothing writes it yet)", () => {
  it("change_world_state sets and clears a dimension", () => {
    let state = worldStateReducer(INITIAL_WORLD_STATE, {
      kind: "change_world_state",
      dimension: "location",
      value: "Amsterdam",
    });
    expect(state.activeFilters).toEqual({ location: "Amsterdam" });

    state = worldStateReducer(state, {
      kind: "change_world_state",
      dimension: "location",
      value: null,
    });
    expect(state.activeFilters).toEqual({});
  });
});

describe("entity identity", () => {
  it("compares by type AND id", () => {
    expect(sameEntity(JOB, { ...JOB })).toBe(true);
    expect(sameEntity(JOB, OTHER)).toBe(false);
    expect(sameEntity(JOB, { type: "person", id: JOB.id })).toBe(false);
    expect(sameEntity(null, null)).toBe(true);
    expect(sameEntity(JOB, null)).toBe(false);
  });

  it("keys are stable and type-scoped", () => {
    expect(entityKey(JOB)).toBe("job:req-1");
    expect(entityKey({ type: "person", id: "req-1" })).not.toBe(entityKey(JOB));
  });
});
