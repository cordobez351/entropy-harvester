/** Simple stable diffusion on a 2D grid — density drives ASCII ramps (fluid-smoke style). */

export type FluidGrid = {
  cols: number;
  rows: number;
  a: Float32Array;
  b: Float32Array;
};

export function createFluid(cols: number, rows: number): FluidGrid {
  const n = cols * rows;
  return { cols, rows, a: new Float32Array(n), b: new Float32Array(n) };
}

export function clearEdges(buf: Float32Array, cols: number, rows: number) {
  for (let x = 0; x < cols; x++) {
    buf[x] = 0;
    buf[(rows - 1) * cols + x] = 0;
  }
  for (let y = 0; y < rows; y++) {
    buf[y * cols] = 0;
    buf[y * cols + cols - 1] = 0;
  }
}

/** Laplacian blend + decay; writes into `dst`, reads `src`. Slightly sticky blend for smoother motion. */
export function diffuse(src: Float32Array, dst: Float32Array, cols: number, rows: number, decay: number) {
  for (let y = 1; y < rows - 1; y++) {
    for (let x = 1; x < cols - 1; x++) {
      const i = y * cols + x;
      const lap = src[i - 1] + src[i + 1] + src[i - cols] + src[i + cols];
      dst[i] = src[i] * 0.265 + lap * 0.184;
      dst[i] *= decay;
      if (dst[i] < 1e-7) dst[i] = 0;
    }
  }
  clearEdges(dst, cols, rows);
}

export function inject(
  buf: Float32Array,
  cols: number,
  rows: number,
  ix: number,
  iy: number,
  amount: number,
) {
  const x = ((ix % cols) + cols) % cols;
  const y = ((iy % rows) + rows) % rows;
  const i = y * cols + x;
  buf[i] += amount;
}

export function swapFluid(f: FluidGrid) {
  const t = f.a;
  f.a = f.b;
  f.b = t;
}
