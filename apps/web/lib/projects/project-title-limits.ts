/**
 * THE project title limits, shared by the canonical create core, the MCP
 * `project.create_*` capability and the web chat's `company.create-project`
 * schema. Pure (no server-only) so the chat schema, which the UI also reads,
 * can use the same numbers: the chat used to refuse 121–200 character titles
 * the core and MCP accept (AI-1 sweep, 2026-11-23).
 */
export const PROJECT_TITLE_MIN = 2;
export const PROJECT_TITLE_MAX = 200;
/** The site city: the same bound the MCP capability applies. */
export const PROJECT_CITY_MAX = 200;
