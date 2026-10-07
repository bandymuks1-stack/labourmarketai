import { createHash } from "node:crypto";

import { z } from "zod";

import type { CapabilityDescriptor } from "@/lib/capabilities/contract";

import type { McpToolDef } from "./protocol";

/** MCP tool names allow [a-zA-Z0-9_-]; capability ids use dots. */
export const toolName = (capabilityId: string): string => capabilityId.replace(/\./g, "_");

/** The tool list a client is shown — derived from the capability registry. */
export function toolDefsOf(capabilities: readonly CapabilityDescriptor[]): McpToolDef[] {
  return capabilities.map((c) => ({
    name: toolName(c.id),
    title: c.title,
    description: c.description,
    inputSchema: z.toJSONSchema(c.inputSchema) as Record<string, unknown>,
    // Honest behavior hints declared per capability in review — clients can
    // tell reads from writes without parsing prose.
    annotations: c.annotations,
  }));
}

/** Semver core of the MCP server. */
export const SERVER_VERSION_CORE = "0.1.0";

/**
 * THE PUBLISHED TOOLSET, AS A VERSION: `0.1.0+t<count>.<schema hash>`.
 * The server is stateless streamable HTTP, so it cannot push
 * `notifications/tools/list_changed`; instead this identity field every client
 * reads on connect changes exactly when a deploy adds, removes or re-describes
 * a tool. Comparing it with what a client (ChatGPT) reports tells SERVER
 * CURRENT from CLIENT STALE at a glance. Semver build metadata — ignored for
 * precedence by design. Every release's value is recorded in
 * docs/integrations/MCP_TOOLSET_FINGERPRINTS.md (pinned by a test).
 */
export function toolsetVersionOf(defs: readonly McpToolDef[]): string {
  const digest = createHash("sha256")
    .update(JSON.stringify(defs.map((d) => [d.name, d.description, d.inputSchema, d.annotations])))
    .digest("hex")
    .slice(0, 8);
  return `${SERVER_VERSION_CORE}+t${defs.length}.${digest}`;
}
