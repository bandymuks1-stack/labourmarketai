import { createMcpDoor, FULL_DOOR_INSTRUCTIONS } from "@/lib/mcp/http-door";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * THE FULL MCP DOOR: every exposed capability, for every MCP client that
 * already connects here (the ChatGPT connector, the mobile app, the
 * production walks). The implementation is `lib/mcp/http-door.ts`; the
 * curated ChatGPT profile is the sibling door `/api/mcp/chatgpt`.
 */
const door = createMcpDoor({ door: "/api/mcp", instructions: FULL_DOOR_INSTRUCTIONS });

export const POST = door.POST;
export const OPTIONS = door.OPTIONS;
export const GET = door.GET;
