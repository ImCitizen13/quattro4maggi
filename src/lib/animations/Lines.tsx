import { splitPathContours } from "@/components/pull-to-refresh/threads-example/textGlyphPaths";
import { Path, Skia } from "@shopify/react-native-skia";
import { useMemo } from "react";

type RosetteColors = {
  petalColor: string;
  diamondColor: string;
  strokeColor: string;
  centerStrokeColor: string;
  starColor: string;
};

const COS_22_5 = 0.92388;
const SIN_22_5 = 0.38268;
const COS_45 = 0.70711;
const TAN_22_5 = 0.41421;
const SQRT2 = 1.41421;

type V2 = readonly [number, number];

const add = (a: V2, b: V2): V2 => [a[0] + b[0], a[1] + b[1]];
const sub = (a: V2, b: V2): V2 => [a[0] - b[0], a[1] - b[1]];
const mul = (a: V2, s: number): V2 => [a[0] * s, a[1] * s];
const len = (a: V2) => Math.hypot(a[0], a[1]);
const norm = (a: V2): V2 => {
  const l = len(a) || 1;
  return [a[0] / l, a[1] / l];
};

// Earliest positive t where ray(origin + t*dir) crosses the infinite line p1->p2.
function rayLineT(origin: V2, dir: V2, p1: V2, p2: V2): number {
  const ld = sub(p2, p1);
  const denom = dir[0] * ld[1] - dir[1] * ld[0];
  if (Math.abs(denom) < 1e-4) return Infinity;
  const diff = sub(p1, origin);
  const t = (diff[0] * ld[1] - diff[1] * ld[0]) / denom;
  return t > 1e-3 ? t : Infinity;
}

// Like rayLineT but only counts hits within the segment p1..p2.
function raySegmentT(origin: V2, dir: V2, p1: V2, p2: V2): number {
  const ld = sub(p2, p1);
  const denom = dir[0] * ld[1] - dir[1] * ld[0];
  if (Math.abs(denom) < 1e-4) return Infinity;
  const diff = sub(p1, origin);
  const t = (diff[0] * ld[1] - diff[1] * ld[0]) / denom;
  const h = (diff[0] * dir[1] - diff[1] * dir[0]) / denom;
  if (h < -1e-3 || h > 1 + 1e-3) return Infinity;
  return t > 1e-3 ? t : Infinity;
}

function lineHitSquare(a: V2, dir: V2, center: V2, r: number): V2 {
  const sx = Math.abs(dir[0]) > 1e-3 ? dir[0] : 1e-3;
  const sy = Math.abs(dir[1]) > 1e-3 ? dir[1] : 1e-3;
  const ts = [
    (center[0] + r - a[0]) / sx,
    (center[0] - r - a[0]) / sx,
    (center[1] + r - a[1]) / sy,
    (center[1] - r - a[1]) / sy,
  ].filter((t) => t > 1e-3);
  const t = ts.length ? Math.min(...ts) : 0;
  return add(a, mul(dir, t));
}

function nearestStep11T(origin: V2, dir: V2, i: V2[]): number {
  const pairs: [number, number][] = [
    [6, 1],
    [5, 2],
    [6, 3],
    [7, 2],
    [7, 4],
    [0, 3],
    [0, 5],
    [1, 4],
  ];
  let t = Infinity;
  for (const [a, b] of pairs) {
    t = Math.min(t, rayLineT(origin, dir, i[a], i[b]));
  }
  return t;
}

// Returns the segment from `origin` toward `target`, truncated at the nearest step-11 line.
function step12Segment(origin: V2, target: V2, i: V2[]): [V2, V2] {
  const dir = norm(sub(target, origin));
  const t = nearestStep11T(origin, dir, i);
  return [origin, add(origin, mul(dir, t))];
}

