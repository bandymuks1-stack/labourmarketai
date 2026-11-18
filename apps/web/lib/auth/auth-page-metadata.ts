import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

/**
 * Each auth page names itself in the browser tab (2026-10-08 walk): signup,
 * login and password pages all inherited the landing page's title, so a tab
 * or history entry could not tell "Create your account" from "Sign in". The
 * page's own visible headline is reused — no new copy. Robots stay noindex
 * from the auth layout.
 */
export type AuthPageKey = "signup" | "login" | "forgotPassword" | "resetPassword";

export async function authPageMetadata(
  params: Promise<{ locale: string }>,
  page: AuthPageKey,
): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: `auth.${page}` });
  return { title: `${t("headline")} — LabourMarket.ai` };
}
