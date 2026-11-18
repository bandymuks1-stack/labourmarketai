"use client";

import type { MouseEvent, ReactNode } from "react";

import { buttonLinkClassName } from "@/components/ui/Button";
import { companyNeedReturnPath } from "@/lib/staffing/company-need-prefill";

type Door = "signup" | "login";

/**
 * Sign up / sign in from the public need form, and come back to it (employer
 * path P0 2026-11-15). Signing in mid-form used to land on the dashboard and
 * the typed need was gone.
 *
 * Plain links to the auth pages (a full-page boundary, like `AuthCtaLink`),
 * each with `next` = this form. Without JavaScript that is all they carry. With
 * it, the click adds what the person has typed so far, as the form's own
 * prefill (`companyNeedReturnPath`: no name, e-mail or phone).
 */
export function CompanyNeedAuthLinks({
  locale,
  signup,
  login,
}: {
  locale: string;
  signup: ReactNode;
  login: ReactNode;
}) {
  const href = (door: Door, next: string) =>
    `/${locale}/auth/${door}?next=${encodeURIComponent(next)}`;

  // The link itself is updated before the browser follows it, so a click that
  // opens a new tab carries the same answers.
  const carry = (door: Door) => (event: MouseEvent<HTMLAnchorElement>) => {
    const form = document.querySelector<HTMLFormElement>('form[data-testid="company-need-form"]');
    if (!form) return;
    const data = new FormData(form);
    const read = (name: string) => {
      const value = data.get(name);
      return typeof value === "string" ? value : "";
    };
    event.currentTarget.href = href(door, companyNeedReturnPath(locale, read, window.location.search));
  };

  const plain = `/${locale}/company-need`;
  return (
    <div className="flex flex-col gap-2 sm:flex-row">
      <a
        href={href("signup", plain)}
        onClick={carry("signup")}
        onAuxClick={carry("signup")}
        className={buttonLinkClassName()}
        data-testid="need-bridge-signup"
      >
        {signup} →
      </a>
      <a
        href={href("login", plain)}
        onClick={carry("login")}
        onAuxClick={carry("login")}
        className={buttonLinkClassName("secondary")}
        data-testid="need-bridge-login"
      >
        {login}
      </a>
    </div>
  );
}
