import { ELEMENTS } from '../chem/elements';
import { idealAngleForStericNumber, templateForStericNumber } from '../chem/geometry';
import type { Atom, Bond, Molecule, Vec3 } from '../chem/types';
import { computeAtomValence } from '../chem/valence';
import {
  add,
  centroid,
  cross,
  distance,
  dot,
  length,
  normalize,
  scale,
  stableJitter,
  sub,
  v3
} from '../chem/vec';
import {
  ANGLE_K,
  BOND_RADIUS_FACTOR,
  MAX_DISPLACEMENT,
  MIN_ATOM_DISTANCE,
  NONBONDED_MIN_DISTANCE,
  RELAXATION_DT,
  RELAXATION_ITERATIONS,
  REPULSION_K,
  SPRING_K
} from './constants';

export interface VirtualHydrogen {
  atomId: number;
  index: number;
  position: Vec3;
  direction: Vec3;
}

export interface LonePairLobe {
  atomId: number;
  index: number;
  position: Vec3;
  direction: Vec3;
}

export interface MoleculeLayout {
  positions: Map<number, Vec3>;
  frames: Map<number, Vec3[]>;
  virtualHydrogens: VirtualHydrogen[];
  lonePairs: LonePairLobe[];
  center: Vec3;
  boundingRadius: number;
  signature: string;
}

export function moleculeSignature(molecule: Molecule): string {
  const atomPart = [...molecule.atoms]
    .sort((a, b) => a.id - b.id)
    .map((atom) => `${atom.id}:${atom.element}:${atom.implicitHydrogens}`)
    .join('|');
  const bondPart = [...molecule.bonds]
    .sort((a, b) => a.id - b.id)
    .map((bond) => `${bond.a}-${bond.b}:${bond.order}`)
    .join('|');
  return `${atomPart}::${bondPart}`;
}

function bondLength(a: Atom, b: Atom): number {
  return (
    (ELEMENTS[a.element].covalentRadius + ELEMENTS[b.element].covalentRadius) * BOND_RADIUS_FACTOR
  );
}

function alignmentFrame(template: Vec3[], parentDirection: Vec3): Vec3[] {
  const anchor = template[0] ?? v3(1, 0, 0);
  if (length(parentDirection) < 1e-8) return template.map((direction) => ({ ...direction }));
  return template.map((direction) => rotateVectorToward(direction, anchor, parentDirection));
}

function rotateVectorToward(vector: Vec3, from: Vec3, to: Vec3): Vec3 {
  const f = normalize(from);
  const t = normalize(to);
  if (length(f) < 1e-8 || length(t) < 1e-8) return { ...vector };
  const d = Math.min(1, Math.max(-1, dot(f, t)));
  if (d > 1 - 1e-8) return { ...vector };
  if (d < -1 + 1e-8) {
    const axis =
      length(cross(f, v3(0, 1, 0))) > 1e-6 ? normalize(cross(f, v3(0, 1, 0))) : v3(1, 0, 0);
    return rotateAroundAxis(vector, axis, Math.PI);
  }
  const axis = cross(f, t);
  const angle = Math.acos(d);
  return rotateAroundAxis(vector, axis, angle);
}

function rotateAroundAxis(vector: Vec3, axis: Vec3, angle: number): Vec3 {
  const k = normalize(axis);
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  return add(
    add(scale(vector, cos), scale(cross(k, vector), sin)),
    scale(k, dot(k, vector) * (1 - cos))
  );
}

interface SlotAssignment {
  frame: Vec3[];
  usedSlots: number[];
  score: number;
}

