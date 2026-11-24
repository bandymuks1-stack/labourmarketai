"use server";

import "server-only";

import { getTranslations } from "next-intl/server";

import { loadConsequenceTrace } from "@/lib/home/consequence-trace-server";
import { traceReachedLivingCv } from "@/lib/home/consequence-trace";
import { traceStepText, traceStepTone, type TraceStepTone } from "@/lib/home/consequence-trace-copy";
import { formatUtcDate } from "@/lib/time/display";

/**
 * "KAS PASIKEITĖ?" — the conversation's answer to "what changed since
 * yesterday" (Future Experience A, owner 2026-10-14: AI as a work partner,
 * not a side chat box). A THIN ADAPTER over the ONE consequence trace
 * (`loadConsequenceTrace`) — the same chains the home's "Kas pasikeitė"
 * region draws, worded by the same `traceStepText`. No second read, no
 * second wording, nothing written.
 *
 * The steps are resolved to text HERE, on the server, so the chat embed
 * needs no extra client message roots: it renders strings and tones.
 *
 * States the chat answers differently (SEP-7):
 *   ok       — chains exist in the window
 *   none     — the reads answered and nothing changed in the window
 *   unknown  — the trace could not be read (never "nothing changed")
 * `partial` names a half-failed read beside the chains it could read.
 */

export type ChatTraceStep = { readonly text: string; readonly tone: TraceStepTone };
export type ChatTraceItem = {
  readonly id: string;
  readonly title: string;
  readonly when: string;
  readonly href: string;
  readonly reachedCv: boolean;
  readonly steps: readonly ChatTraceStep[];
};

export type WhatChangedRead =
  | { readonly kind: "ok"; readonly items: readonly ChatTraceItem[]; readonly partial: string | null }
  | { readonly kind: "none"; readonly partial: string | null }
  | { readonly kind: "unknown" };

export async function readWhatChangedForChat(args: { readonly locale: string }): Promise<WhatChangedRead> {
  const locale = args.locale;
  const [trace, t, tChain, tTypes, tRole, tSkill] = await Promise.all([
    loadConsequenceTrace(),
    getTranslations({ locale, namespace: "homeTrace" }),
    getTranslations({ locale, namespace: "homeRegions.chain" }),
    getTranslations({ locale, namespace: "auth.notifications.types" }),
    getTranslations({ locale, namespace: "journal.entry.confirmerRole" }),
    getTranslations({ locale, namespace: "skillNames" }),
  ]);
  if (trace.kind === "unknown") return { kind: "unknown" };

  const number = (n: number) => new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(n);
  const copy = {
    t: (k: string, v?: Record<string, string | number>) => t(k as never, v as never),
    chain: (k: string) => tChain(k as never),
    role: (r: string | null) => (r && tRole.has(r as never) ? tRole(r as never) : t("roleUnknown")),
    skill: (slug: string) => (tSkill.has(slug as never) ? tSkill(slug as never) : slug),
    number,
  };
  const flags: string[] = [];
  if (trace.journalUnknown) flags.push(t("journalUnknown"));
  if (trace.eventsUnknown) flags.push(t("eventsUnknown"));
  const partial = flags.length > 0 ? flags.join(" ") : null;

  if (trace.items.length === 0) return { kind: "none", partial };
  return {
    kind: "ok",
    partial,
    items: trace.items.map((item) => ({
      id: item.id,
      title:
        item.title.kind === "entry"
          ? item.title.text || t("entryUntitled")
          : tTypes.has(item.title.renderedType as never)
            ? tTypes(item.title.renderedType as never)
            : tTypes("generic"),
      when: formatUtcDate(item.at.slice(0, 10), locale) ?? "",
      href: item.href,
      reachedCv: traceReachedLivingCv(item),
      steps: item.steps.map((step) => ({ text: traceStepText(step, copy), tone: traceStepTone(step) })),
    })),
  };
}
