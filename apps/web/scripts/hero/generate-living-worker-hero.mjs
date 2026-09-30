#!/usr/bin/env node
// LIVING WORKER HERO — media pipeline (owner 2026-09-29: two persistent
// photorealistic sample personas, identity fully consistent through their own
// working life; Gemini image edits on the project's existing Gemini account).
//
// IDENTITY ANCHOR. Each persona has ONE base photograph. Every stage is an
// EDIT of that same base photograph (plus the previous stage as a continuity
// reference), with an instruction that changes only clothing, tool, place,
// light and — for the later stages — a few natural years. The face is never
// described again; it is carried by the reference image.
//
// THESE ARE FICTIONAL SAMPLE PEOPLE. The prompts ask for an original person
// who resembles no real individual; the landing labels them "Pavyzdys" /
// "Sample" exactly as the current sample persona is labelled.
//
// Usage (from apps/web, with GEMINI_API_KEY in .env.local — never in chat):
//   set -a && . ./.env.local && set +a
//   node scripts/hero/generate-living-worker-hero.mjs [--persona tomas|rasa] [--from <stage>] [--model <id>]
// Output: public/hero/<persona>/<nn>-<stage>-{1920,960}.webp and
//         lib/marketing/living-worker-hero.manifest.json (what exists).
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import sharp from "sharp";

const WEB = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const RAW = join(tmpdir(), "lm-living-worker-hero-raw");
const PUBLIC = join(WEB, "public", "hero");
const MANIFEST = join(WEB, "lib", "marketing", "living-worker-hero.manifest.json");

const args = process.argv.slice(2);
const arg = (name, fallback = null) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : fallback;
};
const MODEL = arg("model", "gemini-3-pro-image");
const ONLY = arg("persona");
const FROM = arg("from");
const KEY = process.env.GEMINI_API_KEY;
if (!KEY) {
  console.error("GEMINI_API_KEY is not set (add it to apps/web/.env.local; never paste it in chat).");
  process.exit(2);
}

const LOOK =
  "Photorealistic, premium cinematic commercial photography, natural skin texture, real fabric, real tools, " +
  "soft motivated light with gentle falloff, subtle film grain, 50mm lens at eye level, shallow depth of field. " +
  "Composition: the person stands in the CENTRAL THIRD of a 3:2 frame, head near the upper third, full figure " +
  "or knees-up, generous space left and right. Colour: deep obsidian shadows, warm ivory highlights, a restrained " +
  "warm-gold accent only where light naturally falls. No text, no logos, no brand marks, no watermarks, no flags. " +
  "Clothing is plain: no embroidered or printed names, titles, words or badges on any garment or helmet.";

const KEEP =
  "This is the SAME person as in the reference photograph: keep the face, facial structure, skin, eyes, hair colour " +
  "and hairline, body proportions and identity exactly the same. Change only what is described.";

/** @type {Record<string, {name: string, base: string, stages: {key: string, edit: string}[]}>} */
const PERSONAS = {
  tomas: {
    name: "Tomas K.",
    base:
      "An original, fictional Lithuanian man, about 29 years old, fit working build, short dark-blond hair, light " +
      "stubble, calm confident expression, looking slightly off-camera. Plain charcoal work t-shirt and dark work " +
      "trousers, work boots. Standing relaxed in a dark, softly lit studio with a warm rim light. He must not resemble " +
      "any real public figure.",
    stages: [
      { key: "tool", edit: "He now holds a scaffolder's ratchet spanner in his right hand and wears a scaffolding safety harness, a high-visibility orange vest and work gloves; a white helmet in his left hand. Same dark studio." },
      { key: "site-lt", edit: "He is working on a scaffolding platform on the facade of a historic building in Vilnius old town, helmet on, harness clipped, morning light, the street far below softly out of focus." },
      { key: "van", edit: "Early morning at the site: he stands beside a dark grey unbranded work van with its side door open, scaffold tubes on the roof rack, helmet in hand, first sunlight." },
      { key: "country-no", edit: "He now works in Norway: a construction site above a fjord near Bergen, wooden houses and mountains far behind in soft mist, light rain, he wears a dark rain shell over the hi-vis vest." },
      { key: "specialist", edit: "Three years later — the same man, a few natural years older, a little more weathered, slight grey at the temples. An experienced construction specialist on a site in Stockholm, reading construction drawings on a clipboard, professional high-end workwear, helmet on." },
      { key: "foreman", edit: "Now a team leader on a large site in Sweden: he holds a rugged tablet and directs the work; behind him a crew of four workers in matching workwear at work, softly out of focus. Evening light." },
      { key: "owner", edit: "About eight years after the first photo — the same man, naturally older, now the owner of his own construction company. Smart-casual: dark quilted vest over a white shirt. He stands in his site office in front of a large table with building plans; through the window several active construction sites; two of his team leaders beside the table, softly out of focus." },
    ],
  },
  rasa: {
    name: "Rasa J.",
    base:
      "An original, fictional Lithuanian woman, about 27 years old, shoulder-length chestnut hair, natural make-up, " +
      "warm confident expression, looking slightly off-camera. Plain dark knit top and dark trousers. Standing relaxed " +
      "in a dark, softly lit studio with a warm rim light. She must not resemble any real public figure.",
    stages: [
      { key: "tool", edit: "She now holds a professional prep knife and a wooden cutting board, wears a crisp white kitchen apron over a white shirt, hair tied back. Same dark studio." },
      { key: "kitchen-lt", edit: "She works at the prep station of a busy restaurant kitchen in Vilnius, chopping vegetables, steel surfaces and warm pass lights behind her softly out of focus." },
      { key: "car", edit: "Early morning: she stands beside a small dark hatchback car with a knife roll bag over her shoulder, in front of a restaurant back entrance, first sunlight." },
      { key: "country-no", edit: "She now works in Norway: the pass of a refined Nordic restaurant in Oslo, pale wood, large windows onto the harbour, she wears a chef's jacket and plates a dish." },
      { key: "cook", edit: "Three years later — the same woman, a few natural years older. A professional cook in a black chef's jacket at the stove of an Oslo restaurant kitchen, confident, plating with tweezers." },
      { key: "head-chef", edit: "Now head chef: she leads her brigade, standing at the pass giving calm direction; behind her four cooks in matching jackets at work, softly out of focus." },
      { key: "owner", edit: "About eight years after the first photo — the same woman, naturally older, now the owner of her own restaurant. A tailored dark jacket over a chef's shirt. She stands in her own dining room before service with a floor plan and next week's schedule on the table; two of her team leads beside her, softly out of focus." },
    ],
  },
};

