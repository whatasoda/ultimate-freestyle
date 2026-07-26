const encoder = new TextEncoder();

export const CSRF_COOKIE = "__Host-SAIJIYU_CSRF";
export const TWITCH_STATE_COOKIE = "__Host-SAIJIYU_TWITCH_STATE";

export function createSecureCookie(
  name: string,
  value: string,
  maxAgeSeconds: number
): string {
  return `${name}=${value}; HttpOnly; Secure; Path=/; SameSite=Lax; Max-Age=${maxAgeSeconds}`;
}

export function clearSecureCookie(name: string): string {
  return createSecureCookie(name, "", 0);
}

export function readCookie(request: Request, name: string): string | null {
  const header = request.headers.get("cookie");
  if (header === null) {
    return null;
  }
  for (const part of header.split(";")) {
    const [candidate, ...valueParts] = part.trim().split("=");
    if (candidate === name) {
      return valueParts.join("=");
    }
  }
  return null;
}

export function randomToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join(
    ""
  );
}

export async function hashToken(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(value));
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0")
  ).join("");
}

export async function secureTokenEqual(
  provided: string,
  expected: string
): Promise<boolean> {
  const [providedHash, expectedHash] = await Promise.all([
    crypto.subtle.digest("SHA-256", encoder.encode(provided)),
    crypto.subtle.digest("SHA-256", encoder.encode(expected))
  ]);
  return crypto.subtle.timingSafeEqual(providedHash, expectedHash);
}