// Clip the infinite line through (a,b) to the outer octagon c0..c7. Returns the
// two endpoints inside the octagon.
function lineOctagonExtents(a: V2, b: V2, c: V2[]): [V2, V2] {
  const dir = norm(sub(b, a));
  const negDir: V2 = [-dir[0], -dir[1]];
  let tMin = Infinity;
  let tMax = -Infinity;
  for (let k = 0; k < 8; k++) {
    const p1 = c[k];
    const p2 = c[(k + 1) % 8];
    const tF = raySegmentT(a, dir, p1, p2);
    if (tF < Infinity) {
      tMin = Math.min(tMin, tF);
      tMax = Math.max(tMax, tF);
    }
    const tB = raySegmentT(a, negDir, p1, p2);
    if (tB < Infinity) {
      tMin = Math.min(tMin, -tB);
      tMax = Math.max(tMax, -tB);
    }
  }
  return [add(a, mul(dir, tMin)), add(a, mul(dir, tMax))];
}

// Infinite-line intersection (two lines defined by two points each).
function lineIntersect(p1: V2, p2: V2, p3: V2, p4: V2): V2 {
  const d1 = sub(p2, p1);
  const d2 = sub(p4, p3);
  const denom = d1[0] * d2[1] - d1[1] * d2[0];
  const diff = sub(p3, p1);
  const t = (diff[0] * d2[1] - diff[1] * d2[0]) / denom;
  return [p1[0] + d1[0] * t, p1[1] + d1[1] * t];
}

type Geometry = {
  center: V2;
  r: number;
  c: V2[]; // outer octagon (8)
  i: V2[]; // step-11 inner ring (8)
  v: V2[]; // central octagon (8)
  T: V2[]; // 8 star tips of the central star
  // For each outer octagon edge c[k]→c[k+1], the two step-11 line crossings:
  edgeNear: V2[]; // crossing closer to c[k]
  edgeFar: V2[]; //  crossing closer to c[k+1]
};

// The 8 step-11 line endpoints, indexed as [i-index-a, i-index-b] per line.
const STEP11_PAIRS: [number, number][] = [
  [6, 1],
  [5, 2],
  [0, 3],
  [7, 4],
  [6, 3],
  [7, 2],
  [0, 5],
  [1, 4],
];

function computeGeometry(center: V2, radius: number): Geometry {
  const r = radius;
  const innerR = r / COS_22_5 - r * (SQRT2 - 1.0);
  const R = innerR * TAN_22_5;

  const c: V2[] = [
    add(center, [r * 1.0, 0]),
    add(center, [r * COS_45, r * COS_45]),
    add(center, [0, r * 1.0]),
    add(center, [-r * COS_45, r * COS_45]),
    add(center, [-r * 1.0, 0]),
    add(center, [-r * COS_45, -r * COS_45]),
    add(center, [0, -r * 1.0]),
    add(center, [r * COS_45, -r * COS_45]),
  ];

  const mkRing = (rad: number): V2[] => [
    add(center, [rad * COS_22_5, rad * SIN_22_5]),
    add(center, [rad * SIN_22_5, rad * COS_22_5]),
    add(center, [-rad * SIN_22_5, rad * COS_22_5]),
    add(center, [-rad * COS_22_5, rad * SIN_22_5]),
    add(center, [-rad * COS_22_5, -rad * SIN_22_5]),
    add(center, [-rad * SIN_22_5, -rad * COS_22_5]),
    add(center, [rad * SIN_22_5, -rad * COS_22_5]),
    add(center, [rad * COS_22_5, -rad * SIN_22_5]),
  ];

  const i = mkRing(innerR);
  const v = mkRing(R);

  // Star tips: T[k] sits between v[k] and v[k+1]. It is the intersection of the
  // two step-11 lines that go "outward" from v[k] and v[k+1] (i.e. the lines
  // *other* than the one containing the v[k]-v[k+1] central-octagon side).
  const starTipLines: [[number, number], [number, number]][] = [
    [
      [6, 1],
      [0, 3],
    ], // T0: (i6,i1) ∩ (i0,i3)
    [
      [7, 2],
      [1, 4],
    ], // T1: (i7,i2) ∩ (i1,i4)
    [
      [0, 3],
      [5, 2],
    ], // T2: (i0,i3) ∩ (i5,i2)
    [
      [1, 4],
      [6, 3],
    ], // T3: (i1,i4) ∩ (i6,i3)
    [
      [5, 2],
      [7, 4],
    ], // T4: (i5,i2) ∩ (i7,i4)
    [
      [6, 3],
      [0, 5],
    ], // T5: (i6,i3) ∩ (i0,i5)
    [
      [7, 4],
      [6, 1],
    ], // T6: (i7,i4) ∩ (i6,i1)
    [
      [0, 5],
      [7, 2],
    ], // T7: (i0,i5) ∩ (i7,i2)
  ];
  const T: V2[] = starTipLines.map(([[a, b], [c1, d]]) =>
    lineIntersect(i[a], i[b], i[c1], i[d])
  );

  // For each outer octagon edge c[k]→c[k+1], find its 2 crossings with the
  // 8 step-11 lines (there are exactly 2 per edge). Sorted by param along the
  // edge: edgeNear is closer to c[k], edgeFar is closer to c[k+1].
  const edgeNear: V2[] = [];
  const edgeFar: V2[] = [];
  for (let k = 0; k < 8; k++) {
    const a = c[k];
    const b = c[(k + 1) % 8];
    const dir = sub(b, a);
    const hits: { p: V2; t: number }[] = [];
    for (const [pa, pb] of STEP11_PAIRS) {
      const lp1 = i[pa];
      const lp2 = i[pb];
      const ld = sub(lp2, lp1);
      const denom = dir[0] * ld[1] - dir[1] * ld[0];
      if (Math.abs(denom) < 1e-6) continue;
      const diff = sub(lp1, a);
      const t = (diff[0] * ld[1] - diff[1] * ld[0]) / denom;
      if (t < -1e-6 || t > 1 + 1e-6) continue;
      hits.push({ p: add(a, mul(dir, t)), t });
    }
    hits.sort((x, y) => x.t - y.t);
    edgeNear.push(hits[0].p);
    edgeFar.push(hits[1].p);
  }

  return { center, r, c, i, v, T, edgeNear, edgeFar };
}