function assignDirections(frame: Vec3[], directions: Vec3[]): SlotAssignment | null {
  if (directions.length === 0) return { frame, usedSlots: [], score: 0 };
  if (directions.length > frame.length) return null;
  let best: SlotAssignment | null = null;
  const used = new Set<number>();
  const chosen: number[] = [];

  const search = (index: number, score: number): void => {
    if (index === directions.length) {
      if (!best || score > best.score + 1e-9) {
        best = { frame, usedSlots: [...chosen], score };
      }
      return;
    }
    for (let slot = 0; slot < frame.length; slot++) {
      if (used.has(slot)) continue;
      used.add(slot);
      chosen.push(slot);
      search(index + 1, score + dot(frame[slot], directions[index]));
      chosen.pop();
      used.delete(slot);
    }
  };

  search(0, 0);
  return best;
}

function orientFrame(template: Vec3[], directions: Vec3[]): SlotAssignment | null {
  if (directions.length === 0) return { frame: template, usedSlots: [], score: 0 };
  let best: SlotAssignment | null = null;
  for (let anchor = 0; anchor < template.length; anchor++) {
    const rotated = template.map((direction) =>
      rotateVectorToward(direction, template[anchor], directions[0])
    );
    const assignment = assignDirections(rotated, directions);
    if (assignment && (!best || assignment.score > best.score + 1e-9)) {
      best = assignment;
    }
  }
  return best;
}

function connectedComponents(molecule: Molecule, adjacency: Map<number, number[]>): number[][] {
  const visited = new Set<number>();
  const components: number[][] = [];
  const atoms = [...molecule.atoms].sort((a, b) => a.id - b.id);
  for (const atom of atoms) {
    if (visited.has(atom.id)) continue;
    const component: number[] = [];
    const queue = [atom.id];
    visited.add(atom.id);
    while (queue.length > 0) {
      const id = queue.shift() as number;
      component.push(id);
      for (const neighbor of adjacency.get(id) ?? []) {
        if (!visited.has(neighbor)) {
          visited.add(neighbor);
          queue.push(neighbor);
        }
      }
    }
    components.push(component);
  }
  return components;
}

