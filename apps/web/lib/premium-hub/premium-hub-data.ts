/**
 * Canonical lib entry for the premium-hub read model (P0 nav-performance
 * repair, Track B).
 *
 * The implementation lives next to the hub's presentational components
 * (components/app/premium-hub/premium-hub-data.ts — its content is pinned
 * there by lib/guards/premium-hub-interactivity.test.ts); this module is the
 * lib-facing import path for pages and server code. The hub's person block
 * reads the worker row through THE request-cached core readers in
 * `@/lib/data/worker-core` (shared with player-card and the opportunities
 * pipeline), so one dashboard navigation issues each core `workers` /
 * `worker_skills` / `worker_professions` read exactly once.
 */
export * from "@/components/app/premium-hub/premium-hub-data";
