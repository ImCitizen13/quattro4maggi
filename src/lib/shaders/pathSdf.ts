/**
 * Path SDF bake — CPU signed Euclidean distance transform of an SkPath.
 *
 * FLOW:
 * 1. Rasterize the path filled white into an offscreen surface
 * 2. readPixels → coverage grid; edge pixels seed the EDT with fractional
 *    (subpixel) distances recovered from their AA coverage
 * 3. Felzenszwalb exact EDT (two O(n) passes: inside + outside) → signed field
 * 4. Keep the Float32Array on the JS side (bubble physics samples it directly)
 * 5. Pack normalized field into an RGBA_F32 image → child shader for SkSL
 *
 * CONVENTION: distance is in pixels, POSITIVE inside the shape, negative
 * outside. The packed texture stores `0.5 + 0.5 * d / maxDist` in R (and G),
 * so SkSL reconstructs with `(r - 0.5) * 2.0 * iSdfMax`.
 *
 * KEY FEATURES:
 * - Exact EDT, no jump-flood approximation
 * - One-time cost at mount (bake a 300×300 field in a few ms)
 * - `sample(x, y)` gives bilinear-filtered distance for JS-side physics
 */

import {
  AlphaType,
  ColorType,
  Skia,
  type SkImage,
  type SkPath,
} from "@shopify/react-native-skia";

// ============================================================================
// TYPES
// ============================================================================

export type PathSdf = {
  /** Signed distance per pixel (row-major, w×h). Positive inside, in pixels */
  field: Float32Array;
  /** Field width in pixels */
  width: number;
  /** Field height in pixels */
  height: number;
  /** Largest |distance| in the field — the normalization scale of the texture */
  maxDist: number;
  /** Largest inside distance (depth of the deepest point / medial-axis peak) */
  maxInside: number;
  /** Normalized field packed as RGBA_F32, ready to use as a child shader */
  image: SkImage;
  /** Bilinear-filtered signed distance at (x, y) in field pixel coordinates */
  sample: (x: number, y: number) => number;
  /** Central-difference gradient of the field at (x, y), ≈ unit length */
  gradient: (x: number, y: number) => [number, number];
};

// ============================================================================
// EDT (Felzenszwalb & Huttenlocher, exact, O(n))
// ============================================================================

const INF = 1e20;

/**
 * 1D squared-distance transform via lower envelope of parabolas.
 * `f` is read with stride/offset so rows and columns share the buffer layout.
 */
function edt1d(
  f: Float32Array,
  d: Float32Array,
  v: Int32Array,
  z: Float32Array,
  n: number
) {
  let k = 0;
  v[0] = 0;
  z[0] = -INF;
  z[1] = INF;

  for (let q = 1; q < n; q++) {
    let s = (f[q] + q * q - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
    while (s <= z[k]) {
      k--;
      s = (f[q] + q * q - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
    }
    k++;
    v[k] = q;
    z[k] = s;
    z[k + 1] = INF;
  }

  k = 0;
  for (let q = 0; q < n; q++) {
    while (z[k + 1] < q) k++;
    const dq = q - v[k];
    d[q] = dq * dq + f[v[k]];
  }
}

/**
 * 2D squared EDT in place: `grid` holds 0 at feature pixels, INF elsewhere.
 * After the call every cell holds squared distance to the nearest feature.
 */
function edt2d(grid: Float32Array, width: number, height: number) {
  const size = Math.max(width, height);
  const f = new Float32Array(size);
  const d = new Float32Array(size);
  const v = new Int32Array(size);
  const z = new Float32Array(size + 1);

  // Columns
  for (let x = 0; x < width; x++) {
    for (let y = 0; y < height; y++) f[y] = grid[y * width + x];
    edt1d(f, d, v, z, height);
    for (let y = 0; y < height; y++) grid[y * width + x] = d[y];
  }

  // Rows
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) f[x] = grid[y * width + x];
    edt1d(f, d, v, z, width);
    for (let x = 0; x < width; x++) grid[y * width + x] = d[x];
  }
}

// ============================================================================
// BAKE
// ============================================================================

/**
 * Rasterize `path` (already transformed into canvas coordinates) at
 * `width`×`height` and return its signed distance field.
 *
 * Returns null if the offscreen surface or the float image cannot be created.
 */
