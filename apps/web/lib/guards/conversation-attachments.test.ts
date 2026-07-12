import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

/**
 * Conversation message attachments guard (user-journey root-cause repair v1,
 * finding #6). Pins the security contract of the draft migration
 * 20260712130000 + the end-to-end app flow:
 *
 *   - PRIVATE bucket, participant-scoped storage policies, no public URLs;
 *   - metadata table is append-only, INSERT via SECURITY DEFINER RPC only;
 *   - the RPC re-validates author/participant/path/MIME/size/5-cap;
 *   - attachment-only messages are possible (body CHECK 0..10000) and the
 *     app layer enforces "text OR attachment";
 *   - composer preserves the typed text on failure and never mints a
 *     public URL.
 */

const APP = join(__dirname, "..", "..");
const REPO = resolve(APP, "..", "..");
const readApp = (rel: string) => readFileSync(join(APP, rel), "utf8");

const MIG_REL = "supabase/migrations/20260712130000_conversation_message_attachments.sql";
const migration = readFileSync(join(REPO, MIG_REL), "utf8");
const sqlNoComments = migration.replace(/^\s*--.*$/gm, "");

const composer = readApp("components/app/communication-composer.tsx");
const actions = readApp("lib/communication/actions.ts");
const service = readApp("lib/communication/attachments.ts");
const threadPage = readApp("app/[locale]/dashboard/communication/[conversationId]/page.tsx");

const stripComments = (src: string): string =>
  src.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/[^\n]*/g, "$1");

describe("draft migration — bucket + policies + RPC security contract", () => {
  it("is a DRAFT with the needs-human-gate header (never auto-applied)", () => {
    expect(migration).toMatch(/DRAFT — needs-human-gate — DO NOT APPLY automatically/);
    expect(migration).toMatch(/Never `db push`/);
  });
  it("has a rollback file", () => {
    expect(
      existsSync(join(REPO, "supabase/rollbacks/20260712130000_conversation_message_attachments.down.sql")),
    ).toBe(true);
  });
  it("creates a PRIVATE bucket (public = false), never a public one", () => {
    expect(migration).toMatch(
      /insert into storage\.buckets \(id, name, public\)\s*values \('conversation-attachments', 'conversation-attachments', false\)/,
    );
    expect(sqlNoComments).not.toMatch(/public\s*=\s*true/i);
  });
  it("storage READ requires active conversation participation (path helper)", () => {
    expect(migration).toMatch(
      /"conversation-attachments participant select"[\s\S]*?for select[\s\S]*?is_conversation_participant_path\(name\)/,
    );
  });
  it("storage WRITE additionally pins folder 2 to the uploader's own uid", () => {
    expect(migration).toMatch(
      /"conversation-attachments participant insert"[\s\S]*?for insert[\s\S]*?\(storage\.foldername\(name\)\)\[2\] = auth\.uid\(\)::text[\s\S]*?is_conversation_participant_path\(name\)/,
    );
  });
  it("storage DELETE is uploader-only (pre-send cancel path)", () => {
    expect(migration).toMatch(
      /"conversation-attachments uploader delete"[\s\S]*?for delete[\s\S]*?\(storage\.foldername\(name\)\)\[2\] = auth\.uid\(\)::text/,
    );
  });
  it("the path helper never throws on malformed paths (safe cast)", () => {
    expect(migration).toMatch(
      /is_conversation_participant_path[\s\S]*?exception when others then\s*return false/i,
    );
  });
  it("metadata table: RLS enabled, participant SELECT, INSERT closed (RPC-only), append-only", () => {
    expect(migration).toMatch(/create table if not exists public\.conversation_message_attachments/);
    expect(migration).toMatch(/alter table public\.conversation_message_attachments enable row level security/);
    expect(migration).toMatch(
      /conversation_message_attachments_select[\s\S]*?is_conversation_participant\(conversation_id\)/,
    );
    expect(migration).toMatch(/conversation_message_attachments_insert[\s\S]*?with check \(false\)/);
    expect(sqlNoComments).not.toMatch(
      /create policy[\s\S]{0,120}conversation_message_attachments[\s\S]{0,120}for (update|delete)/i,
    );
  });
  it("register RPC: security definer, author + participant + path + MIME + size + 5-cap", () => {
    const rpc = migration.slice(migration.indexOf("register_conversation_message_attachment"));
    expect(migration).toMatch(
      /create or replace function public\.register_conversation_message_attachment[\s\S]*?security definer/,
    );
    expect(rpc).toMatch(/msg_author <> uid/);
    expect(rpc).toMatch(/is_conversation_participant\(msg_conversation\)/);
    expect(rpc).toMatch(/expected_prefix := msg_conversation::text \|\| '\/' \|\| uid::text \|\| '\/'/);
    expect(rpc).toMatch(/'application\/pdf'/);
    expect(rpc).toMatch(/10485760/);
    expect(rpc).toMatch(/existing_count >= 5/);
  });
  it("grants: authenticated only — never anon/PUBLIC", () => {
    expect(migration).toMatch(/grant select on public\.conversation_message_attachments to authenticated/);
    expect(sqlNoComments).not.toMatch(/grant[\s\S]*?\bto\s+anon\b/i);
    expect(sqlNoComments).not.toMatch(/grant[\s\S]*?\bto\s+public\b/i);
  });
  it("relaxes the body CHECK to 0..10000 (attachment-only messages)", () => {
    expect(migration).toMatch(/check \(char_length\(body\) between 0 and 10000\)/);
  });
  it("contains no destructive op (drop table / delete from) outside comments", () => {
    expect(sqlNoComments).not.toMatch(/drop\s+table/i);
    expect(sqlNoComments).not.toMatch(/delete\s+from\s+public\./i);
  });
});

