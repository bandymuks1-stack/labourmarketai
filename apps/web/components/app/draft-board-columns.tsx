"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useTranslations } from "next-intl";
import { type DraftStatus } from "@/content/placeholders";
import { useMounted } from "@/lib/use-mounted";
import { cn } from "@/lib/utils";
import { MiniDraftCard } from "@/components/app/mini-draft-card";

type Slot = { key: string; id: string };

const POOL = [
  "draft.onDeck.1",
  "draft.onDeck.2",
  "draft.onDeck.3",
  "draft.onDeck.4",
  "draft.live.1",
  "draft.live.2",
  "draft.live.3",
  "draft.drafted.1",
  "draft.drafted.2",
  "draft.drafted.3",
  "draft.drafted.4",
] as const;

/** Live draft pipeline: every 12s one card moves col1 → col2 → col3; oldest
 *  drops out of col3, a recycled card enters col1 at the top. Initial render
 *  is deterministic (head = 0) so SSR + first client render match. The
 *  interval and entrance animations only run after mount. */
export function DraftBoardColumns() {
  const t = useTranslations("draft");
  const reduce = useReducedMotion();
  const mounted = useMounted();

  const [cols, setCols] = useState<{
    onDeck: Slot[];
    live: Slot[];
    drafted: Slot[];
  }>(() => ({
    onDeck: POOL.slice(0, 4).map((id) => ({ key: `${id}-0`, id })),
    live: POOL.slice(4, 7).map((id) => ({ key: `${id}-0`, id })),
    drafted: POOL.slice(7, 11).map((id) => ({ key: `${id}-0`, id })),
  }));

  const tickRef = useRef(1);
  const recyclePtr = useRef(0);

  useEffect(() => {
    if (!mounted) return;
    const iv = setInterval(() => {
      setCols((prev) => {
        const onDeck = prev.onDeck.slice();
        const live = prev.live.slice();
        const drafted = prev.drafted.slice();
        const moveToLive = onDeck.shift();
        const moveToDrafted = live.shift();
        drafted.shift(); // dropped — AnimatePresence handles exit
        if (moveToDrafted) drafted.push(moveToDrafted);
        if (moveToLive) live.push(moveToLive);
        const nextId = POOL[recyclePtr.current % POOL.length];
        recyclePtr.current += 1;
        const fresh: Slot = {
          key: `${nextId}-${tickRef.current}`,
          id: nextId,
        };
        tickRef.current += 1;
        onDeck.push(fresh);
        return { onDeck, live, drafted };
      });
    }, 12000);
    return () => clearInterval(iv);
  }, [mounted]);

  return (
    <div className="grid gap-4 md:grid-cols-3">
      <Column
        title={t("column.onDeck")}
        slots={cols.onDeck}
        statusKey="reviewing"
        enter={{ opacity: 0, y: -12 }}
        exit={{ opacity: 0, x: 24 }}
        reduce={!!reduce}
      />
      <Column
        title={t("column.live")}
        slots={cols.live}
        statusKey="deciding"
        enter={{ opacity: 0, x: -24 }}
        exit={{ opacity: 0, x: 24 }}
        glow="amber"
        reduce={!!reduce}
      />
      <Column
        title={t("column.drafted")}
        slots={cols.drafted}
        statusKey="hired"
        enter={{ opacity: 0, x: -24 }}
        exit={{ opacity: 0, y: 12 }}
        glow="live"
        reduce={!!reduce}
      />
    </div>
  );
}

function Column({
  title,
  slots,
  statusKey,
  enter,
  exit,
  glow,
  reduce,
}: {
  title: string;
  slots: Slot[];
  statusKey: DraftStatus;
  enter: { opacity?: number; x?: number; y?: number };
  exit: { opacity?: number; x?: number; y?: number };
  glow?: "amber" | "live";
  reduce: boolean;
}) {
  return (
    <div
      className={cn(
        "flex flex-col gap-3 rounded-lg p-3",
        glow === "amber" &&
          "ring-1 ring-state-amber/20 shadow-[inset_0_0_30px_-15px_rgba(255,165,82,0.35)]",
        glow === "live" &&
          "ring-1 ring-state-live/20 shadow-[inset_0_0_30px_-15px_rgba(0,230,118,0.30)]",
      )}
    >
      <p className="font-mono text-meta uppercase tracking-label text-text-muted">
        {title}
      </p>
      <ul role="list" className="flex flex-col gap-2.5">
        <AnimatePresence initial={false} mode="popLayout">
          {slots.map((s) => (
            <motion.li
              key={s.key}
              layout
              initial={enter}
              animate={{ opacity: 1, x: 0, y: 0 }}
              exit={exit}
              transition={{ duration: reduce ? 0 : 0.4, ease: "easeOut" }}
            >
              <MiniDraftCard id={s.id} statusKey={statusKey} />
            </motion.li>
          ))}
        </AnimatePresence>
      </ul>
    </div>
  );
}
