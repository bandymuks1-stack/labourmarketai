/**
 * Pinning tests for `supabase/migrations/0021_communication.sql` and the
 * v1 communication surfaces (server actions + pages + composer).
 *
 * Hard contract (encoded so future edits can't silently regress):
 *   - Three tables, RLS-enabled, append-only messages (no UPDATE / DELETE
 *     policy on messages).
 *   - SELECT scoped to conversation participants (or admin via is_admin).
 *   - INSERT message: author_id = auth.uid() AND is_conversation_participant.
 *   - INSERT participant: only by conversation creator OR admin.
 *   - Grants restricted to authenticated; public + anon empty.
 *   - is_conversation_participant function is `security invoker`.
 *   - No file upload code anywhere in the v1 communication module.
 *   - No fake delivered/read indicators in the UI (only the honest
 *     per-participant `last_read_at` timestamp).
 *   - Composer + actions never use service_role.
 */

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const REPO_ROOT = join(process.cwd(), "..", "..");
const APP_ROOT = process.cwd();

function readRepo(rel: string): string {
  return readFileSync(join(REPO_ROOT, rel), "utf-8");
}
function readApp(rel: string): string {
  return readFileSync(join(APP_ROOT, rel), "utf-8");
}

const migration = readRepo("supabase/migrations/0021_communication.sql");
const actions = readApp("lib/communication/actions.ts");
const composer = readApp("components/app/communication-composer.tsx");
const listPage = readApp("app/[locale]/dashboard/communication/page.tsx");
const detailPage = readApp(
  "app/[locale]/dashboard/communication/[conversationId]/page.tsx",
);
const markRead = readApp("components/app/mark-read-on-mount.tsx");

describe("0021 — three tables exist with RLS enabled", () => {
  it("creates conversations / conversation_participants / conversation_messages", () => {
    for (const t of [
      "conversations",
      "conversation_participants",
      "conversation_messages",
    ]) {
      expect(migration).toMatch(
        new RegExp(`create table if not exists public\\.${t}`, "i"),
      );
      expect(migration).toMatch(
        new RegExp(`alter table public\\.${t} enable row level security`, "i"),
      );
    }
  });

  it("does NOT shadow the pre-existing legacy public.messages table", () => {
    // The legacy chain (messages/threads/matches with thread_id/sender_id)
    // pre-existed in production untracked by this repo. We must not
    // collide with it. 0021's message table is `conversation_messages`.
    expect(migration).not.toMatch(/create table if not exists public\.messages/i);
    expect(migration).not.toMatch(/alter table public\.messages\b/i);
    expect(migration).not.toMatch(/create policy[\s\S]{0,200}on public\.messages\b/i);
  });

  it("bounds the message body to 10000 chars on conversation_messages", () => {
    expect(migration).toMatch(
      /body\s+text not null check \(char_length\(body\) between 1 and 10000\)/i,
    );
  });
});

describe("0021 — RLS policies are participant-scoped", () => {
  it("conversations SELECT requires participation or creator or admin", () => {
    expect(migration).toMatch(
      /create policy conversations_select on public\.conversations for select[\s\S]*public\.is_conversation_participant\(id\)[\s\S]*public\.is_admin\(\)/i,
    );
  });

  it("conversations INSERT pins created_by to auth.uid()", () => {
    expect(migration).toMatch(
      /create policy conversations_insert on public\.conversations for insert[\s\S]*with check\s*\(\s*created_by = auth\.uid\(\)\s*\)/i,
    );
  });

  it("conversation_messages INSERT requires author_id = auth.uid() AND participation", () => {
    expect(migration).toMatch(
      /create policy conversation_messages_insert on public\.conversation_messages for insert[\s\S]*author_id = auth\.uid\(\)[\s\S]*is_conversation_participant/i,
    );
  });

  it("conversation_messages has NO update / delete policy (append-only)", () => {
    expect(migration).not.toMatch(
      /create policy[\s\S]*on public\.conversation_messages for (update|delete)/i,
    );
  });

  it("conversation_participants UPDATE only allows the participant to flip their own row", () => {
    expect(migration).toMatch(
      /create policy conversation_participants_update on public\.conversation_participants for update[\s\S]*using\s*\(\s*profile_id = auth\.uid\(\)\s*\)[\s\S]*with check\s*\(\s*profile_id = auth\.uid\(\)\s*\)/i,
    );
  });
});

