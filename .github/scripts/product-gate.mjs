#!/usr/bin/env node
// PRODUCT GATE — Product Constitution enforcement (P0).
//
// Constitution: docs/PRODUCT_CONSTITUTION.md §12 (axioms) + §13 (this gate).
//
// WHAT IT DOES. For every PR it diffs against the base and looks for NEW
// product surfaces: screens, menu items, dashboard elements, popups, modules,
// wizards and persistent cards. Each one must be declared in
// apps/web/lib/product-gate/surface-registry.ts with five answers:
// origin_axiom, purpose, why_not_chat, why_not_existing_component, owner.
//
// It then runs the automatic RED rules (§13.3). Any violation →
// PRODUCT_REVIEW_REQUIRED, exit 1, merge blocked.
//
// It always writes PRODUCT_ARCHITECTURE_DIFF.md so a reviewer sees WHAT
// appeared and WHY, without reading the diff.
//
// WHAT IT DELIBERATELY DOES NOT DO. It does not judge taste, it does not
// rewrite code, and it does not pretend the heuristic rules are proofs — the
// report marks each finding `certain` or `heuristic`, and §9 of the audit
// lists what only a human can decide.
//
// Usage:
//   node .github/scripts/product-gate.mjs              # analyse the PR diff
//   node .github/scripts/product-gate.mjs --self-test  # prove the rules fire
//
// Env: BASE_SHA (or BASE_REF) = base to diff against (default origin/main).
// No network, no env secrets, no writes outside PRODUCT_ARCHITECTURE_DIFF.md.

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";

const REPO_ROOT = process.cwd();
const REGISTRY = "apps/web/lib/product-gate/surface-registry.ts";
const AXIOMS = "apps/web/lib/product-gate/axioms.ts";
const NAV = "apps/web/lib/config/navigation.ts";
const MODULES = "apps/web/lib/dashboard/dashboard-module-registry.ts";
const WORLD_ELEMENTS_FILE = "apps/web/lib/product-gate/world-elements.ts";
const DIFF_OUT = "PRODUCT_ARCHITECTURE_DIFF.md";

// ── detection patterns ──────────────────────────────────────────────────────

const IS_SCREEN = /^apps\/web\/app\/.*\/page\.tsx$/;
const IS_COMPONENT = /^apps\/web\/components\/.*\.tsx$/;

const WIZARD_RE = /\b(currentStep|stepIndex|useWizard|Wizard|<Stepper|activeStep)\b/;
const POPUP_RE = /role=["']dialog["']|<Dialog\b|<Modal\b|showModal\(/;
const FORM_RE = /<form\b|onSubmit=|FormData\(/;
const CARD_RE = /-card\.tsx$/;
const CHAT_ROOT = "apps/web/app/[locale]/dashboard/page.tsx";

/** A screen that behaves as a primary/dashboard surface. */
const DASHBOARD_LIKE = /\/dashboard\/(overview|home|control|visual-os|start|hub|main)\//;
const JOURNAL_MODULE = /\/dashboard\/journal\//;
// ENTITY_BEHAVIOR_MODEL_V1: a per-actor-type executor module is a special case.
const EXECUTOR_MODULE = /lib\/conversation\/[a-z-]+-executors\.ts$/;
const SPATIAL_KINDS_FILE = "apps/web/lib/market-map/spatial-entities.ts";

// ── git helpers ─────────────────────────────────────────────────────────────

function git(args) {
  return execFileSync("git", args, { cwd: REPO_ROOT, encoding: "utf8" });
}

function changedFiles(base) {
  const range = `${base}...HEAD`;
  const added = git(["diff", "--diff-filter=A", "--name-only", range])
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);
  const modified = git(["diff", "--diff-filter=M", "--name-only", range])
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);
  const deleted = git(["diff", "--diff-filter=D", "--name-only", range])
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);
  return { added, modified, deleted };
}

function addedLines(base, file) {
  try {
    const patch = git(["diff", `${base}...HEAD`, "--unified=0", "--", file]);
    return patch
      .split("\n")
      .filter((l) => l.startsWith("+") && !l.startsWith("+++"))
      .map((l) => l.slice(1));
  } catch {
    return [];
  }
}

