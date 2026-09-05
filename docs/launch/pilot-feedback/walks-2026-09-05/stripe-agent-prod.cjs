// LIVE Stripe management for the authorized agent — ROUTINE_AGENT_PERMISSION scope only (owner decision 2026-09-05).
// Auth: a LIVE RESTRICTED key (rk_live_…) read from a file OUTSIDE the repository:
//   %USERPROFILE%\.config\labourmarket\stripe-agent.env   containing one line   STRIPE_AGENT_KEY=rk_live_…
// The key is never printed, logged or written anywhere by this script. Output = public object ids + booleans.
// Commands:
//   node stripe-agent-prod.cjs inventory            read-only: product / €99 price / webhook endpoint + events / portal config / tax status
//   node stripe-agent-prod.cjs ensure-product-price  create the Organization product + €99/month EUR tax-exclusive price ONLY if missing (idempotent)
//   node stripe-agent-prod.cjs ensure-portal         create a Customer Portal configuration ONLY if none is active
//   node stripe-agent-prod.cjs events [minutes]      read-only: recent events of the webhook's types (verification after a payment)
// OWNER_APPROVAL_REQUIRED (never done here): webhook endpoint creation (its secret must go straight from the owner into Vercel),
// enabling Stripe Tax (business registration), Vercel env, real payments, refunds, cancellations, deleting anything.
const fs = require("node:fs"), path = require("node:path"), os = require("node:os");
const KEY_FILE = path.join(os.homedir(), ".config", "labourmarket", "stripe-agent.env");
const WEBHOOK_URL = "https://labourmarket.ai/api/billing/webhook";
const PRODUCT_NAME = "LabourMarket.ai — Organization";
const PLAN_KEY = "company_pilot"; // the code registry key behind the €99 ORGANIZATION plan (#1441)
const REQUIRED_EVENTS = [
  "checkout.session.completed", "customer.subscription.created", "customer.subscription.updated",
  "customer.subscription.deleted", "invoice.paid", "invoice.payment_succeeded", "invoice.payment_failed",
  "charge.refunded", "charge.dispute.created", "charge.dispute.closed",
];
const log = (o) => console.log(JSON.stringify(o));
function key() {
  if (!fs.existsSync(KEY_FILE)) { console.error("NO_AGENT_KEY: " + KEY_FILE + " is missing — owner action (see the owner block)"); process.exit(3); }
  const m = fs.readFileSync(KEY_FILE, "utf8").match(/^STRIPE_AGENT_KEY=(\S+)\s*$/m);
  if (!m) { console.error("NO_AGENT_KEY: file present but no STRIPE_AGENT_KEY= line"); process.exit(3); }
  if (!/^rk_live_/.test(m[1])) { console.error("REFUSED: the agent key must be a LIVE RESTRICTED key (rk_live_…), got another shape"); process.exit(3); }
  return m[1];
}
async function api(method, p, form, idem) {
  const headers = { Authorization: "Bearer " + key(), "Stripe-Version": "2024-06-20" };
  let body;
  if (form) { headers["Content-Type"] = "application/x-www-form-urlencoded"; body = new URLSearchParams(flatten(form)).toString(); }
  if (idem) headers["Idempotency-Key"] = idem;
  const r = await fetch("https://api.stripe.com" + p, { method, headers, body });
  const j = await r.json();
  if (!r.ok) { const e = new Error("STRIPE_" + r.status + " " + p + " " + (j.error && (j.error.code || j.error.type)) + ": " + (j.error && j.error.message)); e.status = r.status; throw e; }
  return j;
}
function flatten(obj, prefix = "", out = {}) {
  for (const [k, v] of Object.entries(obj)) {
    const name = prefix ? `${prefix}[${k}]` : k;
    if (Array.isArray(v)) v.forEach((x, i) => (typeof x === "object" ? flatten(x, `${name}[${i}]`, out) : (out[`${name}[${i}]`] = String(x))));
    else if (v && typeof v === "object") flatten(v, name, out);
    else out[name] = String(v);
  }
  return out;
}
async function findProduct() {
  const list = await api("GET", "/v1/products?active=true&limit=100");
  return list.data.find((p) => (p.metadata && p.metadata.plan_key === PLAN_KEY) || p.name === PRODUCT_NAME) || null;
}
async function findPrice(productId) {
  const list = await api("GET", `/v1/prices?active=true&limit=100&product=${productId}`);
  return list.data.find((p) => p.currency === "eur" && p.unit_amount === 9900 && p.recurring && p.recurring.interval === "month" && p.recurring.interval_count === 1) || null;
}
async function inventory() {
  const product = await findProduct();
  const price = product ? await findPrice(product.id) : null;
  const hooks = await api("GET", "/v1/webhook_endpoints?limit=100");
  const hook = hooks.data.find((h) => h.url === WEBHOOK_URL) || null;
  const missingEvents = hook ? REQUIRED_EVENTS.filter((e) => !(hook.enabled_events.includes("*") || hook.enabled_events.includes(e))) : REQUIRED_EVENTS;
  const portals = await api("GET", "/v1/billing_portal/configurations?limit=20");
  const portal = portals.data.find((c) => c.active && c.is_default) || portals.data.find((c) => c.active) || null;
  let tax = null;
  try { const t = await api("GET", "/v1/tax/settings"); tax = { status: t.status, taxBehavior: t.defaults && t.defaults.tax_behavior, headOffice: !!(t.head_office && t.head_office.address && t.head_office.address.country) }; }
  catch (e) { tax = { unavailable: e.message.slice(0, 120) }; }
  const acct = await api("GET", "/v1/account").catch((e) => ({ id: null, note: e.message.slice(0, 80) }));
  return {
    account: acct.id || null, livemode: acct.charges_enabled !== undefined ? { chargesEnabled: acct.charges_enabled, payoutsEnabled: acct.payouts_enabled, country: acct.country, defaultCurrency: acct.default_currency } : acct.note,
    product: product ? { id: product.id, name: product.name, planKey: product.metadata && product.metadata.plan_key } : null,
    price: price ? { id: price.id, unitAmount: price.unit_amount, currency: price.currency, interval: price.recurring.interval, taxBehavior: price.tax_behavior } : null,
    webhook: hook ? { id: hook.id, status: hook.status, apiVersion: hook.api_version, events: hook.enabled_events.length, missingEvents } : { missing: true, missingEvents },
    portal: portal ? { id: portal.id, isDefault: portal.is_default, cancel: portal.features && portal.features.subscription_cancel && portal.features.subscription_cancel.enabled, invoices: portal.features && portal.features.invoice_history && portal.features.invoice_history.enabled } : null,
    tax,
  };
}
async function ensureProductPrice() {
  let product = await findProduct();
  if (!product) {
    product = await api("POST", "/v1/products", { name: PRODUCT_NAME, description: "Organization plan — up to 10 active workforce needs, monthly", metadata: { plan_key: PLAN_KEY, source: "labourmarket.ai agent 2026-09-05" }, tax_code: "txcd_10103001" }, "lm_product_company_pilot_v1");
    log({ step: "product_created", id: product.id });
  } else log({ step: "product_exists", id: product.id });
  let price = await findPrice(product.id);
  if (!price) {
    price = await api("POST", "/v1/prices", { product: product.id, currency: "eur", unit_amount: 9900, recurring: { interval: "month", interval_count: 1 }, tax_behavior: "exclusive", nickname: "Organization €99/month", metadata: { plan_key: PLAN_KEY } }, "lm_price_company_pilot_9900_v1");
    log({ step: "price_created", id: price.id });
  } else log({ step: "price_exists", id: price.id, taxBehavior: price.tax_behavior });
  return { productId: product.id, priceId: price.id, env: { STRIPE_PRICE_COMPANY_PILOT: price.id } };
}
async function ensurePortal() {
  const portals = await api("GET", "/v1/billing_portal/configurations?limit=20");
  const existing = portals.data.find((c) => c.active);
  if (existing) { log({ step: "portal_exists", id: existing.id, isDefault: existing.is_default }); return { portalId: existing.id }; }
  const c = await api("POST", "/v1/billing_portal/configurations", {
    business_profile: { headline: "LabourMarket.ai — organization account", privacy_policy_url: "https://labourmarket.ai/lt/privacy", terms_of_service_url: "https://labourmarket.ai/lt/terms" },
    features: {
      invoice_history: { enabled: true },
      payment_method_update: { enabled: true },
      customer_update: { enabled: true, allowed_updates: ["address", "tax_id", "email", "name"] },
      subscription_cancel: { enabled: true, mode: "at_period_end", proration_behavior: "none" },
    },
  }, "lm_portal_config_v1");
  log({ step: "portal_created", id: c.id, isDefault: c.is_default });
  return { portalId: c.id };
}
async function events(minutes) {
  const since = Math.floor(Date.now() / 1000) - minutes * 60;
  const list = await api("GET", `/v1/events?limit=50&created[gte]=${since}`);
  return list.data.filter((e) => REQUIRED_EVENTS.includes(e.type)).map((e) => ({ id: e.id, type: e.type, created: new Date(e.created * 1000).toISOString(), object: e.data && e.data.object && e.data.object.id, delivered: e.pending_webhooks === 0 }));
}
(async () => {
  const cmd = process.argv[2] || "inventory";
  if (cmd === "inventory") log({ inventory: await inventory() });
  else if (cmd === "ensure-product-price") log(await ensureProductPrice());
  else if (cmd === "ensure-portal") log(await ensurePortal());
  else if (cmd === "events") log({ events: await events(Number(process.argv[3] || 60)) });
  else { console.error("unknown command"); process.exit(2); }
})().catch((e) => { console.error("STRIPE_AGENT_FAILED " + (e.message || e).toString().replace(/rk_live_\S+/g, "rk_live_***")); process.exit(1); });
