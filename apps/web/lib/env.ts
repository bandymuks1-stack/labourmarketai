import { z } from "zod";

/**
 * Validated environment (principle: validate env at boot).
 *
 * The Supabase URL is public and defaults to the project's literal value so
 * local/CI builds pass without secrets. The anon/service/DB secrets are
 * optional at build time but REQUIRED in production — they are provided via
 * Vercel environment variables and `.env.local`, never committed.
 */
const schema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z
    .string()
    .url()
    .default("https://gorgitwvdzxbnaxhrsrw.supabase.co"),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1).optional(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1).optional(),
  SUPABASE_DB_PASSWORD: z.string().min(1).optional(),
  NEXT_PUBLIC_SHOW_PLACEHOLDER_MARKERS: z
    .enum(["true", "false"])
    .default("true"),
});

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  console.error(
    "Invalid environment variables:",
    parsed.error.flatten().fieldErrors,
  );
  throw new Error("Invalid environment configuration — see .env.example");
}

export const env = parsed.data;

/** Server-only: throws if a required production secret is missing. */
export function requireServerSecrets() {
  const missing: string[] = [];
  if (!env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
    missing.push("NEXT_PUBLIC_SUPABASE_ANON_KEY");
  if (!env.SUPABASE_SERVICE_ROLE_KEY)
    missing.push("SUPABASE_SERVICE_ROLE_KEY");
  if (missing.length > 0) {
    throw new Error(
      `Missing required server secrets: ${missing.join(", ")}. ` +
        "Set them in Vercel env / .env.local (see .env.example).",
    );
  }
}