export function buildLinesPath(geom: Geometry) {
  const path = Skia.Path.Make();
  const { center, r, c, i, v } = geom;

  const moveLine = ([a, b]: [V2, V2]) => {
    path.moveTo(a[0], a[1]);
    path.lineTo(b[0], b[1]);
  };

  // Step 12: 16 star-point feelers from each outer-octagon vertex toward both neighbours.
  for (let k = 0; k < 8; k++) {
    const prev = c[(k + 7) % 8];
    const next = c[(k + 1) % 8];
    moveLine(step12Segment(c[k], next, i));
    moveLine(step12Segment(c[k], prev, i));
  }

  // Step 12 extensions: from c1,c3,c5,c7 outward to the bounding square.
  const extSources: [number, number][] = [
    [1, 0],
    [1, 2],
    [3, 2],
    [3, 4],
    [5, 4],
    [5, 6],
    [7, 6],
    [7, 0],
  ];
  for (const [src, away] of extSources) {
    const dir = norm(sub(c[src], c[away]));
    const hit = lineHitSquare(c[src], dir, center, r);
    moveLine([c[src], hit]);
  }

  // Step 14: 8 step-11 lines clipped to the outer octagon, each broken across the
  // central octagon — pairs match the shader's drawStep14 ordering.
  const step14: { line: [number, number]; ends: [number, number] }[] = [
    { line: [6, 1], ends: [7, 0] },
    { line: [5, 2], ends: [4, 3] },
    { line: [7, 4], ends: [6, 5] },
    { line: [0, 3], ends: [1, 2] },
    { line: [6, 3], ends: [5, 4] },
    { line: [7, 2], ends: [0, 1] },
    { line: [0, 5], ends: [7, 6] },
    { line: [1, 4], ends: [2, 3] },
  ];
  for (const { line, ends } of step14) {
    const [p1, p2] = lineOctagonExtents(i[line[0]], i[line[1]], c);
    moveLine([p1, v[ends[0]]]);
    moveLine([v[ends[1]], p2]);
  }

  return path;
}

// 16-vertex central 8-pointed star: alternates central-octagon vertices v[k]
// (inner concave points) with outward star tips T[k].
function buildCentralStarPath(geom: Geometry) {
  const path = Skia.Path.Make();
  const { v, T } = geom;
  path.moveTo(v[0][0], v[0][1]);
  for (let k = 0; k < 8; k++) {
    path.lineTo(T[k][0], T[k][1]);
    const nextV = v[(k + 1) % 8];
    path.lineTo(nextV[0], nextV[1]);
  }
  path.close();
  return path;
}

