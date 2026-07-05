import Image from "next/image";
import { getLocale } from "next-intl/server";
import { getPlaceholder } from "@/content/placeholders";
import { showPlaceholderMarkers } from "@/lib/env";
import { cn } from "@/lib/utils";

/**
 * Renders a registered placeholder. Components must use this — never inline a
 * fake value. `showPlaceholderMarkers` controls the louder dotted outline +
 * corner chip — forced ON in production builds (§18, PR15); the env opt-out
 * exists only for dev/test visual tinkering.
 *
 * Always-on Sample affordance (platform doctrine §7 — "no unlabeled fake
 * data"): in production, a fabricated value (status !== 'replaced') still
 * carries a subtle visible `sample` marker so a real user never mistakes it
 * for a real platform figure. Once a value is promoted to real data
 * (`pnpm placeholders:promote` → status 'replaced'), it renders cleanly.
 */
export async function Placeholder({
  id,
  className,
}: {
  id: string;
  className?: string;
}) {
  const entry = getPlaceholder(id);
  const locale = await getLocale();
  const showMarker = showPlaceholderMarkers;

  const value = entry.value;
  let content: React.ReactNode;

  if (value && typeof value === "object" && "src" in value) {
    content = (
      <Image
        src={value.src}
        alt={value.alt}
        width={120}
        height={40}
        className="h-10 w-auto opacity-50"
      />
    );
  } else if (value && typeof value === "object" && "lt" in value) {
    content = locale === "lt" ? value.lt : value.en;
  } else {
    content = String(value);
  }

  // Real (promoted) data renders clean; fabricated values keep a visible
  // affordance even in production so nothing fake is shown unlabeled.
  const isReplaced = entry.status === "replaced";

  if (!showMarker) {
    if (isReplaced) {
      return <span className={className}>{content}</span>;
    }
    return (
      <span
        data-sample={entry.id}
        title={`Sample data · ${entry.id} — not a real platform figure yet`}
        className={className}
      >
        {content}
        <sup className="ml-0.5 select-none font-mono text-[10px] uppercase tracking-label text-text-muted">
          sample
        </sup>
      </span>
    );
  }

  return (
    <span
      data-placeholder={entry.id}
      title={`PLACEHOLDER · ${entry.id} — ${entry.description}`}
      className={cn(
        "relative inline-block rounded-sm outline-dashed outline-1 outline-offset-2 outline-brand-blue/40",
        className,
      )}
    >
      <span
        aria-hidden
        className="pointer-events-none absolute -right-1 -top-3 select-none rounded-sm border border-brand-blue/40 bg-ink-800 px-1 font-mono text-[10px] uppercase tracking-label text-brand-blue"
      >
        Placeholder
      </span>
      {content}
    </span>
  );
}
