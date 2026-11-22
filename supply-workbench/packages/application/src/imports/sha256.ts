export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  const digest = await crypto.subtle.digest('SHA-256', copy.buffer);
  return [...new Uint8Array(digest)].map((value) => value.toString(HEX_RADIX).padStart(HEX_WIDTH, '0')).join('');
}

const HEX_RADIX = 16;
const HEX_WIDTH = 2;
