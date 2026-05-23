import { getTranslations } from "next-intl/server";
import { Link } from "@/lib/i18n/navigation";
import { Button } from "@/components/ui/Button";
import { LocaleSwitcher } from "@/components/marketing/locale-switcher";
import { isVisionPublic } from "@/lib/config/vision-publication";

// `/vision` is gated by `lib/config/vision-publication.ts`. While the
// flag is `false`, the route stays reachable by direct URL (so the
// owner can run the production smoke against it) but is NOT surfaced
// in the public site nav. The flip to `true` is a one-line
// owner-authored PR after smoke PASSES.
type LinkVisibility = "always" | "vision-gate";
type NavLink = {
  key: "platform" | "vision" | "solutions" | "resources" | "pricing" | "company";
  href: string;
  visibility: LinkVisibility;
};

const ALL_LINKS: readonly NavLink[] = [
  { key: "platform", href: "/", visibility: "always" },
  { key: "vision", href: "/vision", visibility: "vision-gate" },
  { key: "solutions", href: "/for-companies", visibility: "always" },
  { key: "resources", href: "/for-workers", visibility: "always" },
  { key: "pricing", href: "/pricing", visibility: "always" },
  { key: "company", href: "/for-agencies", visibility: "always" },
];

function visibleLinks(): readonly NavLink[] {
  return ALL_LINKS.filter((l) =>
    l.visibility === "always" ? true : isVisionPublic(),
  );
}

export async function SiteNav() {
  const t = await getTranslations("nav");
  const links = visibleLinks();

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
          {links.map((l) => (
            <Link
              key={l.key}
              href={l.href}
              className="text-sm text-text-secondary transition-colors hover:text-text-primary"
            >
              {t(l.key)}
            </Link>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-3 sm:gap-4">
          <Link
            href="/auth/login"
            className="text-sm text-text-secondary transition-colors hover:text-text-primary"
          >
            {t("login")}
          </Link>
          <Link href="/auth/signup">
            <Button size="sm">{t("startNow")}</Button>
          </Link>
          <LocaleSwitcher className="hidden sm:flex" />
        </div>
      </div>
    </header>
  );
}
