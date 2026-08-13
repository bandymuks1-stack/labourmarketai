import {
  activeLocales,
  defaultLocale,
  type ActiveLocale,
} from "@/lib/i18n/config";
import type { InvitationType } from "@/lib/invitations/model";

/**
 * Invitation email content (V8 W4-B item 6) — RECIPIENT-oriented language.
 *
 * The subject/body used to be hardcoded LT/EN ternaries keyed on the
 * SENDER'S UI locale: a Lithuanian manager inviting a Russian-speaking
 * worker produced a Lithuanian email with a Lithuanian invite link. The
 * strings now live in the i18n catalogs (`invitations.email.*`, 5 routed
 * locales) and the language is the RECIPIENT language the inviter picks on
 * the form — validated server-side against the active-locale list, falling
 * back to the sender's locale, then the default.
 *
 * The builders take an injected translator so the SAME functions run under
 * `getTranslations({ locale, namespace: "invitations.email" })` in the
 * server action (the repo's server-side catalog precedent — see
 * lib/conversation/agenda-summary.ts) and under `createTranslator` with the
 * real JSON catalogs in unit tests.
 */

/** The minimal translator surface the builders need. */
export type InvitationEmailTranslator = (
  key: string,
  values?: Record<string, string | number>,
) => string;

/** Server-side validation: an unknown/inactive requested locale can never
 *  pick a language — the sender's locale, then the default, backs it up. */
export function resolveRecipientLocale(
  requested: string | null | undefined,
  senderLocale: string,
): ActiveLocale {
  if (
    typeof requested === "string" &&
    (activeLocales as readonly string[]).includes(requested)
  ) {
    return requested as ActiveLocale;
  }
  if ((activeLocales as readonly string[]).includes(senderLocale)) {
    return senderLocale as ActiveLocale;
  }
  return defaultLocale;
}

/** Four subject variants cover the seven types — the same grouping the old
 *  hardcoded switch encoded. */
const SUBJECT_VARIANT: Record<
  InvitationType,
  "project" | "collaborate" | "platform" | "team"
> = {
  join_project: "project",
  collaborate_partner: "collaborate",
  join_platform: "platform",
  invite_company: "platform",
  join_organization: "team",
  join_team: "team",
  join_as_employee: "team",
};

export function buildInvitationSubject(
  t: InvitationEmailTranslator,
  type: InvitationType,
): string {
  return t(`subject.${SUBJECT_VARIANT[type] ?? "team"}`);
}

export function buildInvitationBody(
  t: InvitationEmailTranslator,
  input: { link: string; personalMessage: string | null },
): string {
  const lines = [t("intro")];
  if (input.personalMessage?.trim()) {
    lines.push("", `"${input.personalMessage.trim()}"`);
  }
  lines.push("", t("open"), input.link, "", t("validity"));
  return lines.join("\n");
}
