// Motion tokens (TASK 06). Single source of timing/easing for the "living
// arena" feel. Values resolve to the CSS variables defined in app/globals.css
// so motion is theme/perf-tunable in ONE place and components never hard-code a
// duration or curve. Tailwind exposes them as `duration-*` / `ease-*` classes;
// the named animation utilities (.verified-pop, .rise-in, .live-dot …) live in
// globals.css and all honour `prefers-reduced-motion`.
export const motion = {
  duration: {
    instant: "var(--motion-instant)", // 90ms  — press/tap feedback
    fast: "var(--motion-fast)", // 160ms — hover, small state changes
    base: "var(--motion-base)", // 240ms — entrances, panels
    slow: "var(--motion-slow)", // 420ms — the "scored" moment
  },
  easing: {
    out: "var(--motion-ease-out)", // decelerate — most UI
    spring: "var(--motion-ease-spring)", // overshoot — celebratory/earned
  },
} as const;