// 8 diamond "kites" connecting the central star to the petals. Each kite sits
// at an i[k] inner-ring vertex and has corners i[k], T[k], v[k], T[k-1].
function buildDiamondsPath(geom: Geometry) {
  const path = Skia.Path.Make();
  const { i, v, T } = geom;
  for (let k = 0; k < 8; k++) {
    const km1 = (k + 7) % 8;
    const verts: V2[] = [i[k], T[k], v[k], T[km1]];
    path.moveTo(verts[0][0], verts[0][1]);
    for (let j = 1; j < 4; j++) path.lineTo(verts[j][0], verts[j][1]);
    path.close();
  }
  return path;
}

// 8 hexagonal petals around the outer octagon vertices c[k]. "Axis" petals
// (k even) are symmetric about the cardinal axes; "diagonal" petals (k odd)
// sit in the corners. Both types share the same 6-vertex topology.
function buildPetalsPath(geom: Geometry) {
  const path = Skia.Path.Make();
  const { c, i, T, edgeNear, edgeFar } = geom;
  for (let k = 0; k < 8; k++) {
    const km1 = (k + 7) % 8;
    const isAxis = k % 2 === 0;
    const verts: V2[] = isAxis
      ? [T[km1], i[k], edgeNear[k], c[k], edgeFar[km1], i[km1]]
      : [T[km1], i[km1], edgeFar[km1], c[k], edgeNear[k], i[k]];
    path.moveTo(verts[0][0], verts[0][1]);
    for (let j = 1; j < 6; j++) path.lineTo(verts[j][0], verts[j][1]);
    path.close();
  }
  return path;
}

export type LinesAnimationMode = "opacity" | "draw";

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

function pathLength(path: ReturnType<typeof Skia.Path.Make>): number {
  const iter = Skia.ContourMeasureIter(path, false, 1);
  let total = 0;
  let contour;
  while ((contour = iter.next())) total += contour.length();
  return total;
}


export function getLinePaths(center: V2, radius: number): string[] {
  return splitPathContours(buildLinesPath(computeGeometry(center, radius)));
}

export default function Lines({
  animStep,
  center,
  radius,
  colors = {
    petalColor: "#4da6ff",
    diamondColor: "rgb(218, 71, 48)",
    strokeColor: "black",
    centerStrokeColor: "white",
    starColor: "rgb(23, 119, 187)",
  },
}: {
  animStep?: number;
  center: V2;
  radius: number;
  colors: RosetteColors;
}) {
  const geom = useMemo(() => computeGeometry(center, radius), [radius]);
  const linesPath = useMemo(() => buildLinesPath(geom), [geom]);
  const centralStarPath = useMemo(() => buildCentralStarPath(geom), [geom]);
  const diamondsPath = useMemo(() => buildDiamondsPath(geom), [geom]);
  const petalsPath = useMemo(() => buildPetalsPath(geom), [geom]);

  // Staggered 0→1 progress per layer. When animStep is undefined, render fully.
  const animated = animStep !== undefined;
  const linesP = animated ? smoothstep(0, 1, animStep) : 1;
  const starP = animated ? smoothstep(1, 2, animStep) : 1;
  const diamondP = animated ? smoothstep(2, 3, animStep) : 1;
  const petalP = animated ? smoothstep(3, 4, animStep) : 1;

  return (
    <>
      {/*<Path
        path={centralStarPath}
        style="fill"
        color={colors.starColor}
        opacity={starP}
      />
      <Path
        path={diamondsPath}
        style="fill"
        color={colors.diamondColor}
        opacity={diamondP}
      />
      <Path
        path={petalsPath}
        style="fill"
        color={colors.petalColor}
        opacity={petalP}
      />*/}
      <Path
        path={linesPath}
        style="stroke"
        strokeWidth={radius * 0.1}
        strokeJoin="round"
        strokeCap="round"
        color={colors.strokeColor}
        opacity={linesP}
      />

      <Path
        path={linesPath}
        style="stroke"
        strokeWidth={radius * 0.04}
        strokeJoin="round"
        strokeCap="round"
        color={colors.centerStrokeColor}
        opacity={linesP}
      />
    </>
  );
}
