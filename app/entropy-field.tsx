'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { prepareWithSegments, measureNaturalWidth } from '@chenglou/pretext';
import { ASCII_BANNER } from '../lib/banner';
import {
  createFluid,
  diffuse,
  inject,
  swapFluid,
  type FluidGrid,
} from '../lib/fluid-smoke';
import { Pool, hex, estBits } from '../lib/pool';

const FONT_SMOKE = '400 10px "JetBrains Mono", monospace';

/** Density → glyph (fluid-smoke style ramp) */
const SMOKE_RAMP =
  " .'`·^\",:;!il><~-_+][}{1)(|\\/tfjrxnuvcXYZUJHK()*#MW&8%B@$";

export const CORPUS = `Entropy is usable unpredictability—the surprise cryptography turns into keys and seeds; if it is guessable, everything above it fails. Post-quantum hardware and integration will concentrate in large institutions first; ENTROP is modest: it harvests animation-frame jitter in **your** browser, folds samples through SHA-256 into a pool you can watch, and offers a hex seed only when you copy—nothing is sent off-device by default. This does **not** replace your OS cryptographically secure RNG or defeat a quantum adversary on its own. Next: clearer quality estimates, optional sources you approve, stronger mixing, and blends with OS or hardware entropy so inspectable local noise scales beyond well-funded labs.`;

const SMOKE_ROWS = 14;
const SMOKE_LH = 11;
const TYPO_RH = 18;

type SerifGlyph = { ch: string; font: string; w: number };

function buildSerifPalette(): SerifGlyph[] {
  const chars = [' ', '·', '•', '●', '◆', '■'];
  const weights = [400, 600, 700] as const;
  const out: SerifGlyph[] = [];
  for (const wt of weights) {
    for (const ch of chars) {
      const font = `${wt} 11px "IBM Plex Serif", serif`;
      const prep = prepareWithSegments(ch, font);
      out.push({ ch, font, w: measureNaturalWidth(prep) });
    }
  }
  out.sort((a, b) => a.w - b.w);
  return out;
}

function pickSerifGlyph(palette: SerifGlyph[], slotW: number, b: number): SerifGlyph {
  const target = Math.min(palette.length - 1, Math.floor(b * (palette.length - 1)));
  for (let i = Math.min(palette.length - 1, target + 10); i >= 0; i--) {
    if (palette[i].w <= slotW * 0.93) return palette[i];
  }
  return palette[0];
}

/** Inline **bold** segments from mission copy */
function CorpusRich({ text }: { text: string }) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return (
    <>
      {parts.map((seg, i) => {
        const m = seg.match(/^\*\*(.+)\*\*$/);
        if (m) return <strong key={i}>{m[1]}</strong>;
        return <span key={i}>{seg}</span>;
      })}
    </>
  );
}

