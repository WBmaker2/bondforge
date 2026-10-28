import { describe, expect, it } from 'vitest';
import { validateMolecule } from '../../build/graph';
import {
  canonicalSignature,
  graphsIsomorphic,
  hasRing,
  isAcyclicConnected
} from '../../chem/isomers';
import type { Molecule } from '../../chem/types';
import { v3 } from '../../chem/vec';
import { buildButane, buildIsobutane } from '../../features/missions/targets';

function reorderButane(): Molecule {
  const carbon = (id: number) => ({
    id,
    element: 'C' as const,
    position: v3(),
    implicitHydrogens: 0
  });
  const molecule: Molecule = {
    atoms: [carbon(41), carbon(11), carbon(31), carbon(21)],
    bonds: [
      { id: 3, a: 11, b: 41, order: 1 },
      { id: 1, a: 31, b: 11, order: 1 },
      { id: 2, a: 21, b: 31, order: 1 }
    ]
  };
  for (const atom of molecule.atoms) {
    atom.implicitHydrogens = atom.id === 41 || atom.id === 21 ? 3 : 2;
  }
  return molecule;
}

describe('isomer canonicalization', () => {
  it('distinguishes the two C4H10 structural isomers', () => {
    const butane = buildButane();
    const isobutane = buildIsobutane();
    expect(validateMolecule(butane).complete).toBe(true);
    expect(validateMolecule(isobutane).complete).toBe(true);
    expect(canonicalSignature(butane)).not.toBe(canonicalSignature(isobutane));
    expect(graphsIsomorphic(butane, isobutane)).toBe(false);
  });

  it('matches the same graph regardless of atom order and ids', () => {
    const butane = buildButane();
    const reordered = reorderButane();
    expect(graphsIsomorphic(butane, reordered)).toBe(true);
    expect(canonicalSignature(butane)).toBe(canonicalSignature(reordered));
  });

  it('detects rings', () => {
    const butane = buildButane();
    const ring: Molecule = {
      atoms: butane.atoms.map((atom) => ({ ...atom, implicitHydrogens: 2 })),
      bonds: [...butane.bonds, { id: 99, a: 1, b: 4, order: 1 }]
    };
    expect(hasRing(ring)).toBe(true);
    expect(isAcyclicConnected(ring)).toBe(false);
    expect(isAcyclicConnected(butane)).toBe(true);
    expect(validateMolecule(ring).complete).toBe(false);
    expect(validateMolecule(ring).issues.some((issue) => issue.code === 'ring-unsupported')).toBe(
      true
    );
  });
});