async function generate(parts) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;
  for (let attempt = 1; attempt <= 3; attempt++) {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": KEY },
      body: JSON.stringify({
        contents: [{ role: "user", parts }],
        generationConfig: { responseModalities: ["IMAGE"], imageConfig: { aspectRatio: "3:2", imageSize: "2K" } },
      }),
    });
    if (!res.ok) {
      const text = await res.text();
      console.error(`  attempt ${attempt}: HTTP ${res.status} ${text.slice(0, 300)}`);
      if (res.status === 429 || res.status >= 500) {
        await new Promise((r) => setTimeout(r, 4000 * attempt));
        continue;
      }
      throw new Error(`generation failed: HTTP ${res.status}`);
    }
    const json = await res.json();
    const img = json.candidates?.[0]?.content?.parts?.find((p) => p.inlineData || p.inline_data);
    const data = img?.inlineData?.data ?? img?.inline_data?.data;
    if (data) return Buffer.from(data, "base64");
    console.error(`  attempt ${attempt}: no image in response (${JSON.stringify(json).slice(0, 200)})`);
  }
  throw new Error("generation failed after retries");
}

const asPart = (buf) => ({ inline_data: { mime_type: "image/png", data: buf.toString("base64") } });

async function publish(persona, index, key, raw) {
  const dir = join(PUBLIC, persona);
  mkdirSync(dir, { recursive: true });
  const stem = `${String(index).padStart(2, "0")}-${key}`;
  for (const w of [1920, 960]) {
    await sharp(raw).resize({ width: w }).webp({ quality: w > 1000 ? 80 : 76 }).toFile(join(dir, `${stem}-${w}.webp`));
  }
  const { width, height } = await sharp(raw).metadata();
  return { key, stem, width, height };
}

mkdirSync(RAW, { recursive: true });
const manifest = existsSync(MANIFEST) ? JSON.parse(readFileSync(MANIFEST, "utf8")) : { personas: {} };

for (const [id, persona] of Object.entries(PERSONAS)) {
  if (ONLY && ONLY !== id) continue;
  console.log(`\n== ${persona.name} (${id}) with ${MODEL}`);
  const rawPath = (key) => join(RAW, `${id}-${key}.png`);
  const stages = [{ key: "base", edit: null }, ...persona.stages];
  const startAt = FROM ? stages.findIndex((s) => s.key === FROM) : 0;
  const out = manifest.personas[id]?.stages?.slice(0, Math.max(0, startAt)) ?? [];

  let base = existsSync(rawPath("base")) && startAt > 0 ? readFileSync(rawPath("base")) : null;
  let previous = startAt > 0 && existsSync(rawPath(stages[startAt - 1].key)) ? readFileSync(rawPath(stages[startAt - 1].key)) : base;

  for (let i = Math.max(0, startAt); i < stages.length; i++) {
    const stage = stages[i];
    process.stdout.write(`  ${i} ${stage.key} … `);
    const raw =
      stage.edit === null
        ? await generate([{ text: `${persona.base}\n\n${LOOK}` }])
        : await generate([
            { text: `${KEEP}\n\nEdit: ${stage.edit}\n\n${LOOK}\n\nThe first image is the identity reference (the person). The second image is the previous moment of the same person's working life, for continuity of light and framing.` },
            asPart(base),
            asPart(previous),
          ]);
    writeFileSync(rawPath(stage.key), raw);
    if (stage.edit === null) base = raw;
    previous = raw;
    out.push(await publish(id, i, stage.key, raw));
    console.log("ok");
  }
  manifest.personas[id] = { name: persona.name, model: MODEL, stages: out };
  writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2) + "\n");
}
console.log(`\nmanifest → ${MANIFEST}\nraw originals (not committed) → ${RAW}`);
