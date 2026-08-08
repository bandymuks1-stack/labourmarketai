import { chromium } from "@playwright/test";
const BASE = "http://127.0.0.1:3450";
const EMAIL = process.env.UX_EMAIL ?? "dev.worker@local.test";
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
await p.goto(`${BASE}/lt/auth/login`, { waitUntil: "load" });
await p.waitForTimeout(3500);
await p.fill('input[type="email"]', EMAIL);
await p.fill('input[type="password"]', "password");
await p.click('button[type="submit"]');
await p.waitForURL(/dashboard/, { timeout: 90000 });
await p.goto(`${BASE}/lt/dashboard`, { waitUntil: "domcontentloaded" });
await p.waitForTimeout(6000);

const before = await p.evaluate(() => ({
  anchors: [...document.querySelectorAll("a")].map((a) => `${a.textContent.trim().slice(0, 30)} -> ${a.getAttribute("href")}`),
  buttons: [...document.querySelectorAll("button")].map((x) => (x.textContent.trim() || x.getAttribute("aria-label") || "?").slice(0, 40)),
}));
console.log("ANCHORS ON /dashboard:", JSON.stringify(before.anchors, null, 1));
console.log("BUTTONS ON /dashboard:", JSON.stringify(before.buttons));

// open the account menu
await p.click('[data-testid="account-menu-trigger"]').catch(() => {});
await p.waitForTimeout(1200);
const menu = await p.evaluate(() => [...document.querySelectorAll("a,button")].map((a) => `${(a.textContent || "").trim().slice(0, 34)}${a.tagName === "A" ? " -> " + a.getAttribute("href") : " [btn]"}`));
console.log("AFTER ACCOUNT MENU:", JSON.stringify(menu, null, 1));

// open the command search
await p.keyboard.press("Escape");
await p.waitForTimeout(400);
await p.click('[data-testid="chat-command-search"]').catch(() => {});
await p.waitForTimeout(1500);
const search = await p.evaluate(() => ({
  dialogs: document.querySelectorAll('[role="dialog"]').length,
  text: (document.querySelector('[role="dialog"]')?.innerText || document.body.innerText).slice(0, 900),
}));
console.log("SEARCH:", JSON.stringify(search, null, 1));
await b.close();
