/**
 * Where a notification leads on the PHONE — pure, from the web path the
 * server attached to the event (`notificationEventHref`).
 *
 * A path whose screen exists in this app opens that screen; every other path
 * opens on the website, as the person, where that route lives. Nothing is
 * guessed: an id is passed on only when the web path carried one.
 */
export type NotificationDestination =
  | {
      readonly kind: "native";
      readonly pathname:
        | "/(shell)/conversation"
        | "/(shell)/messages"
        | "/(shell)/journal"
        | "/(shell)/profile"
        | "/(shell)/jobs";
      readonly params?: Record<string, string>;
    }
  | { readonly kind: "web"; readonly path: string }
  | { readonly kind: "none" };

const ID = "([0-9a-fA-F-]{36})";

export function notificationDestination(href: string | undefined): NotificationDestination {
  if (!href || !href.startsWith("/")) return { kind: "none" };
  const path = href.split(/[?#]/)[0];
  const thread = new RegExp(`^/dashboard/communication/${ID}$`).exec(path);
  if (thread) return { kind: "native", pathname: "/(shell)/conversation", params: { id: thread[1] } };
  if (path === "/dashboard/communication") return { kind: "native", pathname: "/(shell)/messages" };
  if (path === "/dashboard/journal") return { kind: "native", pathname: "/(shell)/journal" };
  if (path === "/dashboard/profile") return { kind: "native", pathname: "/(shell)/profile" };
  const job = new RegExp(`^/jobs/${ID}$`).exec(path);
  if (job) return { kind: "native", pathname: "/(shell)/jobs", params: { id: job[1] } };
  return { kind: "web", path: href };
}
