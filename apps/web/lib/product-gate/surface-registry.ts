/**
 * PRODUCT SURFACE REGISTRY — the declaration a new UI element must carry.
 *
 * Human half: `docs/PRODUCT_CONSTITUTION.md` §13.
 * Enforced by: `.github/scripts/product-gate.mjs` + `lib/guards/product-gate.test.ts`.
 *
 * THE RULE: a PR that adds a screen, a menu item, a dashboard element, a popup,
 * a module, a wizard or a persistent card must add its declaration here — with
 * the five answers the Product Constitution demands. A surface nobody can
 * justify in five short sentences is a surface that should not exist.
 *
 * THE BASELINE: everything that existed on 2026-07-28 is grandfathered. This
 * PR fixes nothing and redesigns nothing (that was the explicit scope); it
 * stops the NEXT undeclared surface. The known violations in today's baseline
 * are recorded in `docs/audits/product-constitution-audit-v1.md`, not silently
 * blessed here.
 *
 * Pure data. No IO.
 */

import type { AxiomId } from "./axioms";

export type SurfaceKind =
  | "screen"
  | "menu_item"
  | "dashboard_element"
  | "popup"
  | "module"
  | "wizard"
  | "persistent_card";

export interface SurfaceDeclaration {
  /** Stable id — the route, the nav id, or the component path. */
  readonly id: string;
  readonly kind: SurfaceKind;
  /** Which axiom PERMITS this to exist. Must be a real axiom id. */
  readonly originAxiom: AxiomId;
  /** What it is for, in one concrete sentence. */
  readonly purpose: string;
  /** Why a conversation cannot do this job. The hardest question, asked first. */
  readonly whyNotChat: string;
  /** Why an existing component cannot carry it. */
  readonly whyNotExistingComponent: string;
  /** The accountable role. */
  readonly owner: string;
  /**
   * The canonical action this surface OWNS. Two surfaces may not own the same
   * action (A-08). `null` = it owns no action (a pure read surface).
   */
  readonly ownsAction: string | null;
}

/**
 * Declarations added from this PR onward. It is deliberately EMPTY: this slice
 * adds no UI (that was forbidden), so there is nothing to declare yet. The
 * first new surface in the next PR fills it — or CI stays red.
 */
export const PRODUCT_SURFACES: readonly SurfaceDeclaration[] = [] as const;

/**
 * BASELINE — surfaces that existed before the gate. Recorded as PATHS only:
 * a grandfathered surface is not a justified one, it is an un-audited one.
 * The gate ignores these; the audit document lists which of them already
 * conflict with an axiom and at what priority.
 *
 * Generated from `apps/web/app/[locale]/**\/page.tsx` on 2026-07-28.
 * The COUNT is pinned by the guard, so the baseline cannot grow silently.
 */
export const BASELINE_SCREEN_COUNT = 118;
export const BASELINE_DASHBOARD_SCREEN_COUNT = 79;
export const BASELINE_DATE = "2026-07-28";

/**
 * The routes that behave as a PRIMARY surface today. Recorded because A-01
 * (chat-first) is about how many of these exist, and the honest answer today
 * is "more than one" — see the audit.
 */
export const BASELINE_PRIMARY_SURFACES: readonly string[] = [
  "/dashboard", // the canonical chat-first root (PR #864)
  "/dashboard/advanced", // documented module escape hatch
  "/dashboard/visual-os", // NOT in any registry — audit finding PC-01
  "/dashboard/start", // activity setup hub — audit finding PC-04
] as const;

export function surface(id: string): SurfaceDeclaration | null {
  return PRODUCT_SURFACES.find((s) => s.id === id) ?? null;
}

export type DeclarationViolation =
  | "unknown_axiom"
  | "empty_purpose"
  | "empty_why_not_chat"
  | "empty_why_not_existing_component"
  | "empty_owner"
  | "duplicate_id"
  | "duplicate_action";

export interface DeclarationProblem {
  readonly id: string;
  readonly code: DeclarationViolation;
  readonly detail: string;
}

/**
 * Validate the registry itself. A declaration that answers "why not chat?"
 * with a blank is not a declaration — it is paperwork.
 */
export function validateDeclarations(
  declarations: readonly SurfaceDeclaration[],
  knownAxiomIds: readonly string[],
): readonly DeclarationProblem[] {
  const problems: DeclarationProblem[] = [];
  const seenIds = new Set<string>();
  const actionOwners = new Map<string, string>();

  for (const d of declarations) {
    if (seenIds.has(d.id)) {
      problems.push({ id: d.id, code: "duplicate_id", detail: "declared twice" });
    }
    seenIds.add(d.id);

    if (!knownAxiomIds.includes(d.originAxiom)) {
      problems.push({
        id: d.id,
        code: "unknown_axiom",
        detail: `origin axiom ${d.originAxiom} is not in the Product Constitution`,
      });
    }
    if (d.purpose.trim().length < 10) {
      problems.push({ id: d.id, code: "empty_purpose", detail: "purpose is not stated" });
    }
    if (d.whyNotChat.trim().length < 10) {
      problems.push({
        id: d.id,
        code: "empty_why_not_chat",
        detail: "why a conversation cannot do this is not answered",
      });
    }
    if (d.whyNotExistingComponent.trim().length < 10) {
      problems.push({
        id: d.id,
        code: "empty_why_not_existing_component",
        detail: "why an existing component cannot carry this is not answered",
      });
    }
    if (d.owner.trim().length < 2) {
      problems.push({ id: d.id, code: "empty_owner", detail: "no accountable owner" });
    }
    if (d.ownsAction) {
      const existing = actionOwners.get(d.ownsAction);
      if (existing) {
        problems.push({
          id: d.id,
          code: "duplicate_action",
          detail: `action "${d.ownsAction}" is already owned by ${existing} (A-08: one function, one home)`,
        });
      } else {
        actionOwners.set(d.ownsAction, d.id);
      }
    }
  }
  return problems;
}
