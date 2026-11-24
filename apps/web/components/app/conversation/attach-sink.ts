import { useEffect, useRef } from "react";

/**
 * THE OPEN ATTACH TARGET (owner P0 2026-09-23, CASE 6).
 *
 * The conversation used to remember what a paperclip file was "for" in a
 * STICKY ref — `"worklog" | "cv" | null`, set whenever such a flow opened and
 * never reset. After any work-log form had appeared in a session, even one
 * already cancelled or saved, every paperclip click pushed ANOTHER
 * independently savable form: several forms, several confirmation tokens,
 * more than one record possible.
 *
 * A target now lives exactly as long as the flow that offers it. An open
 * `WorkerWorkLogFlow`, `WorkerCvFlow` or `DocumentFileEmbed` registers a sink
 * while it can take a file, and withdraws it on done, cancel or unmount. A
 * picked file goes INTO that flow's own field — its existing pick handler,
 * never a second uploader — instead of opening a new flow.
 *
 * A stack, because flows open over one another: when the newest one closes,
 * the one still open underneath becomes the target again.
 */
export type AttachSinkKind = "worklog" | "cv" | "document";

export type AttachSink = {
  readonly kind: AttachSinkKind;
  /** Can this flow hold THIS file right now (its type, and its own phase)? */
  readonly accepts: (file: File) => boolean;
  /** Hand the file to the flow's own pick handler. Nothing is uploaded here —
   *  the flow's own confirm step still decides that. */
  readonly attach: (file: File) => void;
};

/** Registers a sink; the returned function withdraws exactly that sink. */
export type RegisterAttachSink = (sink: AttachSink) => () => void;

export type AttachSinkStack = {
  readonly register: RegisterAttachSink;
  /** The NEWEST open target, when it takes this file — otherwise null. An
   *  older flow further up the thread is not silently chosen over a question. */
  readonly current: (file: File) => AttachSink | null;
  /** The newest open target of one kind that takes this file — used once the
   *  person has SAID what the file is for, so the answer reaches the flow that
   *  is already open instead of opening a duplicate. */
  readonly openOf: (kind: AttachSinkKind, file: File) => AttachSink | null;
};

export function createAttachSinkStack(): AttachSinkStack {
  let sinks: readonly AttachSink[] = [];
  return {
    register(sink) {
      sinks = [...sinks, sink];
      return () => {
        sinks = sinks.filter((s) => s !== sink);
      };
    },
    current(file) {
      const top = sinks[sinks.length - 1];
      return top && top.accepts(file) ? top : null;
    },
    openOf(kind, file) {
      for (let i = sinks.length - 1; i >= 0; i--) {
        const s = sinks[i]!;
        if (s.kind === kind && s.accepts(file)) return s;
      }
      return null;
    },
  };
}

/**
 * Offer a flow's own field as the attach target while `active`, and withdraw
 * it the moment the flow is done, cancelled or unmounted. The handlers are
 * read through a ref, so the registration does not churn on every render and
 * always calls the flow's CURRENT state.
 */
export function useAttachSink(
  register: RegisterAttachSink | undefined,
  kind: AttachSinkKind,
  active: boolean,
  accepts: (file: File) => boolean,
  attach: (file: File) => void,
): void {
  const latest = useRef({ accepts, attach });
  latest.current = { accepts, attach };
  useEffect(() => {
    if (!register || !active) return;
    return register({
      kind,
      accepts: (file) => latest.current.accepts(file),
      attach: (file) => latest.current.attach(file),
    });
  }, [register, kind, active]);
}

/**
 * A file the person picked BEFORE this flow opened (the composer's pending
 * attachment), handed to the flow's own pick handler exactly once on mount —
 * the same path a pick inside the flow takes. Consumed through a ref, so a
 * development double-mount cannot read it twice.
 */
export function useInitialFile(
  file: File | null | undefined,
  take: (file: File) => void,
): void {
  const pending = useRef<File | null>(file ?? null);
  const takeRef = useRef(take);
  takeRef.current = take;
  useEffect(() => {
    const f = pending.current;
    if (!f) return;
    pending.current = null;
    takeRef.current(f);
  }, []);
}
