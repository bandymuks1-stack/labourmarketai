/**
 * Conversation chat message model (Real Conversation UI). Everything the user
 * sees is a MESSAGE in one chronological thread — assistant turns, user turns,
 * server results, confirmations, and structured cards (CV upload, work-log
 * preview, employer match, translation preview). No dashboard cards; the whole
 * surface is a single conversation.
 */

export type Role = "assistant" | "user" | "system";

export type ChoiceChip = { id: string; label: string };

export type EmployerMatch = {
  id: string;
  name: string;
  /** Bounded, human reason bullets (why this fits) — never a raw score. */
  reasons: string[];
  fitLabel: string; // e.g. "Strong fit"
};

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
  | { id: string; role: "assistant"; kind: "employer-match"; intro: string; matches: EmployerMatch[]; at?: string }
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
      confirmLabel: string;
      cancelLabel: string;
      at?: string;
    };
