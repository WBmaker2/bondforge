import { describe, expect, it } from 'vitest';
import { layoutMolecule } from '../../build/layout';
import { addBond, fillHydrogens, setBondOrder, validateMolecule } from '../../build/graph';
import { ELEMENTS } from '../../chem/elements';
import {
  formatDisplayFormula,
  formatHillFormula,
  formulaCounts,
  molarMass,
  parseFormula
} from '../../chem/formula';
import { computePolarity } from '../../chem/polarity';
import type { Molecule } from '../../chem/types';
import { computeAtomValence } from '../../chem/valence';
import { computeVsepr } from '../../chem/vsepr';
import { v3 } from '../../chem/vec';
import {
  buildAcetylene,
  buildAmmonia,
  buildBoronTrifluoride,
  buildCarbonDioxide,
  buildMethane,
  buildWater
} from '../../features/missions/targets';

function atomValence(molecule: Molecule, atomId: number) {
  const atom = molecule.atoms.find((candidate) => candidate.id === atomId);
  if (!atom) throw new Error(`missing atom ${atomId}`);
  return computeAtomValence(molecule, atom);
}

describe('element data', () => {
  it('uses the planned valence and radius values', () => {
    expect(ELEMENTS.H.valenceElectrons).toBe(1);
    expect(ELEMENTS.C.valenceElectrons).toBe(4);
    expect(ELEMENTS.N.valenceElectrons).toBe(5);
    expect(ELEMENTS.O.valenceElectrons).toBe(6);
    expect(ELEMENTS.F.valenceElectrons).toBe(7);
    expect(ELEMENTS.Cl.valenceElectrons).toBe(7);
    expect(ELEMENTS.N.maxBonds).toBe(4);
    expect(ELEMENTS.O.maxBonds).toBe(3);
    expect(ELEMENTS.O.neutralBonds).toBe(2);
    expect(ELEMENTS.H.covalentRadius).toBeCloseTo(0.31, 5);
    expect(ELEMENTS.B.electronegativity).toBeCloseTo(2.04, 5);
  });
});

describe('formula', () => {
  it('parses formulas and formats Hill order', () => {
    expect(parseFormula('C4H10')).toEqual({ C: 4, H: 10 });
    expect(parseFormula('H2O')).toEqual({ H: 2, O: 1 });
    expect(formatHillFormula({ C: 4, H: 10 })).toBe('C4H10');
    expect(formatHillFormula({ H: 2, O: 1 })).toBe('H2O');
    expect(formatHillFormula({ N: 1, H: 3 })).toBe('H3N');
    expect(formatDisplayFormula({ N: 1, H: 3 })).toBe('NH3');
    expect(formatDisplayFormula({ B: 1, F: 3 })).toBe('BF3');
    expect(molarMass(parseFormula('H2O'))).toBeCloseTo(18.015, 2);
  });

  it('counts implicit hydrogens', () => {
    const water: Molecule = {
      atoms: [{ id: 1, element: 'O', position: v3(), implicitHydrogens: 2 }],
      bonds: []
    };
    expect(formatDisplayFormula(formulaCounts(water))).toBe('H2O');
  });
});

