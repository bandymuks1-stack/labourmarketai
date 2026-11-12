import { activeLocales } from "@/lib/i18n/config";

import type { McpResource } from "./protocol";

/**
 * THE JOB-LIST WIDGET (OpenAI Apps SDK, owner P0 2026-11-11, C-lane item 4).
 *
 * One static `text/html+skybridge` template the ChatGPT host renders under a
 * `jobs_search` / `jobs_get` result. It contains NO data: the host hands it
 * the tool's own `structuredContent` (`window.openai.toolOutput`) — the same
 * anonymous projection the tool already returned as text — and the template
 * only draws it. No dependency, no network call of its own (`connect_domains`
 * is empty), no tracker, no storage.
 *
 * Safety: every value from the result is written with `textContent`, never
 * as markup; a job link is followed only when its `webPath` is a path on THIS
 * origin, opened through the host (`openExternal`) when it offers that.
 */
export const JOBS_WIDGET_URI = "ui://widget/labourmarket-jobs.html" as const;

/** Tool `_meta` that attaches the widget to a tool result. */
export const JOBS_WIDGET_TOOL_META = {
  "openai/outputTemplate": JOBS_WIDGET_URI,
  "openai/widgetAccessible": false,
} as const;

/** The tools that render with the widget (both public job reads). */
export const JOBS_WIDGET_TOOLS = ["jobs_search", "jobs_get"] as const;

/** The words the widget draws, per routed locale — read from the ONE copy
 *  source (`messages/<locale>.json` → `mcpWidget.jobs`), never a second table
 *  (doctrine §2.4). The host's `openai.locale` picks one; an unrouted
 *  language reads English. */
export type JobsWidgetLabels = Readonly<
  Record<string, Readonly<Record<string, string | Readonly<Record<string, string>>>>>
>;

const LABEL_KEYS = ["empty", "unavailable", "positions", "open", "more", "from", "upTo"] as const;
/** Fact words keyed by the projection's slugs; an unknown slug is omitted,
 *  never shown as an internal identifier (same rule as the job card). */
const FACT_GROUPS = ["employmentForm", "workingTime"] as const;

export async function loadJobsWidgetLabels(): Promise<JobsWidgetLabels> {
  const entries = await Promise.all(
    activeLocales.map(async (locale) => {
      const mod = (await import(`../../messages/${locale}.json`)) as {
        default: { mcpWidget?: { jobs?: Record<string, unknown> } };
      };
      const jobs = mod.default.mcpWidget?.jobs ?? {};
      const words = Object.fromEntries(
        LABEL_KEYS.map((k) => [k, typeof jobs[k] === "string" ? (jobs[k] as string) : ""]),
      );
      const facts = Object.fromEntries(
        FACT_GROUPS.map((g) => {
          const group = jobs[g];
          const map =
            group && typeof group === "object"
              ? Object.fromEntries(
                  Object.entries(group as Record<string, unknown>).filter(
                    (e): e is [string, string] => typeof e[1] === "string",
                  ),
                )
              : {};
          return [g, map];
        }),
      );
      return [locale, { ...words, ...facts }] as const;
    }),
  );
  return Object.fromEntries(entries);
}