describe("app flow — send action", () => {
  it("sendMessage accepts attachments and enforces text-OR-attachment", () => {
    expect(actions).toMatch(/attachments\?: ConversationAttachmentInput\[\]/);
    expect(actions).toMatch(/body\.length < BODY_MIN && attachments\.length === 0/);
  });
  it("re-validates the batch server-side before registering", () => {
    expect(actions).toMatch(/validateConversationAttachments\(attachments, \{/);
  });
  it("registers via the SECURITY DEFINER RPC and reports failures honestly", () => {
    expect(actions).toMatch(/register_conversation_message_attachment/);
    expect(actions).toMatch(/attachmentsFailed/);
  });
});

describe("app flow — composer honesty", () => {
  const code = stripComments(composer);
  it("failure paths keep the typed text (setBody('') only after a successful send)", () => {
    // Every early-return error branch precedes the single setBody("") reset.
    const errorReturn = code.indexOf("setError(result.message)");
    const bodyReset = code.indexOf('setBody("")');
    expect(errorReturn).toBeGreaterThan(-1);
    expect(bodyReset).toBeGreaterThan(errorReturn);
  });
  it("has real remove + retry controls and visible upload states", () => {
    expect(composer).toMatch(/communication-attachment-remove-/);
    expect(composer).toMatch(/communication-attachment-retry-/);
    expect(composer).toMatch(/"uploading" \| "uploaded" \| "failed"/);
  });
  it("send-button rules come from the shared pure contract", () => {
    expect(composer).toMatch(/canSendMessage\(\{/);
  });
  it("mobile picker: accepts images (camera/photo picker) + documents", () => {
    expect(composer).toMatch(/accept=\{`\$\{CONVERSATION_ATTACHMENT_ALLOWED_MIME\.join\(","\)\},image\/\*`\}/);
  });
  it("partial attachment failure after a sent message is surfaced, not hidden", () => {
    expect(composer).toMatch(/attachmentsFailed > 0/);
    expect(composer).toMatch(/partialFailure/);
  });
});

describe("app flow — private read path", () => {
  it("service reads via RLS + short-lived signed URLs; degrades pre-migration", () => {
    expect(service).toMatch(/createSignedUrl\(row\.storage_path, 300\)/);
    expect(service).toMatch(/needs-migration/);
  });
  it("no public URL API anywhere in the communication read/write path", () => {
    for (const src of [service, composer, actions, threadPage]) {
      expect(stripComments(src)).not.toMatch(/getPublicUrl/i);
    }
  });
  it("thread page renders attachments per message", () => {
    expect(threadPage).toMatch(/listConversationAttachments\(conversationId\)/);
    expect(threadPage).toMatch(/message-attachments-/);
    expect(threadPage).toMatch(/isImageAttachmentMime/);
  });
});

describe("locale copy (LT/EN) for the attachment flow", () => {
  for (const loc of ["lt", "en"] as const) {
    it(`${loc}: composer attachment keys exist and are non-empty`, () => {
      const msgs = JSON.parse(readApp(`messages/${loc}.json`)) as {
        communication: {
          attachmentUnavailable: string;
          composer: { emptyError: string; attachments: Record<string, string> };
        };
      };
      const a = msgs.communication.composer.attachments;
      for (const k of [
        "addButton", "help", "uploading", "retry", "remove",
        "errorUpload", "errorTooLarge", "errorBadType", "errorTooMany",
        "errorNeedsSetup", "blockedWhileUploading", "blockedFailed", "partialFailure",
      ]) {
        expect(a[k]?.trim().length, `${loc} attachments.${k}`).toBeGreaterThan(0);
      }
      expect(msgs.communication.attachmentUnavailable.trim().length).toBeGreaterThan(0);
      // The empty error must offer BOTH recoveries (text or attachment).
      expect(msgs.communication.composer.emptyError).toMatch(/pried|attach/i);
    });
  }
});
