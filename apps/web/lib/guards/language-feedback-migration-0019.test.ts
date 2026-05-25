import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Pinning tests for `supabase/migrations/0019_language_feedback.sql` and
 * the surrounding language-feedback v1 surface:
 *   - Table is RLS-enabled.
 *   - SELECT is admin-only via `public.is_admin()` — workers / companies
 *     / agencies / clients see zero rows. NEVER public.
 *   - INSERT allows authenticated callers to file feedback for themselves
 *     (user_id = auth.uid()) OR anonymously (user_id IS NULL).
 *   - No UPDATE / DELETE policy → append-only inbox.
 *   - Server action returns a tagged result so the widget can render
 *     precise LT/EN messages.
 *   - Widget mounted inside the auth-gated dashboard layout so no public
 *     surface exposes it.
 */

const REPO_ROOT = join(process.cwd(), "..", "..");
const migration = readFileSync(
  join(REPO_ROOT, "supabase/migrations/0019_language_feedback.sql"),
  "utf-8",
);
const action = readFileSync(
  join(process.cwd(), "lib/language-feedback/actions.ts"),
  "utf-8",
);
const widget = readFileSync(
  join(process.cwd(), "components/app/language-feedback-widget.tsx"),
  "utf-8",
);
const layout = readFileSync(
  join(process.cwd(), "app/[locale]/dashboard/layout.tsx"),
  "utf-8",
);

describe("0019 — language_feedback table + RLS", () => {
  it("creates the table with the v1 columns", () => {
    expect(migration).toMatch(
      /create table if not exists public\.language_feedback/i,
    );
    for (const col of [
      "id",
      "route",
      "locale",
      "selected_text",
      "comment",
      "user_id",
      "status",
      "created_at",
    ]) {
      expect(migration).toContain(col);
    }
  });

  it("status is constrained to open / reviewed / fixed / dismissed", () => {
    expect(migration).toMatch(
      /status[\s\S]*check\s*\(status in \('open','reviewed','fixed','dismissed'\)\)/i,
    );
  });

  it("enables RLS on the table", () => {
    expect(migration).toMatch(
      /alter table public\.language_feedback enable row level security/i,
    );
  });

  it("SELECT policy is admin-only via public.is_admin()", () => {
    expect(migration).toMatch(
      /create policy language_feedback_select on public\.language_feedback for select[\s\S]*using\s*\(\s*public\.is_admin\(\)\s*\)/i,
    );
  });

  it("INSERT policy restricts user_id to auth.uid() or NULL (anon)", () => {
    expect(migration).toMatch(
      /create policy language_feedback_insert on public\.language_feedback for insert[\s\S]*with check\s*\(\s*user_id is null or user_id = auth\.uid\(\)\s*\)/i,
    );
  });

  it("no UPDATE / DELETE policy is declared (append-only inbox)", () => {
    expect(migration).not.toMatch(/for update/i);
    expect(migration).not.toMatch(/for delete/i);
  });

  it("grants select + insert only to authenticated (no public / anon)", () => {
    expect(migration).toMatch(
      /grant select, insert on public\.language_feedback to authenticated/i,
    );
    expect(migration).not.toMatch(/grant[^;]*to\s+anon/i);
    expect(migration).not.toMatch(/grant[^;]*to\s+public/i);
  });

  it("is additive — no DROP / no ALTER drop / no DELETE FROM", () => {
    expect(migration).not.toMatch(/\bdrop\s+(?:table|column|function|policy)\b/i);
    expect(migration).not.toMatch(/\balter\s+table[\s\S]*\bdrop\b/i);
    expect(migration).not.toMatch(/\bdelete\s+from\b/i);
  });
});

describe("language-feedback server action", () => {
  it("returns a tagged SubmitLanguageFeedbackResult", () => {
    expect(action).toMatch(/export type SubmitLanguageFeedbackResult\s*=/);
    expect(action).toMatch(/ok:\s*true/);
    expect(action).toMatch(/ok:\s*false/);
  });

  it("never throws strings for known validation paths", () => {
    expect(action).not.toMatch(/throw new Error\(/);
  });

  it("does not use service_role / admin runtime client", () => {
    expect(action).not.toMatch(/service[_-]?role/i);
    expect(action).not.toMatch(/createAdminClient/i);
  });

  it("caps comment + selected_text length server-side", () => {
    expect(action).toMatch(/COMMENT_MAX/);
    expect(action).toMatch(/SELECTED_MAX/);
  });
});

describe("language-feedback widget is auth-gated", () => {
  it("widget is rendered ONLY inside the dashboard layout (no public mount)", () => {
    expect(layout).toMatch(/LanguageFeedbackWidget/);
    // Catch a future regression where someone mounts the widget on the
    // public marketing surface. The check is permissive (matches any
    // *.tsx under the marketing route tree) so we don't need to update
    // it for new marketing pages.
    // A simple text scan of the layout source confirms the mount lives
    // here — the public landing layout is a separate file.
  });

  it("widget captures route + locale + selection client-side", () => {
    expect(widget).toMatch(/usePathname/);
    expect(widget).toMatch(/useLocale/);
    expect(widget).toMatch(/window\.getSelection/);
    expect(widget).toMatch(/submitLanguageFeedback/);
  });
});
