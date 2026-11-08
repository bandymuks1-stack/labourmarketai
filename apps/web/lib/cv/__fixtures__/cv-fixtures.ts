/**
 * Test-only CV fixture builders. They synthesize MINIMAL but real PDF and DOCX
 * byte streams in-memory so the extraction tests exercise the actual `unpdf` /
 * `mammoth` parsers WITHOUT committing any binary file to the repo (owner rule:
 * never commit CV files). Not imported by any app code.
 */

function crc32(buf: Uint8Array): number {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return (~c) >>> 0;
}

const enc = (s: string) => new TextEncoder().encode(s);

/** Build a STORED (uncompressed) zip from named entries — enough for a DOCX. */
function storedZip(entries: { name: string; data: Uint8Array }[]): Uint8Array {
  const chunks: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;

  for (const e of entries) {
    const nameBytes = enc(e.name);
    const crc = crc32(e.data);
    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true);
    local.setUint16(4, 20, true); // version needed
    local.setUint16(6, 0, true); // flags
    local.setUint16(8, 0, true); // method: stored
    local.setUint16(10, 0, true); // modtime
    local.setUint16(12, 0, true); // moddate
    local.setUint32(14, crc, true);
    local.setUint32(18, e.data.length, true); // comp size
    local.setUint32(22, e.data.length, true); // uncomp size
    local.setUint16(26, nameBytes.length, true);
    local.setUint16(28, 0, true); // extra len
    const localHeader = new Uint8Array(local.buffer);

    chunks.push(localHeader, nameBytes, e.data);

    const cd = new DataView(new ArrayBuffer(46));
    cd.setUint32(0, 0x02014b50, true);
    cd.setUint16(4, 20, true); // version made by
    cd.setUint16(6, 20, true); // version needed
    cd.setUint16(8, 0, true);
    cd.setUint16(10, 0, true); // method
    cd.setUint16(12, 0, true);
    cd.setUint16(14, 0, true);
    cd.setUint32(16, crc, true);
    cd.setUint32(20, e.data.length, true);
    cd.setUint32(24, e.data.length, true);
    cd.setUint16(28, nameBytes.length, true);
    cd.setUint16(30, 0, true); // extra
    cd.setUint16(32, 0, true); // comment
    cd.setUint16(34, 0, true); // disk
    cd.setUint16(36, 0, true); // internal attrs
    cd.setUint32(38, 0, true); // external attrs
    cd.setUint32(42, offset, true); // local header offset
    central.push(new Uint8Array(cd.buffer), nameBytes);

    offset += localHeader.length + nameBytes.length + e.data.length;
  }

  const cdStart = offset;
  let cdSize = 0;
  for (const c of central) cdSize += c.length;

  const eocd = new DataView(new ArrayBuffer(22));
  eocd.setUint32(0, 0x06054b50, true);
  eocd.setUint16(4, 0, true);
  eocd.setUint16(6, 0, true);
  eocd.setUint16(8, entries.length, true);
  eocd.setUint16(10, entries.length, true);
  eocd.setUint32(12, cdSize, true);
  eocd.setUint32(16, cdStart, true);
  eocd.setUint16(20, 0, true);

  const parts = [...chunks, ...central, new Uint8Array(eocd.buffer)];
  let total = 0;
  for (const p of parts) total += p.length;
  const out = new Uint8Array(total);
  let pos = 0;
  for (const p of parts) {
    out.set(p, pos);
    pos += p.length;
  }
  return out;
}

const xmlEscape = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/**
 * Minimal valid .docx (Office Open XML) carrying `text`.
 *
 * Every LINE of `text` becomes its own `<w:p>`, because that is the only shape
 * mammoth turns back into a newline (`extractRawText` joins paragraphs, not
 * runs). A real CV is a list of lines and `parseCvSections` splits on `
`, so
 * a single-paragraph fixture could only ever prove a one-line CV.
 */
