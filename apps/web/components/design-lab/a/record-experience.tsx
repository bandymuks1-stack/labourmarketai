"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { LabSwitch } from "../lab-switch";
import { useReducedMotion } from "../use-lab-motion";
import { RecordCanvas } from "./record-canvas";
import { buildRecord, STANCES, type Stance } from "./record-data";
import {
  columnBaseline,
  columnWidth,
  columnX,
  padX,
  rowLeft,
  rowY,
} from "./record-geometry";

const PAPER = "#EDE9E1";
const INK = "#16130F";
const INK_SOFT = "#6E665A";
const SIGNAL = "#A33816";

function clamp01(x: number) {
  return x < 0 ? 0 : x > 1 ? 1 : x;
}

/**
 * CONCEPT A — "The Record".
 *
 * One continuous object on a fixed stage: the marks a person actually leaves.
 * Scroll does not move it down the page, it REORGANISES it — chronological
 * band, then capability columns, then the six rows a market can read. The
 * three states are the product chain (activity → evidence → capability →
 * living profile), performed rather than described.
 */
export function RecordExperience({ locale }: { readonly locale: string }) {
  const reduced = useReducedMotion();
  const phaseRef = useRef(0);
  const [phase, setPhase] = useState(0);
  const [stance, setStance] = useState<Stance>("work");
  const [feature, setFeature] = useState<string | null>(null);
  const [box, setBox] = useState({ w: 1440, h: 900 });
  const stageRef = useRef<HTMLDivElement | null>(null);

  const record = useMemo(() => buildRecord(stance), [stance]);

  // ── scroll → phase ──────────────────────────────────────────────────────
  useEffect(() => {
    let raf = 0;
    const read = () => {
      const vh = window.innerHeight || 1;
      const p = window.scrollY / vh;
      const one = clamp01((p - 0.42) / 0.78);
      const two = clamp01((p - 1.48) / 0.78);
      const next = one + two;
      phaseRef.current = next;
      setPhase((prev) => (Math.abs(prev - next) > 0.004 ? next : prev));
      raf = 0;
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(read);
    };
    read();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  // ── stage box, so the type layer can sit exactly on the marks ───────────
  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      const r = el.getBoundingClientRect();
      setBox({ w: r.width, h: r.height });
    });
    ro.observe(el);
    const r = el.getBoundingClientRect();
    setBox({ w: r.width, h: r.height });
    return () => ro.disconnect();
  }, []);

  const onFeature = useCallback((line: string | null) => setFeature(line), []);

  const compact = box.w < 760;
  const colOpacity = clamp01((phase - 0.55) / 0.35) * clamp01((1.62 - phase) / 0.3);
  const rowOpacity = clamp01((phase - 1.45) / 0.35);
  const heroOpacity = clamp01((0.55 - phase) / 0.35);

  return (
    <div
      className="relative w-full"
      style={{
        background: PAPER,
        color: INK,
        // 340vh of scroll = three states with room to read between them.
        height: "340vh",
      }}
    >
      {/* ── FIXED STAGE — the record itself ──────────────────────────── */}
      <div
        ref={stageRef}
        className="pointer-events-none fixed inset-0 z-0 overflow-hidden"
      >
        <PaperGrain />
        <RecordCanvas
          stance={stance}
          phaseRef={phaseRef}
          reduced={reduced}
          onFeature={onFeature}
        />

        {/* capability column labels — pinned to the same geometry the
            canvas stacks the marks with */}
        <div style={{ opacity: colOpacity }}>
          {record.capabilities.map((cap, i) => {
            // same left edge the canvas stacks the column against
            const x = columnX(i, box) - columnWidth(box) * 0.32;
            const y = columnBaseline(box) + 18;
            return (
              <div
                key={cap.id}
                className="absolute"
                style={{
                  left: x,
                  top: y,
                  transform: compact ? "rotate(-58deg)" : "none",
                  transformOrigin: "top left",
                  transition: "opacity 300ms linear",
                }}
              >
                <div
                  className="whitespace-nowrap text-[10px] uppercase"
                  style={{
                    fontFamily: "var(--font-mono), monospace",
                    letterSpacing: "0.2em",
                    color: cap.state === "confirmed" ? SIGNAL : INK_SOFT,
                  }}
                >
                  {cap.label}
                </div>
              </div>
            );
          })}
        </div>

        {/* living-profile rows */}
        <div style={{ opacity: rowOpacity }}>
          {record.capabilities.map((cap, i) => {
            const y = rowY(i, box);
            const left = rowLeft(box);
            return (
              <div key={cap.id}>
                <div
                  className="absolute"
                  style={{
                    left: compact ? padX(box.w) : padX(box.w),
                    top: y,
                    transform: compact
                      ? "translate(0, -22px)"
                      : "translate(0, -50%)",
                  }}
                >
                  <span
                    className="text-[13px]"
                    style={{
                      fontFamily: "var(--font-serif-display), Georgia, serif",
                      fontSize: compact ? 15 : 19,
                      letterSpacing: "-0.01em",
                    }}
                  >
                    {cap.label}
                  </span>
                </div>
                <div
                  className="absolute"
                  style={{
                    left: left + (compact ? 0 : 0),
                    top: y,
                    transform: "translate(0,-50%)",
                  }}
                />
                {!compact && (
                  <div
                    className="absolute text-[9px] uppercase"
                    style={{
                      right: padX(box.w),
                      top: y,
                      transform: "translate(0,-50%)",
                      fontFamily: "var(--font-mono), monospace",
                      letterSpacing: "0.2em",
                      color: cap.state === "confirmed" ? SIGNAL : INK_SOFT,
                      opacity: cap.state === "confirmed" ? 1 : 0.62,
                    }}
                  >
                    {cap.state === "confirmed" ? "confirmed" : "recorded"}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* ── SCROLLING TYPE LAYER ─────────────────────────────────────── */}
      <div className="relative z-10">
        {/* — state 1 — */}
        <section className="relative flex h-screen flex-col justify-start px-[22px] pt-8 sm:px-14 sm:pt-10">
          <Kicker />
          <div
            className="mt-[5vh] flex flex-col gap-y-6 sm:mt-[6vh] lg:flex-row lg:items-end lg:gap-x-16"
            style={{ opacity: heroOpacity, transition: "opacity 200ms linear" }}
          >
            <h1
              className="max-w-[8.6em]"
              style={{
                fontFamily: "var(--font-serif-display), Georgia, serif",
                fontSize: "clamp(2.4rem, 5.1vw, 5.4rem)",
                lineHeight: 0.95,
                letterSpacing: "-0.026em",
                fontWeight: 400,
              }}
            >
              Your work{" "}
              <em style={{ fontStyle: "italic", color: SIGNAL }}>already</em>{" "}
              knows what you can do.
            </h1>
            <p
              className="max-w-[34ch] shrink text-[14px] leading-[1.6] sm:text-[15px] lg:pb-[0.55em]"
              style={{ color: INK_SOFT }}
            >
              Every real thing you do leaves a mark. The marks become evidence,
              the evidence becomes capability, and capability decides what
              becomes possible next.
            </p>
          </div>

          {/* the record caption — sits directly under the baseline rule */}
          <div
            className="pointer-events-none absolute left-[22px] right-[22px] sm:left-14 sm:right-14"
            style={{ top: "calc(72vh + 26px)", opacity: heroOpacity }}
          >
            <div className="flex flex-wrap items-baseline gap-x-7 gap-y-1">
              <span
                className="text-[9px] uppercase"
                style={{
                  fontFamily: "var(--font-mono), monospace",
                  letterSpacing: "0.24em",
                  color: INK_SOFT,
                }}
              >
                {record.spanLabel}
              </span>
              <span
                className="min-h-[1.4em] max-w-[60ch] text-[13px] italic sm:text-[15px]"
                style={{
                  fontFamily: "var(--font-serif-display), Georgia, serif",
                  color: INK,
                }}
              >
                {feature ? `“${feature}”` : record.opening}
              </span>
            </div>
          </div>

          {/* the interaction */}
          <div
            className="absolute left-[22px] right-[22px] sm:left-14 sm:right-14"
            style={{ top: "calc(72vh + 66px)", opacity: heroOpacity }}
          >
            <StanceChips value={stance} onChange={setStance} />
          </div>
        </section>

        {/* — state 2 — */}
        <section className="flex h-screen items-start justify-end px-[22px] pt-[14vh] sm:px-14">
          <TypeBlock
            opacity={colOpacity}
            eyebrow="02 — evidence becomes capability"
            title="Then it sorts itself."
            body="Nobody writes this profile. The same marks leave the calendar and gather under the capabilities they actually produced. One entry is a claim. Two years of them is a record."
          />
        </section>

        {/* — state 3 — */}
        <section className="flex h-screen items-start justify-end px-[22px] pt-[10vh] sm:px-14">
          <TypeBlock
            opacity={rowOpacity}
            eyebrow="03 — the market can read it"
            title="And it stops being a CV."
            body={record.outcome}
            note="Confirmed where someone else stood behind it. Recorded where it is still only yours to say. The difference is never quietly dropped."
          />
        </section>
      </div>

      <div className="pointer-events-none fixed bottom-0 left-0 right-0 z-40">
        <div className="pointer-events-auto">
          <LabSwitch locale={locale} tone="light" />
        </div>
      </div>
    </div>
  );
}

function Kicker() {
  return (
    <div
      className="flex items-center gap-4 text-[9px] uppercase"
      style={{
        fontFamily: "var(--font-mono), monospace",
        letterSpacing: "0.26em",
        color: INK_SOFT,
      }}
    >
      <span style={{ color: INK }}>labourmarket.ai</span>
      <span aria-hidden>·</span>
      <span>living labour market</span>
      <span aria-hidden className="hidden sm:inline">
        ·
      </span>
      <span className="hidden sm:inline">concept a — the record</span>
    </div>
  );
}

function TypeBlock({
  opacity,
  eyebrow,
  title,
  body,
  note,
}: {
  readonly opacity: number;
  readonly eyebrow: string;
  readonly title: string;
  readonly body: string;
  readonly note?: string;
}) {
  return (
    <div
      className="max-w-[34ch]"
      style={{
        opacity,
        transform: `translateY(${(1 - opacity) * 14}px)`,
        transition: "opacity 260ms linear, transform 260ms linear",
      }}
    >
      <div
        className="text-[9px] uppercase"
        style={{
          fontFamily: "var(--font-mono), monospace",
          letterSpacing: "0.24em",
          color: SIGNAL,
        }}
      >
        {eyebrow}
      </div>
      <h2
        className="mt-4"
        style={{
          fontFamily: "var(--font-serif-display), Georgia, serif",
          fontSize: "clamp(2rem, 3.6vw, 3.4rem)",
          lineHeight: 1.02,
          letterSpacing: "-0.024em",
          fontWeight: 400,
        }}
      >
        {title}
      </h2>
      <p
        className="mt-4 text-[15px] leading-[1.6]"
        style={{ color: INK_SOFT }}
      >
        {body}
      </p>
      {note ? (
        <p
          className="mt-5 border-t pt-4 text-[12px] leading-[1.6]"
          style={{ color: INK_SOFT, borderColor: "rgba(22,19,15,0.14)" }}
        >
          {note}
        </p>
      ) : null}
    </div>
  );
}

function StanceChips({
  value,
  onChange,
}: {
  readonly value: Stance;
  readonly onChange: (s: Stance) => void;
}) {
  const record = useMemo(
    () => Object.fromEntries(STANCES.map((s) => [s, buildRecord(s).chip])),
    [],
  ) as Record<Stance, string>;
  return (
    <div className="pointer-events-auto">
      <div
        className="mb-3 text-[9px] uppercase"
        style={{
          fontFamily: "var(--font-mono), monospace",
          letterSpacing: "0.24em",
          color: INK_SOFT,
        }}
      >
        whose record
      </div>
      <div className="flex flex-wrap gap-2">
        {STANCES.map((s) => {
          const active = s === value;
          return (
            <button
              key={s}
              type="button"
              onClick={() => onChange(s)}
              className="rounded-full px-4 py-2 text-[12px] transition-all duration-300"
              style={{
                border: `1px solid ${active ? INK : "rgba(22,19,15,0.22)"}`,
                background: active ? INK : "transparent",
                color: active ? PAPER : INK,
                fontFamily: "var(--font-sans), system-ui, sans-serif",
                letterSpacing: "-0.005em",
              }}
            >
              {record[s]}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** Paper tooth. A flat #EDE9E1 fill reads as a screen; a very fine grain
 *  reads as stock. Rendered once to a tiled canvas, not per frame. */
function PaperGrain() {
  const ref = useRef<HTMLCanvasElement | null>(null);
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    const S = 180;
    c.width = S;
    c.height = S;
    const img = ctx.createImageData(S, S);
    for (let i = 0; i < S * S; i += 1) {
      const v = 128 + (Math.random() - 0.5) * 46;
      img.data[i * 4] = v;
      img.data[i * 4 + 1] = v;
      img.data[i * 4 + 2] = v;
      img.data[i * 4 + 3] = 16;
    }
    ctx.putImageData(img, 0, 0);
    const url = c.toDataURL();
    const host = c.parentElement;
    if (host) host.style.backgroundImage = `url(${url})`;
  }, []);
  return (
    <div
      className="absolute inset-0"
      style={{
        backgroundRepeat: "repeat",
        // a barely-there vertical fall so the paper is not one flat value
        boxShadow: "inset 0 -220px 220px -220px rgba(22,19,15,0.10)",
      }}
    >
      <canvas ref={ref} className="hidden" />
    </div>
  );
}
