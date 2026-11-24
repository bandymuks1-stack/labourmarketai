"use client";

import { useEffect, useState } from "react";

/**
 * False during SSR and the first client render, true after mount.
 *
 * Scroll/reduced-motion animations must render their FINAL (static) state
 * until this flips — otherwise `useReducedMotion()` (null on server, boolean
 * on client) makes the server and client markup disagree and React throws a
 * hydration mismatch. Gate the framer-motion `animate`/`transition` on this.
 */
export function useMounted(): boolean {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return mounted;
}
