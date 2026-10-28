import { fillHydrogens } from '../../build/graph';
import type { Atom, Bond, BondOrder, ElementSymbol, Molecule } from '../../chem/types';
import { v3 } from '../../chem/vec';
import { missionSteps, type Mission, type MissionTarget } from './missions';

function atom(id: number, element: ElementSymbol, implicitHydrogens = 0): Atom {
  return { id, element, position: v3(), implicitHydrogens };
}

function bond(id: number, a: number, b: number, order: BondOrder = 1): Bond {
  return { id, a, b, order };
}

function chain(elements: ElementSymbol[]): Molecule {
  const atoms = elements.map((element, index) => atom(index + 1, element));
  const bonds = elements.slice(1).map((_, index) => bond(index + 1, index + 1, index + 2));
  return fillHydrogens({ atoms, bonds });
}

export function buildWater(): Molecule {
  return {
    atoms: [atom(1, 'O'), atom(2, 'H'), atom(3, 'H')],
    bonds: [bond(1, 1, 2), bond(2, 1, 3)]
  };
}

export function buildCarbonDioxide(): Molecule {
  return {
    atoms: [atom(1, 'C'), atom(2, 'O'), atom(3, 'O')],
    bonds: [bond(1, 1, 2, 2), bond(2, 1, 3, 2)]
  };
}

export function buildMethane(): Molecule {
  return {
    atoms: [atom(1, 'C'), atom(2, 'H'), atom(3, 'H'), atom(4, 'H'), atom(5, 'H')],
    bonds: [bond(1, 1, 2), bond(2, 1, 3), bond(3, 1, 4), bond(4, 1, 5)]
  };
}

export function buildAmmonia(): Molecule {
  return {
    atoms: [atom(1, 'N'), atom(2, 'H'), atom(3, 'H'), atom(4, 'H')],
    bonds: [bond(1, 1, 2), bond(2, 1, 3), bond(3, 1, 4)]
  };
}

export function buildBoronTrifluoride(): Molecule {
  return {
    atoms: [atom(1, 'B'), atom(2, 'F'), atom(3, 'F'), atom(4, 'F')],
    bonds: [bond(1, 1, 2), bond(2, 1, 3), bond(3, 1, 4)]
  };
}

export function buildAcetylene(): Molecule {
  return {
    atoms: [atom(1, 'C'), atom(2, 'C'), atom(3, 'H'), atom(4, 'H')],
    bonds: [bond(1, 1, 2, 3), bond(2, 1, 3), bond(3, 2, 4)]
  };
}

export function buildButane(): Molecule {
  return chain(['C', 'C', 'C', 'C']);
}

export function buildIsobutane(): Molecule {
  const molecule: Molecule = {
    atoms: [atom(1, 'C'), atom(2, 'C'), atom(3, 'C'), atom(4, 'C')],
    bonds: [bond(1, 1, 2), bond(2, 1, 3), bond(3, 1, 4)]
  };
  return fillHydrogens(molecule);
}

export function buildTargetMolecule(target: MissionTarget): Molecule | null {
  const formula = target.formula.replace(/\s+/g, '');
  switch (formula) {
    case 'H2O':
      return buildWater();
    case 'CO2':
      return buildCarbonDioxide();
    case 'CH4':
      return buildMethane();
    case 'NH3':
      return buildAmmonia();
    case 'BF3':
      return buildBoronTrifluoride();
    case 'C2H2':
      return buildAcetylene();
    case 'C4H10':
      return buildButane();
    default:
      return null;
  }
}

export interface PreviewOption {
  id: string;
  labelKo: string;
  molecule: Molecule;
}

export function previewOptionsForMission(mission: Mission): PreviewOption[] {
  if (mission.concept === 'isomer') {
    return [
      { id: 'butane', labelKo: '뷰테인 (사슬형)', molecule: buildButane() },
      { id: 'isobutane', labelKo: '아이소뷰테인 (가지형)', molecule: buildIsobutane() }
    ];
  }
  const options: PreviewOption[] = [];
  for (const step of missionSteps(mission)) {
    const molecule = buildTargetMolecule(step.target);
    if (molecule) options.push({ id: step.id, labelKo: step.labelKo, molecule });
  }
  return options;
}
