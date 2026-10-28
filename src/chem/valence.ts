import { ELEMENTS } from './elements';
import type { Atom, Bond, Molecule } from './types';

export type IssueLevel = 'error' | 'warning' | 'info';

export type IssueCode =
  | 'valence-overflow'
  | 'hydrogen-overbond'
  | 'octet-overflow'
  | 'octet-incomplete'
  | 'valence-incomplete'
  | 'formal-charge'
  | 'radical-possible'
  | 'duplicate-bond'
  | 'self-bond'
  | 'disconnected'
  | 'empty-molecule'
  | 'dangling-bond'
  | 'ring-unsupported';

export interface ValidationIssue {
  atomId: number | null;
  bondId: number | null;
  code: IssueCode;
  level: IssueLevel;
  messageKo: string;
  hintKo?: string;
}

export interface AtomValence {
  atomId: number;
  element: Atom['element'];
  bondOrderSum: number;
  explicitBondCount: number;
  implicitHydrogens: number;
  usedValence: number;
  neutralBonds: number;
  remainingValence: number;
  lonePairs: number;
  nonbondingElectrons: number;
  bondingPairs: number;
  pairedElectrons: number;
  unpairedElectrons: number;
  formalCharge: number;
  octetLimit: number;
  octetOverflow: boolean;
  octetIncomplete: boolean;
  octetOk: boolean;
  valenceOverflow: boolean;
  valenceIncomplete: boolean;
  radicalPossible: boolean;
  complete: boolean;
}

export function bondsForAtom(molecule: Molecule, atomId: number): Bond[] {
  return molecule.bonds.filter((bond) => bond.a === atomId || bond.b === atomId);
}

export function neighborIds(molecule: Molecule, atomId: number): number[] {
  const ids: number[] = [];
  for (const bond of molecule.bonds) {
    if (bond.a === atomId) ids.push(bond.b);
    else if (bond.b === atomId) ids.push(bond.a);
  }
  return ids;
}

export function computeAtomValence(molecule: Molecule, atom: Atom): AtomValence {
  const element = ELEMENTS[atom.element];
  const bonds = bondsForAtom(molecule, atom.id);
  const bondOrderSum = bonds.reduce((sum, bond) => sum + bond.order, 0);
  const usedValence = bondOrderSum + Math.max(0, atom.implicitHydrogens);
  const remainingValence = element.neutralBonds - usedValence;
  const remainingElectrons = element.valenceElectrons - usedValence;
  const lonePairs = Math.max(0, Math.floor(remainingElectrons / 2));
  const nonbondingElectrons = 2 * lonePairs;
  const bondingPairs = bondOrderSum + Math.max(0, atom.implicitHydrogens);
  const unpairedElectrons = remainingElectrons > 0 ? remainingElectrons % 2 : 0;
  const pairedElectrons = 2 * (bondingPairs + lonePairs);
  const octetLimit = atom.element === 'H' ? 2 : 8;
  const octetOverflow = pairedElectrons > octetLimit;
  const octetIncomplete = pairedElectrons < octetLimit;
  const octetOk = !octetOverflow && (!octetIncomplete || element.allowsIncompleteOctet);
  const valenceOverflow = usedValence > element.maxBonds;
  const valenceIncomplete = usedValence < element.neutralBonds;
  const formalCharge = element.valenceElectrons - (nonbondingElectrons + bondingPairs);
  const radicalPossible = unpairedElectrons === 1 && formalCharge === 0;
  const complete =
    !valenceOverflow &&
    !octetOverflow &&
    !valenceIncomplete &&
    (!octetIncomplete || element.allowsIncompleteOctet);

  return {
    atomId: atom.id,
    element: atom.element,
    bondOrderSum,
    explicitBondCount: bonds.length,
    implicitHydrogens: Math.max(0, atom.implicitHydrogens),
    usedValence,
    neutralBonds: element.neutralBonds,
    remainingValence,
    lonePairs,
    nonbondingElectrons,
    bondingPairs,
    pairedElectrons,
    unpairedElectrons,
    formalCharge,
    octetLimit,
    octetOverflow,
    octetIncomplete,
    octetOk,
    valenceOverflow,
    valenceIncomplete,
    radicalPossible,
    complete
  };
}

export function computeValences(molecule: Molecule): Map<number, AtomValence> {
  const result = new Map<number, AtomValence>();
  for (const atom of molecule.atoms) {
    result.set(atom.id, computeAtomValence(molecule, atom));
  }
  return result;
}

