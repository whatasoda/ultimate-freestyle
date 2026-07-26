import { describe, expect, it } from "vitest";

import {
  readBytesCapped,
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
});