function relaxComponent(
  molecule: Molecule,
  component: number[],
  positions: Map<number, Vec3>,
  adjacency: Map<number, number[]>,
  signature: string
): void {
  const componentSet = new Set(component);
  const atomById = new Map(molecule.atoms.map((atom) => [atom.id, atom]));
  const bonds = molecule.bonds.filter(
    (bond) => componentSet.has(bond.a) && componentSet.has(bond.b) && bond.a !== bond.b
  );
  const bondKeys = new Set(
    bonds.map((bond) => (bond.a < bond.b ? `${bond.a}:${bond.b}` : `${bond.b}:${bond.a}`))
  );
  const pairs: Array<[number, number]> = [];
  for (let i = 0; i < component.length; i++) {
    for (let j = i + 1; j < component.length; j++) {
      pairs.push([component[i], component[j]]);
    }
  }

  for (let iteration = 0; iteration < RELAXATION_ITERATIONS; iteration++) {
    const displacement = new Map<number, Vec3>();
    for (const id of component) displacement.set(id, v3());

    for (const bond of bonds) {
      const a = positions.get(bond.a);
      const b = positions.get(bond.b);
      if (!a || !b) continue;
      const atomA = atomById.get(bond.a);
      const atomB = atomById.get(bond.b);
      if (!atomA || !atomB) continue;
      const target = bondLength(atomA, atomB);
      let delta = sub(b, a);
      let dist = length(delta);
      if (dist < 1e-7) {
        delta = stableJitter(signature, bond.a * 131 + bond.b);
        dist = length(delta) || 1e-7;
      }
      const direction = scale(delta, 1 / dist);
      const correction = (dist - target) * SPRING_K * RELAXATION_DT * 0.5;
      const da = displacement.get(bond.a);
      const db = displacement.get(bond.b);
      if (da) displacement.set(bond.a, add(da, scale(direction, correction)));
      if (db) displacement.set(bond.b, add(db, scale(direction, -correction)));
    }

    for (const [idA, idB] of pairs) {
      const a = positions.get(idA);
      const b = positions.get(idB);
      if (!a || !b) continue;
      let delta = sub(b, a);
      let dist = length(delta);
      if (dist < 1e-7) {
        delta = stableJitter(signature, idA * 197 + idB);
        dist = length(delta) || 1e-7;
      }
      const key = idA < idB ? `${idA}:${idB}` : `${idB}:${idA}`;
      const bonded = bondKeys.has(key);
      const minDistance = bonded ? MIN_ATOM_DISTANCE : NONBONDED_MIN_DISTANCE;
      if (dist < minDistance) {
        const direction = scale(delta, 1 / dist);
        const push =
          ((minDistance - dist) * REPULSION_K * RELAXATION_DT * 0.9) / Math.max(0.08, dist);
        const da = displacement.get(idA);
        const db = displacement.get(idB);
        if (da) displacement.set(idA, add(da, scale(direction, -push)));
        if (db) displacement.set(idB, add(db, scale(direction, push)));
      }
    }

    for (const id of component) {
      const atom = atomById.get(id);
      if (!atom) continue;
      const vsepr = computeAtomValence(molecule, atom);
      const neighbors = (adjacency.get(id) ?? []).filter((neighbor) => componentSet.has(neighbor));
      if (neighbors.length < 2 || vsepr.valenceOverflow) continue;
      const ideal = idealAngleForStericNumber(
        Math.min(4, vsepr.explicitBondCount + vsepr.implicitHydrogens + vsepr.lonePairs)
      );
      if (ideal === null) continue;
      const targetRadians = (ideal * Math.PI) / 180;
      for (let i = 0; i < neighbors.length; i++) {
        for (let j = i + 1; j < neighbors.length; j++) {
          const n1 = neighbors[i];
          const n2 = neighbors[j];
          const p0 = positions.get(id);
          const p1 = positions.get(n1);
          const p2 = positions.get(n2);
          if (!p0 || !p1 || !p2) continue;
          const v1 = sub(p1, p0);
          const v2 = sub(p2, p0);
          const l1 = length(v1);
          const l2 = length(v2);
          if (l1 < 1e-7 || l2 < 1e-7) continue;
          const targetDistance = Math.sqrt(
            Math.max(0, l1 * l1 + l2 * l2 - 2 * l1 * l2 * Math.cos(targetRadians))
          );
          let delta = sub(p2, p1);
          let dist = length(delta);
          if (dist < 1e-7) {
            delta = stableJitter(signature, n1 * 233 + n2);
            dist = length(delta) || 1e-7;
          }
          const direction = scale(delta, 1 / dist);
          const correction = (dist - targetDistance) * ANGLE_K * RELAXATION_DT * 0.16;
          const d1 = displacement.get(n1);
          const d2 = displacement.get(n2);
          if (d1) displacement.set(n1, add(d1, scale(direction, correction)));
          if (d2) displacement.set(n2, add(d2, scale(direction, -correction)));
        }
      }
    }

    for (const id of component) {
      const d = displacement.get(id);
      const p = positions.get(id);
      if (!d || !p) continue;
      const len = length(d);
      const capped = len > MAX_DISPLACEMENT ? scale(d, MAX_DISPLACEMENT / len) : d;
      if (!Number.isFinite(capped.x) || !Number.isFinite(capped.y) || !Number.isFinite(capped.z)) {
        continue;
      }
      positions.set(id, add(p, capped));
    }
  }

  const points = component.map((id) => positions.get(id)).filter((p): p is Vec3 => Boolean(p));
  const center = centroid(points);
  for (const id of component) {
    const p = positions.get(id);
    if (p) positions.set(id, sub(p, center));
  }
}