export function bakePathSdf(
  path: SkPath,
  width: number,
  height: number
): PathSdf | null {
  const w = Math.max(1, Math.round(width));
  const h = Math.max(1, Math.round(height));

  // --- 1. Rasterize the path as white on transparent -------------------------
  const surface = Skia.Surface.MakeOffscreen(w, h) ?? Skia.Surface.Make(w, h);
  if (!surface) return null;

  const canvas = surface.getCanvas();
  const paint = Skia.Paint();
  paint.setColor(Skia.Color("white"));
  paint.setAntiAlias(true);
  canvas.drawPath(path, paint);

  const snapshot = surface.makeImageSnapshot();
  const pixels = snapshot.readPixels();
  if (!pixels) return null;

  // --- 2. Coverage → two feature grids with subpixel seeds -------------------
  // The AA coverage of an edge pixel encodes where the true edge sits inside
  // it: coverage 0.5 = edge through the center, 0.75 = edge ~0.25px away.
  // Seeding the EDT with those fractional distances (instead of a binary
  // inside/outside) keeps the zero-isoline on the true curve rather than
  // snapping it to the pixel lattice — the SDF-font-atlas trick.
  // readPixels may return Uint8Array (0-255) or Float32Array (0-1)
  const isFloat = pixels instanceof Float32Array;
  const alphaScale = isFloat ? 1 : 1 / 255;

  const n = w * h;
  const distToOutside = new Float32Array(n); // squared dist to outside region
  const distToInside = new Float32Array(n); // squared dist to inside region
  for (let i = 0; i < n; i++) {
    const a = pixels[i * 4 + 3] * alphaScale;
    if (a >= 1) {
      distToOutside[i] = INF;
      distToInside[i] = 0;
    } else if (a <= 0) {
      distToOutside[i] = 0;
      distToInside[i] = INF;
    } else {
      const dIn = Math.max(0, a - 0.5); // center inside: edge is (a-0.5)px away
      const dOut = Math.max(0, 0.5 - a); // center outside: edge is (0.5-a)px away
      distToOutside[i] = dIn * dIn;
      distToInside[i] = dOut * dOut;
    }
  }

  // --- 3. Two EDTs → signed field --------------------------------------------
  edt2d(distToOutside, w, h);
  edt2d(distToInside, w, h);

  const field = new Float32Array(n);
  let maxDist = 1e-6;
  let maxInside = 1e-6;
  for (let i = 0; i < n; i++) {
    // Inside: distToInside = 0 → d = +depth. Outside: distToOutside = 0 → d < 0
    const d = Math.sqrt(distToOutside[i]) - Math.sqrt(distToInside[i]);
    field[i] = d;
    const a = Math.abs(d);
    if (a > maxDist) maxDist = a;
    if (d > maxInside) maxInside = d;
  }

  // --- 4. Pack normalized field into RGBA_F32 --------------------------------
  const packed = new Float32Array(n * 4);
  for (let i = 0; i < n; i++) {
    const v = 0.5 + (0.5 * field[i]) / maxDist;
    packed[i * 4] = v;
    packed[i * 4 + 1] = v;
    packed[i * 4 + 2] = 0;
    packed[i * 4 + 3] = 1;
  }

  const image = Skia.Image.MakeImage(
    {
      width: w,
      height: h,
      colorType: ColorType.RGBA_F32,
      alphaType: AlphaType.Unpremul,
    },
    Skia.Data.fromBytes(new Uint8Array(packed.buffer)),
    w * 16
  );
  if (!image) return null;

  // --- 5. JS-side samplers for bubble physics --------------------------------
  const sample = (x: number, y: number): number => {
    const cx = Math.min(Math.max(x, 0), w - 1);
    const cy = Math.min(Math.max(y, 0), h - 1);
    const x0 = Math.floor(cx);
    const y0 = Math.floor(cy);
    const x1 = Math.min(x0 + 1, w - 1);
    const y1 = Math.min(y0 + 1, h - 1);
    const fx = cx - x0;
    const fy = cy - y0;
    const top = field[y0 * w + x0] * (1 - fx) + field[y0 * w + x1] * fx;
    const bot = field[y1 * w + x0] * (1 - fx) + field[y1 * w + x1] * fx;
    return top * (1 - fy) + bot * fy;
  };

  const gradient = (x: number, y: number): [number, number] => {
    const gx = sample(x + 1, y) - sample(x - 1, y);
    const gy = sample(x, y + 1) - sample(x, y - 1);
    const len = Math.hypot(gx, gy);
    return len > 1e-6 ? [gx / len, gy / len] : [0, 0];
  };

  return { field, width: w, height: h, maxDist, maxInside, image, sample, gradient };
}
