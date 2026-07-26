export type CappedReadResult<T> =
  | { ok: true; value: T }
  | { ok: false; reason: "invalid" | "over_cap" };

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
  if (declared !== null && (!Number.isFinite(declared) || declared > maxBytes)) {
    await request.body?.cancel("declared request body exceeded limit");
    return { ok: false, reason: "over_cap" };
  }
  if (request.body === null) {
    return { ok: false, reason: "invalid" };
  }

  const reader = request.body.getReader();
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
        await reader.cancel("request body exceeded limit");
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
