import {
  CHATGPT_PROFILE_INSTRUCTIONS,
  CHATGPT_PROFILE_PATH,
  CHATGPT_PUBLIC_TOOLS,
  chatgptProfileToolDefs,
} from "@/lib/mcp/chatgpt-profile";
import { JOBS_WIDGET_TOOLS, JOBS_WIDGET_TOOL_META, jobsWidgetResource } from "@/lib/mcp/chatgpt-jobs-widget";
import { createMcpDoor } from "@/lib/mcp/http-door";
import { CHATGPT_PROTECTED_RESOURCE_METADATA_PATH } from "@/lib/mcp/protected-resource-metadata";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * THE CURATED CHATGPT DOOR (owner P0 2026-11-11): the same MCP server as
 * `/api/mcp`, publishing and accepting only the profile in
 * `lib/mcp/chatgpt-profile.ts`. Its 401 points at its OWN RFC 9728 document,
 * whose `resource` is this URL, so a client that enters this address is told
 * the resource it entered.
 *
 * PUBLIC JOB SEARCH WITHOUT SIGN-IN (owner approval needed): a caller with
 * no credential may run `CHATGPT_PUBLIC_TOOLS` only, on the anonymous client
 * (the same anonymous projection the public /jobs page shows).
 */
const door = createMcpDoor({
  door: CHATGPT_PROFILE_PATH,
  selectTools: chatgptProfileToolDefs,
  instructions: CHATGPT_PROFILE_INSTRUCTIONS,
  metadataPath: CHATGPT_PROTECTED_RESOURCE_METADATA_PATH,
  anonymousTools: CHATGPT_PUBLIC_TOOLS,
  // The job-list widget (Apps SDK): one static template, no data of its own.
  resources: (origin) => [jobsWidgetResource(origin)],
  toolMeta: Object.fromEntries(JOBS_WIDGET_TOOLS.map((t) => [t, JOBS_WIDGET_TOOL_META])),
});

export const POST = door.POST;
export const OPTIONS = door.OPTIONS;
export const GET = door.GET;
