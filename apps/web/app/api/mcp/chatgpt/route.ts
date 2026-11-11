import {
  CHATGPT_PROFILE_INSTRUCTIONS,
  CHATGPT_PROFILE_PATH,
  chatgptProfileToolDefs,
} from "@/lib/mcp/chatgpt-profile";
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
 */
const door = createMcpDoor({
  door: CHATGPT_PROFILE_PATH,
  selectTools: chatgptProfileToolDefs,
  instructions: CHATGPT_PROFILE_INSTRUCTIONS,
  metadataPath: CHATGPT_PROTECTED_RESOURCE_METADATA_PATH,
});

export const POST = door.POST;
export const OPTIONS = door.OPTIONS;
export const GET = door.GET;
