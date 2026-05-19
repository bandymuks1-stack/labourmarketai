import { getTranslations } from "next-intl/server";
import { Link } from "@/lib/i18n/navigation";

export default async function NotFound() {
  const t = await getTranslations("common");
  return (
    <main className="mx-auto flex min-h-screen max-w-[1440px] flex-col items-center justify-center gap-6 px-6 text-center">
      <p className="font-mono text-xs uppercase tracking-[0.18em] text-[#5C6480]">
        404
      </p>
      <h1 className="font-display text-4xl font-bold">{t("notFound")}</h1>
      <Link
        href="/"
        className="rounded-[14px] border border-[#252A3D] px-6 py-3 text-sm font-semibold"
      >
        {t("backHome")}
      </Link>
    </main>
  );
}
