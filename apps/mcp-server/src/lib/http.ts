export type CappedReadResult<T> =
  | { ok: true; value: T }
  | { ok: false; reason: "invalid" | "over_cap" };

export async function readStreamCapped(
  stream: ReadableStream<Uint8Array> | null,
  maxBytes: number,
  declaredBytes: number | null = null
): Promise<CappedReadResult<Uint8Array>> {
  if (
    declaredBytes !== null &&
    (!Number.isSafeInteger(declaredBytes) ||
      declaredBytes < 0 ||
      declaredBytes > maxBytes)
  ) {
    await stream?.cancel("declared body exceeded limit");
    return { ok: false, reason: "over_cap" };
  }
  if (stream === null) {
    return { ok: false, reason: "invalid" };
  }

  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const chunk = await reader.read();
      if (chunk.done) {
        break;
      }
      total += chunk.value.byteLength;
      if (total > maxBytes) {
        await reader.cancel("body exceeded limit");
        return { ok: false, reason: "over_cap" };
      }
      chunks.push(chunk.value);
    }
  } catch {
    return { ok: false, reason: "invalid" };
  }

  const body = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return { ok: true, value: body };
}

function declaredLength(request: Request): number | null {
  const header = request.headers.get("content-length");
  if (header === null) {
    return null;
  }
  const parsed = Number(header);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : Number.NaN;
}

export async function readBytesCapped(
  request: Request,
  maxBytes: number
): Promise<CappedReadResult<Uint8Array>> {
  const declared = declaredLength(request);
  return readStreamCapped(request.body, maxBytes, declared);
}

export async function readUrlEncodedFormCapped(
  request: Request,
  maxBytes: number
): Promise<CappedReadResult<URLSearchParams>> {
  const contentType = request.headers.get("content-type")?.split(";", 1)[0];
  if (contentType !== "application/x-www-form-urlencoded") {
    return { ok: false, reason: "invalid" };
  }
  const read = await readBytesCapped(request, maxBytes);
  if (!read.ok) {
    return read;
  }
  try {
    return {
      ok: true,
      value: new URLSearchParams(
        new TextDecoder("utf-8", { fatal: true, ignoreBOM: false }).decode(
          read.value
        )
      )
    };
  } catch {
    return { ok: false, reason: "invalid" };
  }
}
