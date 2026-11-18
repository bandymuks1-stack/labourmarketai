import { getTranslations } from "next-intl/server";

import { Link } from "@/lib/i18n/navigation";
import { buttonLinkClassName } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { cn } from "@/lib/utils";

/**
 * THE MESSAGE IN SECONDS (owner positioning 2026-10-21): right under the
 * promise, the three things a person does here — show what they can do, offer
 * what they have, find what they need — and what can be found. A visitor
 * understands the product before any control asks anything.
 *
 * Honest doors only: "show" opens a profile (signup), "offer" opens the
 * services a person publishes (signup → /dashboard/services), "find" goes to
 * the sentence entry right below, which routes a need written in the person's
 * own words. The five discovery words are a statement of scope, not links: a
 * public discovery page for every kind does not exist yet, so none is implied.
 */
const WAYS = [
  { key: "show", href: "/auth/signup", variant: "secondary" as const },
  {
    key: "offer",
    href: `/auth/signup?next=${encodeURIComponent("/dashboard/services")}`,
    variant: "secondary" as const,
  },
  { key: "find", href: "#find", variant: "secondary" as const },
] as const;

const DISCOVER = ["workers", "jobs", "contractors", "services", "goods"] as const;

/**
 * `placement`: with the photographed living worker hero, a phone shows the
 * promise ABOVE the 78svh photograph and a wide screen lays the promise over
 * it. So the three ways render twice, each for exactly one width: inside the
 * promise on a phone (before the photograph — the message stays on the first
 * screen), and under the hero on a wide screen. "all" is the single render of
 * the hero without photographs.
 */
export async function LandingThreeWays({ placement = "all" }: { placement?: "all" | "phone" | "wide" }) {
  const t = await getTranslations("landing.ways");
  const visibility = placement === "phone" ? "md:hidden" : placement === "wide" ? "hidden md:block" : "";
  const titleId = `three-ways-title-${placement}`;
  return (
    <section
      className={cn(placement === "phone" ? "mt-6" : "mt-8", visibility)}
      aria-labelledby={titleId}
      data-testid={placement === "all" ? "landing-three-ways" : `landing-three-ways-${placement}`}
    >
      <h2 id={titleId} className="sr-only">
        {t("title")}
      </h2>
      <div className="grid gap-3 md:grid-cols-3">
        {WAYS.map(({ key, href, variant }) => (
          <Card key={key} className="wow-card flex flex-col gap-3 p-5" data-testid={`three-ways-${key}`}>
            <h3 className="font-display text-xl font-bold tracking-tightest text-text-primary">
              {t(`${key}.title`)}
            </h3>
            <p className="text-sm leading-relaxed text-text-secondary">{t(`${key}.body`)}</p>
            <div className="mt-auto pt-1">
              {href.startsWith("#") ? (
                <a
                  href={href}
                  className={cn(buttonLinkClassName(variant), "w-full rounded-xl")}
                  data-testid={`three-ways-${key}-cta`}
                >
                  {t(`${key}.cta`)} →
                </a>
              ) : (
                <Link
                  href={href as "/auth/signup"}
                  className={cn(buttonLinkClassName(variant), "w-full rounded-xl")}
                  data-testid={`three-ways-${key}-cta`}
                >
                  {t(`${key}.cta`)} →
                </Link>
              )}
            </div>
          </Card>
        ))}
      </div>
      <p className="mt-5 flex flex-wrap items-center gap-2 text-sm text-text-secondary" data-testid="three-ways-discover">
        <span className="font-mono text-meta uppercase tracking-label text-text-muted">{t("discoverLead")}</span>
        {DISCOVER.map((k) => (
          <span key={k} className="rounded-full border border-ink-600 px-3 py-1 text-text-primary">
            {t(`discover.${k}`)}
          </span>
        ))}
      </p>
      <p className="mt-3 max-w-3xl text-sm leading-relaxed text-text-secondary" data-testid="three-ways-lasting">
        {t("lasting")}
      </p>
    </section>
  );
}
