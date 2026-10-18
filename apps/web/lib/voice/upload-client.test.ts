import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { uploadForTranscription } from "./upload-client";

/** A scriptable XMLHttpRequest: the test decides which real event fires. */
class FakeXhr {
  static last: FakeXhr;
  method = "";
  url = "";
  headers: Record<string, string> = {};
  timeout = 0;
  responseType = "";
  status = 0;
  responseText = "";
  sent: Blob | null = null;
  upload: {
    onprogress: ((e: unknown) => void) | null;
    onload: (() => void) | null;
  } = { onprogress: null, onload: null };
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  ontimeout: (() => void) | null = null;
  onabort: (() => void) | null = null;
  constructor() {
    FakeXhr.last = this;
  }
  open(method: string, url: string) {
    this.method = method;
    this.url = url;
  }
  setRequestHeader(k: string, v: string) {
    this.headers[k.toLowerCase()] = v;
  }
  send(b: Blob) {
    this.sent = b;
  }
  abort() {
    this.onabort?.();
  }
}

const orig = (globalThis as { XMLHttpRequest?: unknown }).XMLHttpRequest;
beforeEach(() => {
  (globalThis as { XMLHttpRequest?: unknown }).XMLHttpRequest = FakeXhr;
});
afterEach(() => {
  (globalThis as { XMLHttpRequest?: unknown }).XMLHttpRequest = orig;
});

const input = (extra = {}) => ({
  url: "https://stt.example.test/v1/transcribe",
  token: "v1.tok.sig",
  blob: new Blob([new Uint8Array(2048)], { type: "audio/webm" }),
  mime: "audio/webm",
  language: "lt",
  ...extra,
});

describe("uploadForTranscription - honest stages and failures", () => {
  it("sends the token as a Bearer, the closed mime as content-type, and the language as a query param", () => {
    void uploadForTranscription(input());
    expect(FakeXhr.last.method).toBe("POST");
    expect(FakeXhr.last.url).toBe(
      "https://stt.example.test/v1/transcribe?language=lt",
    );
    expect(FakeXhr.last.headers.authorization).toBe("Bearer v1.tok.sig");
    expect(FakeXhr.last.headers["content-type"]).toBe("audio/webm");
    expect(FakeXhr.last.sent).toBeInstanceOf(Blob);
    expect(FakeXhr.last.timeout).toBe(330_000);
  });

  it("progress and the 'uploaded' stage come ONLY from real events", async () => {
    const seen: number[] = [];
    let uploaded = 0;
    const p = uploadForTranscription(
      input({
        onProgress: (f: number) => seen.push(f),
        onUploaded: () => (uploaded += 1),
      }),
    );
    const x = FakeXhr.last;
    x.upload.onprogress?.({ lengthComputable: true, loaded: 512, total: 2048 });
    x.upload.onprogress?.({ lengthComputable: false, loaded: 0, total: 0 }); // ignored, not invented
    expect(seen).toEqual([0.25]);
    expect(uploaded).toBe(0);
    x.upload.onload?.();
    expect(uploaded).toBe(1);
    expect(seen.at(-1)).toBe(1);
    x.status = 200;
    x.responseText = JSON.stringify({
      transcript: "  sveiki  ",
      language: "lt",
      durationSeconds: 3.2,
    });
    x.onload?.();
    expect(await p).toEqual({
      ok: true,
      transcript: "sveiki",
      language: "lt",
      durationSeconds: 3.2,
    });
  });

  it("an empty transcript is a failure, never a blank success", async () => {
    const p = uploadForTranscription(input());
    FakeXhr.last.status = 200;
    FakeXhr.last.responseText = JSON.stringify({ transcript: "   " });
    FakeXhr.last.onload?.();
    expect(await p).toMatchObject({ ok: false, code: "empty" });
  });

  it("a network-level failure is 'service unreachable' (offline, DNS, TLS, CORS, server down)", async () => {
    const p = uploadForTranscription(input());
    FakeXhr.last.onerror?.();
    expect(await p).toEqual({
      ok: false,
      code: "service_unreachable",
      status: 0,
    });
  });

  it("service answers map to honest codes", async () => {
    const cases: [number, string | null, string][] = [
      [401, "token_expired", "token_expired"],
      [401, "token_used", "token_expired"],
      [401, "unauthorized", "unauthorized"],
      [403, "origin_not_allowed", "service_unreachable"],
      [413, "too_long", "too_long"],
      [413, "too_large", "too_large"],
      [415, "bad_mime", "bad_mime"],
      [429, "rate_limited", "rate_limited"],
      [400, "undecodable", "undecodable"],
      [502, "engine_failed", "engine_failed"],
    ];
    for (const [status, code, want] of cases) {
      const p = uploadForTranscription(input());
      FakeXhr.last.status = status;
      FakeXhr.last.responseText = JSON.stringify(code ? { code } : {});
      FakeXhr.last.onload?.();
      expect(await p).toMatchObject({ ok: false, code: want });
    }
  });

  it("a non-JSON error body does not crash and still classifies by status", async () => {
    const p = uploadForTranscription(input());
    FakeXhr.last.status = 502;
    FakeXhr.last.responseText = "<html>bad gateway</html>";
    FakeXhr.last.onload?.();
    expect(await p).toMatchObject({ ok: false, code: "engine_failed" });
  });

  it("a timeout is a timeout", async () => {
    const p = uploadForTranscription(input({ timeoutMs: 5000 }));
    expect(FakeXhr.last.timeout).toBe(5000);
    FakeXhr.last.ontimeout?.();
    expect(await p).toMatchObject({ ok: false, code: "timeout" });
  });

  it("an abort signal cancels the request and reports it as not reaching the service", async () => {
    const ac = new AbortController();
    const p = uploadForTranscription(input({ signal: ac.signal }));
    ac.abort();
    expect(await p).toMatchObject({ ok: false, code: "service_unreachable" });
  });

  it("settles exactly once even if events fire twice", async () => {
    const p = uploadForTranscription(input());
    FakeXhr.last.onerror?.();
    FakeXhr.last.status = 200;
    FakeXhr.last.responseText = JSON.stringify({ transcript: "late" });
    FakeXhr.last.onload?.();
    expect(await p).toMatchObject({ ok: false });
  });
});
