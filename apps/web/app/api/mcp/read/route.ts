import { mcpDoor } from "@/lib/mcp/door";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * MCP DOOR, read profile: only the capabilities that read, for a connector
 * that must not change anything (an app-directory review). Same identity and
 * brake as `/api/mcp`; every write name is refused. See `lib/mcp/door.ts`.
 */
const door = mcpDoor("read");

export const POST = door.POST;
export const OPTIONS = door.OPTIONS;
export const GET = door.GET;
