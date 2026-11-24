/** Fixed page-level radial ambient glow (brief §8.6). Token gradient. */
export function AmbientGlow() {
  return (
    <div
      data-decor
      aria-hidden
      className="pointer-events-none fixed inset-0 -z-20 bg-page-ambient"
    />
  );
}
