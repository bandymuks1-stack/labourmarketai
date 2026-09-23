"use client";

import { useEffect, useState } from "react";

import { Link } from "@/lib/i18n/navigation";
import { getMyDiscoverabilityState } from "@/lib/privacy/discoverability-actions";
import {
  EMPLOYER_VISIBILITY_HREF,
  readVisibilityAskRecord,
  shouldAskEmployerVisibility,
  visibilityAskEnded,
  writeVisibilityAskRecord,
} from "@/lib/privacy/employer-visibility";

/**
 * THE ONE ASK after a work-card save: "should employers be able to find you?"
 * (capability matrix P0, 2026-09-23).
 *
 * The moment is chosen, not arbitrary: the person has just told the product
 * when, where and for how much they can work — the facts an employer search
 * reads — and the one thing that decides whether any employer ever sees them
 * is a consent they have never been shown.
 *
 * NON-BLOCKING AND ASKED ONCE. Not a modal, not a redirect, not a step: a
 * small note under the saved card with a door and "not now". It renders only
 * when `shouldAskEmployerVisibility` says so — the consent was never decided
 * (ledger `not_set`, every device) and this device has not ended the ask
 * (`opened` / `dismissed`, the profession-prompt idiom: one localStorage key,
 * no table). An unknown state never asks.
 *
 * NOT A CONSENT. The door opens the EXISTING consent on its canonical screen,
 * where the full versioned text and the two equal buttons are; nothing here
 * grants, and the ask pre-selects nothing.
 */

export interface EmployerVisibilityAskLabels {
  readonly title: string;
  readonly body: string;
  readonly open: string;
  readonly dismiss: string;
}

export function EmployerVisibilityAsk({
  labels,
}: {
  readonly labels: EmployerVisibilityAskLabels;
}) {
  // Nothing renders until the device record and the ledger state are both
  // known, so an already-answered ask never flashes on screen.
  const [show, setShow] = useState(false);

  useEffect(() => {
    const record = readVisibilityAskRecord();
    // A recorded outcome ends the ask without a server read.
    if (visibilityAskEnded(record)) return;
    let alive = true;
    getMyDiscoverabilityState()
      .then((consent) => {
        if (
          alive &&
          shouldAskEmployerVisibility({ justSaved: true, consent, askRecord: record })
        ) {
          setShow(true);
        }
      })
      .catch(() => {
        /* unknown state — never ask on a failed read */
      });
    return () => {
      alive = false;
    };
  }, []);

  if (!show) return null;

  return (
    <section
      className="mt-3 flex flex-col items-start gap-2 rounded-md border border-brand-blue/30 bg-brand-blue/5 px-4 py-3"
      data-testid="work-card-visibility-ask"
    >
      <p className="text-sm font-semibold text-text-primary">{labels.title}</p>
      <p className="text-xs leading-relaxed text-text-secondary">{labels.body}</p>
      <div className="flex flex-wrap items-center gap-2">
        <Link
          href={EMPLOYER_VISIBILITY_HREF as "/dashboard"}
          onClick={() => writeVisibilityAskRecord("opened")}
          className="inline-flex min-h-11 items-center rounded-md border border-brand-blue/40 px-3 text-xs font-semibold text-brand-blue hover:border-brand-blue"
          data-testid="work-card-visibility-ask-open"
        >
          {labels.open} →
        </Link>
        <button
          type="button"
          onClick={() => {
            writeVisibilityAskRecord("dismissed");
            setShow(false);
          }}
          className="min-h-11 rounded-md px-3 text-xs font-semibold text-text-secondary hover:text-text-primary"
          data-testid="work-card-visibility-ask-dismiss"
        >
          {labels.dismiss}
        </button>
      </div>
    </section>
  );
}
