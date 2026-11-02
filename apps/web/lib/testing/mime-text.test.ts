import { describe, expect, it } from "vitest";

import { mimeText } from "./mime-text";

const LINK = "https://example.test/auth/v1/verify?token=abcdef0123456789&type=recovery";

describe("mimeText decodes each part by its own transfer encoding", () => {
  it("7bit keeps a link whose query looks like quoted-printable escapes", () => {
    const raw = `Content-Type: text/plain; charset=utf-8\r\nContent-Transfer-Encoding: 7bit\r\n\r\nOpen ${LINK}\r\n`;
    expect(mimeText(raw)).toContain(LINK);
  });

  it("8bit keeps UTF-8 text and the link", () => {
    const raw = Buffer.from(
      `Content-Type: text/plain; charset=utf-8\r\nContent-Transfer-Encoding: 8bit\r\n\r\nAtkurk slaptažodį: ${LINK}\r\n`,
      "utf8",
    ).toString("latin1");
    const text = mimeText(raw);
    expect(text).toContain("slaptažodį");
    expect(text).toContain(LINK);
  });

  it("quoted-printable joins soft breaks and undoes =3D", () => {
    const qp = LINK.replace("=", "=3D").replace("&type=", "&ty=\r\npe=3D");
    const raw = `Content-Type: text/html\r\nContent-Transfer-Encoding: quoted-printable\r\n\r\n<a href=3D"${qp}">x</a>\r\n`;
    expect(mimeText(raw)).toContain(LINK);
  });

  it("base64 is decoded", () => {
    const b64 = Buffer.from(`Link: ${LINK}`, "utf8").toString("base64").replace(/(.{20})/g, "$1\r\n");
    const raw = `Content-Type: text/plain; charset=utf-8\r\nContent-Transfer-Encoding: base64\r\n\r\n${b64}\r\n`;
    expect(mimeText(raw)).toContain(LINK);
  });

  it("multipart/alternative: every text part, each with its own encoding; attachments skipped", () => {
    const b64 = Buffer.from(`<a href="${LINK}">x</a>`, "utf8").toString("base64");
    const raw = [
      'Content-Type: multipart/mixed; boundary="outer"',
      "",
      "--outer",
      'Content-Type: multipart/alternative; boundary="inner"',
      "",
      "--inner",
      "Content-Type: text/plain; charset=utf-8",
      "Content-Transfer-Encoding: 7bit",
      "",
      "plain body without link",
      "--inner",
      "Content-Type: text/html; charset=utf-8",
      "Content-Transfer-Encoding: base64",
      "",
      b64,
      "--inner--",
      "--outer",
      "Content-Type: application/pdf",
      "Content-Transfer-Encoding: base64",
      "",
      Buffer.from("https://evil.test/not-a-text-part").toString("base64"),
      "--outer--",
      "",
    ].join("\r\n");
    const text = mimeText(raw);
    expect(text).toContain("plain body without link");
    expect(text).toContain(LINK);
    expect(text).not.toContain("evil.test");
  });

  it("no encoding header defaults to 7bit", () => {
    expect(mimeText(`Content-Type: text/plain\r\n\r\n${LINK}`)).toContain(LINK);
  });
});
