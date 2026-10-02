import Image from "next/image";

import { TrackedCta } from "@/components/app/tracked-cta";
import { buttonLinkClassName } from "@/components/ui/Button";
import { cn } from "@/lib/utils";

import { PUBLIC_IMAGERY, type PublicImageKey } from "./public-imagery";
import { StateMark } from "./state-mark";

type Cta = { readonly label: string; readonly href: string; readonly id: string };

/**
 * The public acquisition hero — one component for /for-workers and
 * /for-companies (the homepage keeps its own living hero).
 *
 * Composition: a large human photograph carries the first impression, a
 * second profession sits beside it so the brand is not one trade, the promise
 * is plain sentence-case type, and there is ONE primary action. On a phone the
 * photograph comes first and is height-capped so headline + action are on the
 * first screen. The photograph is a labelled sample fixture (see
 * public-imagery.ts); with no photograph the type + action stand alone.
 */
export function PublicHero({
  title,
  accent,
  sub,
  note,
  primary,
  secondary,
  audience,
  main,
  aside,
  copy,
  floating,
}: {
  title: string;
  accent: string;
  sub: string;
  note: string;
  primary: Cta;
  secondary: Cta;
  audience: "workers" | "companies";
  main: PublicImageKey;
  aside: PublicImageKey;
  copy: {
    sample: string;
    mainAlt: string;
    mainCaption: string;
    asideAlt: string;
  };
  /** Optional product chip floating on the photograph (companies). */
  floating?: { readonly text: string; readonly state: "waiting" };
}) {
  const m = PUBLIC_IMAGERY[main];
  const a = PUBLIC_IMAGERY[aside];
  return (
    <section
      className="relative mx-auto max-w-container px-6 pb-14 pt-4 sm:px-12 lg:pb-24 lg:pt-14"
      data-testid={`public-hero-${audience}`}
    >
      <div className="grid gap-7 lg:grid-cols-[1.02fr_1fr] lg:items-center lg:gap-16">
        <div className="order-2 lg:order-1">
          <h1 className="font-display text-[2.15rem] font-bold leading-[1.04] tracking-tightest text-text-primary sm:text-6xl lg:text-[4.4rem]">
            {title}{" "}
            <span className="block text-gradient-accent">{accent}</span>
          </h1>
          <p className="mt-5 max-w-xl text-base leading-relaxed text-text-secondary sm:text-xl">{sub}</p>
          <div className="mt-6 flex flex-wrap items-center gap-x-6 gap-y-3 sm:mt-7">
            <TrackedCta
              href={primary.href}
              ctaId={primary.id}
              audience={audience}
              className={buttonLinkClassName("primary")}
            >
              {primary.label} →
            </TrackedCta>
            <TrackedCta
              href={secondary.href}
              ctaId={secondary.id}
              audience={audience}
              className="inline-flex min-h-11 items-center text-support font-medium text-text-secondary underline-offset-4 hover:text-text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue"
            >
              {secondary.label}
            </TrackedCta>
          </div>
          <p className="mt-4 text-support text-text-muted">{note}</p>
        </div>

        <div className="order-1 lg:order-2">
          <div className="relative">
            <div className="relative aspect-[16/9] overflow-hidden rounded-3xl bg-ink-800 sm:aspect-[5/4] lg:aspect-[4/5]">
              <Image
                src={m.src}
                alt={copy.mainAlt}
                width={m.width}
                height={m.height}
                priority
                fetchPriority="high"
                sizes="(min-width:1024px) 520px, 100vw"
                style={{ objectPosition: `${m.focusX}% 40%` }}
                className="h-full w-full object-cover"
              />
              <div
                aria-hidden
                className="absolute inset-0 bg-gradient-to-t from-ink-900/70 via-transparent to-transparent"
              />
              <span className="absolute left-4 top-4 rounded-full bg-ink-900/70 px-3 py-1 text-basis text-text-secondary backdrop-blur">
                {copy.sample}
              </span>
              <p className="absolute bottom-4 left-5 text-support font-medium text-text-primary">
                {copy.mainCaption}
              </p>
            </div>
            <div
              className={cn(
                "absolute -bottom-6 right-4 hidden w-[34%] overflow-hidden rounded-2xl border-4 border-ink-900 bg-ink-800 shadow-xl sm:block lg:-left-8 lg:right-auto lg:w-[38%]",
              )}
            >
              <Image
                src={a.src}
                alt={copy.asideAlt}
                width={a.width}
                height={a.height}
                sizes="200px"
                className="aspect-square w-full object-cover"
              />
            </div>
            {floating ? (
              <div className="absolute right-6 top-6 hidden rounded-2xl bg-ink-800/95 px-4 py-3 shadow-xl backdrop-blur sm:block">
                <StateMark state={floating.state} label={floating.text} />
              </div>
            ) : null}
          </div>
          {floating ? (
            <div className="mt-3 inline-flex rounded-2xl bg-ink-800 px-4 py-2.5 sm:hidden">
              <StateMark state={floating.state} label={floating.text} />
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}
