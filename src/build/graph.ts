import { ELEMENTS } from '../chem/elements';
import { hasRing, isAcyclicConnected, isConnected } from '../chem/isomers';
import type { Atom, Bond, BondOrder, ElementSymbol, Molecule, Vec3 } from '../chem/types';
import {
  computeAtomValence,
  computeValences,
  neighborIds,
  validateValence,
  type ValidationIssue
} from '../chem/valence';
import { MAX_ATOMS, MAX_BONDS } from './constants';

export interface EditResult {
  molecule: Molecule;
  changed: boolean;
  message?: string;
  issue?: ValidationIssue;
}

export interface MoleculeValidation {
  issues: ValidationIssue[];
  valenceIssues: ValidationIssue[];
  connected: boolean;
  complete: boolean;
  errorCount: number;
  warningCount: number;
  formulaKey: string;
}

export function cloneMolecule(molecule: Molecule): Molecule {
  return {
    atoms: molecule.atoms.map((atom) => ({
      ...atom,
      position: { ...atom.position },
      implicitHydrogens: atom.implicitHydrogens
    })),
    bonds: molecule.bonds.map((bond) => ({ ...bond }))
  };
}

export function createEmptyMolecule(): Molecule {
  return { atoms: [], bonds: [] };
}

export function addAtom(molecule: Molecule, element: ElementSymbol, position: Vec3): EditResult {
  if (molecule.atoms.length >= MAX_ATOMS) {
    return {
      molecule,
      changed: false,
      message: `원자는 최대 ${MAX_ATOMS}개까지 놓을 수 있습니다.`
    };
  }
  const nextId = molecule.atoms.reduce((max, atom) => Math.max(max, atom.id), 0) + 1;
  const atom: Atom = {
    id: nextId,
    element,
    position: { ...position },
    implicitHydrogens: 0
  };
  return {
    molecule: { atoms: [...molecule.atoms, atom], bonds: [...molecule.bonds] },
    changed: true
  };
}

export function removeAtom(molecule: Molecule, atomId: number): EditResult {
  const atom = molecule.atoms.find((candidate) => candidate.id === atomId);
  if (!atom) return { molecule, changed: false, message: '원자를 찾을 수 없습니다.' };
  const attached = molecule.bonds.filter((bond) => bond.a === atomId || bond.b === atomId);
  const next = cloneMolecule(molecule);
  next.atoms = next.atoms.filter((candidate) => candidate.id !== atomId);
  next.bonds = next.bonds.filter((bond) => bond.a !== atomId && bond.b !== atomId);
  for (const bond of attached) {
    const otherId = bond.a === atomId ? bond.b : bond.a;
    const other = next.atoms.find((candidate) => candidate.id === otherId);
    if (other && other.implicitHydrogens > 0) {
      const valence = computeAtomValence(next, other);
      other.implicitHydrogens = Math.max(
        0,
        ELEMENTS[other.element].neutralBonds - valence.bondOrderSum
      );
    }
  }
  return { molecule: next, changed: true };
}

function valenceIssueFor(
  atomId: number,
  message: string,
  code: ValidationIssue['code']
): ValidationIssue {
  return {
    atomId,
    bondId: null,
    code,
    level: 'error',
    messageKo: message
  };
}

