import { getTranslations } from "next-intl/server";
import { Link } from "@/lib/i18n/navigation";
import { LocaleSwitcher } from "@/components/marketing/locale-switcher";

/** Decorative live-market activity map (brief §10.4): glowing dot grid.
 *  NOT placeholder data — purely ornamental, deterministic coordinates. */
function ActivityMap() {
  const cols = 24;
  const rows = 6;
  const dots = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const seed = (r * 7 + c * 13) % 11;
      const lit = seed === 0 || seed === 5;
      dots.push(
        <circle
          key={`${r}-${c}`}
          cx={c * 20 + 10}
          cy={r * 20 + 10}
          r={lit ? 2.4 : 1.4}
          fill="currentColor"
          fillOpacity={lit ? 0.85 : 0.18}
          filter={lit ? "url(#fdot)" : undefined}
        />,
      );
    }
  }
  return (
    <svg
      data-decor
      aria-hidden
      viewBox={`0 0 ${cols * 20} ${rows * 20}`}
      preserveAspectRatio="none"
      className="h-20 w-full text-brand-blue"
    >
      <defs>
        <filter id="fdot">
          <feGaussianBlur stdDeviation="1.6" result="b" />
          <feMerge>
            <feMergeNode in="b" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
      {dots}
    </svg>
  );
}

export async function SiteFooter() {
  const t = await getTranslations("footer");
  const nav = await getTranslations("nav");
  const legal = await getTranslations("legal");

  return (
    <footer className="relative z-10 mt-24 border-t border-ink-600/60">
      <div className="mx-auto max-w-container px-6 sm:px-12">
        <div className="py-8 opacity-70">
          <p className="mb-3 font-mono text-[11px] uppercase tracking-label text-text-muted">
            {t("activity")}
          </p>
          <ActivityMap />
        </div>

        <div className="grid gap-10 border-t border-ink-600/60 py-12 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <p className="font-display text-base font-bold text-text-primary">
              labourmarket<span className="text-gradient-accent">.ai</span>
            </p>
            <p className="mt-3 max-w-xs text-sm text-text-secondary">
              {t("tagline")}
            </p>
          </div>

          <div className="flex flex-col gap-3">
            <p className="font-mono text-[11px] uppercase tracking-label text-text-muted">
              {t("product")}
            </p>
            <Link href="/" className="text-sm text-text-secondary hover:text-text-primary">
              {nav("platform")}
            </Link>
            <Link href="/pricing" className="text-sm text-text-secondary hover:text-text-primary">
              {nav("pricing")}
            </Link>
            <Link href="/for-workers" className="text-sm text-text-secondary hover:text-text-primary">
              {nav("resources")}
            </Link>
          </div>

          <div className="flex flex-col gap-3">
            <p className="font-mono text-[11px] uppercase tracking-label text-text-muted">
              {t("legalGroup")}
            </p>
            <Link href="/legal/terms" className="text-sm text-text-secondary hover:text-text-primary">
              {legal("terms.title")}
            </Link>
            <Link href="/legal/privacy" className="text-sm text-text-secondary hover:text-text-primary">
              {legal("privacy.title")}
            </Link>
            <Link href="/legal/cookies" className="text-sm text-text-secondary hover:text-text-primary">
              {legal("cookies.title")}
            </Link>
          </div>

          <div className="flex flex-col gap-3">
            <p className="font-mono text-[11px] uppercase tracking-label text-text-muted">
              {t("company")}
            </p>
            <Link href="/for-companies" className="text-sm text-text-secondary hover:text-text-primary">
              {nav("solutions")}
            </Link>
            <Link href="/for-agencies" className="text-sm text-text-secondary hover:text-text-primary">
              {nav("company")}
            </Link>
            <LocaleSwitcher className="mt-2" />
          </div>
        </div>

        <div className="flex flex-col gap-2 border-t border-ink-600/60 py-6 text-xs text-text-muted sm:flex-row sm:items-center sm:justify-between">
          <span>
            © {new Date().getFullYear()} labourmarket.ai — {t("rights")}
          </span>
          <span className="font-mono uppercase tracking-label">
            {t("preview")}
          </span>
        </div>
      </div>
    </footer>
  );
}
