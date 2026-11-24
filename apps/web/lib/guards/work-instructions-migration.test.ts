import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Migration/security guard for Work Instructions v1 (migration 20260608150000).
 * Pins: additive + reversible, RLS reuse (no loosening), owner-scoped +
 * relationship-gated SECURITY DEFINER sender, never PUBLIC/anon execute, and the
 * original message is never overwritten.
 */

const repo = join(__dirname, "..", "..", "..", "..");
const sql = readFileSync(
  join(repo, "supabase", "migrations", "20260608150000_work_instructions.sql"),
  "utf8",
);
const code = sql.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/--[^\n]*/g, " ");

describe("work-instructions migration is additive + reversible", () => {
  it("adds instruction columns with IF NOT EXISTS (additive)", () => {
    for (const col of [
      "is_instruction",
      "original_language",
      "target_language",
      "translated_text",
      "translation_status",
      "is_clarification_request",
    ]) {
      expect(sql).toMatch(new RegExp(`add column if not exists ${col}\\b`, "i"));
    }
  });
  it("performs no destructive op in executable SQL", () => {
    expect(code).not.toMatch(/drop\s+table/i);
    expect(code).not.toMatch(/drop\s+column/i);
    expect(code).not.toMatch(/truncate|delete\s+from/i);
  });
  it("ships a documented rollback path", () => {
    expect(sql).toMatch(/ROLLBACK \(reversible\)/);
    expect(sql).toMatch(/drop function if exists public\.send_work_instruction/i);
  });
});

describe("the sender RPC is owner-scoped, relationship-gated, never public", () => {
  it("is SECURITY DEFINER with a fixed search_path", () => {
    expect((code.match(/^\s*security definer\s*$/gim) ?? []).length).toBe(1);
    expect((code.match(/^\s*set search_path = public\s*$/gim) ?? []).length).toBe(1);
  });
  it("scopes the author to the caller (auth.uid())", () => {
    expect(code).toMatch(/uid\s+uuid\s*:=\s*auth\.uid\(\)/i);
    // the instruction message is authored by the caller (uid), not an arbitrary id
    expect(code).toMatch(/values \(conv_id, uid,/i);
    expect(code).toMatch(/\bauthor_id\b/);
  });
  it("relationship-gates instruction creation to managed workers (or admin)", () => {
    expect(code).toMatch(/owns_company\(/i);
    expect(code).toMatch(/owns_agency\(/i);
    expect(code).toMatch(/status = 'active'/i);
    expect(code).toMatch(/Not authorized to instruct this worker/i);
  });
  it("never grants PUBLIC/anon execute (revoke from public, grant authenticated)", () => {
    expect(code).toMatch(/revoke all\s+on function public\.send_work_instruction[\s\S]*from public/i);
    expect(code).toMatch(/grant execute\s+on function public\.send_work_instruction[\s\S]*to authenticated/i);
    expect(code).not.toMatch(/grant[\s\S]{0,120}?to\s+(anon|public)\b/i);
  });
  it("never overwrites the original message body", () => {
    // No UPDATE of conversation_messages.body anywhere.
    expect(code).not.toMatch(/update public\.conversation_messages[\s\S]*set[\s\S]*body\s*=/i);
  });
  it("does not loosen RLS (no using(true) / to anon / new broad grants)", () => {
    expect(code).not.toMatch(/using\s*\(\s*true\s*\)/i);
    expect(code).not.toMatch(/\bto\s+anon\b/i);
  });
});
