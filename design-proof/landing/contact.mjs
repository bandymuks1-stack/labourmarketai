// node contact.mjs <outfile> <cols> <scale 0-1> <files...>   (builds a contact sheet)
import { createRequire } from "node:module"; const sharp = createRequire(import.meta.url)("../../node_modules/sharp");
const [out, colsS, scaleS, ...files] = process.argv.slice(2);
const cols = +colsS, scale = +scaleS;
const metas = await Promise.all(files.map((f) => sharp(f).metadata()));
const cw = Math.round(metas[0].width * scale), ch = Math.round(metas[0].height * scale);
const rows = Math.ceil(files.length / cols);
const gap = 8;
const bufs = await Promise.all(files.map((f) => sharp(f).resize(cw, ch, { fit: "fill" }).toBuffer()));
await sharp({ create: { width: cols * cw + (cols + 1) * gap, height: rows * ch + (rows + 1) * gap, channels: 3, background: "#1a1a17" } })
  .composite(bufs.map((input, i) => ({ input, left: gap + (i % cols) * (cw + gap), top: gap + Math.floor(i / cols) * (ch + gap) })))
  .png()
  .toFile(out);
console.log("wrote", out);
