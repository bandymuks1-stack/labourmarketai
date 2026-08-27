"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { LabSwitch } from "../lab-switch";
import { LabErrorBoundary } from "../lab-error-boundary";
import { MobileScrim } from "../r2/mobile-scrim";
import { useBudget, useReducedMotion } from "../r2/quality";
import { useStory } from "../r2/story";
import { STANCES } from "./presence-stances";

const PresenceCanvas = dynamic(
  () => import("./presence-scene").then((m) => m.PresenceCanvas),
  { ssr: false },
);

const INK = "#F5EFE6";
const DIM = "#948B7E";

const BEATS = [
  {
    eyebrow: "01 — before anything is understood",
    title: "Everything you have done is already out there.",
    body: "Scattered, unread, attached to nobody. This is what a working life looks like to a market with no way to see it.",
  },
  {
    eyebrow: "02 — the record gathers",
    title: "It was never missing. It was never gathered.",
    body: "Real work, in real places. The same marks, pulled together until they describe a person rather than a pile of days.",
  },
  {
    eyebrow: "03 — capability leaves the body",
    title: "What you can do is what the record can show.",
    body: "Each trace leaving the figure is a capability with its evidence still attached. Nothing here was typed into a form.",
  },
  {
    eyebrow: "04 — and it goes back out",
    title: "Then the market can finally read you.",
    body: "The same evidence, released into a field where needs are looking for exactly this. One living profile, many possible futures.",
  },
];

export function PresenceExperience({ locale }: { readonly locale: string }) {
  const budget = useBudget();
  const reduced = useReducedMotion();
  const story = useStory(4);
  const [stance, setStance] = useState(0);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") setStance((i) => (i + 1) % STANCES.length);
      if (e.key === "ArrowLeft")
        setStance((i) => (i - 1 + STANCES.length) % STANCES.length);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div
      className="relative w-full"
      style={{ background: "#070605", color: INK, height: "440vh" }}
    >
      <div className="fixed inset-0 z-0">
        <LabErrorBoundary>
          <PresenceCanvas
            stance={stance}
            budget={budget}
            reduced={reduced}
            storyT={story.t}
          />
        </LabErrorBoundary>
      </div>

      <div className="pointer-events-none fixed inset-x-0 top-0 z-20 flex items-start justify-between px-[22px] pt-8 sm:px-12 sm:pt-9">
        <div
          className="text-[10px] uppercase"
          style={{
            fontFamily: "var(--font-mono), monospace",
            letterSpacing: "0.22em",
          }}
        >
          <span style={{ color: INK }}>labourmarket.ai</span>
          <span className="mx-3 opacity-35">·</span>
          <span style={{ color: DIM }}>living labour market</span>
          <span className="mx-3 hidden opacity-35 sm:inline">·</span>
          <span className="hidden sm:inline" style={{ color: DIM }}>
            concept c1 — the presence
          </span>
        </div>
      </div>

      <MobileScrim tone="#070605" />

      <div className="pointer-events-none relative z-10">
        {BEATS.map((b, i) => (
          <section
            key={b.eyebrow}
            className={`flex h-[110vh] items-center px-[22px] sm:px-12 ${
              i % 2 === 1 ? "justify-end text-right" : ""
            }`}
          >
            <div
              className="max-w-[36ch]"
              style={{
                opacity: envelope(story.progress, i, BEATS.length),
                transform: `translateY(${(1 - envelope(story.progress, i, BEATS.length)) * 18}px)`,
              }}
            >
              <div
                className="text-[10px] uppercase"
                style={{
                  fontFamily: "var(--font-mono), monospace",
                  letterSpacing: "0.22em",
                  color: "#E8A765",
                }}
              >
                {b.eyebrow}
              </div>
              <h2
                className="mt-4"
                style={{
                  fontFamily: "var(--font-serif-display), Georgia, serif",
                  fontSize: "clamp(1.9rem, 3.1vw, 3.1rem)",
                  lineHeight: 1.03,
                  letterSpacing: "-0.022em",
                  fontWeight: 400,
                }}
              >
                {b.title}
              </h2>
              <p
                className="mt-4 text-[14.5px] leading-[1.62]"
                style={{ color: DIM }}
              >
                {b.body}
              </p>
            </div>
          </section>
        ))}
      </div>

      <div className="pointer-events-none fixed inset-x-0 bottom-0 z-30 px-[22px] pb-20 sm:px-12 sm:pb-16">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="pointer-events-auto">
            <div
              className="mb-2.5 text-[9px] uppercase"
              style={{
                fontFamily: "var(--font-mono), monospace",
                letterSpacing: "0.22em",
                color: DIM,
              }}
            >
              whose record
            </div>
            <div className="flex flex-wrap gap-2">
              {STANCES.map((s, i) => {
                const active = i === stance;
                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => setStance(i)}
                    aria-pressed={active}
                    className="rounded-full px-4 py-2 text-[12.5px] transition-all duration-300"
                    style={{
                      border: `1px solid ${active ? "rgba(232,167,101,0.85)" : "rgba(245,239,230,0.2)"}`,
                      background: active
                        ? "rgba(232,167,101,0.14)"
                        : "rgba(10,8,6,0.45)",
                      color: active ? "#FFD9AE" : INK,
                      fontFamily: "var(--font-sans), system-ui, sans-serif",
                      backdropFilter: "blur(8px)",
                    }}
                  >
                    {s.chip}
                  </button>
                );
              })}
            </div>
          </div>
          <p
            className="max-w-[46ch] text-[11px] leading-[1.6]"
            style={{ color: DIM }}
          >
            Concept surface. The figure is an abstracted human presence built
            from primitives, not a real person. The photographic fragments are
            public-domain and CC0 records of real work — provenance in
            public/design-lab/human/LICENSES.md. No claim is made about anyone
            pictured.
          </p>
        </div>
      </div>

      <LabSwitch locale={locale} tone="dark" />
    </div>
  );
}

/** each beat owns a slice of the timeline, with cross-fades between */
function envelope(t: number, i: number, n: number) {
  const w = 1 / n;
  const a = i * w;
  const fadeIn = Math.min(1, Math.max(0, (t - a) / (w * 0.35)));
  const fadeOut = 1 - Math.min(1, Math.max(0, (t - (a + w * 0.72)) / (w * 0.35)));
  return Math.max(0, Math.min(fadeIn, fadeOut));
}
