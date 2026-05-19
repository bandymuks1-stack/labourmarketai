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

/**
 * Public (URL + anon key) Supabase config for the browser/RSC clients.
 * Validated lazily at client-construction time (not module load) so build
 * and SSG succeed without secrets — Vercel injects them at deploy.
 */
export function requireSupabaseClientEnv(): {
  url: string;
  anonKey: string;
} {
  if (!env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_ANON_KEY. Set it in Vercel env / " +
        ".env.local (Supabase Dashboard → Settings → API). See .env.example.",
    );
  }
  return {
    url: env.NEXT_PUBLIC_SUPABASE_URL,
    anonKey: env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  };
}

/** Server-only: validated service-role config for the admin client. */
export function requireSupabaseServiceEnv(): {
  url: string;
  serviceRoleKey: string;
} {
  if (!env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error(
      "Missing SUPABASE_SERVICE_ROLE_KEY. Set it in Vercel env / " +
        ".env.local (Supabase Dashboard → Settings → API). NEVER commit it.",
    );
  }
  return {
    url: env.NEXT_PUBLIC_SUPABASE_URL,
    serviceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY,
  };
}
