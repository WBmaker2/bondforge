import type { Vec3 } from './types';
import { normalize, v3 } from './vec';

export type GeometryId =
  | 'linear'
  | 'trigonal-planar'
  | 'tetrahedral'
  | 'bent'
  | 'trigonal-pyramidal'
  | 'terminal'
  | 'isolated'
  | 'unsupported';

export interface GeometryName {
  ko: string;
  en: string;
}

export const GEOMETRY_NAMES: Record<GeometryId, GeometryName> = {
  linear: { ko: '선형', en: 'linear' },
  'trigonal-planar': { ko: '삼각평면형', en: 'trigonal planar' },
  tetrahedral: { ko: '정사면체형', en: 'tetrahedral' },
  bent: { ko: '굽은형', en: 'bent' },
  'trigonal-pyramidal': { ko: '삼각뿔형', en: 'trigonal pyramidal' },
  terminal: { ko: '말단 원자', en: 'terminal atom' },
  isolated: { ko: '고립 원자', en: 'isolated atom' },
  unsupported: { ko: '지원 범위 밖', en: 'unsupported' }
};

export const IDEAL_ANGLES: Record<number, number> = {
  2: 180,
  3: 120,
  4: 109.5
};

const TETRA = [
  normalize(v3(1, 1, 1)),
  normalize(v3(1, -1, -1)),
  normalize(v3(-1, 1, -1)),
  normalize(v3(-1, -1, 1))
];

const TEMPLATES: Record<number, Vec3[]> = {
  1: [v3(1, 0, 0)],
  2: [v3(1, 0, 0), v3(-1, 0, 0)],
  3: [v3(1, 0, 0), v3(-0.5, Math.sqrt(3) / 2, 0), v3(-0.5, -Math.sqrt(3) / 2, 0)],
  4: TETRA
};

export function templateForStericNumber(steric: number): Vec3[] {
  return (TEMPLATES[steric] ?? []).map((direction) => ({ ...direction }));
}

export function idealAngleForStericNumber(steric: number): number | null {
  return IDEAL_ANGLES[steric] ?? null;
}

export function approximateAngleFor(steric: number, lonePairs: number): number | null {
  if (steric === 3 && lonePairs === 1) return 118;
  if (steric === 4 && lonePairs === 1) return 107;
  if (steric === 4 && lonePairs === 2) return 104.5;
  return idealAngleForStericNumber(steric);
}

export function electronGeometryFor(steric: number): GeometryId | null {
  switch (steric) {
    case 2:
      return 'linear';
    case 3:
      return 'trigonal-planar';
    case 4:
      return 'tetrahedral';
    default:
      return null;
  }
}

export function molecularGeometryFor(
  steric: number,
  lonePairs: number,
  bondedAtoms: number
): GeometryId {
  if (bondedAtoms === 0) return 'isolated';
  if (bondedAtoms === 1) return 'terminal';
  if (steric === 2 && lonePairs === 0) return 'linear';
  if (steric === 3 && lonePairs === 0) return 'trigonal-planar';
  if (steric === 3 && lonePairs === 1) return 'bent';
  if (steric === 4 && lonePairs === 0) return 'tetrahedral';
  if (steric === 4 && lonePairs === 1) return 'trigonal-pyramidal';
  if (steric === 4 && lonePairs === 2) return 'bent';
  return 'unsupported';
}

export function geometryName(id: GeometryId | null): GeometryName {
  if (!id) return { ko: '—', en: '—' };
  return GEOMETRY_NAMES[id];
}

export function formatAngle(angle: number | null): string {
  if (angle === null || !Number.isFinite(angle)) return '—';
  return `${angle.toFixed(1).replace(/\.0$/, '')}°`;
}
