"use client";

import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { ArrowUpRight, Check } from "lucide-react";

import { cn } from "@/lib/utils";
import {
  CTX_LABEL,
  DASHBOARDS,
  type Attention,
  type Change,
  type CtxId,
  type Dashboard as Model,
} from "@/lib/design-proof/dashboard-model";
import { personById } from "@/lib/design-proof/product-fixtures";

import { TeamStack } from "./identity";
import { EntityCard, EntityThumb, resolve } from "./entity";
import { StateStage } from "./state-stage";
import { Btn, Eyebrow, RegionHead, Segmented, Surface } from "./ui";

/**
 * DASHBOARD — the operating centre.
 *
 *   IMPACT        the current-state stage: one headline, one object, four steps
 *   (gear change) a strip of live facts
 *   INFORMATION   what needs you · what is running · who · what changed
 *   INTERACTION   every row can be completed in place; completing it changes
 *                 the headline, the stage and "what changed"
 *   CALM          nothing below the stage moves unless something happened
 *
 * One grammar for every context: the model changes, the composition does not.
 */
export function Dashboard({ ctx, onCtx }: { readonly ctx: CtxId; readonly onCtx: (c: CtxId) => void }) {
  const reduce = useReducedMotion();
  const base = DASHBOARDS[ctx];
  const [done, setDone] = useState<Record<string, string[]>>({});
  const [mobile, setMobile] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 767px)");
    const on = () => setMobile(mq.matches);
    on();
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);

  const doneIds = done[ctx] ?? [];
  const remaining = base.attention.filter((a) => !doneIds.includes(a.id));
  const completed = base.attention.filter((a) => doneIds.includes(a.id));
  const model: Model = useMemo(() => base, [base]);
  const changes: Change[] = [
    ...completed.map((a): Change => ({ entity: a.entity, text: a.becomes, when: "just now", level: "confirmed" })).reverse(),
    ...base.changes,
  ];
  const complete = (a: Attention) => setDone((d) => ({ ...d, [ctx]: [...(d[ctx] ?? []), a.id] }));

  return (
    <div data-testid="dashboard" data-ctx={ctx} data-remaining={remaining.length}>
      {/* proof control: switch the context the dashboard is acting in */}
      <div className="relative z-20 border-b border-text-primary/10 bg-ink-900/80 px-4 py-2.5 backdrop-blur md:fixed md:bottom-4 md:right-5 md:z-50 md:rounded-full md:border md:px-2 md:py-1.5 md:shadow-[0_12px_40px_rgba(0,0,0,0.5)]" data-proof-control>
        <Segmented
          label="Context"
          value={ctx}
          onChange={onCtx}
          options={(Object.keys(CTX_LABEL) as CtxId[]).map((c) => ({ id: c, label: CTX_LABEL[c] }))}
          className="max-w-full overflow-x-auto"
        />
      </div>

      {/* IMPACT */}
      <StateStage key={ctx} model={model} remaining={remaining.length} mobile={mobile} />

      {/* the gear change */}
      <Strip facts={model.strip} />

      {/* INFORMATION + INTERACTION */}
      <div className="mx-auto flex max-w-[1320px] flex-col gap-[clamp(4rem,9vw,7.5rem)] px-4 pb-32 pt-[clamp(3.5rem,8vw,6.5rem)] md:px-10">
        <section aria-label="Needs you" data-testid="needs-you">
          <RegionHead
            eyebrow="Needs you"
            title={remaining.length === 0 ? "Nothing is *waiting* on you" : "Start with the *oldest*"}
            sub={remaining.length === 0 ? "Everything that asked for you has been answered." : "Each can be finished here. Finishing one changes what the rest of the page says."}
          />
          <Surface className="mt-8 overflow-hidden">
            <AnimatePresence initial={false}>
              {remaining.map((a, i) => (
                <motion.div
                  key={a.id}
                  layout={!reduce}
                  exit={reduce ? undefined : { opacity: 0, height: 0 }}
                  transition={{ duration: 0.45, ease: [0.2, 0.7, 0.2, 1] }}
                  className="overflow-hidden"
                  data-attention={a.id}
                >
                  <div className="grid grid-cols-[auto_1fr] items-center gap-x-5 gap-y-4 border-t border-text-primary/10 px-5 py-5 first:border-t-0 md:grid-cols-[auto_1fr_auto] md:px-7">
                    <EntityThumb entity={a.entity} size={mobile ? 64 : 84} />
                    <div className="min-w-0">
                      <p className="flex flex-wrap items-baseline gap-x-3"><span className="font-display text-[1.15rem] font-semibold leading-tight tracking-[-0.02em]">{resolve(a.entity).title}</span><span className="text-[0.85rem] text-text-muted">{resolve(a.entity).eyebrow}</span></p>
                      <p className="mt-1.5 max-w-[60ch] text-[0.95rem] leading-snug text-text-secondary">{a.text}</p>
                    </div>
                    <Btn kind={i === 0 ? "primary" : "secondary"} onClick={() => complete(a)} className="max-md:col-span-2 max-md:w-full" data-testid={`do-${a.id}`}>
                      {a.action} <ArrowUpRight className="h-4 w-4" aria-hidden />
                    </Btn>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
            {remaining.length === 0 ? (
              <motion.div initial={reduce ? false : { opacity: 0 }} animate={{ opacity: 1 }} className="flex items-center gap-3 px-7 py-9 text-[1.02rem] text-text-secondary">
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[rgba(52,211,153,0.16)] text-[rgb(110,231,183)]"><Check className="h-4 w-4" aria-hidden /></span>
                Clear. The next thing will appear here.
              </motion.div>
            ) : null}
          </Surface>
        </section>

        <section aria-label="In motion">
          <RegionHead eyebrow={model.motionHead.eyebrow} title={model.motionHead.title} sub={model.motionHead.sub} />
          <ul className={cn("mt-8 grid gap-5", model.motion.length > 2 ? "md:grid-cols-3" : model.motion.length === 2 ? "md:grid-cols-2" : "md:grid-cols-[minmax(0,1.2fr)_1fr]")}>
            {model.motion.map((m, i) => (
              <li key={i}>
                <EntityCard entity={m.entity} aspect="16 / 11" selected={i === 0}>
                  <span className="mt-2 text-[0.9rem] text-text-secondary">{m.state}</span>
                  <span className="mt-2.5 block h-[3px] overflow-hidden rounded-full bg-text-primary/15">
                    <span className="block h-full rounded-full bg-[rgb(235,200,95)]" style={{ width: `${Math.max(4, m.progress * 100)}%` }} />
                  </span>
                  <span className="mt-3 flex items-center justify-between gap-3">
                    <TeamStack members={m.people.map(personById)} size={30} max={5} />
                    <span className="text-[0.85rem] text-text-secondary">{m.next}</span>
                  </span>
                </EntityCard>
              </li>
            ))}
          </ul>
        </section>

        <section aria-label="People">
          <RegionHead eyebrow={model.peopleHead.eyebrow} title={model.peopleHead.title} sub={model.peopleHead.sub} />
          <ul className={cn("-mx-4 mt-8 flex snap-x gap-4 overflow-x-auto px-4 pb-2 md:mx-0 md:grid md:gap-5 md:overflow-visible md:px-0 [&::-webkit-scrollbar]:hidden", model.people.length < 5 ? "md:grid-cols-4" : "md:grid-cols-5")}>
            {model.people.slice(0, 5).map((p, i) => (
              <li key={i} className="w-[46vw] shrink-0 snap-start md:w-auto">
                <EntityCard entity={p.entity} aspect="4 / 5" selected={i === 0}>
                  <span className="mt-2 inline-flex w-fit rounded-full bg-[rgba(245,241,232,0.09)] px-2.5 py-1 text-[0.78rem] text-text-secondary">{p.chip}</span>
                </EntityCard>
              </li>
            ))}
          </ul>
        </section>

        <div className="grid gap-x-14 gap-y-[clamp(4rem,9vw,7rem)] lg:grid-cols-[1fr_1fr]">
          <section aria-label="What changed" data-testid="what-changed">
            <RegionHead eyebrow="What changed" title="Work becoming *history*" sub="Confirmed, joined and recorded since you last looked." />
            <Surface className="mt-8 overflow-hidden">
              <ul>
                <AnimatePresence initial={false}>
                  {changes.map((c, i) => (
                    <motion.li
                      key={c.text}
                      layout={!reduce}
                      initial={reduce || i > 0 ? false : { opacity: 0, backgroundColor: "rgba(52,211,153,0.14)" }}
                      animate={{ opacity: 1, backgroundColor: "rgba(52,211,153,0)" }}
                      transition={{ duration: 1.6 }}
                      className="grid grid-cols-[auto_1fr_auto] items-center gap-x-4 border-t border-text-primary/10 px-5 py-4 first:border-t-0 md:px-6"
                    >
                      <EntityThumb entity={c.entity} size={48} />
                      <p className="text-[0.98rem] leading-snug"><span className="font-medium">{c.when === "just now" ? "You" : resolve(c.entity).title.split(" ")[0]}</span> <span className="text-text-secondary">{c.text}</span></p>
                      <span className="flex flex-col items-end gap-1.5 text-[0.8rem] text-text-muted">
                        <span className={cn("rounded-full px-2.5 py-0.5 text-[0.72rem]", c.level === "confirmed" ? "bg-[rgba(52,211,153,0.13)] text-[rgb(110,231,183)]" : c.level === "joined" ? "bg-[rgba(245,241,232,0.09)] text-text-secondary" : "border border-dashed border-text-primary/35 text-text-secondary")}>
                          {c.level === "confirmed" ? "Confirmed" : c.level === "joined" ? "Joined" : "Recorded"}
                        </span>
                        {c.when}
                      </span>
                    </motion.li>
                  ))}
                </AnimatePresence>
              </ul>
            </Surface>
          </section>

          <section aria-label="Conversations">
            <RegionHead eyebrow="Conversations" title="Where people are *talking*" sub="Each thread belongs to a project, a team or a person." />
            <Surface className="mt-8 overflow-hidden">
              <ul>
                {model.threads.map((t, i) => (
                  <li key={i} className="grid grid-cols-[auto_1fr_auto] items-center gap-x-4 border-t border-text-primary/10 px-5 py-4 first:border-t-0 md:px-6">
                    <EntityThumb entity={t.entity} size={52} />
                    <div className="min-w-0">
                      <p className="truncate text-[1rem] font-medium">{t.who}</p>
                      <p className="truncate text-[0.92rem] text-text-secondary">{t.text}</p>
                    </div>
                    <span className="flex flex-col items-end gap-2 text-[0.8rem] text-text-muted">
                      {t.when}
                      {t.unread ? <span aria-label="Unread" className="h-2.5 w-2.5 rounded-full bg-brand-blue" /> : null}
                    </span>
                  </li>
                ))}
              </ul>
            </Surface>
          </section>
        </div>

        <section aria-label="Market">
          <RegionHead eyebrow={model.marketHead.eyebrow} title={model.marketHead.title} sub={model.marketHead.sub} />
          <ul className={cn("mt-8 grid gap-5", model.market.length > 3 ? "sm:grid-cols-2 md:grid-cols-4" : "sm:grid-cols-2 md:grid-cols-3")}>
            {model.market.map((m, i) => (
              <li key={i}>
                <EntityCard entity={m.entity} aspect="4 / 3" eyebrow={m.eyebrow} title={m.title} selected={i === 0}>
                  <span className="text-[0.85rem] text-text-secondary">{m.note}</span>
                </EntityCard>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}

/** The gear change: live facts, quiet, between the stage and the work. */
function Strip({ facts }: { readonly facts: readonly string[] }) {
  const row = [...facts, ...facts, ...facts, ...facts];
  return (
    <div aria-label="Live facts" className="relative z-10 overflow-hidden border-y border-text-primary/10 bg-[rgba(245,241,232,0.025)] py-3.5">
      <div className="lm-marquee flex w-max items-center gap-10 whitespace-nowrap">
        {[0, 1].map((k) => (
          <div key={k} className="flex items-center gap-10" aria-hidden={k === 1}>
            {row.map((f, i) => (
              <span key={`${k}-${i}`} className="flex items-center gap-10 text-[0.82rem] tracking-[0.02em] text-text-secondary">
                {f}
                <span aria-hidden className="h-1 w-1 rounded-full bg-[rgb(235,200,95)]" />
              </span>
            ))}
          </div>
        ))}
      </div>
      <Eyebrow className="sr-only">Live facts</Eyebrow>
    </div>
  );
}