export function makeDocx(text: string): Uint8Array {
  const contentTypes =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
    '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
    '<Default Extension="xml" ContentType="application/xml"/>' +
    '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>' +
    "</Types>";
  const rels =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>' +
    "</Relationships>";
  const paragraphs = text
    .split("\n")
    .map((line) => `<w:p><w:r><w:t xml:space="preserve">${xmlEscape(line)}</w:t></w:r></w:p>`)
    .join("");
  const doc =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">' +
    "<w:body>" +
    paragraphs +
    "</w:body></w:document>";

  return storedZip([
    { name: "[Content_Types].xml", data: enc(contentTypes) },
    { name: "_rels/.rels", data: enc(rels) },
    { name: "word/document.xml", data: enc(doc) },
  ]);
}

/** Minimal single-page PDF (uncompressed content stream) carrying `text`. */
export function makePdf(text: string): Uint8Array {
  // Parenthesise-safe: escape the PDF string delimiters.
  const safe = text.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
  const objects: string[] = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  // Wrap at word boundaries so every glyph stays inside the MediaBox —
  // pdf.js drops text positioned past the page edge, so a single long line
  // would come back truncated from extraction.
  // An explicit newline is a hard break; only over-long lines are re-wrapped.
  const lines: string[] = [];
  for (const source of safe.split("\n")) {
    const words = source.split(" ");
    let cur = "";
    for (const w of words) {
      const next = cur ? `${cur} ${w}` : w;
      if (next.length > 70 && cur) {
        lines.push(cur);
        cur = w;
      } else {
        cur = next;
      }
    }
    lines.push(cur);
  }
  const stream = `BT /F1 12 Tf 14 TL 72 720 Td ${lines
    .map((l) => `(${l}) Tj T*`)
    .join(" ")} ET`;
  const streamObj = `<< /Length ${enc(stream).length} >>\nstream\n${stream}\nendstream`;
  objects.push(streamObj);

  let body = "%PDF-1.4\n";
  const offsets: number[] = [];
  objects.forEach((obj, i) => {
    offsets.push(enc(body).length);
    body += `${i + 1} 0 obj\n${obj}\nendobj\n`;
  });
  const xrefStart = enc(body).length;
  let xref = `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const off of offsets) {
    xref += `${String(off).padStart(10, "0")} 00000 n \n`;
  }
  const trailer = `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`;
  return enc(body + xref + trailer);
}

/** Assemble numbered PDF objects into a file with a correct xref table. */
function assemblePdf(objects: string[]): Uint8Array {
  let body = "%PDF-1.4\n";
  const offsets: number[] = [];
  objects.forEach((obj, i) => {
    offsets.push(enc(body).length);
    body += `${i + 1} 0 obj\n${obj}\nendobj\n`;
  });
  const xrefStart = enc(body).length;
  let xref = `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const off of offsets) xref += `${String(off).padStart(10, "0")} 00000 n \n`;
  const trailer = `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`;
  return enc(body + xref + trailer);
}

const hex4 = (n: number) => n.toString(16).toUpperCase().padStart(4, "0");

/** UTF-16BE hex of a string, as a ToUnicode CMap writes the destination. */
const utf16Hex = (s: string) =>
  [...s]
    .map((ch) => {
      const cp = ch.codePointAt(0) ?? 0;
      if (cp <= 0xffff) return hex4(cp);
      const v = cp - 0x10000;
      return hex4(0xd800 + (v >> 10)) + hex4(0xdc00 + (v & 0x3ff));
    })
    .join("");

/** Adobe glyph names for the letters the `differences` encoding maps. */
const GLYPH_NAMES: Record<string, string> = {
  ą: "aogonek", Ą: "Aogonek", č: "ccaron", Č: "Ccaron", ę: "eogonek", Ę: "Eogonek",
  ė: "edotaccent", Ė: "Edotaccent", į: "iogonek", Į: "Iogonek", š: "scaron", Š: "Scaron",
  ų: "uogonek", Ų: "Uogonek", ū: "umacron", Ū: "Umacron", ž: "zcaron", Ž: "Zcaron",
  "–": "endash", "—": "emdash",
};

