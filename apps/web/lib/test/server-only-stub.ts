/**
 * Test stub for the `server-only` (and `client-only`) marker packages.
 *
 * Those packages intentionally throw when imported outside their intended
 * environment. Under vitest (a plain Node environment) that throw is a false
 * positive — it blocks unit-testing server modules whose logic is pure (e.g.
 * lib/cv/extract). vitest aliases `server-only` to this no-op so the modules
 * import cleanly; the real package still guards production client bundles.
 */
export {};
