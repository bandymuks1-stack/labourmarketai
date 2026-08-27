"use client";

import { useEffect, useRef } from "react";
import {
  buildRecord,
  type RecordSet,
  type Stance,
} from "./record-data";
import {
  columnBaseline,
  columnCount,
  columnWidth,
  columnX,
  padX,
  rowLeft,
  rowSpan,
  rowY,
  timelineBaseline,
} from "./record-geometry";

const INK = "22, 19, 15";
const SIGNAL = "163, 56, 22";

/** Fixed mark pool. The largest record is 470 marks; a stance with fewer
 *  simply parks the remainder at zero opacity, so a stance switch is a
 *  transition rather than a rebuild. */
const POOL = 480;

type Mark = {
  /** rendered state */
  cx: number;
  cy: number;
  len: number;
  thick: number;
  ang: number;
  alpha: number;
  /** target state */
  tcx: number;
  tcy: number;
  tlen: number;
  tthick: number;
  tang: number;
  talpha: number;
  /** identity */
  cap: number;
  confirmed: boolean;
  seq: number;
  hasLine: boolean;
};

function easeOutCubic(x: number) {
  return 1 - Math.pow(1 - x, 3);
}
function easeInOutCubic(x: number) {
  return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
}
function clamp01(x: number) {
  return x < 0 ? 0 : x > 1 ? 1 : x;
}
function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

export type RecordCanvasHandle = {
  readonly setStance: (s: Stance) => void;
};