function layoutComponent(
  molecule: Molecule,
  component: number[],
  adjacency: Map<number, number[]>,
  signature: string
): Map<number, Vec3> {
  const atomById = new Map(molecule.atoms.map((atom) => [atom.id, atom]));
  const componentSet = new Set(component);
  const positions = new Map<number, Vec3>();
  const frames = new Map<number, Vec3[]>();
  const parentOf = new Map<number, number | null>();
  const queue: number[] = [];
  const visited = new Set<number>();

  const degree = (id: number): number => {
    const atom = atomById.get(id);
    return (
      (adjacency.get(id)?.filter((neighbor) => componentSet.has(neighbor)).length ?? 0) +
      (atom?.implicitHydrogens ?? 0)
    );
  };

  const root = [...component].sort((a, b) => {
    const degreeDiff = degree(b) - degree(a);
    return degreeDiff !== 0 ? degreeDiff : a - b;
  })[0];

  positions.set(root, v3());
  parentOf.set(root, null);
  visited.add(root);
  queue.push(root);

  while (queue.length > 0) {
    const id = queue.shift() as number;
    const atom = atomById.get(id);
    const current = positions.get(id);
    if (!atom || !current) continue;
    const valence = computeAtomValence(molecule, atom);
    const bondedAtoms = valence.explicitBondCount + valence.implicitHydrogens;
    const steric = Math.max(1, Math.min(4, bondedAtoms + valence.lonePairs));
    const template = templateForStericNumber(steric);
    const parentId = parentOf.get(id) ?? null;
    let frame: Vec3[];
    let startSlot = 0;
    if (parentId !== null) {
      const parentPosition = positions.get(parentId);
      frame = parentPosition
        ? alignmentFrame(template, normalize(sub(parentPosition, current)))
        : template;
      startSlot = 1;
    } else {
      frame = template;
    }
    frames.set(id, frame);
    const children = (adjacency.get(id) ?? [])
      .filter((neighbor) => componentSet.has(neighbor) && !visited.has(neighbor))
      .sort((a, b) => a - b);
    for (let i = 0; i < children.length; i++) {
      const childId = children[i];
      const childAtom = atomById.get(childId);
      if (!childAtom) continue;
      const slot = startSlot + i;
      const direction =
        frame[slot] ??
        normalize(
          v3(
            Math.cos((i * Math.PI * 2) / Math.max(1, children.length)),
            Math.sin((i * Math.PI * 2) / Math.max(1, children.length)),
            0
          )
        );
      const position = add(current, scale(direction, bondLength(atom, childAtom)));
      positions.set(childId, position);
      parentOf.set(childId, id);
      visited.add(childId);
      queue.push(childId);
    }
  }

  for (const id of component) {
    if (!positions.has(id)) {
      const atom = atomById.get(id);
      const offset = atom ? atom.position : v3();
      positions.set(id, offset);
    }
  }

  if (component.length > 1) {
    relaxComponent(molecule, component, positions, adjacency, signature);
  }

  const originalPoints = component
    .map((id) => atomById.get(id)?.position)
    .filter((p): p is Vec3 => Boolean(p));
  const originalCenter = centroid(originalPoints);
  for (const id of component) {
    const p = positions.get(id);
    if (p) positions.set(id, add(p, originalCenter));
  }
  return positions;
}

