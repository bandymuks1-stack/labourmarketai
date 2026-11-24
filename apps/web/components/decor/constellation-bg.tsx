/**
 * Constellation overlay (brief §8.6): SVG network of dots + connecting lines,
 * slow opacity animation, pointer-events none, hidden on mobile. Deterministic
 * coordinates (no randomness) so SSR output is stable.
 */
const NODES: ReadonlyArray<readonly [number, number]> = [
  [60, 80],
  [180, 140],
  [120, 300],
  [300, 70],
  [340, 240],
  [470, 150],
  [520, 330],
  [620, 90],
  [700, 260],
  [760, 120],
  [420, 400],
  [240, 440],
];

const EDGES: ReadonlyArray<readonly [number, number]> = [
  [0, 1],
  [1, 2],
  [1, 3],
  [3, 4],
  [4, 5],
  [5, 6],
  [5, 7],
  [7, 9],
  [6, 8],
  [8, 9],
  [4, 10],
  [2, 11],
  [10, 11],
];

export function ConstellationBg() {
  return (
    <svg
      data-decor
      aria-hidden
      viewBox="0 0 800 500"
      preserveAspectRatio="xMidYMid slice"
      className="pointer-events-none absolute inset-0 -z-10 hidden h-full w-full text-brand-blue md:block"
      style={{ animation: "constellation-fade 9s ease-in-out infinite" }}
    >
      <g stroke="currentColor" strokeOpacity="0.18" strokeWidth="1">
        {EDGES.map(([a, b], i) => (
          <line
            key={`e${i}`}
            x1={NODES[a][0]}
            y1={NODES[a][1]}
            x2={NODES[b][0]}
            y2={NODES[b][1]}
          />
        ))}
      </g>
      <g fill="currentColor">
        {NODES.map(([x, y], i) => (
          <circle key={`n${i}`} cx={x} cy={y} r={i % 3 === 0 ? 2.6 : 1.8} />
        ))}
      </g>
    </svg>
  );
}
