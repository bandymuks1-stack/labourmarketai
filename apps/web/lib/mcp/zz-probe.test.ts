import { it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("@/lib/env", () => ({ env: { CONVERSATION_TOKEN_SECRET: "unit-test-secret-with-enough-length", SUPABASE_SERVICE_ROLE_KEY: undefined } }));
vi.mock("next-intl/server", () => ({ getTranslations: async () => Object.assign((k: string) => k, { has: () => false }) }));
import { exposedCapabilities } from "@/lib/capabilities/registry";
import { toolName } from "./toolset";
import { writeFileSync } from "node:fs";
const out: string[] = [];
const log = (...a: unknown[]) => out.push(a.join(" "));
it("probe", () => {
  const caps = exposedCapabilities();
  const lens = caps.map((c) => c.description.length).sort((a, b) => b - a);
  log("count", caps.length, "kinds", JSON.stringify(caps.reduce((m: Record<string, number>, c) => ((m[c.kind] = (m[c.kind] ?? 0) + 1), m), {})));
  log("top lens", lens.slice(0, 15).join(","));
  for (const c of caps) {
    const d = c.description;
    const flags: string[] = [];
    if (/\bignore\b/i.test(d)) flags.push("ignore");
    if (/always call|you must|must always|do not tell|never tell/i.test(d)) flags.push("imperative");
    const urls = d.match(/https?:\/\/[^\s)"']+/g) ?? [];
    if (urls.some((u) => !/^https?:\/\/(www\.)?labourmarket\.ai/.test(u))) flags.push("url:" + urls.join(" "));
    if (c.kind === "draft" && !/confirm/i.test(d)) flags.push("draft-no-confirm");
    if (c.kind === "confirm" && !/token|confirm/i.test(d)) flags.push("confirm-no-token");
    if (c.kind === "execute" && !/(writ|chang|creat|updat|record|add|set|mark|stag|switch|sav)/i.test(d)) flags.push("execute-no-write-word");
    if (flags.length) log("FLAG", toolName(c.id), c.kind, flags.join("|"));
  }
  writeFileSync("C:/Users/Mano/AppData/Local/Temp/claude/C--Users-Mano-Documents-claud-darbai-labourmarketai-evid2-self-confirmation-block-12f0dc/2582386b-1301-4fa2-be39-909fcc3b991e/scratchpad/probe.txt", out.join(String.fromCharCode(10)));
});