describe('valence, octet, and formal charge', () => {
  it('models water, carbon dioxide, methane, ammonia, and BF3', () => {
    const water = buildWater();
    const oxygen = atomValence(water, 1);
    expect(oxygen.bondOrderSum).toBe(2);
    expect(oxygen.lonePairs).toBe(2);
    expect(oxygen.pairedElectrons).toBe(8);
    expect(oxygen.formalCharge).toBe(0);
    expect(oxygen.complete).toBe(true);
    expect(atomValence(water, 2).formalCharge).toBe(0);

    const co2 = buildCarbonDioxide();
    expect(atomValence(co2, 1).bondOrderSum).toBe(4);
    expect(atomValence(co2, 1).lonePairs).toBe(0);
    expect(atomValence(co2, 2).bondOrderSum).toBe(2);
    expect(atomValence(co2, 2).lonePairs).toBe(2);
    expect(atomValence(co2, 2).formalCharge).toBe(0);

    const methane = buildMethane();
    expect(atomValence(methane, 1).bondOrderSum).toBe(4);
    expect(atomValence(methane, 1).lonePairs).toBe(0);
    expect(atomValence(methane, 1).formalCharge).toBe(0);

    const ammonia = buildAmmonia();
    expect(atomValence(ammonia, 1).bondOrderSum).toBe(3);
    expect(atomValence(ammonia, 1).lonePairs).toBe(1);
    expect(atomValence(ammonia, 1).formalCharge).toBe(0);

    const bf3 = buildBoronTrifluoride();
    const boron = atomValence(bf3, 1);
    expect(boron.bondOrderSum).toBe(3);
    expect(boron.lonePairs).toBe(0);
    expect(boron.formalCharge).toBe(0);
    expect(boron.pairedElectrons).toBe(6);
    expect(boron.octetOk).toBe(true);
    expect(boron.complete).toBe(true);
  });

  it('accounts for implicit hydrogens in electron count and formal charge', () => {
    const water: Molecule = {
      atoms: [{ id: 1, element: 'O', position: v3(), implicitHydrogens: 2 }],
      bonds: []
    };
    const oxygen = atomValence(water, 1);
    expect(oxygen.usedValence).toBe(2);
    expect(oxygen.lonePairs).toBe(2);
    expect(oxygen.pairedElectrons).toBe(8);
    expect(oxygen.formalCharge).toBe(0);
    expect(oxygen.complete).toBe(true);
    expect(validateMolecule(water).complete).toBe(true);
  });

  it('rejects a second bond on hydrogen and valence overflow', () => {
    const water = buildWater();
    const second = addBond(water, 2, 3);
    expect(second.changed).toBe(false);
    expect(second.message).toContain('수소');
    const acetylene = buildAcetylene();
    const bad = addBond(acetylene, 1, 2, 1);
    expect(bad.changed).toBe(false);
  });

  it('fills hydrogens from a heavy-atom skeleton', () => {
    const skeleton: Molecule = {
      atoms: [
        { id: 1, element: 'C', position: v3(), implicitHydrogens: 0 },
        { id: 2, element: 'C', position: v3(), implicitHydrogens: 0 },
        { id: 3, element: 'C', position: v3(), implicitHydrogens: 0 },
        { id: 4, element: 'C', position: v3(), implicitHydrogens: 0 }
      ],
      bonds: [
        { id: 1, a: 1, b: 2, order: 1 },
        { id: 2, a: 2, b: 3, order: 1 },
        { id: 3, a: 3, b: 4, order: 1 }
      ]
    };
    const filled = fillHydrogens(skeleton);
    expect(formatDisplayFormula(formulaCounts(filled))).toBe('C4H10');
    expect(filled.atoms.map((atom) => atom.implicitHydrogens)).toEqual([3, 2, 2, 3]);
    expect(validateMolecule(filled).complete).toBe(true);
  });

  it('cycles bond order while freeing implicit hydrogens', () => {
    const ethane = fillHydrogens({
      atoms: [
        { id: 1, element: 'C', position: v3(), implicitHydrogens: 0 },
        { id: 2, element: 'C', position: v3(), implicitHydrogens: 0 }
      ],
      bonds: [{ id: 1, a: 1, b: 2, order: 1 }]
    });
    expect(formatDisplayFormula(formulaCounts(ethane))).toBe('C2H6');
    const ethene = setBondOrder(ethane, 1, 2);
    expect(ethene.changed).toBe(true);
    expect(formatDisplayFormula(formulaCounts(ethene.molecule))).toBe('C2H4');
    const ethyne = setBondOrder(ethene.molecule, 1, 3);
    expect(ethyne.changed).toBe(true);
    expect(formatDisplayFormula(formulaCounts(ethyne.molecule))).toBe('C2H2');
  });
});

