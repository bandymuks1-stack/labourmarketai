import { getTranslations } from "next-intl/server";
import { Link } from "@/lib/i18n/navigation";
import { LeadCapture } from "@/components/marketing/lead-capture";
import { LocaleSwitcher } from "@/components/marketing/locale-switcher";

const LINKS = [
  { key: "platform", href: "/" },
  { key: "solutions", href: "/for-companies" },
  { key: "resources", href: "/for-workers" },
  { key: "pricing", href: "/pricing" },
  { key: "company", href: "/for-agencies" },
] as const;

export async function SiteNav() {
  const t = await getTranslations("nav");

  return (
    <header className="relative z-20 border-b border-ink-600/60">
      <div className="mx-auto flex max-w-container items-center gap-6 px-6 py-4 sm:px-12">
        <Link
          href="/"
          className="font-display text-lg font-bold tracking-tightest text-text-primary"
        >
          labourmarket<span className="text-gradient-accent">.ai</span>
        </Link>

        <nav className="hidden items-center gap-6 lg:flex">
          {LINKS.map((l) => (
            <Link
              key={l.key}
              href={l.href}
              className="text-sm text-text-secondary transition-colors hover:text-text-primary"
            >
              {t(l.key)}
            </Link>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-4">
          {/* 5b.5: the live-system pill was removed here — DemoChip on the
              hero is now the single honesty indicator (per PV §10). */}
          <LocaleSwitcher className="hidden sm:flex" />
          <LeadCapture source="nav_demo" />
        </div>
      </div>
    </header>
  );
}
