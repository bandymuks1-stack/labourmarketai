import type { Metadata } from "next";
import type { ReactNode } from "react";

/** Private flow, like /auth: never indexable. robots.txt alone does not stop
 *  URL-only indexing from an inbound link, and the root layout says
 *  "index, follow". Metadata merges to every page below. */
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default function OauthLayout({ children }: { children: ReactNode }) {
  return children;
}
