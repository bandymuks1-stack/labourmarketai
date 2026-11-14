import { mcpDoor } from "@/lib/mcp/door";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * MCP DOOR, full profile: every exposed capability, reads and writes.
 * The door itself (identity, brake, receipts, brand) is `lib/mcp/door.ts`;
 * the read-only profile is `app/api/mcp/read/route.ts`.
 */
const door = mcpDoor("full");

export const POST = door.POST;
export const OPTIONS = door.OPTIONS;
export const GET = door.GET;