export function addBond(
  molecule: Molecule,
  aId: number,
  bId: number,
  order: BondOrder = 1
): EditResult {
  if (aId === bId) {
    return {
      molecule,
      changed: false,
      message: '같은 원자끼리는 결합할 수 없습니다.',
      issue: valenceIssueFor(aId, '같은 원자끼리는 결합할 수 없습니다.', 'self-bond')
    };
  }
  const a = molecule.atoms.find((atom) => atom.id === aId);
  const b = molecule.atoms.find((atom) => atom.id === bId);
  if (!a || !b) {
    return { molecule, changed: false, message: '원자를 찾을 수 없습니다.' };
  }
  if (
    molecule.bonds.some(
      (bond) => (bond.a === aId && bond.b === bId) || (bond.a === bId && bond.b === aId)
    )
  ) {
    return {
      molecule,
      changed: false,
      message: '이미 결합이 있습니다.',
      issue: valenceIssueFor(aId, '이미 결합이 있습니다.', 'duplicate-bond')
    };
  }
  if (molecule.bonds.length >= MAX_BONDS) {
    return {
      molecule,
      changed: false,
      message: `결합은 최대 ${MAX_BONDS}개까지 만들 수 있습니다.`
    };
  }
  const valenceA = computeAtomValence(molecule, a);
  const valenceB = computeAtomValence(molecule, b);
  if (valenceA.bondOrderSum + order > ELEMENTS[a.element].maxBonds) {
    return {
      molecule,
      changed: false,
      message:
        a.element === 'H' ? '수소는 결합을 하나만 가질 수 있습니다.' : '원자가가 남지 않습니다.',
      issue: valenceIssueFor(
        a.id,
        a.element === 'H' ? '수소는 결합을 하나만 가질 수 있습니다.' : '원자가가 남지 않습니다.',
        a.element === 'H' ? 'hydrogen-overbond' : 'valence-overflow'
      )
    };
  }
  if (valenceB.bondOrderSum + order > ELEMENTS[b.element].maxBonds) {
    return {
      molecule,
      changed: false,
      message:
        b.element === 'H' ? '수소는 결합을 하나만 가질 수 있습니다.' : '원자가가 남지 않습니다.',
      issue: valenceIssueFor(
        b.id,
        b.element === 'H' ? '수소는 결합을 하나만 가질 수 있습니다.' : '원자가가 남지 않습니다.',
        b.element === 'H' ? 'hydrogen-overbond' : 'valence-overflow'
      )
    };
  }

  const next = cloneMolecule(molecule);
  const nextId = next.bonds.reduce((max, bond) => Math.max(max, bond.id), 0) + 1;
  next.bonds.push({ id: nextId, a: aId, b: bId, order });
  reconcileImplicit(next, aId);
  reconcileImplicit(next, bId);
  return { molecule: next, changed: true };
}

function reconcileImplicit(molecule: Molecule, atomId: number): void {
  const atom = molecule.atoms.find((candidate) => candidate.id === atomId);
  if (!atom || atom.implicitHydrogens <= 0) return;
  const valence = computeAtomValence(molecule, atom);
  atom.implicitHydrogens = Math.max(0, ELEMENTS[atom.element].neutralBonds - valence.bondOrderSum);
}

export function removeBond(molecule: Molecule, bondId: number): EditResult {
  const bond = molecule.bonds.find((candidate) => candidate.id === bondId);
  if (!bond) return { molecule, changed: false, message: '결합을 찾을 수 없습니다.' };
  const next = cloneMolecule(molecule);
  next.bonds = next.bonds.filter((candidate) => candidate.id !== bondId);
  reconcileImplicit(next, bond.a);
  reconcileImplicit(next, bond.b);
  return { molecule: next, changed: true };
}

export function setBondOrder(molecule: Molecule, bondId: number, order: BondOrder): EditResult {
  const bond = molecule.bonds.find((candidate) => candidate.id === bondId);
  if (!bond) return { molecule, changed: false, message: '결합을 찾을 수 없습니다.' };
  if (bond.order === order) return { molecule, changed: false };
  const a = molecule.atoms.find((atom) => atom.id === bond.a);
  const b = molecule.atoms.find((atom) => atom.id === bond.b);
  if (!a || !b) return { molecule, changed: false, message: '원자를 찾을 수 없습니다.' };
  const valenceA = computeAtomValence(molecule, a);
  const valenceB = computeAtomValence(molecule, b);
  const delta = order - bond.order;
  if (delta > 0) {
    if (valenceA.bondOrderSum + delta > ELEMENTS[a.element].maxBonds) {
      return {
        molecule,
        changed: false,
        message:
          a.element === 'H' ? '수소는 결합을 하나만 가질 수 있습니다.' : '원자가가 남지 않습니다.'
      };
    }
    if (valenceB.bondOrderSum + delta > ELEMENTS[b.element].maxBonds) {
      return {
        molecule,
        changed: false,
        message:
          b.element === 'H' ? '수소는 결합을 하나만 가질 수 있습니다.' : '원자가가 남지 않습니다.'
      };
    }
  }
  const next = cloneMolecule(molecule);
  const nextBond = next.bonds.find((candidate) => candidate.id === bondId);
  if (!nextBond) return { molecule, changed: false };
  nextBond.order = order;
  reconcileImplicit(next, bond.a);
  reconcileImplicit(next, bond.b);
  return { molecule: next, changed: true };
}

export function cycleBondOrder(molecule: Molecule, bondId: number): EditResult {
  const bond = molecule.bonds.find((candidate) => candidate.id === bondId);
  if (!bond) return { molecule, changed: false, message: '결합을 찾을 수 없습니다.' };
  const nextOrder = (bond.order === 1 ? 2 : bond.order === 2 ? 3 : 1) as BondOrder;
  return setBondOrder(molecule, bondId, nextOrder);
}

