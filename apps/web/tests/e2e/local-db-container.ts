/**
 * The LOCAL Supabase Postgres container a few specs `docker exec psql` into
 * for read-back and reversible negative controls.
 *
 * The Supabase CLI names it `supabase_db_<project_id>` (supabase/config.toml),
 * so a stack started under another project id — a parallel QA stack, a
 * worktree with its own config — has a different name. It was hard-coded in
 * three specs, which then failed on such a stack for a reason that had nothing
 * to do with the product. One constant, overridable by env, default unchanged:
 *
 *   E2E_DB_CONTAINER=supabase_db_<project_id> pnpm e2e:local
 *
 * This only ever names a LOCAL container; each caller still asserts its own
 * loopback / local-stack precondition before touching it.
 */
export const LOCAL_DB_CONTAINER = process.env.E2E_DB_CONTAINER?.trim() || "supabase_db_labourmarketai";
