/**
 * The owner-SQL cleanup of ONE synthetic chat-revocation walk thread
 * (`tests/e2e/prod-chat-revocation.spec.ts`, PR #3239). No role in the
 * project holds DELETE on the chat tables, so the walk only LISTS what it
 * leaves; the owner runs the generated statement as a separate approval.
 *
 * Deterministic and read-only here: it turns the rows the walk read back
 * into (1) a row-level dry-run table and (2) one transaction that deletes
 * exactly those rows, by id, each scoped to the walk's own thread id, and
 * aborts unless every DELETE removes exactly the listed number of rows.
 * Nothing is matched by pattern, so real users' data and the shared QA
 * threads can never be touched. Pure.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface ChatWalkRows {
  readonly threadId: string;
  readonly subject: string;
  /** The three synthetic profiles of the walk (A, B, C). */
  readonly profileIds: readonly string[];
  readonly messageIds: readonly string[];
  readonly attachmentIds: readonly string[];
  /** Bell rows of B and C for this thread (their own reads). */
  readonly notificationIds: readonly string[];
}

export interface ChatWalkCleanup {
  /** `table | row id | thread id | why it is ours`, one line per row. */
  readonly dryRun: readonly string[];
  readonly sql: string;
}

function ids(label: string, list: readonly string[]): string[] {
  for (const id of list) {
    if (!UUID.test(id)) throw new Error(`chat-walk-cleanup: ${label} id is not a uuid`);
  }
  return [...new Set(list)].sort();
}

const arr = (list: readonly string[]) => `array[${list.map((i) => `'${i}'`).join(",")}]::uuid[]`;

export function chatWalkCleanup(rows: ChatWalkRows): ChatWalkCleanup {
  const thread = ids("thread", [rows.threadId])[0]!;
  if (!rows.subject.startsWith("QA-SYNTHETIC ")) {
    throw new Error("chat-walk-cleanup: the thread is not a QA-SYNTHETIC walk thread");
  }
  const profiles = ids("profile", rows.profileIds);
  if (profiles.length !== 3) throw new Error("chat-walk-cleanup: expected exactly the three walk profiles");
  const messages = ids("message", rows.messageIds);
  const attachments = ids("attachment", rows.attachmentIds);
  const notifications = ids("notification", rows.notificationIds);

  const dryRun = [
    "table | row id | thread id | why it is ours",
    `conversations | ${thread} | ${thread} | created by the walk (subject "${rows.subject}")`,
    ...profiles.map((p) => `conversation_participants | ${thread}/${p} | ${thread} | walk profile A, B or C in the walk's thread`),
    ...messages.map((m) => `conversation_messages | ${m} | ${thread} | message in the walk's thread`),
    ...attachments.map((a) => `conversation_message_attachments | ${a} | ${thread} | attachment in the walk's thread`),
    ...notifications.map((n) => `notification_events | ${n} | ${thread} | B's or C's bell row for the walk's thread`),
  ];

  const del = (sqlDelete: string, expected: number, label: string) =>
    `  ${sqlDelete};\n  get diagnostics n = row_count;\n  if n <> ${expected} then raise exception '${label}: expected ${expected} rows, deleted %', n; end if;`;

  const sql = [
    "begin;",
    "do $cleanup$",
    "declare n int;",
    "begin",
    del(
      `delete from public.notification_events where id = any(${notifications.length ? arr(notifications) : "array[]::uuid[]"}) and metadata->>'conversationId' = '${thread}'`,
      notifications.length,
      "notification_events",
    ),
    del(
      `delete from public.conversation_message_attachments where id = any(${attachments.length ? arr(attachments) : "array[]::uuid[]"}) and conversation_id = '${thread}'`,
      attachments.length,
      "conversation_message_attachments",
    ),
    del(
      `delete from public.conversation_messages where id = any(${messages.length ? arr(messages) : "array[]::uuid[]"}) and conversation_id = '${thread}'`,
      messages.length,
      "conversation_messages",
    ),
    del(
      `delete from public.conversation_participants where conversation_id = '${thread}' and profile_id = any(${arr(profiles)})`,
      profiles.length,
      "conversation_participants",
    ),
    del(
      `delete from public.conversations where id = '${thread}' and subject = '${rows.subject.replace(/'/g, "''")}'`,
      1,
      "conversations",
    ),
    "end",
    "$cleanup$;",
    "commit;",
    "-- audit_logs (the removal's own row) is deliberately kept.",
  ].join("\n");

  return { dryRun, sql };
}
