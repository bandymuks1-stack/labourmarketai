import { notFound } from "next/navigation";

/**
 * Unknown-route catch-all. Without it, an unmatched path renders Next's
 * default 404 OUTSIDE the [locale] layout — no font vars, no colour tokens
 * (the bare-serif page real users would see). Routing it through notFound()
 * renders the branded, localized sibling not-found.tsx instead. Real routes
 * always win: Next matches static and dynamic segments before a catch-all.
 */
export default function CatchAllNotFound(): never {
  notFound();
}
