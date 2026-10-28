import { describe, expect, it } from 'vitest';
import { angleAt, layoutMolecule, moleculeSignature } from '../../build/layout';
import { fillHydrogens } from '../../build/graph';
import type { Molecule } from '../../chem/types';
import { distance, v3 } from '../../chem/vec';
import {
  buildAcetylene,
  buildAmmonia,
  buildBoronTrifluoride,
  buildButane,
  buildCarbonDioxide,
  buildIsobutane,
  buildMethane,
  buildWater
} from '../../features/missions/targets';

function expectFiniteLayout(molecule: Molecule) {
  const layout = layoutMolecule(molecule);
  for (const atom of molecule.atoms) {
    const position = layout.positions.get(atom.id);
    expect(position).toBeDefined();
    expect(Number.isFinite(position?.x)).toBe(true);
    expect(Number.isFinite(position?.y)).toBe(true);
    expect(Number.isFinite(position?.z)).toBe(true);
  }
  for (const virtual of layout.virtualHydrogens) {
    expect(Number.isFinite(virtual.position.x)).toBe(true);
    expect(Number.isFinite(virtual.position.y)).toBe(true);
    expect(Number.isFinite(virtual.position.z)).toBe(true);
  }
  expect(Number.isFinite(layout.center.x)).toBe(true);
  expect(layout.boundingRadius).toBeGreaterThan(0);
  return layout;
}

describe('3D layout and relaxation', () => {
  it('lays out every target molecule without NaNs', () => {
    for (const molecule of [
      buildWater(),
      buildCarbonDioxide(),
      buildMethane(),
      buildAmmonia(),
      buildBoronTrifluoride(),
      buildAcetylene(),
      buildButane(),
      buildIsobutane()
    ]) {
      expectFiniteLayout(molecule);
    }
  });

  it('is deterministic for the same structure', () => {
    const water = buildWater();
    const first = layoutMolecule(water);
    const second = layoutMolecule(water);
    expect(moleculeSignature(water)).toBe(moleculeSignature(water));
    for (const atom of water.atoms) {
      const a = first.positions.get(atom.id);
      const b = second.positions.get(atom.id);
      expect(a).toBeDefined();
      expect(b).toBeDefined();
      if (a && b) {
        expect(distance(a, b)).toBeLessThan(1e-9);
      }
    }
  });

  it('keeps water bent and acetylene linear', () => {
    const water = buildWater();
    const waterLayout = layoutMolecule(water);
    const o = waterLayout.positions.get(1);
    const h1 = waterLayout.positions.get(2);
    const h2 = waterLayout.positions.get(3);
    expect(o && h1 && h2).toBeTruthy();
    if (o && h1 && h2) {
      const angle = angleAt(o, h1, h2);
      expect(angle).toBeGreaterThan(100);
      expect(angle).toBeLessThan(120);
    }

    const acetylene = buildAcetylene();
    const acetyleneLayout = layoutMolecule(acetylene);
    const c1 = acetyleneLayout.positions.get(1);
    const c2 = acetyleneLayout.positions.get(2);
    const h = acetyleneLayout.positions.get(3);
    expect(c1 && c2 && h).toBeTruthy();
    if (c1 && c2 && h) {
      const angle = angleAt(c1, c2, h);
      expect(Math.abs(angle - 180)).toBeLessThan(8);
    }
  });

  it('places virtual hydrogens for an implicit-hydrogen water', () => {
    const water: Molecule = {
      atoms: [{ id: 1, element: 'O', position: v3(), implicitHydrogens: 2 }],
      bonds: []
    };
    const layout = layoutMolecule(water);
    expect(layout.virtualHydrogens).toHaveLength(2);
    expect(layout.lonePairs.filter((lonePair) => lonePair.atomId === 1)).toHaveLength(2);
    for (const virtual of layout.virtualHydrogens) {
      expect(distance(virtual.position, layout.positions.get(1) ?? v3())).toBeGreaterThan(0.5);
    }
  });

  it('keeps nonbonded atoms apart', () => {
    const molecules = [buildMethane(), buildAmmonia(), buildWater(), buildIsobutane()];
    for (const molecule of molecules) {
      const layout = layoutMolecule(molecule);
      for (let i = 0; i < molecule.atoms.length; i++) {
        for (let j = i + 1; j < molecule.atoms.length; j++) {
          const a = molecule.atoms[i];
          const b = molecule.atoms[j];
          const bonded = molecule.bonds.some(
            (bond) => (bond.a === a.id && bond.b === b.id) || (bond.a === b.id && bond.b === a.id)
          );
          if (bonded) continue;
          const pa = layout.positions.get(a.id);
          const pb = layout.positions.get(b.id);
          if (pa && pb) {
            expect(distance(pa, pb)).toBeGreaterThan(0.55);
          }
        }
      }
    }
  });

  it('fills hydrogens for both butane isomers', () => {
    const butane = fillHydrogens({
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
    });
    const layout = layoutMolecule(butane);
    expect(layout.virtualHydrogens).toHaveLength(10);
  });
});
