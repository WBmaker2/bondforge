import type { Vec3 } from './types';

export const EPSILON = 1e-9;

export function v3(x = 0, y = 0, z = 0): Vec3 {
  return { x, y, z };
}

export function add(a: Vec3, b: Vec3): Vec3 {
  return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z };
}

export function sub(a: Vec3, b: Vec3): Vec3 {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}

export function scale(a: Vec3, s: number): Vec3 {
  return { x: a.x * s, y: a.y * s, z: a.z * s };
}

export function dot(a: Vec3, b: Vec3): number {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

export function cross(a: Vec3, b: Vec3): Vec3 {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x
  };
}

export function length(a: Vec3): number {
  return Math.hypot(a.x, a.y, a.z);
}

export function lengthSq(a: Vec3): number {
  return a.x * a.x + a.y * a.y + a.z * a.z;
}

export function normalize(a: Vec3): Vec3 {
  const len = length(a);
  if (len < EPSILON) return v3(0, 0, 0);
  return scale(a, 1 / len);
}

export function distance(a: Vec3, b: Vec3): number {
  return length(sub(a, b));
}

export function lerp(a: Vec3, b: Vec3, t: number): Vec3 {
  return {
    x: a.x + (b.x - a.x) * t,
    y: a.y + (b.y - a.y) * t,
    z: a.z + (b.z - a.z) * t
  };
}

export function centroid(points: Vec3[]): Vec3 {
  if (points.length === 0) return v3();
  const sum = points.reduce((acc, p) => add(acc, p), v3());
  return scale(sum, 1 / points.length);
}

export function angleBetween(a: Vec3, b: Vec3): number {
  const na = normalize(a);
  const nb = normalize(b);
  const c = Math.min(1, Math.max(-1, dot(na, nb)));
  return (Math.acos(c) * 180) / Math.PI;
}

export function projectPerpendicular(v: Vec3, axis: Vec3): Vec3 {
  const n = normalize(axis);
  return sub(v, scale(n, dot(v, n)));
}

export function anyPerpendicular(v: Vec3): Vec3 {
  const n = normalize(v);
  const candidate = Math.abs(n.y) < 0.9 ? v3(0, 1, 0) : v3(1, 0, 0);
  const p = projectPerpendicular(candidate, n);
  if (length(p) > EPSILON) return normalize(p);
  return normalize(v3(1, 0, 0));
}

/**
 * Rotates `vector` around `axis` by `angle` radians (Rodrigues' formula).
 */
export function rotateAroundAxis(vector: Vec3, axis: Vec3, angle: number): Vec3 {
  const k = normalize(axis);
  if (length(k) < EPSILON) return vector;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  return add(
    add(scale(vector, cos), scale(cross(k, vector), sin)),
    scale(k, dot(k, vector) * (1 - cos))
  );
}

/**
 * Returns the minimal rotation that maps `from` to `to`.
 */
export function rotateVectorTo(vector: Vec3, from: Vec3, to: Vec3): Vec3 {
  const f = normalize(from);
  const t = normalize(to);
  if (length(f) < EPSILON) return vector;
  if (length(t) < EPSILON) return vector;
  const d = Math.min(1, Math.max(-1, dot(f, t)));
  if (d > 1 - 1e-8) return vector;
  if (d < -1 + 1e-8) {
    const axis = anyPerpendicular(f);
    return rotateAroundAxis(vector, axis, Math.PI);
  }
  const axis = cross(f, t);
  const angle = Math.acos(d);
  return rotateAroundAxis(vector, axis, angle);
}

export function stableHash(input: string): number {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function stableJitter(input: string, salt: number): Vec3 {
  const h = stableHash(`${input}:${salt}`);
  const x = ((h & 0xff) / 255 - 0.5) * 0.02;
  const y = (((h >> 8) & 0xff) / 255 - 0.5) * 0.02;
  const z = (((h >> 16) & 0xff) / 255 - 0.5) * 0.02;
  return v3(x, y, z);
}
