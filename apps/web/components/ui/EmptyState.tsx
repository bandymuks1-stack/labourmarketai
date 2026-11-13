/**
 * The shared empty state, under `components/ui` where the other primitives
 * live. ONE implementation: this file only re-exports
 * `components/app/empty-state.tsx`, so both import paths give the same
 * component and there is nothing to keep in step.
 */
export { EmptyState } from "@/components/app/empty-state";
