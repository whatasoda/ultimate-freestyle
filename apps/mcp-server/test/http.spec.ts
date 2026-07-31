import { describe, expect, it } from "vitest";

import {
  readBytesCapped,
  readJsonCapped,
  readStreamCapped,
  readUrlEncodedFormCapped
} from "../src/lib/http";

describe("capped request readers", () => {
  it("cancels a chunked body as soon as it exceeds the cap", async () => {
    let cancelled = false;
    const chunk = new Uint8Array(64).fill(120);
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        controller.enqueue(chunk);
      },
      cancel() {
        cancelled = true;
      }
    });
    const result = await readBytesCapped(
      new Request("https://example.com/upload", {
        method: "POST",
        body: stream
      }),
      100
    );
    expect(result).toEqual({ ok: false, reason: "over_cap" });
    expect(cancelled).toBe(true);
  });

  it("rejects an oversized declared content length", async () => {
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        controller.enqueue(new Uint8Array([1]));
        controller.close();
      }
    });
    const result = await readBytesCapped(
      new Request("https://example.com/upload", {
        method: "POST",
        headers: { "content-length": "101" },
        body: stream
      }),
      100
    );
    expect(result).toEqual({ ok: false, reason: "over_cap" });
  });

  it("parses a bounded urlencoded form and rejects other media types", async () => {
    const body = new URLSearchParams({ csrf_token: "token" });
    const parsed = await readUrlEncodedFormCapped(
      new Request("https://example.com/logout", {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body
      }),
      1024
    );
    expect(parsed.ok && parsed.value.get("csrf_token")).toBe("token");

    const invalid = await readUrlEncodedFormCapped(
      new Request("https://example.com/logout", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{}"
      }),
      1024
    );
    expect(invalid).toEqual({ ok: false, reason: "invalid" });
  });

  it("rejects absent, interrupted, and invalid UTF-8 streams", async () => {
    expect(await readStreamCapped(null, 100)).toEqual({
      ok: false,
      reason: "invalid"
    });

    const interrupted = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.error(new Error("interrupted"));
      }
    });
    expect(await readStreamCapped(interrupted, 100)).toEqual({
      ok: false,
      reason: "invalid"
    });

    const invalidUtf8 = await readUrlEncodedFormCapped(
      new Request("https://example.com/logout", {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new Uint8Array([0xc3, 0x28])
      }),
      100
    );
    expect(invalidUtf8).toEqual({ ok: false, reason: "invalid" });
  });

  it("propagates form size failures", async () => {
    const result = await readUrlEncodedFormCapped(
      new Request("https://example.com/logout", {
        method: "POST",
        headers: {
          "content-length": "101",
          "content-type": "application/x-www-form-urlencoded"
        },
        body: "a=1"
      }),
      100
    );
    expect(result).toEqual({ ok: false, reason: "over_cap" });
  });

  it("parses bounded JSON and distinguishes invalid inputs from size failures", async () => {
    const parsed = await readJsonCapped(
      new Request("https://example.com/api", {
        method: "POST",
        headers: { "content-type": "application/json; charset=utf-8" },
        body: JSON.stringify({ title: "研究" })
      }),
      100
    );
    expect(parsed).toEqual({ ok: true, value: { title: "研究" } });

    const wrongMediaType = await readJsonCapped(
      new Request("https://example.com/api", {
        method: "POST",
        headers: { "content-type": "text/plain" },
        body: "{}"
      }),
      100
    );
    expect(wrongMediaType).toEqual({ ok: false, reason: "invalid" });

    const malformed = await readJsonCapped(
      new Request("https://example.com/api", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{"
      }),
      100
    );
    expect(malformed).toEqual({ ok: false, reason: "invalid" });

    const invalidUtf8 = await readJsonCapped(
      new Request("https://example.com/api", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: new Uint8Array([0xc3, 0x28])
      }),
      100
    );
    expect(invalidUtf8).toEqual({ ok: false, reason: "invalid" });

    const oversized = await readJsonCapped(
      new Request("https://example.com/api", {
        method: "POST",
        headers: {
          "content-length": "101",
          "content-type": "application/json"
        },
        body: "{}"
      }),
      100
    );
    expect(oversized).toEqual({ ok: false, reason: "over_cap" });
  });
});
