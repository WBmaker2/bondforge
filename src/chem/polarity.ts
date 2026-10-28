import type { MoleculeLayout } from '../build/layout';
import { MIN_NET_DIPOLE_DELTA_EN, POLARITY_THRESHOLD } from '../build/constants';
import { ELEMENTS } from './elements';
import { formatDisplayFormula, formulaCounts } from './formula';
import type { Molecule, Polarity, Vec3 } from './types';
import { add, length, normalize, scale, sub, v3 } from './vec';

export interface BondDipole {
  bondId: number | null;
  a: number;
  b: number | null;
  label: string;
  order: number;
  deltaEN: number;
  magnitude: number;
  vector: Vec3;
  implicitHydrogen: boolean;
  includedInNet: boolean;
}

export interface PolarityResult {
  bondDipoles: BondDipole[];
  netVector: Vec3;
  netMagnitude: number;
  normalizedMagnitude: number;
  direction: Vec3;
  polarity: Polarity;
  labelKo: string;
  labelEn: string;
  formula: string;
  excludedBondCount: number;
}

function dipoleBetween(
  molecule: Molecule,
  aId: number,
  bId: number | null,
  aPosition: Vec3,
  bPosition: Vec3,
  bSymbol: 'H',
  order: number,
  bondId: number | null,
  implicitHydrogen: boolean
): BondDipole | null {
  const a = molecule.atoms.find((atom) => atom.id === aId);
  if (!a) return null;
  const enA = ELEMENTS[a.element].electronegativity;
  const enB = ELEMENTS[bSymbol].electronegativity;
  const deltaEN = Math.abs(enA - enB);
  const direction = normalize(sub(bPosition, aPosition));
  const vector = enA > enB ? scale(direction, -deltaEN * order) : scale(direction, deltaEN * order);
  const label =
    a.element === bSymbol
      ? `${a.element}–${bSymbol}`
      : `${a.element}${order === 1 ? '–' : order === 2 ? '=' : '≡'}${bSymbol}`;
  return {
    bondId,
    a: aId,
    b: bId,
    label: implicitHydrogen ? `${label} (암시적 H)` : label,
    order,
    deltaEN,
    magnitude: deltaEN * order,
    vector,
    implicitHydrogen,
    includedInNet: deltaEN >= MIN_NET_DIPOLE_DELTA_EN
  };
}

export function computePolarity(molecule: Molecule, layout: MoleculeLayout): PolarityResult {
  const bondDipoles: BondDipole[] = [];
  for (const bond of molecule.bonds) {
    const a = molecule.atoms.find((atom) => atom.id === bond.a);
    const b = molecule.atoms.find((atom) => atom.id === bond.b);
    if (!a || !b) continue;
    const aPosition = layout.positions.get(a.id) ?? a.position;
    const bPosition = layout.positions.get(b.id) ?? b.position;
    const enA = ELEMENTS[a.element].electronegativity;
    const enB = ELEMENTS[b.element].electronegativity;
    const deltaEN = Math.abs(enA - enB);
    const direction = normalize(sub(bPosition, aPosition));
    const vector =
      enA > enB ? scale(direction, -deltaEN * bond.order) : scale(direction, deltaEN * bond.order);
    const label = `${a.element}${bond.order === 1 ? '–' : bond.order === 2 ? '=' : '≡'}${b.element}`;
    bondDipoles.push({
      bondId: bond.id,
      a: a.id,
      b: b.id,
      label,
      order: bond.order,
      deltaEN,
      magnitude: deltaEN * bond.order,
      vector,
      implicitHydrogen: false,
      includedInNet: deltaEN >= MIN_NET_DIPOLE_DELTA_EN
    });
  }

  for (const virtual of layout.virtualHydrogens) {
    const center = molecule.atoms.find((atom) => atom.id === virtual.atomId);
    if (!center) continue;
    const dipole = dipoleBetween(
      molecule,
      virtual.atomId,
      null,
      layout.positions.get(center.id) ?? center.position,
      virtual.position,
      'H',
      1,
      null,
      true
    );
    if (dipole) bondDipoles.push(dipole);
  }

  const netVector = bondDipoles.reduce(
    (sum, dipole) => (dipole.includedInNet ? add(sum, dipole.vector) : sum),
    v3()
  );
  const netMagnitude = length(netVector);
  const direction = normalize(netVector);
  const polarity: Polarity = netMagnitude < POLARITY_THRESHOLD ? 'nonpolar' : 'polar';

  return {
    bondDipoles,
    netVector,
    netMagnitude,
    normalizedMagnitude: Math.min(4, netMagnitude),
    direction,
    polarity,
    labelKo: polarity === 'polar' ? '극성 분자' : '무극성 분자',
    labelEn: polarity === 'polar' ? 'polar molecule' : 'nonpolar molecule',
    formula: formatDisplayFormula(formulaCounts(molecule)),
    excludedBondCount: bondDipoles.filter((dipole) => !dipole.includedInNet).length
  };
}

export function polarityMatches(expected: Polarity | undefined, result: PolarityResult): boolean {
  return expected === undefined || expected === result.polarity;
}

export function netDipoleLabel(result: PolarityResult): string {
  if (result.netMagnitude < POLARITY_THRESHOLD) return '0.00 (상쇄됨)';
  return result.netMagnitude.toFixed(2);
}