export function RecordCanvas({
  stance,
  phaseRef,
  reduced,
  onFeature,
}: {
  readonly stance: Stance;
  /** 0 = chronological, 1 = capability columns, 2 = living profile */
  readonly phaseRef: { current: number };
  readonly reduced: boolean;
  readonly onFeature: (line: string | null) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const marksRef = useRef<Mark[]>([]);
  const recordRef = useRef<RecordSet>(buildRecord(stance));
  const pointerRef = useRef<{ x: number; active: boolean }>({
    x: -1,
    active: false,
  });
  const introRef = useRef(0);
  const featureRef = useRef<string | null>(null);
  const reducedRef = useRef(reduced);
  reducedRef.current = reduced;

  // Stance changes retarget the SAME marks — the record reorganises, it is
  // never torn down and re-poured.
  useEffect(() => {
    recordRef.current = buildRecord(stance);
  }, [stance]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d", { alpha: true });
    if (!ctx) return;

    // ── pool ────────────────────────────────────────────────────────────
    if (marksRef.current.length === 0) {
      marksRef.current = Array.from({ length: POOL }, (_, i) => ({
        cx: 0,
        cy: 0,
        len: 0,
        thick: 2,
        ang: -Math.PI / 2,
        alpha: 0,
        tcx: 0,
        tcy: 0,
        tlen: 0,
        tthick: 2,
        tang: -Math.PI / 2,
        talpha: 0,
        cap: 0,
        confirmed: false,
        seq: i,
        hasLine: false,
      }));
    }

    let w = 0;
    let h = 0;
    let dpr = 1;
    let raf = 0;
    let t0 = 0;

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = rect.width;
      h = rect.height;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    const onMove = (e: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      pointerRef.current = {
        x: e.clientX - rect.left,
        active:
          e.clientY - rect.top > 0 &&
          e.clientY - rect.top < rect.height &&
          e.pointerType !== "touch",
      };
    };
    const onLeave = () => {
      pointerRef.current = { x: -1, active: false };
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    window.addEventListener("pointerleave", onLeave);

    // ── target computation ──────────────────────────────────────────────
    const computeTargets = (phase: number) => {
      const rec = recordRef.current;
      const marks = marksRef.current;
      const box = { w, h };
      const p = padX(w);
      const inner = w - p * 2;
      const strokes = rec.strokes;
      const n = strokes.length;
      const compact = w < 760;

      // ONE primitive in all three states: a single recorded entry, drawn as
      // a short horizontal dash. The states differ only in HOW the entries
      // are grouped — by month, by capability, then into the profile rows.
      // That is the product chain, performed by the same objects.
      const dashH = compact ? 2.0 : 2.6;

      // column stacking cursors
      const colCursor = new Array(columnCount()).fill(0);
      const colCounts = new Array(columnCount()).fill(0);
      for (const s of strokes) colCounts[s.cap] += 1;
      const tallest = Math.max(...colCounts, 1);
      const stackGap = Math.max(
        0.6,
        Math.min(3.6, (h * 0.5) / tallest - dashH),
      );

      // month stacking
      const monthSlot = inner / rec.months;
      const monthGutter = Math.min(monthSlot * 0.3, 16);
      const slotInner = Math.max(monthSlot - monthGutter, 6);
      const monthGap = compact ? 1.3 : 2.3;

      // row cursors
      const rowCursor = new Array(columnCount()).fill(0);
      const rLeft = rowLeft(box);
      const rSpan = rowSpan(box);

      const tl = timelineBaseline(box);
      const cb = columnBaseline(box);

      for (let i = 0; i < POOL; i += 1) {
        const m = marks[i];
        if (i >= n) {
          m.talpha = 0;
          continue;
        }
        const s = strokes[i];
        m.cap = s.cap;
        m.confirmed = rec.capabilities[s.cap].state === "confirmed";
        m.hasLine = Boolean(s.line);

        // ── layout 0: one stack per month ──
        // A month is a stack of the entries it actually holds. Its height is
        // therefore volume and its silhouette is the shape of that month —
        // a quiet month is visibly short, not hidden by even spacing.
        const cx0 = p + s.month * monthSlot + monthSlot / 2;
        const cy0 = tl - s.inMonth * (dashH + monthGap) - dashH / 2 - 2;
        const len0 = slotInner * (0.4 + 0.6 * s.w);
        const a0 = 0;

        // ── layout 1: capability columns ──
        const colw = columnWidth(box);
        // left-aligned inside the column: a clean left edge, a ragged right
        // one. Centre-alignment made six soft blurs; this reads as six
        // deliberate columns of set text.
        const len1 = colw * (0.3 + 0.34 * s.w);
        const cx1 = columnX(s.cap, box) - colw * 0.32 + len1 / 2;
        const cy1 = cb - colCursor[s.cap] * (dashH + stackGap) - 6;
        colCursor[s.cap] += 1;

        // ── layout 2: living profile rows ──
        // The row is exactly as long as the evidence behind it. Padding every
        // row to full width would be the ordinary skill-bar lie; here the
        // capability with the thinnest record visibly has the shortest row.
        const idx = rowCursor[s.cap];
        rowCursor[s.cap] += 1;
        const share = colCounts[s.cap] / tallest;
        const usable = rSpan * share;
        const seg = usable / Math.max(colCounts[s.cap], 1);
        const cx2 = rLeft + idx * seg + seg / 2;
        const cy2 = rowY(s.cap, box);
        const len2 = seg * 1.02;

        // blend the two bracketing layouts, with a per-mark cascade so the
        // record reorganises like a hand of cards, not like one block
        const lo = Math.min(Math.floor(phase), 1);
        const raw = clamp01(phase - lo);
        const delay = (s.cap / columnCount()) * 0.22 + (i / n) * 0.16;
        const local = easeInOutCubic(clamp01((raw - delay) / (1 - 0.38)));

        const A =
          lo === 0
            ? { cx: cx0, cy: cy0, len: len0, ang: a0, th: dashH }
            : { cx: cx1, cy: cy1, len: len1, ang: 0, th: dashH };
        const B =
          lo === 0
            ? { cx: cx1, cy: cy1, len: len1, ang: 0, th: dashH }
            : { cx: cx2, cy: cy2, len: len2, ang: 0, th: compact ? 5 : 7 };

        m.tcx = lerp(A.cx, B.cx, local);
        m.tcy = lerp(A.cy, B.cy, local);
        m.tlen = lerp(A.len, B.len, local);
        m.tang = lerp(A.ang, B.ang, local);
        m.tthick = lerp(A.th, B.th, local);
        m.talpha = 1;
      }
    };

    // ── draw ────────────────────────────────────────────────────────────
    const draw = (now: number) => {
      if (!t0) t0 = now;
      const elapsed = (now - t0) / 1000;
      const phase = phaseRef.current;
      const red = reducedRef.current;

      introRef.current = red
        ? 1
        : clamp01(easeOutCubic(clamp01((elapsed - 0.25) / 2.4)));
      const intro = introRef.current;

      computeTargets(phase);

      ctx.clearRect(0, 0, w, h);
      const box = { w, h };
      const marks = marksRef.current;
      const rec = recordRef.current;
      const n = rec.strokes.length;

      // baseline rule + month ticks — present only while the record is
      // chronological. The ticks are what stop the marks reading as noise:
      // they say "this is time", before a single word does.
      const ruleAlpha = clamp01(1 - phase * 1.9) * intro;
      if (ruleAlpha > 0.01) {
        const p = padX(w);
        const base = timelineBaseline(box);
        const inner = w - p * 2;
        ctx.strokeStyle = `rgba(${INK}, ${ruleAlpha * 0.3})`;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(p, base + 0.5);
        ctx.lineTo(w - p, base + 0.5);
        ctx.stroke();

        const slot = inner / rec.months;
        const every = w < 760 ? 6 : 3;
        ctx.strokeStyle = `rgba(${INK}, ${ruleAlpha * 0.34})`;
        ctx.beginPath();
        for (let m = 0; m <= rec.months; m += 1) {
          if (m % every !== 0) continue;
          const x = Math.round(p + m * slot) + 0.5;
          const long = m % (every * 2) === 0;
          ctx.moveTo(x, base + 1);
          ctx.lineTo(x, base + (long ? 11 : 6));
        }
        ctx.stroke();
      }

      // the reading head — a slow sweep that "reads" the record
      let headX = -1;
      if (phase < 0.35 && intro > 0.98) {
        const pt = pointerRef.current;
        if (pt.active && pt.x > 0) headX = pt.x;
        else if (!red) {
          const p = padX(w);
          const cycle = (elapsed * 0.055) % 1;
          headX = p + easeInOutCubic(cycle < 0.5 ? cycle * 2 : (1 - cycle) * 2) * (w - p * 2);
        }
      }

      // find the featured line nearest the head
      let bestLine: string | null = null;
      let bestDist = Infinity;
      let bestIdx = -1;

      const smooth = red ? 1 : 0.16;

      for (let i = 0; i < POOL; i += 1) {
        const m = marks[i];
        const visible = i < n && i / n <= intro + 0.0001;
        const wantAlpha = visible ? m.talpha : 0;

        m.cx += (m.tcx - m.cx) * smooth;
        m.cy += (m.tcy - m.cy) * smooth;
        m.len += (m.tlen - m.len) * smooth;
        m.thick += (m.tthick - m.thick) * smooth;
        m.ang += (m.tang - m.ang) * smooth;
        m.alpha += (wantAlpha - m.alpha) * (red ? 1 : 0.12);

        if (m.alpha < 0.01) continue;

        if (headX > 0 && m.hasLine) {
          const d = Math.abs(m.cx - headX);
          if (d < bestDist) {
            bestDist = d;
            bestIdx = i;
            bestLine = rec.strokes[i].line ?? null;
          }
        }

        // near-head marks lift and darken
        let lift = 0;
        let boost = 0;
        // the reading head lights a WHOLE MONTH, not a radius of loose marks
        if (headX > 0) {
          const slot = (w - padX(w) * 2) / rec.months;
          const d = Math.abs(m.cx - headX);
          if (d < slot * 0.55) {
            const k = 1 - d / (slot * 0.55);
            lift = k * 2.5;
            boost = k * 0.42;
          }
        }

        // Colour carries ONE meaning and only one: once the record has sorted
        // itself, a capability someone else stood behind turns to the signal
        // ink; a capability that is still only self-recorded stays graphite.
        // Nothing else on this surface is allowed to use the signal colour.
        const inkA = rec.strokes[i]?.ink ?? 0.7;
        const sorted = clamp01((phase - 0.62) / 0.42);
        const useSignal = m.confirmed && sorted > 0.02;
        const a = m.alpha * (0.3 + inkA * 0.66 + boost);

        ctx.save();
        ctx.translate(m.cx, m.cy - lift);
        ctx.rotate(m.ang);
        ctx.fillStyle = useSignal
          ? `rgba(${SIGNAL}, ${a * (1 - sorted * 0.12)})`
          : `rgba(${INK}, ${a})`;
        const L = Math.max(m.len, 1);
        const T = Math.max(m.thick, 1);
        ctx.beginPath();
        if (typeof ctx.roundRect === "function") {
          ctx.roundRect(-L / 2, -T / 2, L, T, T / 2);
        } else {
          ctx.rect(-L / 2, -T / 2, L, T);
        }
        ctx.fill();
        ctx.restore();
      }

      // vertical reading line
      if (headX > 0) {
        ctx.strokeStyle = `rgba(${INK}, 0.22)`;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(Math.round(headX) + 0.5, timelineBaseline(box) - h * 0.42);
        ctx.lineTo(Math.round(headX) + 0.5, timelineBaseline(box) + 16);
        ctx.stroke();
        if (bestIdx >= 0) {
          const m = marks[bestIdx];
          ctx.fillStyle = `rgba(${SIGNAL}, 0.9)`;
          ctx.beginPath();
          ctx.arc(m.cx, timelineBaseline(box) + 16, 2.6, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      if (bestLine !== featureRef.current) {
        featureRef.current = bestLine;
        onFeature(bestLine);
      }

      raf = requestAnimationFrame(draw);
    };

    raf = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerleave", onLeave);
    };
    // onFeature is stable (useCallback at the call site); phaseRef is a ref.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 h-full w-full"
      aria-hidden="true"
    />
  );
}