function computeVirtualGeometry(
  molecule: Molecule,
  positions: Map<number, Vec3>,
  frames: Map<number, Vec3[]>
): { virtualHydrogens: VirtualHydrogen[]; lonePairs: LonePairLobe[] } {
  const virtualHydrogens: VirtualHydrogen[] = [];
  const lonePairs: LonePairLobe[] = [];
  const adjacency = new Map<number, number[]>();
  for (const atom of molecule.atoms) adjacency.set(atom.id, []);
  for (const bond of molecule.bonds) {
    adjacency.get(bond.a)?.push(bond.b);
    adjacency.get(bond.b)?.push(bond.a);
  }

  for (const atom of molecule.atoms) {
    const position = positions.get(atom.id);
    if (!position) continue;
    const valence = computeAtomValence(molecule, atom);
    const neighbors = (adjacency.get(atom.id) ?? []).filter((id) => positions.has(id));
    const directions = neighbors
      .map((id) => {
        const neighborPosition = positions.get(id);
        return neighborPosition ? normalize(sub(neighborPosition, position)) : v3();
      })
      .filter((direction) => length(direction) > 1e-7);
    const implicitHydrogens = Math.max(0, atom.implicitHydrogens);
    const steric = neighbors.length + implicitHydrogens + valence.lonePairs;
    if (steric < 1 || steric > 4) continue;
    const template = templateForStericNumber(steric);
    const orient = orientFrame(template, directions);
    if (!orient) continue;
    const used = new Set(orient.usedSlots);
    const remaining = orient.frame
      .map((direction, index) => ({ direction, index }))
      .filter((entry) => !used.has(entry.index));
    let cursor = 0;
    for (let i = 0; i < implicitHydrogens && cursor < remaining.length; i++, cursor++) {
      const direction = remaining[cursor].direction;
      const hAtom: Atom = { id: -1, element: 'H', position: v3(), implicitHydrogens: 0 };
      virtualHydrogens.push({
        atomId: atom.id,
        index: i,
        position: add(position, scale(direction, bondLength(atom, hAtom))),
        direction
      });
    }
    for (let i = 0; i < valence.lonePairs && cursor < remaining.length; i++, cursor++) {
      const direction = remaining[cursor].direction;
      lonePairs.push({
        atomId: atom.id,
        index: i,
        position: add(position, scale(direction, 0.62)),
        direction
      });
    }
    frames.set(atom.id, orient.frame);
  }
  return { virtualHydrogens, lonePairs };
}

export function layoutMolecule(molecule: Molecule): MoleculeLayout {
  const signature = moleculeSignature(molecule);
  if (molecule.atoms.length === 0) {
    return {
      positions: new Map(),
      frames: new Map(),
      virtualHydrogens: [],
      lonePairs: [],
      center: v3(),
      boundingRadius: 3,
      signature
    };
  }

  const adjacency = new Map<number, number[]>();
  for (const atom of molecule.atoms) adjacency.set(atom.id, []);
  for (const bond of molecule.bonds) {
    if (!adjacency.has(bond.a) || !adjacency.has(bond.b)) continue;
    adjacency.get(bond.a)?.push(bond.b);
    adjacency.get(bond.b)?.push(bond.a);
  }

  const components = connectedComponents(molecule, adjacency);
  const positions = new Map<number, Vec3>();
  for (const component of components) {
    const componentPositions = layoutComponent(molecule, component, adjacency, signature);
    for (const [id, position] of componentPositions) positions.set(id, position);
  }

  const frames = new Map<number, Vec3[]>();
  const { virtualHydrogens, lonePairs } = computeVirtualGeometry(molecule, positions, frames);
  const allPoints = [
    ...[...positions.values()],
    ...virtualHydrogens.map((entry) => entry.position)
  ];
  const center = centroid(allPoints);
  let radius = 0;
  for (const point of allPoints) {
    radius = Math.max(radius, distance(point, center));
  }
  const maxRadius = Math.max(1.4, radius + 0.9);

  return {
    positions,
    frames,
    virtualHydrogens,
    lonePairs,
    center,
    boundingRadius: maxRadius,
    signature
  };
}

export function positionOf(layout: MoleculeLayout, molecule: Molecule, atomId: number): Vec3 {
  return (
    layout.positions.get(atomId) ??
    molecule.atoms.find((atom) => atom.id === atomId)?.position ??
    v3()
  );
}

export function bondKey(bond: Bond): string {
  return bond.a < bond.b ? `${bond.a}:${bond.b}` : `${bond.b}:${bond.a}`;
}

export function neighborSet(adjacency: Map<number, number[]>, id: number): Set<number> {
  return new Set(adjacency.get(id) ?? []);
}

export function angleAt(center: Vec3, a: Vec3, b: Vec3): number {
  const u = normalize(sub(a, center));
  const v = normalize(sub(b, center));
  const c = Math.min(1, Math.max(-1, dot(u, v)));
  return (Math.acos(c) * 180) / Math.PI;
}

export function isFinitePosition(position: Vec3): boolean {
  return Number.isFinite(position.x) && Number.isFinite(position.y) && Number.isFinite(position.z);
}
