const HEX = "0123456789abcdef";

/** Lowercase hex encoding of binary data. */
export function toHex(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let output = "";
  for (const byte of bytes) {
    output += HEX[byte >> 4];
    output += HEX[byte & 0x0f];
  }
  return output;
}

/** SHA-256 over UTF-8 text. Web Crypto is available in Workers and Node 24. */
export async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return toHex(digest);
}

/** 256 bits of entropy, URL-safe. Used for invitation and reset tokens. */
export function randomToken(bytes = 32): string {
  const buffer = crypto.getRandomValues(new Uint8Array(bytes));
  let binary = "";
  for (const byte of buffer) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

/** Constant-time string comparison for token and secret checks. */
export function constantTimeEqual(a: string, b: string): boolean {
  const left = new TextEncoder().encode(a);
  const right = new TextEncoder().encode(b);
  if (left.length !== right.length) return false;

  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= (left[index] ?? 0) ^ (right[index] ?? 0);
  }
  return difference === 0;
}
