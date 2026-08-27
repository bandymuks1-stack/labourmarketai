/**
 * ROUND 2 — the phone's reading ground.
 *
 * On a wide screen the type sits beside the world and both are legible. On a
 * phone they occupy the same rectangle, and a scene bright enough to be worth
 * looking at is bright enough to destroy body copy. Rather than dim the whole
 * concept for everyone, narrow viewports get a ground under the words — the
 * 3D subject keeps the top of the screen, the type keeps the bottom.
 */
export function MobileScrim({ tone }: { readonly tone: string }) {
  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-0 z-[6] lg:hidden"
      style={{
        background: `linear-gradient(to bottom, ${tone}00 0%, ${tone}00 26%, ${tone}cc 46%, ${tone}f5 68%)`,
      }}
    />
  );
}