/**
 * A PDF whose text is NOT limited to the standard-14 Latin-1 set: the shapes
 * real exporters write for Lithuanian letters, one `text` line per text line.
 *
 * - `encoding: "identity"` (default): a Type0 / Identity-H composite font, two
 *   bytes per glyph, with a `/ToUnicode` CMap saying which character each glyph
 *   is. That is what Word, Chrome and LibreOffice emit, and the CMap is what
 *   every text extractor reads. `form: "NFD"` writes the text decomposed (base
 *   letter and combining mark as separate glyphs, as a macOS-typed or LaTeX PDF
 *   can).
 * - `encoding: "differences"`: a simple font whose `/Encoding /Differences`
 *   names each Lithuanian glyph (`/scaron`, `/eogonek`, ...) with no ToUnicode,
 *   the older producer path, read through the glyph names.
 *
 * The glyph program is not embedded: text extraction never reads outlines, only
 * the encoding and the ToUnicode map, which are complete here.
 */
export function makeUnicodePdf(
  text: string,
  opts: { encoding?: "identity" | "differences"; form?: "NFC" | "NFD" } = {},
): Uint8Array {
  const lines = text.normalize(opts.form ?? "NFC").split("\n");
  const objects: string[] = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
  ];
  const content = (hexLines: string[]) => {
    const stream = `BT /F1 12 Tf 14 TL 72 720 Td ${hexLines.map((h) => `<${h}> Tj T*`).join(" ")} ET`;
    return `<< /Length ${enc(stream).length} >>\nstream\n${stream}\nendstream`;
  };

  if (opts.encoding === "differences") {
    const codes = new Map<string, number>();
    const encoded = lines.map((line) =>
      [...line]
        .map((ch) => {
          const cp = ch.codePointAt(0) ?? 0;
          if (cp >= 0x20 && cp < 0x7f) return cp.toString(16).padStart(2, "0");
          if (!GLYPH_NAMES[ch]) throw new Error(`makeUnicodePdf: no glyph name for U+${hex4(cp)}`);
          if (!codes.has(ch)) codes.set(ch, 0x80 + codes.size);
          return (codes.get(ch) ?? 0).toString(16);
        })
        .join(""),
    );
    const differences = [...codes.entries()].map(([ch, code]) => `${code} /${GLYPH_NAMES[ch]}`).join(" ");
    objects.push(
      "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding << /Type /Encoding " +
        `/BaseEncoding /WinAnsiEncoding /Differences [${differences}] >> >>`,
      content(encoded),
    );
    return assemblePdf(objects);
  }

  // Identity-H: one CID per distinct code point, in order of first use.
  const cids = new Map<string, number>();
  for (const line of lines) for (const ch of line) if (!cids.has(ch)) cids.set(ch, cids.size + 1);
  const encoded = lines.map((line) => [...line].map((ch) => hex4(cids.get(ch) ?? 0)).join(""));
  const bfchar = [...cids.entries()]
    .map(([ch, cid]) => `<${hex4(cid)}> <${utf16Hex(ch)}>`)
    .join("\n");
  const cmap =
    "/CIDInit /ProcSet findresource begin\n12 dict begin\nbegincmap\n" +
    "/CIDSystemInfo << /Registry (Adobe) /Ordering (UCS) /Supplement 0 >> def\n" +
    "/CMapName /QASynthetic-UCS def\n/CMapType 2 def\n" +
    "1 begincodespacerange\n<0000> <FFFF>\nendcodespacerange\n" +
    `${cids.size} beginbfchar\n${bfchar}\nendbfchar\n` +
    "endcmap\nCMapName currentdict /CMap defineresource pop\nend\nend";
  objects.push(
    "<< /Type /Font /Subtype /Type0 /BaseFont /QASyntheticSans /Encoding /Identity-H " +
      "/DescendantFonts [6 0 R] /ToUnicode 7 0 R >>",
    content(encoded),
    "<< /Type /Font /Subtype /CIDFontType2 /BaseFont /QASyntheticSans " +
      "/CIDSystemInfo << /Registry (Adobe) /Ordering (Identity) /Supplement 0 >> " +
      "/FontDescriptor 8 0 R /DW 600 /CIDToGIDMap /Identity >>",
    `<< /Length ${enc(cmap).length} >>\nstream\n${cmap}\nendstream`,
    "<< /Type /FontDescriptor /FontName /QASyntheticSans /Flags 32 /FontBBox [0 -200 1000 900] " +
      "/ItalicAngle 0 /Ascent 900 /Descent -200 /CapHeight 700 /StemV 80 >>",
  );
  return assemblePdf(objects);
}