function removedLines(base, file) {
  try {
    const patch = git(["diff", `${base}...HEAD`, "--unified=0", "--", file]);
    return patch
      .split("\n")
      .filter((l) => l.startsWith("-") && !l.startsWith("---"))
      .map((l) => l.slice(1));
  } catch {
    return [];
  }
}

function read(file) {
  const p = `${REPO_ROOT}/${file}`;
  return existsSync(p) ? readFileSync(p, "utf8") : "";
}

// ── declaration lookup (regex over the registry — no TS runtime needed) ─────

function declaredIds() {
  const src = read(REGISTRY);
  const block = /PRODUCT_SURFACES[\s\S]*?\n\] as const;/.exec(src)?.[0] ?? "";
  return new Set([...block.matchAll(/id:\s*["'`]([^"'`]+)["'`]/g)].map((m) => m[1]));
}

/** Route id for a screen file: apps/web/app/[locale]/dashboard/x/page.tsx → /dashboard/x */
function routeOf(file) {
  return (
    "/" +
    file
      .replace(/^apps\/web\/app\//, "")
      .replace(/\/page\.tsx$/, "")
      .replace(/\[locale\]\/?/, "")
      .replace(/\(([^)]+)\)\//g, "")
      .replace(/^\/+/, "")
  );
}

// ── the rules ───────────────────────────────────────────────────────────────

function analyse(base) {
  const { added, modified, deleted } = changedFiles(base);
  const declared = declaredIds();
  const findings = [];
  const surfaces = [];

  const add = (code, axiom, what, detail, certainty) =>
    findings.push({ code, axiom, what, detail, certainty });

  // 1. NEW SCREENS ---------------------------------------------------------
  for (const file of added.filter((f) => IS_SCREEN.test(f))) {
    const route = routeOf(file);
    const src = read(file);
    const isRedirect = /redirect\(/.test(src) && src.length < 2000;
    surfaces.push({ kind: "screen", id: route, file, declared: declared.has(route) });
    if (isRedirect) continue; // an alias is not a new surface

    if (!declared.has(route)) {
      add(
        "undeclared_surface",
        "A-09",
        route,
        "new screen with no declaration in the surface registry (origin_axiom / purpose / why_not_chat / why_not_existing_component / owner)",
        "certain",
      );
    }
    if (DASHBOARD_LIKE.test(file + "/")) {
      add("second_dashboard", "A-01", route, "adds another dashboard-like primary surface", "certain");
    }
    if (JOURNAL_MODULE.test(file)) {
      add("new_journal_module", "A-08", route, "adds another Journal module surface", "certain");
    }
    if (WIZARD_RE.test(src)) {
      add(
        "wizard_replaceable_by_chat",
        "A-04",
        route,
        "new wizard/stepper screen — a conversation collects the same data one question at a time",
        "heuristic",
      );
    }
    if (FORM_RE.test(src) && !declared.has(route)) {
      add(
        "form_replaceable_by_dialog",
        "A-04",
        route,
        "new form screen — the AI dialog is the declared collection path",
        "heuristic",
      );
    }
  }

  // 2. NEW COMPONENTS: popups, wizards, persistent cards -------------------
  for (const file of added.filter((f) => IS_COMPONENT.test(f))) {
    const src = read(file);
    const id = file.replace(/^apps\/web\//, "");
    if (POPUP_RE.test(src)) {
      surfaces.push({ kind: "popup", id, file, declared: declared.has(id) });
      if (!declared.has(id)) {
        add("undeclared_surface", "A-09", id, "new popup/modal with no declaration", "certain");
      }
    }
    if (WIZARD_RE.test(src)) {
      surfaces.push({ kind: "wizard", id, file, declared: declared.has(id) });
      if (!declared.has(id)) {
        add(
          "wizard_replaceable_by_chat",
          "A-04",
          id,
          "new wizard component with no declaration of why a conversation cannot do it",
          "certain",
        );
      }
    }
    if (CARD_RE.test(file)) {
      surfaces.push({ kind: "persistent_card", id, file, declared: declared.has(id) });
      if (!declared.has(id)) {
        add("undeclared_surface", "A-09", id, "new persistent card with no declaration", "certain");
      }
    }
    // A-07: the profile is not a log of completed actions.
    if (/components\/app\/profile/.test(file) && /completed|done|finished|atlikt/i.test(src)) {
      add(
        "profile_shows_completed_action",
        "A-07",
        id,
        "profile surface renders completed-action state — completed work belongs to the journal/engagement record",
        "heuristic",
      );
    }
  }

  // 3. NAVIGATION: a new persistent menu item ------------------------------
  if (modified.includes(NAV) || added.includes(NAV)) {
    const plus = addedLines(base, NAV);
    const newItems = plus.filter((l) => /id:\s*["'`]/.test(l));
    for (const line of newItems) {
      const id = /id:\s*["'`]([^"'`]+)["'`]/.exec(line)?.[1] ?? "unknown";
      surfaces.push({ kind: "menu_item", id, file: NAV, declared: declared.has(id) });
      if (!declared.has(id)) {
        add(
          "new_persistent_menu",
          "A-03",
          id,
          "new persistent navigation item with no declaration — the core loop is chat → journal → calendar → messages",
          "certain",
        );
      }
    }
    // A-01: chat may not lose its place in the core loop.
    const minus = removedLines(base, NAV);
    if (minus.some((l) => /"overview"/.test(l)) && !plus.some((l) => /"overview"/.test(l))) {
      add("chat_importance_reduced", "A-01", NAV, "chat/overview removed from the core navigation", "certain");
    }
  }

  // 4. DASHBOARD MODULES ---------------------------------------------------
  if (modified.includes(MODULES) || added.includes(MODULES)) {
    for (const line of addedLines(base, MODULES)) {
      const id = /^\s*id:\s*["'`]([^"'`]+)["'`]/.exec(line)?.[1];
      if (!id) continue;
      surfaces.push({ kind: "dashboard_element", id, file: MODULES, declared: declared.has(id) });
      if (!declared.has(id)) {
        add("undeclared_surface", "A-09", id, "new dashboard module with no declaration", "certain");
      }
    }
  }

  // 5. CHAT IMPORTANCE -----------------------------------------------------
  if (deleted.includes(CHAT_ROOT)) {
    add("chat_importance_reduced", "A-01", CHAT_ROOT, "the conversation root was deleted", "certain");
  }
  if (modified.includes(CHAT_ROOT)) {
    const minus = removedLines(base, CHAT_ROOT);
    if (minus.some((l) => /ConversationChat/.test(l))) {
      const plus = addedLines(base, CHAT_ROOT);
      if (!plus.some((l) => /ConversationChat/.test(l))) {
        add("chat_importance_reduced", "A-01", CHAT_ROOT, "the conversation component was removed from /dashboard", "certain");
      }
    }
  }

  // 6. VISION LOCK (PRODUCT_VISION_LOCK_V1, owner 2026-07-28) ---------------
  //    The six mandatory answers + the prohibition list. A surface that
  //    extends none of the twelve world elements is a second product.
  const VISION_FIELDS = [
    "worldElement",
    "whyNotExistingElement",
    "chatIntegration",
    "avatarEffect",
    "mapEffect",
    "journalRelation",
  ];
  {
    const regSrcV = read(REGISTRY);
    const blockV = /PRODUCT_SURFACES[\s\S]*?\n\] as const;/.exec(regSrcV)?.[0] ?? "";
    const elementsSrc = read(WORLD_ELEMENTS_FILE);
    const knownElements = new Set(
      [...elementsSrc.matchAll(/id:\s*"([a-z_]+)"/g)].map((m) => m[1]),
    );
    // Each declared surface must answer all six.
    for (const decl of blockV.split(/\n\s*\{\s*\n/).slice(1)) {
      const id = /id:\s*["'`]([^"'`]+)["'`]/.exec(decl)?.[1];
      if (!id) continue;
      for (const field of VISION_FIELDS) {
        if (!new RegExp(`${field}:`).test(decl)) {
          add(
            "unanswered_vision_question",
            "A-09",
            id,
            `does not answer "${field}" — PRODUCT_VISION_LOCK_V1 requires all six answers`,
            "certain",
          );
        }
      }
      const el = /worldElement:\s*["'`]([^"'`]+)["'`]/.exec(decl)?.[1];
      if (el && !knownElements.has(el)) {
        add(
          "no_world_element",
          "A-09",
          id,
          `"${el}" is not one of the twelve world elements — a surface that extends none of them is a second product`,
          "certain",
        );
      }
    }
  }

  // A SECOND AI is forbidden outright (AI Conversation element rule).
  for (const file of added.filter((f) => IS_SCREEN.test(f) || IS_COMPONENT.test(f))) {
    const src = read(file);
    const id = IS_SCREEN.test(file) ? routeOf(file) : file.replace(/^apps\/web\//, "");
    const looksLikeAssistant =
      /assistant|copilot|agent/i.test(file) &&
      /(chat|prompt|message)/i.test(src) &&
      !/ConversationChat/.test(src);
    if (looksLikeAssistant) {
      add(
        "second_ai",
        "A-01",
        id,
        "a second assistant surface — the vision lock permits exactly one AI, and it is the conversation",
        "heuristic",
      );
    }
  }

  // 6b. UNIVERSE LOCK V2 — the World Map is a PLATFORM ----------------------
  //     "Naujas objektų tipas turi būti registruojamas, o ne reikalauti Map
  //      perprojektavimo. Jeigu naujo objekto įdiegimui reikia keisti pačią
  //      World Map architektūrą, architektūra laikoma neteisinga."
  const MAP_ARCH_FILES = [
    "apps/web/lib/market-map/spatial-entities.ts",
    "apps/web/components/app/market-map-entity-layers.tsx",
    "apps/web/components/app/market-map-base.tsx",
  ];
  for (const file of MAP_ARCH_FILES) {
    if (!modified.includes(file) && !added.includes(file)) continue;
    const plus = addedLines(base, file);
    const addsKind = plus.some(
      (l) =>
        /SPATIAL_ENTITY_KINDS|SpatialEntityKind|SpatialRenderContract/.test(l) ||
        /^\s*"[a-z_]+",\s*$/.test(l),
    );
    if (addsKind) {
      add(
        "map_architecture_change",
        "A-09",
        file,
        "a world object type is being added by editing World Map architecture. The universe lock requires types to be REGISTERED, not hardcoded — if this edit is unavoidable, the architecture is wrong and must be fixed first",
        "certain",
      );
    }
  }

  // The nine universe answers must be present, and a blocking "no" stops the PR.
  {
    const regSrcU = read(REGISTRY);
    const blockU = /PRODUCT_SURFACES[\s\S]*?\n\] as const;/.exec(regSrcU)?.[0] ?? "";
    const UNIVERSE_FIELDS = [
      "pillar",
      "objectType",
      "registeredInObjectModel",
      "hasTimeline",
      "hasHistory",
      "addableWithoutMapChange",
    ];
    for (const decl of blockU.split(/\n\s*\{\s*\n/).slice(1)) {
      const id = /id:\s*["'`]([^"'`]+)["'`]/.exec(decl)?.[1];
      if (!id) continue;
      for (const field of UNIVERSE_FIELDS) {
        if (!new RegExp(field + ":").test(decl)) {
          add(
            "unanswered_universe_question",
            "A-09",
            id,
            'does not answer "' + field + '" — PRODUCT_UNIVERSE_LOCK_V2 requires all nine answers',
            "certain",
          );
        }
      }
      for (const field of [
        "registeredInObjectModel",
        "hasTimeline",
        "hasHistory",
        "addableWithoutMapChange",
      ]) {
        if (new RegExp(field + ":\\s*false").test(decl)) {
          add(
            field === "addableWithoutMapChange"
              ? "requires_map_architecture_change"
              : "not_registered_object_type",
            "A-09",
            id,
            '"' + field + '" is false — the universe lock stops this PR for human review',
            "certain",
          );
        }
      }
    }
  }

  // 6c. WORLD STATE UX (owner refinement 2026-07-28) -----------------------
  //     AI-first, ONE workspace, no page switching. All five answers are
  //     blocking: "Jeigu bent vienas atsakymas yra 'ne', sprendimas laikomas
  //     neatitinkančiu PRODUCT_VISION_LOCK."
  {
    const regSrcW = read(REGISTRY);
    const blockW = /PRODUCT_SURFACES[\s\S]*?\n\] as const;/.exec(regSrcW)?.[0] ?? "";
    const WS = {
      changesWorldState: "not_world_state_driven",
      reflectedOnMap: "not_reflected_on_map",
      aiControlled: "not_ai_controlled",
      usableWithoutLeavingWorkspace: "requires_leaving_workspace",
      needsNoNewPage: "requires_new_page",
    };
    for (const decl of blockW.split(/\n\s*\{\s*\n/).slice(1)) {
      const id = /id:\s*["'`]([^"'`]+)["'`]/.exec(decl)?.[1];
      if (!id) continue;
      for (const [field, code] of Object.entries(WS)) {
        if (!new RegExp(field + ":").test(decl)) {
          add("unanswered_universe_question", "A-01", id,
            'does not answer "' + field + '" — WORLD_STATE_UX_ARCHITECTURE_V1 requires all five answers',
            "certain");
        } else if (new RegExp(field + ":\\s*false").test(decl)) {
          add(code, "A-01", id,
            '"' + field + '" is false — AI-first, one workspace, no page switching',
            "certain");
        }
      }
    }
  }

  // 6f. UNIFIED WORLD MODEL (owner lock 2026-07-28) ------------------------
  //     Entity is the only base thing in the world, and the world grows by
  //     REGISTRATION: "Naujam Entity Type negali reikėti architektūros
  //     pakeitimo. Pakanka jį užregistruoti."
  //
  //     Asymmetry, deliberately: needing a new TYPE, ROLE or RELATIONSHIP never
  //     blocks — that is how the world grows. `registrationIsEnough` is what
  //     blocks, and it is the ONLY growth mechanism. The map question is not
  //     re-asked here; `addableWithoutMapChange` (6b) is the canonical one.
  {
    const regSrcE = read(REGISTRY);
    const blockE = /PRODUCT_SURFACES[\s\S]*?\n\] as const;/.exec(regSrcE)?.[0] ?? "";
    const EN = {
      usesEntity: "not_entity_based",
      registrationIsEnough: "registration_not_enough",
      aiCanWorkWithIt: "ai_cannot_work_with_entity",
    };
    const ASKED = ["usesEntity", "needsNewEntityType", "registrationIsEnough",
      "createsNewRole", "createsNewRelationship", "aiCanWorkWithIt"];
    for (const decl of blockE.split(/\n\s*\{\s*\n/).slice(1)) {
      const id = /id:\s*["'`]([^"'`]+)["'`]/.exec(decl)?.[1];
      if (!id) continue;
      for (const field of ASKED) {
        if (!new RegExp(field + ":").test(decl)) {
          add("unanswered_universe_question", "A-09", id,
            'does not answer "' + field + '" — UNIFIED_WORLD_MODEL_V1 requires all seven answers',
            "certain");
        }
      }
      for (const [field, code] of Object.entries(EN)) {
        if (new RegExp(field + ":\\s*false").test(decl)) {
          add(code, "A-09", id,
            field === "registrationIsEnough"
              ? '"registrationIsEnough" is false — registering the type/role/relationship is not enough, so an architecture change is required and the architecture is wrong'
              : '"' + field + '" is false — Entity is the only base thing in the world',
            "certain");
        }
      }
      // A new entity type the map cannot carry without an architecture change.
      if (new RegExp("needsNewEntityType" + ":\\s*true").test(decl) &&
          new RegExp("addableWithoutMapChange" + ":\\s*false").test(decl)) {
        add("map_does_not_support_type", "A-09", id,
          "a new entity type that the World Map cannot carry without an architecture change",
          "certain");
      }
    }
  }

  // 6d. ENTITY BEHAVIOR (owner lock 2026-07-28) ----------------------------
  //     The world grows by CHANGING BEHAVIOR — not by new tables, modules or
  //     architectures. All six answers block. The last one escalates:
  //     "Jeigu atsakymas į paskutinį klausimą yra 'ne', sprendimas turi būti
  //     perprojektuotas." — redesign, not review.
  {
    const regSrcB = read(REGISTRY);
    const blockB = /PRODUCT_SURFACES[\s\S]*?\n\] as const;/.exec(regSrcB)?.[0] ?? "";
    const BH = {
      usesExistingEntityType: "new_entity_type_instead_of_behavior",
      newBehaviorIsEnough: "behavior_not_enough",
      newRelationshipIsEnough: "relationship_not_enough",
      aiUsesItWithoutArchitectureChange: "ai_needs_architecture_change",
      mapCanRenderIt: "map_cannot_render_it",
      worldStateCanControlIt: "world_state_cannot_control_it",
    };
    for (const decl of blockB.split(/\n\s*\{\s*\n/).slice(1)) {
      const id = /id:\s*["'`]([^"'`]+)["'`]/.exec(decl)?.[1];
      if (!id) continue;
      for (const [field, code] of Object.entries(BH)) {
        if (!new RegExp(field + ":").test(decl)) {
          add("unanswered_universe_question", "A-01", id,
            'does not answer "' + field + '" — ENTITY_BEHAVIOR_MODEL_V1 requires all six answers',
            "certain");
        } else if (new RegExp(field + ":\\s*false").test(decl)) {
          add(code, "A-01", id,
            field === "worldStateCanControlIt"
              ? '"worldStateCanControlIt" is false — World State cannot control it, so this decision must be REDESIGNED, not reviewed'
              : '"' + field + '" is false — the world grows by behavior, not by new tables, modules or architectures',
            "certain");
        }
      }
    }
  }

  // 6e. SPECIAL CASES IN CODE (owner rule: NO SPECIAL CASES) ---------------
  //     A new per-actor-type executor module is the exact shape the lock
  //     forbids: "Negalima kurti architektūros, kur vienam Entity Type reikia
  //     specialios logikos." Today worker-executors + company-executors already
  //     exist (recorded in the audit); a THIRD one is a new special case.
  for (const f of [...added]) {
    if (EXECUTOR_MODULE.test(f)) {
      add("special_case_for_entity_type", "A-01", f,
        "a new per-actor-type executor module — behavior must be a binding on an entity, not a module per type",
        "certain");
    }
  }

  // 6g. TRANSITIONAL WAIVERS (audit correction 5) --------------------------
  //     The readiness questions (map / World State) cannot honestly be answered
  //     "yes" before E.7 / B.6 exist. A waiver is the ONLY honest way through,
  //     and it is deliberately hard to abuse:
  //       - it needs recorded owner approval;
  //       - it may name only WAIVABLE_FIELDS — never usesEntity, never
  //         registrationIsEnough;
  //       - it EXPIRES BY ITSELF: readiness is computed from the code below,
  //         so once the map stops being a closed per-kind union the waiver
  //         becomes a hard error instead of a quiet permanent bypass;
  //       - it is always reported, so a waived PR is never silently green.
  {
    const spatial = read(SPATIAL_KINDS_FILE);
    // E.7 / B.6 have shipped when the map no longer enumerates a closed set of
    // kinds — i.e. it renders an entity BY TYPE instead of knowing the types.
    const closedKindUnion = /SPATIAL_ENTITY_KINDS\s*=\s*\[/.test(spatial);
    const enablingArchitectureExists = spatial !== "" && !closedKindUnion;

    const regSrcW2 = read(REGISTRY);
    const blockW2 = /PRODUCT_SURFACES[\s\S]*?\n\] as const;/.exec(regSrcW2)?.[0] ?? "";
    const WAIVABLE = ["reflectedOnMap", "addableWithoutMapChange", "worldStateCanControlIt"];

    for (const decl of blockW2.split(/\n\s*\{\s*\n/).slice(1)) {
      const id = /id:\s*["'`]([^"'`]+)["'`]/.exec(decl)?.[1];
      if (!id || !/transitionalWaiver:/.test(decl)) continue;

      const approval = /ownerApproval:\s*["'`]([^"'`]*)["'`]/.exec(decl)?.[1] ?? "";
      if (approval.trim().length < 3) {
        add("waiver_not_approved", "A-09", id,
          "a transitional waiver without recorded owner approval is just an unanswered question",
          "certain");
      }
      const fieldsSrc = /fields:\s*\[([^\]]*)\]/.exec(decl)?.[1] ?? "";
      for (const f of [...fieldsSrc.matchAll(/["'`]([a-zA-Z]+)["'`]/g)].map((m) => m[1])) {
        if (!WAIVABLE.includes(f)) {
          add("waiver_covers_unwaivable_field", "A-09", id,
            '"' + f + '" may never be waived — a waiver covers map/World-State readiness only, never whether the thing is an Entity or whether registering it is enough',
            "certain");
        }
      }
      if (enablingArchitectureExists) {
        add("waiver_expired", "A-09", id,
          "the enabling architecture (E.7 / B.6) has shipped — this waiver has expired and must be removed",
          "certain");
      } else {
        // Never silent: a waived surface is always visible to the reviewer.
        add("transitional_waiver_in_use", "A-09", id,
          "readiness answers are waived until E.7 / B.6 ship — owner-approved, and this PR stays a human gate",
          "review");
      }
    }
  }

  // 7. REGISTRY SELF-CONSISTENCY -------------------------------------------
  const axiomSrc = read(AXIOMS);
  const knownAxioms = new Set([...axiomSrc.matchAll(/id:\s*"(A-\d\d)"/g)].map((m) => m[1]));
  const regSrc = read(REGISTRY);
  const block = /PRODUCT_SURFACES[\s\S]*?\n\] as const;/.exec(regSrc)?.[0] ?? "";
  for (const m of block.matchAll(/originAxiom:\s*["'`]([^"'`]+)["'`]/g)) {
    if (!knownAxioms.has(m[1])) {
      add("unknown_axiom", "A-09", m[1], "declaration cites an axiom that does not exist", "certain");
    }
  }
  const actions = [...block.matchAll(/ownsAction:\s*["'`]([^"'`]+)["'`]/g)].map((m) => m[1]);
  const dupes = actions.filter((a, i) => actions.indexOf(a) !== i);
  for (const d of new Set(dupes)) {
    add("duplicate_action", "A-08", d, "two surfaces claim to own the same action", "certain");
  }

  return { findings, surfaces, changed: { added, modified, deleted } };
}

// ── architecture diff ───────────────────────────────────────────────────────

function writeArchitectureDiff({ findings, surfaces }, status) {
  const rows =
    surfaces.length === 0
      ? "_No new product surface was added by this PR._"
      : [
          "| What appeared | Kind | Why it appeared | Why it cannot be a conversation | Permitting axiom | Declared |",
          "|---|---|---|---|---|---|",
          ...surfaces.map((s) => {
            const src = read(REGISTRY);
            const dec = new RegExp(
              `id:\\s*["'\`]${s.id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}["'\`][\\s\\S]*?owner:`,
            ).exec(src)?.[0];
            const field = (name) =>
              dec ? (new RegExp(`${name}:\\s*\n?\\s*["'\`]([^"'\`]+)`).exec(dec)?.[1] ?? "—") : "—";
            return `| \`${s.id}\` | ${s.kind} | ${field("purpose")} | ${field("whyNotChat")} | ${field("originAxiom")} | ${s.declared ? "yes" : "**NO**"} |`;
          }),
        ].join("\n");

  const violations =
    findings.length === 0
      ? "_No axiom violation detected._"
      : [
          "| Finding | Axiom | Where | Certainty | Detail |",
          "|---|---|---|---|---|",
          ...findings.map(
            (f) => `| \`${f.code}\` | ${f.axiom} | \`${f.what}\` | ${f.certainty} | ${f.detail} |`,
          ),
        ].join("\n");

  const body = `# PRODUCT ARCHITECTURE DIFF

> Generated by \`.github/scripts/product-gate.mjs\`. Constitution:
> \`docs/PRODUCT_CONSTITUTION.md\` §12–§13.

**Status: ${status}**

## What appeared

${rows}

## Axiom checks

${violations}

## Rules that were checked

Every rule in \`docs/PRODUCT_CONSTITUTION.md\` §13.3 ran against this diff:
second dashboard · new Journal module · new persistent menu · duplicated action ·
profile showing a completed action · same function in several places · wizard
replaceable by conversation · form replaceable by an AI dialog · reduced chat
importance · UI the constitution does not permit.

\`certainty: heuristic\` means the gate found a pattern a human must judge —
it blocks the merge, and the reviewer either declares the surface or removes it.
`;
  writeFileSync(`${REPO_ROOT}/${DIFF_OUT}`, body, "utf8");
}

// ── self-test: prove each rule can actually fire ────────────────────────────

function selfTest() {
  const cases = [
    ["second_dashboard", DASHBOARD_LIKE.test("apps/web/app/[locale]/dashboard/visual-os/page.tsx/")],
    ["new_journal_module", JOURNAL_MODULE.test("apps/web/app/[locale]/dashboard/journal/voice/page.tsx")],
    ["wizard", WIZARD_RE.test("const [currentStep, setStep] = useState(0)")],
    ["popup", POPUP_RE.test('<div role="dialog">')],
    ["form", FORM_RE.test("<form onSubmit={save}>")],
    ["card", CARD_RE.test("apps/web/components/app/worker-card.tsx")],
    ["screen", IS_SCREEN.test("apps/web/app/[locale]/dashboard/x/page.tsx")],
    ["route", routeOf("apps/web/app/[locale]/dashboard/x/page.tsx") === "/dashboard/x"],
    ["route_group", routeOf("apps/web/app/[locale]/(marketing)/pricing/page.tsx") === "/pricing"],
    // Regression guard: a dynamically built regex must really match. CodeQL
    // caught `field + ":\s*false"` written as `":\s*false"` in a string
    // literal, where \s degrades to a plain "s" — the rule silently never
    // fired. A gate rule that cannot fire is worse than no rule.
    ["dynamic_false_regex", new RegExp("needsNoNewPage" + ":\\s*false").test("  needsNoNewPage: false,")],
    ["dynamic_false_regex_negative", !new RegExp("needsNoNewPage" + ":\\s*false").test("  needsNoNewPage: true,")],
    // ENTITY_BEHAVIOR_MODEL_V1 detectors.
    ["behavior_false_regex", new RegExp("worldStateCanControlIt" + ":\\s*false").test("  worldStateCanControlIt: false,")],
    ["behavior_false_regex_negative", !new RegExp("worldStateCanControlIt" + ":\\s*false").test("  worldStateCanControlIt: true,")],
    ["special_case_executor", EXECUTOR_MODULE.test("apps/web/lib/conversation/customer-executors.ts")],
    ["special_case_executor_negative", !EXECUTOR_MODULE.test("apps/web/lib/conversation/executor-contract.ts")],
    // Transitional waiver: the expiry predicate must really flip.
    ["waiver_expiry_before", /SPATIAL_ENTITY_KINDS\s*=\s*\[/.test("export const SPATIAL_ENTITY_KINDS = [")],
    ["waiver_expiry_after", !/SPATIAL_ENTITY_KINDS\s*=\s*\[/.test("export function renderEntityByType(e) {}")],
    ["waiver_field_allowlist", ["reflectedOnMap", "addableWithoutMapChange", "worldStateCanControlIt"].includes("worldStateCanControlIt")],
    ["waiver_field_allowlist_negative", !["reflectedOnMap", "addableWithoutMapChange", "worldStateCanControlIt"].includes("registrationIsEnough")],
  ];
  const failed = cases.filter(([, ok]) => !ok).map(([n]) => n);
  if (failed.length > 0) {
    console.error(`::error::product-gate self-test FAILED for: ${failed.join(", ")}`);
    process.exit(1);
  }
  console.log(`product-gate self-test: ${cases.length}/${cases.length} detectors fire correctly.`);
  process.exit(0);
}

// ── main ────────────────────────────────────────────────────────────────────

if (process.argv.includes("--self-test")) selfTest();

const base = process.env.BASE_SHA || process.env.BASE_REF || "origin/main";
let result;
try {
  result = analyse(base);
} catch (e) {
  console.error(`::error::product-gate could not diff against ${base}: ${e.message}`);
  process.exit(1);
}

const { findings, surfaces } = result;
const status = findings.length > 0 ? "PRODUCT_REVIEW_REQUIRED" : "GREEN";
writeArchitectureDiff(result, status);

console.log(`product-gate: ${surfaces.length} new product surface(s) in this diff`);
for (const s of surfaces) {
  console.log(`  • ${s.kind.padEnd(18)} ${s.id} ${s.declared ? "[declared]" : "[UNDECLARED]"}`);
}

if (findings.length === 0) {
  console.log("product-gate: GREEN — no axiom violation.");
  console.log(`product-gate: wrote ${DIFF_OUT}`);
  process.exit(0);
}

console.log("");
for (const f of findings) {
  console.log(
    `::error file=${f.what}::[${f.code}] ${f.axiom} — ${f.detail} (certainty: ${f.certainty})`,
  );
}
console.log("");
console.log(`product-gate: PRODUCT_REVIEW_REQUIRED — ${findings.length} violation(s). Merge blocked.`);
console.log("Declare the surface in apps/web/lib/product-gate/surface-registry.ts");
console.log("(origin_axiom, purpose, why_not_chat, why_not_existing_component, owner) or remove it.");
process.exit(1);
