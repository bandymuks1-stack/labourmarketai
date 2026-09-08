import "server-only";

/**
 * NOTIFICATION EMAIL RENDERER (completion v1) — the pure-ish half of the
 * notification email channel: one event → one subject/body pair.
 *
 * SAME COPY AS THE BELL, by construction: the subject is the exact
 * `auth.notifications.types.event_<type>` string the notification panel and
 * the activity page render, loaded from the SAME messages/<locale>.json
 * catalogue (§7: no second copy source, no hardcoded English drifting from
 * the product). The body carries the entity's canonical surface as an
 * ABSOLUTE deep link on the single-domain origin (CANONICAL_ORIGIN — email
 * links must never point at a preview host), plus a link to the settings
 * surface where the recipient can turn the channel off (consent hygiene:
 * every notification email says where to stop them).
 *
 * LOCALE: `profiles` stores no UI-language column today, so the dispatcher
 * renders in the platform default locale. The `locale` parameter exists so
 * a per-recipient language can be threaded through the moment one is stored
 * — rendering is already locale-complete for every ACTIVE locale.
 *
 * Returns null only when the catalogue cannot name the event at all — the
 * dispatcher treats that as an honest render failure, never sends a raw
 * enum to a person.
 */
import {
  activeLocales,
  defaultLocale,
  type ActiveLocale,
} from "@/lib/i18n/config";
import { CANONICAL_ORIGIN } from "@/lib/domain/canonical";
import { notificationEventHref } from "@/lib/notifications/events";

export interface RenderedNotificationEmail {
  readonly subject: string;
  readonly text: string;
  /** Absolute canonical-origin URL the email points at. */
  readonly deepLink: string;
}

function isActiveLocale(value: string): value is ActiveLocale {
  return (activeLocales as readonly string[]).includes(value);
}

type MessageTree = Record<string, unknown>;

function readString(tree: MessageTree, path: readonly string[]): string | null {
  let node: unknown = tree;
  for (const key of path) {
    if (!node || typeof node !== "object") return null;
    node = (node as MessageTree)[key];
  }
  return typeof node === "string" && node.trim().length > 0 ? node : null;
}

async function loadMessages(locale: ActiveLocale): Promise<MessageTree> {
  // The same per-locale JSON the request config loads — one copy source.
  const mod = (await import(`../../messages/${locale}.json`)) as {
    default: MessageTree;
  };
  return mod.default;
}

export async function renderNotificationEmail(input: {
  readonly eventType: string;
  readonly entityType: string;
  readonly locale?: string;
}): Promise<RenderedNotificationEmail | null> {
  const locale: ActiveLocale =
    input.locale && isActiveLocale(input.locale) ? input.locale : defaultLocale;
  let messages: MessageTree;
  try {
    messages = await loadMessages(locale);
  } catch {
    return null;
  }

  const subject =
    readString(messages, [
      "auth",
      "notifications",
      "types",
      `event_${input.eventType}`,
    ]) ?? readString(messages, ["auth", "notifications", "types", "generic"]);
  if (!subject) return null;

  // The entity's canonical surface — the same href the bell row links.
  // An unmapped entity falls back to the activity centre (the durable feed).
  const path = notificationEventHref(input.entityType) ?? "/dashboard/activity";
  const deepLink = `${CANONICAL_ORIGIN}/${locale}${path}`;
  const manageLink = `${CANONICAL_ORIGIN}/${locale}/dashboard/account`;

  const openLine =
    readString(messages, ["auth", "notifications", "email", "open"]) ?? "";
  const manageLine =
    readString(messages, ["auth", "notifications", "email", "manage"]) ?? "";

  const text = [
    subject,
    "",
    openLine ? `${openLine} ${deepLink}` : deepLink,
    "",
    manageLine ? `${manageLine} ${manageLink}` : manageLink,
  ].join("\n");

  return { subject, text, deepLink };
}
