/**
 * The GDPR erasure registry (privacy_erasure_executor_v3) names every table
 * that references a person — as DATA, one string literal per FK column, inside
 * `-- REGISTRY-SEED-BEGIN … -- REGISTRY-SEED-END`. Guards that forbid "any
 * other migration mentions table X" read migrations through this function so
 * the registry's list does not count as a definition; the rest of the file
 * stays checked like any other migration.
 */
export function withoutErasureRegistrySeed(src: string): string {
  return src.replace(
    /-- REGISTRY-SEED-BEGIN[\s\S]*?-- REGISTRY-SEED-END/g,
    "-- (erasure registry seed: table names as data)",
  );
}
