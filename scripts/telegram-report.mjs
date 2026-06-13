#!/usr/bin/env node
/**
 * Labourmarket.ai owner-internal progress reporter (Telegram).
 *
 * OWNER-INTERNAL ONLY. Sends a short progress message to the OWNER's own
 * Telegram chat — never to prospects, workers, employers, clients, or public
 * channels. Not outreach, not marketing.
 *
 * Secrets: the bot token + chat id are read from the ENVIRONMENT at run time.
 * They are NEVER hardcoded here, never printed, never logged, never committed.
 * This file contains no secret. Provide the credentials by exporting them in
 * the shell (e.g. source the owner's existing automation .env), preferring
 * labourmarket.ai-scoped vars and falling back to the existing owner bot:
 *
 *   LMAI_TELEGRAM_BOT_TOKEN  || AGENTAI_TELEGRAM_BOT_TOKEN
 *   LMAI_TELEGRAM_CHAT_ID    || AGENTAI_TELEGRAM_CHAT_ID
 *
 * Usage:
 *   # creds already in the environment:
 *   node scripts/telegram-report.mjs "[Labourmarket.ai] Step X/Y — STATUS — detail"
 *   # or load the owner's existing automation env file in-process (BOM/CRLF safe):
 *   node scripts/telegram-report.mjs --env-file <path-to-.env.local> "…message…"
 *
 * Status vocabulary: STARTED | PR_OPENED | CI_WAITING | MERGE_GATE | MERGED |
 *   DEPLOYED | BLOCKED | COMPLETED.
 */

import { readFileSync } from "node:fs";

// Optional: load the owner's existing automation env file IN-PROCESS (BOM/CRLF
// safe), so credentials never pass through the shell or get printed. Path comes
// from `--env-file <path>` or LMAI_TELEGRAM_ENV_FILE. Values are read into a
// local map and used directly — never logged.
const args = process.argv.slice(2);
let envFile = process.env.LMAI_TELEGRAM_ENV_FILE || "";
const fileIdx = args.indexOf("--env-file");
if (fileIdx !== -1) {
  envFile = args[fileIdx + 1] || "";
  args.splice(fileIdx, 2);
}
const fileEnv = {};
if (envFile) {
  try {
    const raw = readFileSync(envFile, "utf8").replace(/^﻿/, "");
    for (const line of raw.split(/\r?\n/)) {
      const m = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
      if (!m || line.trim().startsWith("#")) continue;
      let v = m[2].trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
        v = v.slice(1, -1);
      }
      fileEnv[m[1]] = v;
    }
  } catch (e) {
    console.error("telegram-report: cannot read --env-file (" + (e?.code ?? "error") + ")");
    process.exit(1);
  }
}

const pick = (...keys) => keys.map((k) => process.env[k] || fileEnv[k]).find(Boolean);
const token = pick("LMAI_TELEGRAM_BOT_TOKEN", "AGENTAI_TELEGRAM_BOT_TOKEN");
const chatId = pick("LMAI_TELEGRAM_CHAT_ID", "AGENTAI_TELEGRAM_CHAT_ID");

const text = args.join(" ").trim();

function fail(msg) {
  // Never include the token in any output.
  console.error("telegram-report: " + msg);
  process.exit(1);
}

if (!text) fail("no message text provided");
if (!token) fail("missing bot token env (LMAI_TELEGRAM_BOT_TOKEN / AGENTAI_TELEGRAM_BOT_TOKEN)");
if (!chatId) fail("missing chat id env (LMAI_TELEGRAM_CHAT_ID / AGENTAI_TELEGRAM_CHAT_ID)");

const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    chat_id: chatId,
    text,
    disable_web_page_preview: true,
  }),
}).catch((e) => {
  // The error message from fetch never contains the token (URL is not echoed by Node here).
  fail("network error: " + (e?.message ?? "unknown"));
});

const json = await res.json().catch(() => ({}));
if (json && json.ok) {
  // Telegram's response carries no token. Print only a safe confirmation.
  console.log(`telegram-report: delivered (message_id=${json.result?.message_id ?? "?"})`);
  process.exit(0);
}
// Telegram error payload contains description + error_code, never the token.
fail(`telegram API rejected: ${json?.error_code ?? "?"} ${json?.description ?? "unknown"}`);