export function formalChargeLabel(charge: number): string {
  if (charge === 0) return '0';
  return charge > 0 ? `+${charge}` : `${charge}`;
}

export function validateAtom(molecule: Molecule, atom: Atom): ValidationIssue[] {
  const valence = computeAtomValence(molecule, atom);
  const issues: ValidationIssue[] = [];
  const element = ELEMENTS[atom.element];

  if (atom.element === 'H' && valence.usedValence > 1) {
    issues.push({
      atomId: atom.id,
      bondId: null,
      code: 'hydrogen-overbond',
      level: 'error',
      messageKo: '수소는 결합을 하나만 가질 수 있습니다.',
      hintKo: '수소에 연결된 결합을 지우고 다시 시도하세요.'
    });
  }

  if (valence.valenceOverflow) {
    issues.push({
      atomId: atom.id,
      bondId: null,
      code: 'valence-overflow',
      level: 'error',
      messageKo: `${element.nameKo}의 원자가를 초과했습니다. (${valence.usedValence}/${element.maxBonds})`,
      hintKo: '결합 차수를 낮추거나 결합을 하나 지우세요.'
    });
  }

  if (valence.octetOverflow) {
    issues.push({
      atomId: atom.id,
      bondId: null,
      code: 'octet-overflow',
      level: 'error',
      messageKo: '옥텟을 초과했습니다.',
      hintKo:
        atom.element === 'H'
          ? '수소는 전자 2개까지만 가질 수 있습니다.'
          : '2주기 원소는 전자 8개까지만 가질 수 있습니다.'
    });
  }

  if (valence.radicalPossible) {
    issues.push({
      atomId: atom.id,
      bondId: null,
      code: 'radical-possible',
      level: 'warning',
      messageKo: '홀전자가 있는 라디칼 구조일 수 있습니다.',
      hintKo: '원자가가 남아 있다면 H 채우기로 수소를 채워 보세요.'
    });
  }

  if (valence.valenceIncomplete && !valence.valenceOverflow) {
    issues.push({
      atomId: atom.id,
      bondId: null,
      code: 'valence-incomplete',
      level: 'warning',
      messageKo: `${element.nameKo}의 원자가가 남아 있습니다. (${valence.usedValence}/${element.neutralBonds})`,
      hintKo:
        atom.element === 'H'
          ? '수소를 다른 원자와 결합하세요.'
          : 'H 채우기를 누르거나 다른 원자와 결합하세요.'
    });
  } else if (valence.octetIncomplete && !element.allowsIncompleteOctet && !valence.octetOverflow) {
    issues.push({
      atomId: atom.id,
      bondId: null,
      code: 'octet-incomplete',
      level: 'warning',
      messageKo: '옥텟이 아직 채워지지 않았습니다.',
      hintKo: '결합을 추가하거나 H 채우기를 사용하세요.'
    });
  }

  if (valence.formalCharge !== 0) {
    issues.push({
      atomId: atom.id,
      bondId: null,
      code: 'formal-charge',
      level: 'info',
      messageKo: `형식 전하 ${formalChargeLabel(valence.formalCharge)}`,
      hintKo: '형식 전하는 원자가 전자 수와 실제로 배정된 전자 수의 차이입니다.'
    });
  }

  return issues;
}

export function validateValence(molecule: Molecule): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const seenBonds = new Set<string>();
  for (const bond of molecule.bonds) {
    if (bond.a === bond.b) {
      issues.push({
        atomId: bond.a,
        bondId: bond.id,
        code: 'self-bond',
        level: 'error',
        messageKo: '같은 원자끼리는 결합할 수 없습니다.',
        hintKo: '서로 다른 두 원자를 선택하세요.'
      });
    }
    const key = bond.a < bond.b ? `${bond.a}:${bond.b}` : `${bond.b}:${bond.a}`;
    if (seenBonds.has(key)) {
      issues.push({
        atomId: null,
        bondId: bond.id,
        code: 'duplicate-bond',
        level: 'error',
        messageKo: '이미 결합이 있습니다.',
        hintKo: '기존 결합의 차수를 바꾸려면 결합을 클릭하세요.'
      });
    }
    seenBonds.add(key);
  }
  for (const atom of molecule.atoms) {
    issues.push(...validateAtom(molecule, atom));
  }
  return issues;
}
