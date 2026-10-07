import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { isNonPublicAddress, screenSourceUrl } from "./fetch-source-file";

describe("a source file fetched by reference cannot reach the inside", () => {
  it("accepts only a plain https URL on a named host", () => {
    expect(screenSourceUrl("https://files.example.com/a/b.xlsx?sig=abc")).not.toBeNull();
    expect(screenSourceUrl("http://files.example.com/a.xlsx")).toBeNull();
    expect(screenSourceUrl("https://user:pw@files.example.com/a.xlsx")).toBeNull();
    expect(screenSourceUrl("https://files.example.com:8443/a.xlsx")).toBeNull();
    expect(screenSourceUrl("https://127.0.0.1/a.xlsx")).toBeNull();
    expect(screenSourceUrl("https://[::1]/a.xlsx")).toBeNull();
    expect(screenSourceUrl("https://localhost/a.xlsx")).toBeNull();
    expect(screenSourceUrl("file:///etc/passwd")).toBeNull();
    expect(screenSourceUrl("not a url")).toBeNull();
  });

  it("classifies loopback, private, link-local, CGNAT and metadata addresses as non-public", () => {
    for (const a of ["127.0.0.1", "10.1.2.3", "172.16.0.1", "172.31.255.255", "192.168.1.1", "169.254.169.254", "100.64.0.1", "0.0.0.0", "224.0.0.1", "::1", "fd00::1", "fe80::1", "::ffff:10.0.0.1"]) {
      expect(isNonPublicAddress(a), a).toBe(true);
    }
    for (const a of ["8.8.8.8", "1.1.1.1", "172.32.0.1", "100.63.0.1", "2606:4700:4700::1111"]) {
      expect(isNonPublicAddress(a), a).toBe(false);
    }
  });
});
