import "server-only";

import { structureNeed } from "@/lib/structuring/structure-need";
import { buildWorkCategoryOptions } from "@/lib/taxonomy/work-categories";
import { saveDemandDraft } from "./demand-drafts";

/**
 * "I typed my need once" -> the canonical demand draft the wizard already
 * continues from.
 *
 * THE DEFECT THIS CLOSES. /dashboard/market/recognize asked an employer to
 * describe what they need, recognised it, listed what was missing, and then
 * handed them a plain link to /dashboard/company - a wizard with an EMPTY
 * description box. The employer's sentence was read, scored, and thrown away.
 * They typed it again.
 *
 * WHY THIS IS NOT A NEW MODEL. Every piece of the chain already existed; only
 * the join between two of them was missing:
 *
 *   free text        -> structureNeed()            (lib/structuring)
 *   ephemeral draft  -> customer_requests          (status='draft', kind, RLS
 *                                                   owner-scoped, written only
 *                                                   through save_demand_draft)
 *   editable preview -> the 3-step wizard          (demand-request-button)
 *   explicit confirm -> submitDemandRequestAction  (status='submitted')
 *
 * So this adds NO table, NO column, NO second demand model and NO new intake.
 * It writes the SAME draft the wizard's own "save as draft" writes, through the
 * SAME action, and the wizard's existing auto-continue (`getOwnLastDemandPrefill`
 * with `source === 'draft'`) picks it up with no change on that side at all.
 *
 * WHY NOT A QUERY PARAMETER. The obvious shortcut is `?text=...`. It is refused
 * on purpose: a need routinely names a client, a site, a rate and a headcount,
 * and a URL is logged by the browser, the proxy, the analytics layer and the
 * referrer header of the next request. The draft row is owner-scoped by RLS and
 * carries the text where the rest of the demand chain already keeps it.
 *
 * WHY THE DRAFT IS SAFE TO CREATE BEFORE ANY CONFIRMATION. `status='draft'` is
 * not a demand. The board reads `submitted`; matching reads structured
 * requirements off submitted rows; nobody is contacted. `save_demand_draft`
 * holds ONE draft per (profile, kind) behind a partial unique index, so
 * arriving here twice REPLACES the pending draft rather than accumulating
 * rows - which also makes this idempotent under a double click or a replayed
 * form post. The employer still has to walk the three steps and press create
 * before anything becomes real.
 */

/** Longest need text carried into a draft. `sanitizeDemandDraftPayload` caps
 *  the stored fields again; this bound only keeps an absurd paste out of the
 *  action's argument. */
const MAX_NEED_TEXT = 4000;
/** Fallback title length when the text names no recognisable work type. */
const MAX_FALLBACK_TITLE = 60;

export type StartDemandFromNeedText =
  | { readonly ok: true; readonly title: string }
  /** `no_company` is the honest, EXPECTED outcome for a signed-in person who
   *  holds no employer context yet - the surface offers the plain link instead
   *  of pretending a draft was saved. Anything else is a real failure. */
  | { readonly ok: false; readonly reason: "empty" | "no_company" | "failed" };

/**
 * A title made of the employer's OWN words, never an invented one.
 *
 * First choice is the localized label of the work type `structureNeed`
 * recognised in their sentence - a closed-set taxonomy value, so "reikia 4
 * suvirintoju Vokietijoje" titles the draft "Suvirintojas", not the whole
 * paragraph. When nothing is recognised it falls back to the opening of what
 * they wrote.
 *
 * A title matters more than it looks: `save_demand_draft` stores '—' when the
 * title is null, and the wizard's prefill reads `payload.role || title` into the
 * ROLE field. Left alone, the employer would have found a literal em-dash sitting
 * in the role box.
 */
export function demandTitleFromNeedText(text: string, locale: string): string {
  const structured = structureNeed({ description: text });
  if (structured.workType) {
    for (const group of buildWorkCategoryOptions(locale)) {
      const hit = group.options.find((o) => o.slug === structured.workType);
      if (hit) return hit.label;
    }
  }
  const firstLine = text.split(/\r?\n/, 1)[0]?.trim() ?? "";
  const source = firstLine || text.trim();
  return source.length > MAX_FALLBACK_TITLE
    ? `${source.slice(0, MAX_FALLBACK_TITLE).trimEnd()}…`
    : source;
}

/**
 * Persist a recognised need as the canonical employer draft.
 *
 * The STRUCTURED values (work type, country, headcount, start period,
 * accommodation) are deliberately NOT written here. The wizard re-derives them
 * from the description with the very same `structureNeed` call when the
 * employer steps from "describe" to "criteria", and it only fills fields the
 * employer has left empty. Writing them twice would mean two places deciding
 * what a sentence means, which is exactly how the two sides drift apart.
 */
export async function startDemandFromNeedText(
  rawText: string,
  locale: string,
): Promise<StartDemandFromNeedText> {
  const text = (rawText ?? "").slice(0, MAX_NEED_TEXT).trim();
  if (!text) return { ok: false, reason: "empty" };

  const title = demandTitleFromNeedText(text, locale);
  try {
    await saveDemandDraft("company_request", {
      title,
      // -> `description` in the wizard: the sentence the employer actually
      //    wrote, unedited and unsummarised.
      capabilities: text,
    });
    return { ok: true, title };
  } catch (e) {
    // `saveDemandDraft` throws `no company context: <reason>` when the caller
    // holds no employer workspace. That is a legitimate state, not an error to
    // hide: the surface degrades to the plain link and says why.
    const message = e instanceof Error ? e.message : "";
    if (message.startsWith("no company context")) {
      return { ok: false, reason: "no_company" };
    }
    console.error("[demand-from-need-text] save failed:", message);
    return { ok: false, reason: "failed" };
  }
}
