"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const ROUND1 = [
  { id: "a", slug: "premium-a", name: "Record" },
  { id: "b", slug: "premium-b", name: "Field" },
  { id: "c", slug: "premium-c", name: "Composition" },
] as const;

/** Round 2 — the three evolutions of the selected direction. Round 1 stays
 *  reachable so the owner can compare rather than remember. */
const ROUND2 = [
  { id: "c1", slug: "premium-c1", name: "Presence" },
  { id: "c2", slug: "premium-c2", name: "Weather" },
  { id: "c3", slug: "premium-c3", name: "Assembly" },
] as const;

/**
 * Lab chrome. Fixed, tiny, always legible on either ground, and explicitly
 * marked CONCEPT (doctrine §18: an unlabelled non-live surface is banned;
 * the word "demo" is banned from product copy).
 */
export function LabSwitch({
  locale,
  tone = "dark",
}: {
  readonly locale: string;
  readonly tone?: "dark" | "light";
}) {
  const pathname = usePathname();
  const fg = tone === "dark" ? "#F4F1EA" : "#16130F";
  const bg = tone === "dark" ? "rgba(12,12,14,0.62)" : "rgba(255,255,255,0.62)";
  const line =
    tone === "dark" ? "rgba(244,241,234,0.18)" : "rgba(22,19,15,0.16)";
  return (
    <div
      className="pointer-events-auto fixed bottom-4 left-1/2 z-50 -translate-x-1/2"
      style={{ fontFamily: "var(--font-mono), ui-monospace, monospace" }}
    >
      <div
        className="flex items-center gap-1 rounded-full px-1.5 py-1.5 backdrop-blur-xl"
        style={{ background: bg, border: `1px solid ${line}`, color: fg }}
      >
        <span
          className="hidden px-2.5 text-[9px] uppercase tracking-[0.24em] opacity-55 sm:inline"
          style={{ letterSpacing: "0.24em" }}
        >
          R2
        </span>
        {ROUND2.map((c) => {
          const href = `/${locale}/design/${c.slug}`;
          const active = pathname === href;
          return (
            <Link
              key={c.id}
              href={href}
              className="rounded-full px-2 py-1.5 text-[9px] uppercase tracking-[0.14em] transition-colors duration-200 sm:px-3 sm:text-[10px] sm:tracking-[0.18em]"
              style={{
                background: active ? fg : "transparent",
                color: active ? (tone === "dark" ? "#0C0C0E" : "#FFFFFF") : fg,
                opacity: active ? 1 : 0.62,
              }}
            >
              {c.id} · {c.name}
            </Link>
          );
        })}
        <span aria-hidden className="mx-1 opacity-25">|</span>
        {ROUND1.map((c) => {
          const href = `/${locale}/design/${c.slug}`;
          const active = pathname === href;
          return (
            <Link
              key={c.id}
              href={href}
              title={`Round 1 — ${c.name}`}
              className="rounded-full px-2 py-1.5 text-[9px] uppercase tracking-[0.14em] transition-colors duration-200"
              style={{
                background: active ? fg : "transparent",
                color: active ? (tone === "dark" ? "#0C0C0E" : "#FFFFFF") : fg,
                opacity: active ? 1 : 0.4,
              }}
            >
              {c.id}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
