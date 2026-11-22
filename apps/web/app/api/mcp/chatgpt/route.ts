import { mcpDoor } from "@/lib/mcp/door";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * MCP DOOR, curated ChatGPT profile (owner P0 2026-11-11): the same server as
 * `/api/mcp`, publishing and accepting only the tools in
 * `lib/mcp/chatgpt-profile.ts`. Its 401 points at its own RFC 9728 document,
 * whose `resource` is this URL. See `lib/mcp/door.ts`.
 */
const door = mcpDoor("chatgpt");

export const POST = door.POST;
export const OPTIONS = door.OPTIONS;
export const GET = door.GET;
