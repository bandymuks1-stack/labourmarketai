import {
  describeConfigProblem,
  readClientConfig,
  type ClientConfig,
  type ConfigResult,
} from "@labourmarket/client-core";

/**
 * This build's configuration.
 *
 * `EXPO_PUBLIC_*` variables are INLINED into the JavaScript bundle at build
 * time, so they must be referenced statically — `process.env[name]` with a
 * computed name reads nothing on a device. That constraint is the reason each
 * one is written out below rather than looped over.
 *
 * The validation, including the refusal of an RLS-bypassing key, lives in
 * `@labourmarket/client-core` so that the web client and a future MCP server
 * get the same answer to "is this configuration usable?".
 */
export const CONFIG_RESULT: ConfigResult = readClientConfig({
  supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL,
  supabaseAnonKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
  apiBaseUrl: process.env.EXPO_PUBLIC_API_BASE_URL,
});

export const CONFIG: ClientConfig | null = CONFIG_RESULT.ok
  ? CONFIG_RESULT.config
  : null;

/**
 * Lines for the misconfiguration screen.
 *
 * A build with no Supabase key renders an honest, specific message instead of
 * crashing on a white screen — the same degradation rule the web app follows,
 * and the difference between "someone forgot to set the key" and "the app is
 * broken" for whoever is holding the phone.
 */
export const CONFIG_PROBLEMS: readonly string[] = CONFIG_RESULT.ok
  ? []
  : CONFIG_RESULT.problems.map(describeConfigProblem);
