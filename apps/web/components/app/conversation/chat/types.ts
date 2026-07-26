/**
 * Conversation chat message model (Real Conversation UI). Everything the user
 * sees is a MESSAGE in one chronological thread — assistant turns, user turns,
 * server results, confirmations, and structured cards (CV upload, work-log
 * preview, employer match, translation preview). No dashboard cards; the whole
 * surface is a single conversation.
 */

import type {
  ChatEmployerMatch,
  ChatInterestLabels,
} from "@/lib/conversation/find-work-contract";

export type Role = "assistant" | "user" | "system";

export type ChoiceChip = {
  id: string;
  label: string;
  /** `true` marks the ONE recommended choice in a row.
   *
   *  Set only when the SERVER supplied a concrete next step (the first missing
   *  profile checkpoint). When there is no real priority every chip stays
   *  neutral — a recommendation is never invented to make the row look
   *  designed. */
  recommended?: boolean;
};

/**
 * An employer-match card IS the canonical adapter's output — the same object,
 * not a look-alike. Re-declaring the shape here is exactly how a presentation
 * copy of a domain result starts drifting; the alias makes that impossible.
 *
 * It carries the REAL demand id (`JobRecommendation.requestId`, never a list
 * index — it doubles as the React key and as the id the shown-marker reports),
 * the bounded human reason bullets (the first is the canonical §19 basis line,
 * identical on every marketplace surface, never a raw score), and the worker's
 * own interest status.
 */
export type EmployerMatch = ChatEmployerMatch;
export type InterestLabels = ChatInterestLabels;

export type WorkLogDraft = {
  date: string;
  start: string;
  end: string;
  breakMinutes: number;
  hoursLabel: string;
  task?: string;
  project?: string;
  skills?: string[];
};

export type ChatMessage =
  /**
   * The opening turn. Rendered as the screen's real `<h1>` at the title scale
   * in the display face — the conversation's one page title. Every other
   * assistant turn is `kind: "text"` at body scale, so exactly one heading
   * exists per thread.
   */
  | {
      id: string;
      role: "assistant";
      kind: "greeting";
      text: string;
      /** The assistant's display name, shown once above the title. */
      assistantName: string;
      at?: string;
      chips?: ChoiceChip[];
    }
  | { id: string; role: "assistant"; kind: "text"; text: string; at?: string; chips?: ChoiceChip[] }
  | { id: string; role: "user"; kind: "text"; text: string; at?: string }
  | { id: string; role: "system"; kind: "result"; ok: boolean; text: string; at?: string }
  | { id: string; role: "system"; kind: "error"; text: string; at?: string }
  | {
      id: string;
      role: "assistant";
      kind: "confirmation";
      title: string;
      body?: string;
      strong?: boolean;
      confirmLabel: string;
      cancelLabel: string;
      confirmedText?: string;
      at?: string;
    }
  | { id: string; role: "user"; kind: "file"; fileName: string; status: "uploading" | "read" | "error"; note?: string; at?: string }
  | { id: string; role: "assistant"; kind: "question"; text: string; chips: ChoiceChip[]; at?: string }
  | {
      id: string;
      role: "assistant";
      kind: "employer-match";
      intro: string;
      matches: EmployerMatch[];
      /** Locale + capability come from the server turn. `interestLabels: null`
       *  means the owner-gated interest table is absent, so the cards stay
       *  read-only — never a dead button. */
      locale?: string;
      interestLabels?: InterestLabels | null;
      at?: string;
    }
  | {
      id: string;
      role: "assistant";
      kind: "profile-summary";
      intro: string;
      /** Concrete facts already saved on the worker's canonical rows. */
      done: string[];
      /** Concrete facts still missing — named, never a bare percentage. */
      missing: string[];
      /** Server-supplied counts. The card RENDERS these; it never counts the
       *  arrays, so the bar can never disagree with the server. */
      stepsDone: number;
      stepsTotal: number;
      /** Localized "{done} / {total}" readout + the progress group's a11y name,
       *  resolved server-side so the card holds no copy of its own. */
      progressLabel: string;
      progressAriaLabel: string;
      /** Localized "saved" / "missing" words — the TEXT signal that makes the
       *  segments readable without perceiving colour. */
      doneWord: string;
      missingWord: string;
      /** Honest last-activity line, or null when there is no activity yet. */
      lastActivity: string | null;
      chips?: ChoiceChip[];
      at?: string;
    }
  | {
      id: string;
      role: "assistant";
      kind: "translation";
      recipient: string;
      channelLabel: string;
      originalLabel: string;
      original: string;
      translatedLabel: string;
      translated: string;
      confirmLabel: string;
      cancelLabel: string;
      at?: string;
    }
  | {
      id: string;
      role: "assistant";
      kind: "worklog";
      title: string;
      draft: WorkLogDraft;
      /** Localized field captions (`conversation.worklog.label*`) — the card
       *  bakes in no product copy of its own. */
      fieldLabels: WorkLogFieldLabels;
      confirmLabel: string;
      cancelLabel: string;
      at?: string;
    };

export type WorkLogFieldLabels = {
  date: string;
  time: string;
  break: string;
  hours: string;
  task: string;
  site: string;
};
