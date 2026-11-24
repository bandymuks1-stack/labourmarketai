import "server-only";
/**
 * Answer Engine — IndexNow adapter (server-only, Wave 1).
 *
 * A safe, dormant adapter. The key is read from a SERVER-ONLY env var; there is
 * NO hardcoded key and this module can never reach the client bundle (the
 * `server-only` import throws if it does). It submits nothing without a real
 * owner key, never mass-submits on deploy, and never throws — a failure here can
 * never block publishing.
 */

const ENDPOINT = "https://api.indexnow.org/indexnow";

/** Present only when the owner has provisioned a key (server env). */
export function indexNowKey(): string | null {
  const k = process.env.INDEXNOW_KEY;
  return typeof k === "string" && k.trim().length > 0 ? k.trim() : null;
}

export function isIndexNowConfigured(): boolean {
  return indexNowKey() !== null;
}

/**
 * Submit up to a small batch of already-PUBLISHED URLs to IndexNow. No-op (and
 * returns { submitted: false }) when no key is configured. Never throws.
 * Callers must pass only indexable, published URLs — this adapter does not crawl
 * or mass-enumerate.
 */
export async function submitIndexNow(
  urls: readonly string[],
): Promise<{ submitted: boolean; reason?: string }> {
  const key = indexNowKey();
  if (!key) return { submitted: false, reason: "no_key" };
  if (urls.length === 0) return { submitted: false, reason: "no_urls" };
  const host = "labourmarket.ai";
  try {
    const res = await fetch(ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        host,
        key,
        keyLocation: `https://${host}/${key}.txt`,
        urlList: urls.slice(0, 200),
      }),
    });
    return { submitted: res.ok, reason: res.ok ? undefined : `status_${res.status}` };
  } catch {
    // Failure must never block publishing.
    return { submitted: false, reason: "request_failed" };
  }
}
