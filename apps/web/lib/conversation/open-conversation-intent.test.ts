import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { classifyIntent } from "./intent-router";

const WEB = join(__dirname, "..", "..");
const CHAT = readFileSync(
  join(WEB, "components", "app", "conversation", "chat", "conversation-chat.tsx"),
  "utf8",
);

describe("'write to / open a conversation with <person>' opens the one conversation", () => {
  it.each([
    "Parašyk Jonui",
    "Parašyk žinutę Jonui",
    "Atidaryk pokalbį su Jonu",
    "Pasikalbėk su Rasa",
    "Susisiek su Jonu",
    "Message Anna",
    "Open a conversation with Jonas",
    "Chat with Anna",
    "Напиши Йонасу",
    "Открой чат с Йонасом",
    "Schreib Jonas",
    "Öffne ein Gespräch mit Jonas",
    "Open een gesprek met Jonas",
    "Napisz do Jonasa",
  ])("%s -> open-conversation", (sentence) => {
    expect(classifyIntent(sentence).intent).toBe("open-conversation");
  });

  it("sentences write-employer owns, and things one writes that are not a person, keep their routes", () => {
    for (const s of [
      "Parašyk šiai įmonei",
      "Parašyk darbdaviui",
      "Parašyk man laišką",
      "Parašyk CV",
      "Parašyk ataskaitą",
      "Write to this company",
      "Message the employer",
      "Показать сообщения",
    ]) {
      expect(classifyIntent(s).intent, s).not.toBe("open-conversation");
    }
    expect(classifyIntent("Parodyk žinutes").intent).toBe("messages-view");
  });
});

describe("the chat has no message logic of its own", () => {
  it("resolves who through the conversation door, opens through it, and only navigates", () => {
    expect(CHAT).toMatch(/from "@\/lib\/communication\/chat-open-conversation"/);
    expect(CHAT).toMatch(/findConversationPeople\(sentence\)/);
    expect(CHAT).toMatch(/openConversationWith\(\{/);
    const block = CHAT.slice(
      CHAT.indexOf("const openConversationTarget = useCallback("),
      CHAT.indexOf("const startSwitchContext = useCallback("),
    );
    expect(block).not.toMatch(/sendMessage|conversation_messages|\.insert\(|getOrCreateDirectConversation/);
    expect(block).toMatch(/router\.push\(/);
    // many -> asks which; none and failures -> plain sentences
    expect(block).toMatch(/openConversationWhich/);
    expect(block).toMatch(/openConversationNone/);
    expect(block).toMatch(/openConversationNoPermission/);
  });
});

describe("the employer brief counts the company's unread, not the person's whole inbox", () => {
  it("uses the organization-scoped unread read", () => {
    const brief = readFileSync(join(WEB, "lib", "conversation", "opening-brief.ts"), "utf8");
    const employer = brief.slice(brief.indexOf("export async function loadEmployerOpeningBrief"));
    expect(employer).toMatch(/getUnreadConversationIdsForOrganization\(ctx\.companyId\)/);
    expect(employer).not.toMatch(/getUnreadConversationCount\(\)/);
  });
});
