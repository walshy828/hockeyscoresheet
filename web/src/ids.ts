export function uid(): string {
  const c = globalThis.crypto;
  if (c?.randomUUID) return c.randomUUID();
  const b = c.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

/** Unguessable token for the public viewer link. */
export function token(): string {
  const b = globalThis.crypto.getRandomValues(new Uint8Array(18));
  return [...b].map((x) => x.toString(36).padStart(2, '0')).join('').slice(0, 24);
}
