"use client";

import { useEffect, useState } from "react";

import {
  registerWebPushSubscriptionAction,
  unregisterWebPushSubscriptionAction,
} from "@/lib/notifications/web-push-actions";

/**
 * Push notifications on THIS device — the opt-in (COM-3 push channel).
 *
 * Rendered by the account page ONLY while the channel is active (flag on +
 * VAPID keys present); with the flag off this component is never mounted
 * and no service worker is ever registered. The service worker
 * (`/sw.js`) is registered here, on the person's click — never on page
 * load — and the browser then asks its own permission question.
 *
 * Honest states: the browser cannot do push; the person blocked
 * notifications in the browser (we cannot override that — we say where to
 * change it); off; on. A failed save never shows "on".
 */
export interface WebPushOptInLabels {
  readonly title: string;
  readonly intro: string;
  readonly turnOn: string;
  readonly turnOff: string;
  readonly working: string;
  readonly on: string;
  readonly off: string;
  readonly unsupported: string;
  readonly blocked: string;
  readonly error: string;
}

type View = "checking" | "unsupported" | "blocked" | "off" | "on";

function keyToBytes(base64url: string): Uint8Array<ArrayBuffer> {
  const pad = "=".repeat((4 - (base64url.length % 4)) % 4);
  const raw = atob((base64url + pad).replace(/-/g, "+").replace(/_/g, "/"));
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

function supported(): boolean {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

export function WebPushOptIn({
  publicKey,
  optedIn,
  labels,
}: {
  publicKey: string;
  /** The stored opt-in (`*`/`push` preference row). */
  optedIn: boolean;
  labels: WebPushOptInLabels;
}) {
  const [view, setView] = useState<View>("checking");
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!supported()) return setView("unsupported");
      if (Notification.permission === "denied") return setView("blocked");
      const reg = await navigator.serviceWorker.getRegistration("/");
      const sub = reg ? await reg.pushManager.getSubscription() : null;
      if (!cancelled) setView(sub && optedIn ? "on" : "off");
    })().catch(() => !cancelled && setView("off"));
    return () => {
      cancelled = true;
    };
  }, [optedIn]);

  const turnOn = async () => {
    setBusy(true);
    setFailed(false);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setView(permission === "denied" ? "blocked" : "off");
        return;
      }
      const reg = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
      await navigator.serviceWorker.ready;
      const sub =
        (await reg.pushManager.getSubscription()) ??
        (await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: keyToBytes(publicKey),
        }));
      const json = sub.toJSON();
      const result = await registerWebPushSubscriptionAction({
        endpoint: json.endpoint ?? "",
        p256dh: json.keys?.p256dh ?? "",
        auth: json.keys?.auth ?? "",
      });
      if (result.kind === "ok") setView("on");
      else {
        await sub.unsubscribe().catch(() => undefined);
        setFailed(true);
        setView("off");
      }
    } catch {
      setFailed(true);
      setView("off");
    } finally {
      setBusy(false);
    }
  };

  const turnOff = async () => {
    setBusy(true);
    setFailed(false);
    try {
      const reg = await navigator.serviceWorker.getRegistration("/");
      const sub = reg ? await reg.pushManager.getSubscription() : null;
      const endpoint = sub?.endpoint ?? null;
      await sub?.unsubscribe().catch(() => undefined);
      const result = await unregisterWebPushSubscriptionAction({ endpoint });
      if (result.kind === "ok") setView("off");
      else setFailed(true);
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section
      className="rounded-md border border-ink-500 bg-ink-800/20 p-5"
      data-testid="web-push-opt-in"
      data-state={view}
    >
      <p className="font-mono text-meta uppercase tracking-label text-text-muted">{labels.title}</p>
      <p className="mt-2 text-xs leading-relaxed text-text-secondary">{labels.intro}</p>
      <p className="mt-3 text-sm text-text-primary" role="status" aria-live="polite">
        {busy
          ? labels.working
          : view === "unsupported"
            ? labels.unsupported
            : view === "blocked"
              ? labels.blocked
              : view === "on"
                ? labels.on
                : view === "off"
                  ? labels.off
                  : null}
      </p>
      {failed && (
        <p className="mt-2 text-xs text-state-warning" role="alert">
          {labels.error}
        </p>
      )}
      {(view === "off" || view === "on") && (
        <button
          type="button"
          disabled={busy}
          aria-busy={busy}
          onClick={view === "on" ? turnOff : turnOn}
          className="mt-3 inline-flex min-h-10 items-center rounded-md border border-ink-500 px-4 py-2 text-sm font-medium text-text-primary hover:border-brand-blue disabled:cursor-not-allowed disabled:opacity-60"
          data-testid="web-push-toggle"
        >
          {view === "on" ? labels.turnOff : labels.turnOn}
        </button>
      )}
    </section>
  );
}