describe('VSEPR geometry', () => {
  it('selects the expected geometry and angles', () => {
    const water = buildWater();
    const waterO = computeVsepr(water, 1);
    expect(waterO?.stericNumber).toBe(4);
    expect(waterO?.lonePairs).toBe(2);
    expect(waterO?.electronGeometry).toBe('tetrahedral');
    expect(waterO?.molecularGeometry).toBe('bent');
    expect(waterO?.idealAngle).toBe(109.5);
    expect(waterO?.approximateAngle).toBe(104.5);

    const co2 = buildCarbonDioxide();
    const co2C = computeVsepr(co2, 1);
    expect(co2C?.electronGeometry).toBe('linear');
    expect(co2C?.molecularGeometry).toBe('linear');
    expect(co2C?.approximateAngle).toBe(180);

    const methane = buildMethane();
    const ch4 = computeVsepr(methane, 1);
    expect(ch4?.molecularGeometry).toBe('tetrahedral');
    expect(ch4?.approximateAngle).toBe(109.5);

    const ammonia = buildAmmonia();
    const nh3 = computeVsepr(ammonia, 1);
    expect(nh3?.molecularGeometry).toBe('trigonal-pyramidal');
    expect(nh3?.approximateAngle).toBe(107);

    const bf3 = buildBoronTrifluoride();
    const boron = computeVsepr(bf3, 1);
    expect(boron?.molecularGeometry).toBe('trigonal-planar');
    expect(boron?.approximateAngle).toBe(120);

    const acetylene = buildAcetylene();
    const carbon = computeVsepr(acetylene, 1);
    expect(carbon?.molecularGeometry).toBe('linear');
    expect(carbon?.approximateAngle).toBe(180);
  });

  it('reports an implicit-hydrogen water molecule as bent', () => {
    const water: Molecule = {
      atoms: [{ id: 1, element: 'O', position: v3(), implicitHydrogens: 2 }],
      bonds: []
    };
    const vsepr = computeVsepr(water, 1);
    expect(vsepr?.stericNumber).toBe(4);
    expect(vsepr?.molecularGeometry).toBe('bent');
  });
});

describe('polarity', () => {
  it('cancels CO2 and BF3 but not H2O and NH3', () => {
    const water = buildWater();
    const waterPolarity = computePolarity(water, layoutMolecule(water));
    expect(waterPolarity.polarity).toBe('polar');
    expect(waterPolarity.netMagnitude).toBeGreaterThan(0.05);

    const co2 = buildCarbonDioxide();
    const co2Polarity = computePolarity(co2, layoutMolecule(co2));
    expect(co2Polarity.polarity).toBe('nonpolar');
    expect(co2Polarity.netMagnitude).toBeLessThan(0.05);

    const ammonia = buildAmmonia();
    const ammoniaPolarity = computePolarity(ammonia, layoutMolecule(ammonia));
    expect(ammoniaPolarity.polarity).toBe('polar');
    expect(ammoniaPolarity.netMagnitude).toBeGreaterThan(0.05);

    const bf3 = buildBoronTrifluoride();
    const bf3Polarity = computePolarity(bf3, layoutMolecule(bf3));
    expect(bf3Polarity.polarity).toBe('nonpolar');
    expect(bf3Polarity.netMagnitude).toBeLessThan(0.05);

    const methane = buildMethane();
    expect(computePolarity(methane, layoutMolecule(methane)).polarity).toBe('nonpolar');

    const acetylene = buildAcetylene();
    expect(computePolarity(acetylene, layoutMolecule(acetylene)).polarity).toBe('nonpolar');
  });

  it('includes implicit hydrogen dipoles', () => {
    const water: Molecule = {
      atoms: [{ id: 1, element: 'O', position: v3(), implicitHydrogens: 2 }],
      bonds: []
    };
    const layout = layoutMolecule(water);
    expect(layout.virtualHydrogens).toHaveLength(2);
    const polarity = computePolarity(water, layout);
    expect(polarity.polarity).toBe('polar');
    expect(polarity.bondDipoles.some((dipole) => dipole.implicitHydrogen)).toBe(true);
  });
});
