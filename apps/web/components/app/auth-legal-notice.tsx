"use client";

import { useTranslations } from "next-intl";
import { Link } from "@/lib/i18n/navigation";

/** Pre-collection privacy & terms notice (GDPR Art. 13 first layer).
 *  Rendered before every account-creating action: above the Google button
 *  (signup AND login — the Google path creates accounts from login too)
 *  and above the email/password submit. Wording is acknowledgement only
 *  ("you confirm you have read"), never "I consent to the Privacy Policy" —
 *  a privacy policy is information, not a GDPR consent instrument. No
 *  marketing consent control exists here because the signup path has no
 *  marketing feature; the controller line states marketing needs separate
 *  opt-in consent. Links go through the locale-aware `Link`, which adds
 *  exactly one `/{locale}` prefix (no `/lt/lt/...`). */
export function AuthLegalNotice({
  variant,
}: {
  variant: "signup" | "googleLogin";
}) {
  const t = useTranslations("auth.legalNotice");
  const linkCls =
    "font-medium text-brand-blue underline underline-offset-2 hover:text-brand-cyan";
  return (
    <div
      data-testid="auth-legal-notice"
      className="text-xs leading-relaxed text-text-secondary"
    >
      <p>
        {t.rich(variant, {
          terms: (chunks) => (
            <Link href="/legal/terms" className={linkCls}>
              {chunks}
            </Link>
          ),
          privacy: (chunks) => (
            <Link href="/legal/privacy" className={linkCls}>
              {chunks}
            </Link>
          ),
        })}
      </p>
      <p className="mt-1 text-text-muted">{t("controller")}</p>
    </div>
  );
}