function widgetHtml(origin: string, labels: JobsWidgetLabels): string {
  // Values reach the page only as JSON in a data block, read with JSON.parse.
  const config = JSON.stringify({ origin, labels }).replace(/</g, "\\u003c");
  return `<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<style>
:root{--fg:#111;--muted:#666;--line:#e5e5e5;--accent:#8a6d1f;--bg:#fff}
@media (prefers-color-scheme:dark){:root{--fg:#f2f2f2;--muted:#a3a3a3;--line:#2e2e2e;--accent:#d4b25c;--bg:#151515}}
body{margin:0;font:14px/1.45 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:var(--fg);background:var(--bg)}
ul{list-style:none;margin:0;padding:0}
li{display:flex;gap:12px;justify-content:space-between;align-items:center;padding:10px 12px;border-bottom:1px solid var(--line)}
.t{font-weight:600}.m{color:var(--muted);font-size:13px}
button{font:inherit;color:var(--accent);background:none;border:1px solid var(--line);border-radius:8px;padding:6px 10px;cursor:pointer;white-space:nowrap}
p{margin:12px;color:var(--muted)}
</style></head><body><div id="root"></div>
<script type="application/json" id="cfg">${config}</script>
<script>
(function(){
  var cfg = JSON.parse(document.getElementById("cfg").textContent);
  function el(tag, cls, text){ var e=document.createElement(tag); if(cls) e.className=cls; if(text!=null) e.textContent=String(text); return e; }
  function labels(){ var l=(window.openai&&window.openai.locale||"en").slice(0,2); return cfg.labels[l]||cfg.labels.en; }
  function open(path){
    if(typeof path!=="string"||path.charAt(0)!=="/"||path.charAt(1)==="/") return;
    var href=cfg.origin+path;
    if(window.openai&&typeof window.openai.openExternal==="function") window.openai.openExternal({href:href});
    else window.open(href,"_blank","noopener");
  }
  // The same wording as lib/vacancy-store/vacancy-pay-label.ts payLabel: a
  // one-sided bound keeps its direction ("from" / "up to"), never an exact
  // amount the publisher did not state; no currency or no amount = nothing.
  function pay(j,L){
    var c=String(j.compensationCurrency||"").trim().toUpperCase();
    if(!/^[A-Z]{3}$/.test(c)) return "";
    function v(n){ return typeof n==="number"&&isFinite(n)&&n>0?Math.round(n):null; }
    var lo=v(j.compensationMin), hi=v(j.compensationMax);
    if(lo!=null&&hi!=null&&hi>lo) return lo+"–"+hi+" "+c;
    if(lo!=null&&hi!=null) return lo+" "+c;
    if(lo!=null) return L.from+" "+lo+" "+c;
    if(hi!=null) return L.upTo+" "+hi+" "+c;
    return "";
  }
  function render(){
    var L=labels(), root=document.getElementById("root"); root.textContent="";
    var out=window.openai&&window.openai.toolOutput;
    if(!out) return;
    // A failed read ({ok:false, code}) is not an empty search: say so.
    if(out.ok===false||!out.data){ root.appendChild(el("p",null,L.unavailable)); return; }
    var data=out.data, jobs=data.jobs||(data.job?[data.job]:[]);
    if(!jobs.length){ root.appendChild(el("p",null,L.empty)); return; }
    var ul=el("ul");
    jobs.forEach(function(j){
      var li=el("li"), info=el("div");
      info.appendChild(el("div","t",j.occupation||j.professionSlug||""));
      // Fact words from the catalog by slug; an unknown slug is left out.
      function fact(group,slug){ var m=L[group]; return slug&&m&&typeof m[slug]==="string"?m[slug]:null; }
      var meta=[pay(j,L),fact("employmentForm",j.employmentForm),fact("workingTime",j.workingTime),j.positions>1?j.positions+" "+L.positions:null].filter(Boolean).join(" · ");
      if(meta) info.appendChild(el("div","m",meta));
      var b=el("button",null,L.open); b.addEventListener("click",function(){open(j.webPath);});
      li.appendChild(info); li.appendChild(b); ul.appendChild(li);
    });
    root.appendChild(ul);
    if(data.hasMore) root.appendChild(el("p",null,L.more));
  }
  window.addEventListener("openai:set_globals",render);
  render();
})();
</script></body></html>`;
}

/** The widget as an MCP resource for this door's public origin. */
export function jobsWidgetResource(origin: string, labels: JobsWidgetLabels): McpResource {
  return {
    uri: JOBS_WIDGET_URI,
    name: "LabourMarket.ai job list",
    description: "Renders a public job search result as a list.",
    mimeType: "text/html+skybridge",
    text: widgetHtml(origin, labels),
    _meta: {
      "openai/widgetDescription": "A list of open jobs from the public LabourMarket.ai board.",
      "openai/widgetPrefersBorder": true,
      "openai/widgetDomain": origin,
      // No fetches and no external assets: the template only draws the result.
      "openai/widgetCSP": { connect_domains: [], resource_domains: [] },
    },
  };
}