export default function EntropyField() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const poolRef = useRef<Pool | null>(null);
  const harvestingRef = useRef(false);

  const [statsLine, setStatsLine] = useState('0 bytes absorbed · ~0 bits estimated');
  const [harvesting, setHarvesting] = useState(false);
  const [copyFlash, setCopyFlash] = useState(false);
  const [poolReady, setPoolReady] = useState(false);

  if (!poolRef.current) poolRef.current = new Pool();

  useEffect(() => {
    harvestingRef.current = harvesting;
  }, [harvesting]);

  const absorb = useCallback(async (id: string, bytes: Uint8Array, bits: number) => {
    const pool = poolRef.current!;
    await pool.absorb(id, bytes, bits);
    setPoolReady(pool.chunks.length > 0);
    setStatsLine(
      `${pool.totalBytes} bytes absorbed · ~${Math.floor(pool.estimatedBits)} bits estimated`,
    );
  }, []);

  const toggleHarvest = useCallback(() => {
    setHarvesting((h) => !h);
  }, []);

  const copySeed = useCallback(async () => {
    const pool = poolRef.current!;
    if (pool.chunks.length === 0) return;
    const h32 = hex(await pool.seed(16));
    try {
      await navigator.clipboard.writeText(h32);
      setCopyFlash(true);
      window.setTimeout(() => setCopyFlash(false), 900);
    } catch {
      prompt('Seed', h32);
    }
  }, []);

  /** Fluid canvas: smoke + serif row only — pixels are not selectable; controls are HTML below. */
  useEffect(() => {
    const canvasEl = canvasRef.current;
    const wrapEl = wrapRef.current;
    if (!canvasEl || !wrapEl) return;
    const canvas = canvasEl;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const C2D = ctx;

    const serifPalette = buildSerifPalette();

    let fluid: FluidGrid | null = null;
    let smoothFieldMax = 0.06;
    let layoutDpr = 1;

    let smokeBandH = SMOKE_ROWS * SMOKE_LH + 10;
    let typoBandH = TYPO_RH + 8;
    const CANVAS_PAD = 14;
    const DECAY_HARVEST = 0.993;
    const DECAY_IDLE = 0.9976;

    function resizeFluidCanvas(w: number) {
      const ch = CANVAS_PAD * 2 + smokeBandH + typoBandH;
      layoutDpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.floor(w * layoutDpr);
      canvas.height = Math.floor(ch * layoutDpr);
      canvas.style.width = `${w}px`;
      canvas.style.height = `${ch}px`;
      C2D.setTransform(layoutDpr, 0, 0, layoutDpr, 0, 0);

      C2D.font = FONT_SMOKE;
      const cellW = Math.max(5.5, C2D.measureText('M').width);
      const cols = Math.max(32, Math.min(100, Math.floor((w - 2 * CANVAS_PAD) / cellW)));
      fluid = createFluid(cols, SMOKE_ROWS);
      smoothFieldMax = 0.06;
    }

    function stepSmoke(digest: Uint8Array | null) {
      if (!fluid) return;
      const { cols, rows, a, b } = fluid;
      const h = harvestingRef.current;
      const t = performance.now() * 0.00035;

      if (h) {
        const wobble = performance.now() * 0.00085;
        inject(
          a,
          cols,
          rows,
          Math.floor(wobble * 2.4) % cols,
          Math.floor(wobble * 1.65) % rows,
          0.038,
        );
      } else {
        const cx = (cols >> 1) + Math.cos(t * 1.1) * cols * 0.38;
        const cy = (rows >> 1) + Math.sin(t * 0.95) * rows * 0.36;
        inject(a, cols, rows, Math.floor(cx), Math.floor(cy), 0.022 + Math.sin(t * 2.3) * 0.008);
        inject(
          a,
          cols,
          rows,
          Math.floor((cols >> 1) + Math.sin(t * 0.7) * cols * 0.25),
          Math.floor((rows >> 1) + Math.cos(t * 0.88) * rows * 0.22),
          0.014,
        );
      }

      if (h && digest) {
        inject(a, cols, rows, digest[0] % cols, digest[1] % rows, (digest[2] / 255) * 1.55);
        inject(
          a,
          cols,
          rows,
          (digest[11] + digest[3]) % cols,
          (digest[17] + digest[5]) % rows,
          (digest[19] / 255) * 1.05,
        );
      }

      diffuse(a, b, cols, rows, h ? DECAY_HARVEST : DECAY_IDLE);
      swapFluid(fluid);
    }

    function fieldMax(): number {
      if (!fluid) return 1e-6;
      let m = 1e-6;
      for (let i = 0; i < fluid.a.length; i++) if (fluid.a[i] > m) m = fluid.a[i];
      return m;
    }

    function drawSmokeAscii(
      C: CanvasRenderingContext2D,
      w: number,
      pad: number,
      maxV: number,
      digest: Uint8Array | null,
    ) {
      if (!fluid) return;
      const { cols, rows, a } = fluid;
      C.font = FONT_SMOKE;
      const rampLen = SMOKE_RAMP.length;
      for (let y = 0; y < rows; y++) {
        for (let x = 0; x < cols; x++) {
          const v = a[y * cols + x] / maxV;
          const ri = Math.min(rampLen - 1, Math.floor(v * rampLen));
          const ch = SMOKE_RAMP[ri];
          const px = pad + (x * (w - 2 * pad)) / cols;
          const py = pad + (y + 1) * SMOKE_LH + 3;
          const hue = 32 + v * 48 + (digest ? (digest[x % 32] / 255) * 18 : 0);
          C.fillStyle = `hsla(${hue}, 42%, ${48 + v * 42}%, ${0.22 + v * 0.58})`;
          C.fillText(ch, px, py);
        }
      }
    }

    function drawSerifVariableRow(
      C: CanvasRenderingContext2D,
      w: number,
      pad: number,
      innerW: number,
      maxV: number,
      digest: Uint8Array | null,
    ) {
      if (!fluid) return;
      const { cols, rows, a } = fluid;
      const slots = Math.min(52, Math.max(24, Math.floor(innerW / 12)));
      const slotW = innerW / slots;
      const yr = Math.min(rows - 2, Math.max(1, rows - 4));
      const baseline = pad + smokeBandH + TYPO_RH - 3;

      for (let s = 0; s < slots; s++) {
        const fx = 1 + Math.floor(((s + 0.5) / slots) * (cols - 2));
        const fi = yr * cols + fx;
        const raw = Math.min(1, a[fi] / maxV);
        const g = pickSerifGlyph(serifPalette, slotW, raw);
        const x = pad + s * slotW + (slotW - g.w) * 0.5;
        C.font = g.font;
        const hue = 36 + raw * 36 + (digest ? (digest[s % 32] / 255) * 14 : 0);
        C.fillStyle = `hsla(${hue}, 36%, ${58 + raw * 30}%, ${0.42 + raw * 0.48})`;
        C.fillText(g.ch, x, baseline);
      }
    }

    const resize = () => {
      resizeFluidCanvas(wrapEl.clientWidth || 400);
    };

    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(wrapEl);
    window.addEventListener('resize', resize);

    let rafId = 0;
    let t0 = 0;
    const rafBuf: number[] = [];

    const tick = (time: number) => {
      const pool = poolRef.current!;
      const digest = pool.lastSha256;

      if (harvestingRef.current) {
        if (t0 > 0) {
          const dt = time - t0;
          rafBuf.push(dt);
          if (rafBuf.length > 50) rafBuf.shift();
          const b = new Uint8Array(8);
          new DataView(b.buffer).setFloat64(0, dt, true);
          void absorb('raf', b, estBits(rafBuf));
        }
        t0 = time;
      }

      stepSmoke(digest);

      const rawMax = fieldMax();
      smoothFieldMax += (Math.max(rawMax, 0.012) - smoothFieldMax) * 0.055;
      const maxV = Math.max(smoothFieldMax, 0.022);

      const w = wrapEl.clientWidth || canvas.width / layoutDpr;
      const pad = CANVAS_PAD;
      const innerW = w - 2 * pad;

      const C = C2D;
      C.fillStyle = '#04050d';
      C.fillRect(0, 0, w, canvas.height / layoutDpr);

      C.strokeStyle = 'rgba(251, 191, 36, 0.028)';
      for (let x = 0; x < w; x += 9) {
        C.beginPath();
        C.moveTo(x, 0);
        C.lineTo(x, canvas.height / layoutDpr);
        C.stroke();
      }

      C.fillStyle = 'rgba(10, 12, 22, 0.94)';
      C.fillRect(pad, pad, innerW, smokeBandH + typoBandH + 4);

      C.strokeStyle = 'rgba(251, 191, 36, 0.11)';
      C.strokeRect(pad, pad - 1, innerW, smokeBandH + typoBandH + 6);

      drawSmokeAscii(C, w, pad, maxV, digest);
      drawSerifVariableRow(C, w, pad, innerW, maxV, digest);

      rafId = requestAnimationFrame(tick);
    };

    rafId = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(rafId);
      ro.disconnect();
      window.removeEventListener('resize', resize);
    };
  }, [absorb]);

  return (
    <div className="entropy-shell">
      <p className="sr-only" aria-live="polite">
        Banner and mission copy are selectable text; fluid strip below is a non-interactive canvas.
      </p>

      <pre className="entropy-banner" aria-hidden="false">
        {ASCII_BANNER.trim()}
      </pre>

      <article className="entropy-prose">
        <CorpusRich text={CORPUS} />
      </article>

      <div ref={wrapRef} className="canvas-frame entropy-fluid-frame">
        <canvas ref={canvasRef} className="entropy-canvas entropy-fluid-canvas" aria-hidden />
      </div>

      <p className="entropy-stats">{statsLine}</p>

      <div className="entropy-actions">
        <button type="button" className="entropy-btn entropy-btn-primary" onClick={toggleHarvest}>
          {harvesting ? 'Stop' : 'Start harvest'}
        </button>
        <button
          type="button"
          className="entropy-btn entropy-btn-copy"
          onClick={copySeed}
          disabled={!poolReady}
        >
          {copyFlash ? 'Copied' : 'Copy seed'}
        </button>
      </div>
    </div>
  );
}
