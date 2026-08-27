"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useState } from "react";
import { LabSwitch } from "../lab-switch";
import { LabErrorBoundary } from "../lab-error-boundary";
import { MobileScrim } from "../r2/mobile-scrim";
import { useBudget, useReducedMotion } from "../r2/quality";
import { useStory } from "../r2/story";
import { NEEDS, ROLE_LABEL, type Role } from "./assembly-model";

const AssemblyCanvas = dynamic(
  () => import("./assembly-scene").then((m) => m.AssemblyCanvas),
  { ssr: false },
);

const INK = "#F4F0EA";
const DIM = "#8A8C95";

const SWATCH: Readonly<Record<Role, string>> = {
  person: "linear-gradient(135deg,#FFE3BE,#C98F4E)",
  team: "linear-gradient(135deg,#F4F1EA,#B9B4A9)",
  agent: "linear-gradient(135deg,#7E93A8,#14161C)",
  org: "linear-gradient(135deg,#AFC0D4,#465A72)",
};

export function AssemblyExperience({ locale }: { readonly locale: string }) {
  const budget = useBudget();
  const reduced = useReducedMotion();
  const story = useStory(4);
  const [needIndex, setNeedIndex] = useState(0);
  const [settled, setSettled] = useState(0);
  const need = NEEDS[needIndex];

  const onSettled = useCallback((v: number) => setSettled(v), []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") setNeedIndex((i) => (i + 1) % NEEDS.length);
      if (e.key === "ArrowLeft")
        setNeedIndex((i) => (i - 1 + NEEDS.length) % NEEDS.length);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div
      className="relative w-full"
      style={{ background: "#07070A", color: INK, height: "420vh" }}
    >
      <div className="fixed inset-0 z-0">
        <LabErrorBoundary>
          <AssemblyCanvas
            needIndex={needIndex}
            budget={budget}
            reduced={reduced}
            storyT={story.t}
            onSettled={onSettled}
          />
        </LabErrorBoundary>
      </div>

      {/* ── instrument chrome ─────────────────────────────────────────── */}
      <div className="pointer-events-none fixed inset-x-0 top-0 z-20 flex items-start justify-between px-[22px] pt-8 sm:px-12 sm:pt-9">
        <Mono>
          <span style={{ color: INK }}>labourmarket.ai</span>
          <span className="mx-3 opacity-35">·</span>
          <span style={{ color: DIM }}>living labour market</span>
          <span className="mx-3 hidden opacity-35 sm:inline">·</span>
          <span className="hidden sm:inline" style={{ color: DIM }}>
            concept c3 — the assembly
          </span>
        </Mono>
        <div className="flex flex-col items-end gap-1.5">
          {(Object.keys(ROLE_LABEL) as Role[]).map((r) => (
            <div key={r} className="flex items-center gap-2">
              <span
                className="text-[9px] uppercase"
                style={{
                  fontFamily: "var(--font-mono), monospace",
                  letterSpacing: "0.2em",
                  color: DIM,
                }}
              >
                {ROLE_LABEL[r]}
              </span>
              <span
                aria-hidden
                style={{
                  width: 20,
                  height: 6,
                  borderRadius: 3,
                  background: SWATCH[r],
                  boxShadow: "0 0 10px rgba(255,200,150,0.18)",
                }}
              />
            </div>
          ))}
        </div>
      </div>

      <MobileScrim tone="#07070A" />

      {/* ── the story, in the page ────────────────────────────────────── */}
      <div className="pointer-events-none relative z-10">
        <section className="h-[100vh]" />

        <section className="flex h-[110vh] items-center px-[22px] sm:px-12">
          <div
            className="max-w-[38ch]"
            style={{
              opacity: fade(story.progress, 0.14, 0.26, 0.44, 0.56),
              transform: `translateY(${(1 - fade(story.progress, 0.14, 0.26, 0.44, 0.56)) * 16}px)`,
            }}
          >
            <Eyebrow>01 — a need arrives</Eyebrow>
            <h2 className="mt-4" style={H2}>
              Nothing here was assigned.
            </h2>
            <p className="mt-4 text-[14.5px] leading-[1.62]" style={{ color: DIM }}>
              The need is stated, and the capabilities that could actually meet
              it move — from wherever they were, along the path that gets them
              there, arriving in the order the work needs them.
            </p>
          </div>
        </section>

        <section className="flex h-[110vh] items-center justify-end px-[22px] sm:px-12">
          <div
            className="max-w-[40ch] text-right"
            style={{
              opacity: fade(story.progress, 0.46, 0.58, 0.70, 0.80),
              transform: `translateY(${(1 - fade(story.progress, 0.46, 0.58, 0.7, 0.8)) * 16}px)`,
            }}
          >
            <Eyebrow>02 — the structure is the answer</Eyebrow>
            <h2 className="mt-4" style={H2}>
              {need.headline}
            </h2>
            <p className="mt-4 text-[14.5px] leading-[1.62]" style={{ color: DIM }}>
              {need.body}
            </p>
          </div>
        </section>

        <section className="flex h-[100vh] items-center px-[22px] sm:px-12">
          <div
            className="max-w-[40ch]"
            style={{ opacity: fade(story.progress, 0.8, 0.9, 1.1, 1.2) }}
          >
            <Eyebrow>03 — and it is one of many</Eyebrow>
            <h2 className="mt-4" style={H2}>
              Every other need in the market is doing this too.
            </h2>
            <p className="mt-4 text-[14.5px] leading-[1.62]" style={{ color: DIM }}>
              That is the whole product: not a board of postings, but a market
              that keeps re-forming around what is actually being asked for, out
              of what people can actually be shown to do.
            </p>
          </div>
        </section>
      </div>

      {/* ── the control ──────────────────────────────────────────────── */}
      <div className="pointer-events-none fixed inset-x-0 bottom-0 z-30 px-[22px] pb-20 sm:px-12 sm:pb-16">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="pointer-events-auto">
            <div
              className="mb-2.5 flex items-center gap-3 text-[9px] uppercase"
              style={{
                fontFamily: "var(--font-mono), monospace",
                letterSpacing: "0.22em",
                color: DIM,
              }}
            >
              <span>change the need</span>
              <span
                aria-hidden
                style={{
                  display: "inline-block",
                  width: 54,
                  height: 2,
                  background: "rgba(244,240,234,0.16)",
                  position: "relative",
                }}
              >
                <span
                  style={{
                    position: "absolute",
                    inset: 0,
                    width: `${Math.round(settled * 100)}%`,
                    background: "rgba(255,201,138,0.9)",
                    transition: "width 220ms linear",
                  }}
                />
              </span>
              <span style={{ color: settled > 0.98 ? "#FFC98A" : DIM }}>
                {settled > 0.98 ? "assembled" : "assembling"}
              </span>
            </div>
            <div className="flex flex-wrap gap-2">
              {NEEDS.map((n, i) => {
                const active = i === needIndex;
                return (
                  <button
                    key={n.id}
                    type="button"
                    onClick={() => setNeedIndex(i)}
                    aria-pressed={active}
                    className="rounded-full px-4 py-2 text-[12.5px] transition-all duration-300"
                    style={{
                      border: `1px solid ${active ? "rgba(255,201,138,0.85)" : "rgba(244,240,234,0.2)"}`,
                      background: active ? "rgba(255,201,138,0.14)" : "rgba(12,12,16,0.4)",
                      color: active ? "#FFD9AE" : INK,
                      fontFamily: "var(--font-manrope), system-ui, sans-serif",
                      backdropFilter: "blur(8px)",
                    }}
                  >
                    {n.chip}
                  </button>
                );
              })}
            </div>
          </div>

          <p
            className="max-w-[44ch] text-[11px] leading-[1.6]"
            style={{ color: DIM }}
          >
            Concept surface. These compositions are visual storytelling states,
            not measured staffing. An AI agent appears because the architecture
            already treats it as a work subject that must earn its place through
            reviewed work — never as a legal person.
          </p>
        </div>
      </div>

      <LabSwitch locale={locale} tone="dark" />
    </div>
  );
}

const H2: React.CSSProperties = {
  fontFamily: "var(--font-manrope), system-ui, sans-serif",
  fontSize: "clamp(1.6rem, 2.5vw, 2.5rem)",
  lineHeight: 1.08,
  letterSpacing: "-0.032em",
  fontWeight: 500,
};

/** trapezoid opacity envelope across the story timeline */
function fade(t: number, a: number, b: number, c: number, d: number) {
  if (t < a || t > d) return 0;
  if (t < b) return (t - a) / (b - a);
  if (t > c) return 1 - (t - c) / (d - c);
  return 1;
}

function Mono({ children }: { readonly children: React.ReactNode }) {
  return (
    <div
      className="text-[10px] uppercase"
      style={{ fontFamily: "var(--font-mono), monospace", letterSpacing: "0.22em" }}
    >
      {children}
    </div>
  );
}

function Eyebrow({ children }: { readonly children: React.ReactNode }) {
  return (
    <div
      className="text-[10px] uppercase"
      style={{
        fontFamily: "var(--font-mono), monospace",
        letterSpacing: "0.22em",
        color: "#FFC98A",
      }}
    >
      {children}
    </div>
  );
}
