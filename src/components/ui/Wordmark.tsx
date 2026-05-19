import Link from "next/link";
import { site } from "@/config/site";

export function Wordmark({ href = "/" }: { href?: string }) {
  return (
    <Link
      href={href}
      className="group inline-flex items-center gap-2.5 text-fg"
    >
      <span className="grad-cv relative grid h-8 w-8 place-items-center rounded-lg text-sm font-black text-ink">
        lm
        <span className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-emerald shadow-[0_0_10px_2px_rgba(77,255,176,0.7)]" />
      </span>
      <span className="text-[1.05rem] font-semibold tracking-tight">
        {site.wordmark}
        <span className="text-cyan">{site.domainTld}</span>
      </span>
    </Link>
  );
}
