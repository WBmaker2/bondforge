import {
  approximateAngleFor,
  electronGeometryFor,
  idealAngleForStericNumber,
  molecularGeometryFor,
  type GeometryId
} from './geometry';
import { computeAtomValence, neighborIds } from './valence';
import type { Molecule } from './types';

export interface VseprResult {
  atomId: number;
  bondedAtoms: number;
  explicitNeighbors: number;
  implicitHydrogens: number;
  lonePairs: number;
  stericNumber: number;
  electronGeometry: GeometryId | null;
  molecularGeometry: GeometryId;
  idealAngle: number | null;
  approximateAngle: number | null;
  supported: boolean;
  noteKo: string;
}

export function computeVsepr(molecule: Molecule, atomId: number): VseprResult | null {
  const atom = molecule.atoms.find((candidate) => candidate.id === atomId);
  if (!atom) return null;
  const valence = computeAtomValence(molecule, atom);
  const explicitNeighbors = neighborIds(molecule, atomId).length;
  const implicitHydrogens = Math.max(0, atom.implicitHydrogens);
  const bondedAtoms = explicitNeighbors + implicitHydrogens;
  const lonePairs = valence.lonePairs;
  const stericNumber = bondedAtoms + lonePairs;
  const electronGeometry = electronGeometryFor(stericNumber);
  const molecularGeometry = molecularGeometryFor(stericNumber, lonePairs, bondedAtoms);
  const supported = stericNumber >= 1 && stericNumber <= 4 && !valence.valenceOverflow;
  const hasAngle = bondedAtoms >= 2 && stericNumber >= 2;
  const idealAngle = hasAngle ? idealAngleForStericNumber(stericNumber) : null;
  const approximateAngle = hasAngle ? approximateAngleFor(stericNumber, lonePairs) : null;

  return {
    atomId,
    bondedAtoms,
    explicitNeighbors,
    implicitHydrogens,
    lonePairs,
    stericNumber,
    electronGeometry,
    molecularGeometry,
    idealAngle,
    approximateAngle,
    supported,
    noteKo:
      'VSEPR은 전자 영역의 반발을 이용한 근사 모형입니다. 표시된 각도는 이상적인 전자 영역 배치를 바탕으로 한 근사값이며, 실제 결합 길이를 예측하지 않습니다.'
  };
}

export function findCentralAtoms(molecule: Molecule): VseprResult[] {
  const results: VseprResult[] = [];
  for (const atom of molecule.atoms) {
    const result = computeVsepr(molecule, atom.id);
    if (!result) continue;
    if (result.bondedAtoms >= 2) results.push(result);
  }
  const order: GeometryId[] = [
    'tetrahedral',
    'trigonal-pyramidal',
    'bent',
    'trigonal-planar',
    'linear'
  ];
  results.sort((a, b) => {
    const degreeDiff = b.bondedAtoms - a.bondedAtoms;
    if (degreeDiff !== 0) return degreeDiff;
    return order.indexOf(a.molecularGeometry) - order.indexOf(b.molecularGeometry);
  });
  return results;
}

export function chooseRepresentativeVsepr(molecule: Molecule): VseprResult | null {
  const central = findCentralAtoms(molecule);
  if (central.length > 0) return central[0];
  const first = molecule.atoms[0];
  return first ? computeVsepr(molecule, first.id) : null;
}

export function geometryMatches(molecule: Molecule, geometry: GeometryId | undefined): boolean {
  if (!geometry) return true;
  return findCentralAtoms(molecule).some(
    (result) => result.molecularGeometry === geometry && result.supported
  );
}

export function angleMatches(molecule: Molecule, angle: number | undefined): boolean {
  if (angle === undefined) return true;
  return findCentralAtoms(molecule).some(
    (result) => result.approximateAngle !== null && Math.abs(result.approximateAngle - angle) < 0.75
  );
}
