export const hex = (u: Uint8Array) => [...u].map((b) => b.toString(16).padStart(2, '0')).join('');

export function estBits(vals: number[]): number {
  if (vals.length < 4) return 0;
  let lo = Infinity,
    hi = -Infinity;
  for (const v of vals) {
    if (v < lo) lo = v;
    if (v > hi) hi = v;
  }
  return Math.min(8, Math.log2(1 + Math.max(0, hi - lo)));
}

export class Pool {
  chunks: Uint8Array[] = [];
  totalBytes = 0;
  estimatedBits = 0;
  /** Latest SHA-256 chunk from the last absorb — drives visuals */
  lastSha256: Uint8Array | null = null;

  async absorb(id: string, bytes: Uint8Array, bits = 0) {
    this.totalBytes += bytes.length;
    this.estimatedBits += bits;
    const head = new TextEncoder().encode(`${id}|${Date.now()}|`);
    const msg = new Uint8Array(head.length + bytes.length);
    msg.set(head, 0);
    msg.set(bytes, head.length);
    const h = new Uint8Array(await crypto.subtle.digest('SHA-256', msg));
    this.chunks.push(h);
    if (this.chunks.length > 32) this.chunks.shift();
    this.lastSha256 = new Uint8Array(h);
  }

  async seed(n = 16): Promise<Uint8Array> {
    if (!this.chunks.length) return new Uint8Array(n);
    const tot = this.chunks.reduce((a, c) => a + c.length, 0);
    const buf = new Uint8Array(tot);
    let o = 0;
    for (const c of this.chunks) {
      buf.set(c, o);
      o += c.length;
    }
    return new Uint8Array(await crypto.subtle.digest('SHA-256', buf)).slice(0, n);
  }
}