export function fillHydrogens(molecule: Molecule): Molecule {
  const next = cloneMolecule(molecule);
  for (const atom of next.atoms) {
    if (atom.element === 'H') {
      atom.implicitHydrogens = 0;
      continue;
    }
    const valence = computeAtomValence(next, atom);
    atom.implicitHydrogens = Math.max(
      0,
      ELEMENTS[atom.element].neutralBonds - valence.bondOrderSum
    );
  }
  return next;
}

export function clearImplicitHydrogens(molecule: Molecule): Molecule {
  const next = cloneMolecule(molecule);
  for (const atom of next.atoms) atom.implicitHydrogens = 0;
  return next;
}

export function validateMolecule(molecule: Molecule): MoleculeValidation {
  const valenceIssues = validateValence(molecule);
  const issues: ValidationIssue[] = [...valenceIssues];
  if (molecule.atoms.length === 0) {
    issues.push({
      atomId: null,
      bondId: null,
      code: 'empty-molecule',
      level: 'warning',
      messageKo: '아직 원자가 없습니다.',
      hintKo: '왼쪽 팔레트에서 원자를 선택하고 작업대를 클릭하세요.'
    });
  }
  const atomIds = new Set(molecule.atoms.map((atom) => atom.id));
  for (const bond of molecule.bonds) {
    if (!atomIds.has(bond.a) || !atomIds.has(bond.b)) {
      issues.push({
        atomId: null,
        bondId: bond.id,
        code: 'dangling-bond',
        level: 'error',
        messageKo: '결합이 없는 원자를 가리키고 있습니다.',
        hintKo: '분자를 초기화하거나 결합을 삭제하세요.'
      });
    }
  }
  const connected = molecule.atoms.length > 0 && isConnected(molecule);
  const cyclic = connected && hasRing(molecule);
  if (cyclic) {
    issues.push({
      atomId: null,
      bondId: null,
      code: 'ring-unsupported',
      level: 'warning',
      messageKo: '고리 구조는 이 MVP에서 지원하지 않습니다.',
      hintKo: '고리를 끊고 사슬이나 가지 구조로 만들어 보세요.'
    });
  }
  if (molecule.atoms.length > 1 && !connected) {
    issues.push({
      atomId: null,
      bondId: null,
      code: 'disconnected',
      level: 'warning',
      messageKo: '분자가 연결되어 있지 않습니다.',
      hintKo: '원자 사이에 결합을 만들어 하나의 분자로 연결하세요.'
    });
  }
  const valences = computeValences(molecule);
  const allAtomsComplete = molecule.atoms.every((atom) => valences.get(atom.id)?.complete);
  const hardError = issues.some((issue) => issue.level === 'error');
  const complete = connected && !cyclic && allAtomsComplete && !hardError;
  const errorCount = issues.filter((issue) => issue.level === 'error').length;
  const warningCount = issues.filter((issue) => issue.level === 'warning').length;
  return {
    issues,
    valenceIssues,
    connected,
    complete,
    errorCount,
    warningCount,
    formulaKey: ''
  };
}

export function moleculeStats(molecule: Molecule): {
  atomCount: number;
  bondCount: number;
  heavyAtomCount: number;
} {
  return {
    atomCount: molecule.atoms.length,
    bondCount: molecule.bonds.length,
    heavyAtomCount: molecule.atoms.filter((atom) => atom.element !== 'H').length
  };
}

export function atomNeighbors(molecule: Molecule, atomId: number): number[] {
  return neighborIds(molecule, atomId);
}

export function allBondsValid(molecule: Molecule): boolean {
  return validateMolecule(molecule).errorCount === 0;
}

export function isAcyclic(molecule: Molecule): boolean {
  return isAcyclicConnected(molecule);
}

export class MoleculeHistory {
  private past: Molecule[] = [];
  private future: Molecule[] = [];
  private readonly limit = 50;

  push(molecule: Molecule): void {
    this.past.push(cloneMolecule(molecule));
    if (this.past.length > this.limit) this.past.shift();
    this.future = [];
  }

  undo(current: Molecule): Molecule | null {
    const previous = this.past.pop();
    if (!previous) return null;
    this.future.push(cloneMolecule(current));
    return previous;
  }

  redo(current: Molecule): Molecule | null {
    const next = this.future.pop();
    if (!next) return null;
    this.past.push(cloneMolecule(current));
    return next;
  }

  get canUndo(): boolean {
    return this.past.length > 0;
  }

  get canRedo(): boolean {
    return this.future.length > 0;
  }

  clear(): void {
    this.past = [];
    this.future = [];
  }
}

export function makeBond(a: number, b: number, order: BondOrder, id: number): Bond {
  return { id, a, b, order };
}
