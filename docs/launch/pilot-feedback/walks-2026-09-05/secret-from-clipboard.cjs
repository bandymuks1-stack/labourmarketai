// Secure single-value intake: the owner copies ONE value to the Windows clipboard; this script reads the clipboard,
// checks the shape the code contract requires, writes/updates the line in %USERPROFILE%\.config\labourmarket\vercel-billing.env,
// then clears the clipboard. Nothing is printed except the name, the shape verdict and the length.
//   node secret-from-clipboard.cjs STRIPE_SECRET_KEY | STRIPE_WEBHOOK_SECRET | NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
const { spawnSync } = require("node:child_process"), fs = require("node:fs"), path = require("node:path"), os = require("node:os");
const FILE = path.join(os.homedir(), ".config", "labourmarket", "vercel-billing.env");
const SHAPES = { STRIPE_SECRET_KEY: /^(rk|sk)_live_[A-Za-z0-9]{16,}$/, STRIPE_WEBHOOK_SECRET: /^whsec_[A-Za-z0-9]{16,}$/, NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: /^pk_live_[A-Za-z0-9]{16,}$/ };
const name = process.argv[2];
if (!SHAPES[name]) { console.error("usage: node secret-from-clipboard.cjs <" + Object.keys(SHAPES).join("|") + ">"); process.exit(2); }
const ps = (cmd) => spawnSync("powershell", ["-NoProfile", "-NonInteractive", "-Command", cmd], { encoding: "utf8" });
const r = ps("Get-Clipboard -Raw");
const value = (r.stdout || "").replace(/^﻿/, "").trim();
const ok = SHAPES[name].test(value);
if (!ok) { console.log(JSON.stringify({ name, shapeOk: false, length: value.length, hint: "clipboard does not hold a value of the required shape; nothing written" })); process.exit(3); }
fs.mkdirSync(path.dirname(FILE), { recursive: true });
let txt = fs.existsSync(FILE) ? fs.readFileSync(FILE, "utf8") : "";
const line = name + "=" + value;
txt = new RegExp("^" + name + "=.*$", "m").test(txt) ? txt.replace(new RegExp("^" + name + "=.*$", "m"), line) : txt.replace(/\s*$/, "\n") + line + "\n";
fs.writeFileSync(FILE, txt, { mode: 0o600 });
ps("Set-Clipboard -Value ' '");
const present = Object.keys(SHAPES).filter((k) => new RegExp("^" + k + "=", "m").test(txt));
console.log(JSON.stringify({ name, shapeOk: true, length: value.length, written: true, clipboardCleared: true, fileNowHas: present }));