describe("0021 — is_conversation_participant helper", () => {
  it("is security invoker (not definer)", () => {
    expect(migration).toMatch(
      /create or replace function public\.is_conversation_participant[\s\S]*security invoker/i,
    );
    expect(migration).not.toMatch(
      /create or replace function public\.is_conversation_participant[\s\S]*security definer/i,
    );
  });
});

describe("0021 — grants restricted to authenticated", () => {
  it("only authenticated has app-level grants on the three tables", () => {
    for (const t of [
      "conversations",
      "conversation_participants",
      "conversation_messages",
    ]) {
      expect(migration).toMatch(
        new RegExp(`grant[^;]*on public\\.${t}[\\s\\S]*to authenticated`, "i"),
      );
    }
    expect(migration).not.toMatch(/grant[^;]*on public\.(conversations|conversation_participants|conversation_messages)[^;]*to\s+(anon|public)/i);
  });
});

// Strip whole-line slash-slash and block comments before scanning so
// doctrine notes (e.g. a comment saying "no service_role here") don't
// trigger prohibitions against the values themselves.
function stripComments(src: string): string {
  const noBlock = src.replace(/\/\*[\s\S]*?\*\//g, "");
  return noBlock
    .split("\n")
    .filter((line) => !/^\s*(?:\/\/|\*)/.test(line))
    .join("\n");
}

describe("communication v1 — no service_role, no file upload, no fake indicators", () => {
  it("actions never use service_role (code paths only — doctrine comments allowed)", () => {
    const code = stripComments(actions);
    expect(code).not.toMatch(/service[_-]?role/i);
    expect(code).not.toMatch(/SUPABASE_SERVICE_ROLE/);
    expect(code).not.toMatch(/createAdminClient/i);
  });

  it("composer uploads files ONLY to the private participant-scoped bucket (v2 attachments)", () => {
    // The v1 "no file upload" pin evolved with migration 20260712130000:
    // attachments are now a real product flow, but the upload path must stay
    // the ONE private conversation bucket through the user's own client —
    // never a public URL, never service_role, never a decorative control.
    const code = stripComments(composer);
    expect(code).toMatch(/type="file"/);
    expect(code).toMatch(/CONVERSATION_ATTACHMENT_BUCKET/);
    expect(code).not.toMatch(/getPublicUrl/i);
    expect(code).not.toMatch(/service[_-]?role/i);
    // No hard-coded bucket strings — the model constant is the single source.
    expect(code).not.toMatch(/from\(\s*["']conversation-attachments["']\s*\)/);
  });

  it("UI code never RENDERS fake 'delivered' / 'seen' / 'read receipt' / 'typing' indicators", () => {
    const all = stripComments(
      [composer, listPage, detailPage, markRead].join("\n"),
    );
    expect(all).not.toMatch(/\bdelivered\b/i);
    expect(all).not.toMatch(/\bread receipt\b/i);
    expect(all).not.toMatch(/\bis typing\b/i);
    expect(all).not.toMatch(/\btyping\.\.\./i);
  });

  it("composer surfaces the precise server-side error message (no generic blob)", () => {
    expect(composer).toMatch(/setError\(result\.message\)/);
  });
});

describe("communication v1 — pages live under the auth-gated /dashboard tree", () => {
  it("list page exists at /[locale]/dashboard/communication", () => {
    expect(listPage).toMatch(/CommunicationListPage/);
    // Unauth users get redirected to /auth/login with a next param.
    expect(listPage).toContain("auth/login?next=/");
  });

  it("detail page exists at /[locale]/dashboard/communication/[conversationId]", () => {
    expect(detailPage).toMatch(/ConversationDetailPage/);
    expect(detailPage).toMatch(/notFound/);
  });
});
