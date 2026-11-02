/**
 * Where a notification leads on the PHONE — pure, from the web path the
 * server attached to the event (`notificationEventHref`).
 *
 * A path whose screen exists in this app AND carries the action the
 * notification is about opens that screen; every other path opens on the
 * website, as the person, where that route lives. Nothing is
 * guessed: an id is passed on only when the web path carried one.
 */
export type NotificationDestination =
  | {
      readonly kind: "native";
      readonly pathname:
        | "/(shell)/conversation"
        | "/(shell)/messages"
        | "/(shell)/journal"
        | "/(shell)/jobs";
      readonly params?: Record<string, string>;
    }
  | { readonly kind: "web"; readonly path: string }
  | { readonly kind: "none" };

const ID = "([0-9a-fA-F-]{36})";

export function notificationDestination(
  href: string | undefined,
  /** The row's rendered type (`event_…`); decides where one href serves two kinds. */
  type?: string,
): NotificationDestination {
  if (!href || !href.startsWith("/")) return { kind: "none" };
  const path = href.split(/[?#]/)[0];
  // A review DECISION (approved / changes requested / rejected) carries the
  // reviewer's decision and note, which only the web journal shows (its
  // decision timeline and review panel); the phone's journal lists entries
  // without them. The journal digest, same href, opens natively.
  if (type?.startsWith("event_journal_review_decided")) return { kind: "web", path: href };
  const thread = new RegExp(`^/dashboard/communication/${ID}$`).exec(path);
  if (thread) return { kind: "native", pathname: "/(shell)/conversation", params: { id: thread[1] } };
  if (path === "/dashboard/communication") return { kind: "native", pathname: "/(shell)/messages" };
  if (path === "/dashboard/journal") return { kind: "native", pathname: "/(shell)/journal" };
  // NOT the native profile: what a profile notification is about — a roster
  // link offer to accept or refuse, a profile to complete — is decided on the
  // web profile; the phone's profile only reads. It opens on the website.
  const job = new RegExp(`^/jobs/${ID}$`).exec(path);
  if (job) return { kind: "native", pathname: "/(shell)/jobs", params: { id: job[1] } };
  return { kind: "web", path: href };
}
