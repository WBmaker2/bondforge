import { formatHillFormula, formulaCounts } from './formula';
import type { ElementSymbol, Molecule } from './types';
import { stableHash } from './vec';

interface HeavyEdge {
  to: number;
  order: number;
}

interface HeavyNode {
  id: number;
  element: ElementSymbol;
  hCount: number;
  bonds: HeavyEdge[];
}

interface HeavyGraph {
  nodes: Map<number, HeavyNode>;
  edgeOrders: number[];
}

function buildHeavyGraph(molecule: Molecule): HeavyGraph {
  const heavyAtoms = molecule.atoms.filter((atom) => atom.element !== 'H');
  const heavyIds = new Set(heavyAtoms.map((atom) => atom.id));
  const nodes = new Map<number, HeavyNode>();
  for (const atom of heavyAtoms) {
    nodes.set(atom.id, {
      id: atom.id,
      element: atom.element,
      hCount: Math.max(0, atom.implicitHydrogens),
      bonds: []
    });
  }

  for (const atom of molecule.atoms) {
    if (atom.element !== 'H') continue;
    for (const bond of molecule.bonds) {
      if (bond.a === atom.id && heavyIds.has(bond.b)) {
        const node = nodes.get(bond.b);
        if (node) node.hCount += 1;
      } else if (bond.b === atom.id && heavyIds.has(bond.a)) {
        const node = nodes.get(bond.a);
        if (node) node.hCount += 1;
      }
    }
  }

  const edgeOrders: number[] = [];
  for (const bond of molecule.bonds) {
    if (!heavyIds.has(bond.a) || !heavyIds.has(bond.b) || bond.a === bond.b) continue;
    const a = nodes.get(bond.a);
    const b = nodes.get(bond.b);
    if (!a || !b) continue;
    a.bonds.push({ to: bond.b, order: bond.order });
    b.bonds.push({ to: bond.a, order: bond.order });
    edgeOrders.push(bond.order);
  }
  return { nodes, edgeOrders };
}

function invariant(node: HeavyNode, graph: HeavyGraph): string {
  const neighborLabels = node.bonds
    .map((edge) => {
      const neighbor = graph.nodes.get(edge.to);
      return `${edge.order}:${neighbor?.element ?? '?'}:${neighbor?.hCount ?? 0}`;
    })
    .sort()
    .join(',');
  return `${node.element}|${node.hCount}|${node.bonds.length}|${neighborLabels}`;
}

function adjacencyKey(a: number, b: number): string {
  return a < b ? `${a}:${b}` : `${b}:${a}`;
}

function edgeOrderMap(graph: HeavyGraph): Map<string, number> {
  const map = new Map<string, number>();
  for (const node of graph.nodes.values()) {
    for (const edge of node.bonds) {
      map.set(adjacencyKey(node.id, edge.to), edge.order);
    }
  }
  return map;
}

export function wlHash(molecule: Molecule): string {
  const graph = buildHeavyGraph(molecule);
  const nodes = [...graph.nodes.values()];
  if (nodes.length === 0) return 'empty';
  const labels = new Map<number, string>();
  for (const node of nodes) {
    labels.set(
      node.id,
      `${node.element}|${node.hCount}|${node.bonds.length}|${node.bonds
        .map((edge) => edge.order)
        .sort()
        .join(',')}`
    );
  }
  const rounds = Math.max(2, Math.min(6, nodes.length));
  for (let round = 0; round < rounds; round++) {
    const next = new Map<number, string>();
    for (const node of nodes) {
      const neighborPart = node.bonds
        .map((edge) => `${edge.order}:${labels.get(edge.to) ?? ''}`)
        .sort()
        .join('|');
      next.set(node.id, `r${round}:${stableHash(`${labels.get(node.id)}::${neighborPart}`)}`);
    }
    for (const [id, label] of next) labels.set(id, label);
  }
  return [...labels.values()].sort().join(';');
}

export function canonicalSignature(molecule: Molecule): string {
  return `${formatHillFormula(formulaCounts(molecule))}:${wlHash(molecule)}`;
}

export function graphsIsomorphic(a: Molecule, b: Molecule): boolean {
  const ga = buildHeavyGraph(a);
  const gb = buildHeavyGraph(b);
  if (ga.nodes.size !== gb.nodes.size) return false;
  if (ga.nodes.size === 0) return true;
  if ([...ga.edgeOrders].sort().join(',') !== [...gb.edgeOrders].sort().join(',')) {
    return false;
  }
  const invariantCounts = (graph: HeavyGraph): Map<string, number> => {
    const map = new Map<string, number>();
    for (const node of graph.nodes.values()) {
      const key = invariant(node, graph);
      map.set(key, (map.get(key) ?? 0) + 1);
    }
    return map;
  };
  const countsA = invariantCounts(ga);
  const countsB = invariantCounts(gb);
  if (countsA.size !== countsB.size) return false;
  for (const [key, count] of countsA) {
    if (countsB.get(key) !== count) return false;
  }

  const ordersA = edgeOrderMap(ga);
  const ordersB = edgeOrderMap(gb);
  const nodesA = [...ga.nodes.values()].sort(
    (x, y) => invariant(x, ga).localeCompare(invariant(y, ga)) || x.id - y.id
  );
  const candidates = new Map<number, HeavyNode[]>();
  for (const node of nodesA) {
    const key = invariant(node, ga);
    candidates.set(
      node.id,
      [...gb.nodes.values()].filter((candidate) => invariant(candidate, gb) === key)
    );
  }
  nodesA.sort((x, y) => {
    const countDiff = (candidates.get(x.id)?.length ?? 0) - (candidates.get(y.id)?.length ?? 0);
    return countDiff !== 0 ? countDiff : y.bonds.length - x.bonds.length;
  });

  const mapping = new Map<number, number>();
  const reverse = new Map<number, number>();

  const compatible = (aId: number, bId: number): boolean => {
    for (const [mappedA, mappedB] of mapping) {
      const orderA = ordersA.get(adjacencyKey(aId, mappedA)) ?? 0;
      const orderB = ordersB.get(adjacencyKey(bId, mappedB)) ?? 0;
      if (orderA !== orderB) return false;
    }
    return true;
  };

  const search = (index: number): boolean => {
    if (index === nodesA.length) return true;
    const node = nodesA[index];
    for (const candidate of candidates.get(node.id) ?? []) {
      if (reverse.has(candidate.id)) continue;
      if (!compatible(node.id, candidate.id)) continue;
      mapping.set(node.id, candidate.id);
      reverse.set(candidate.id, node.id);
      if (search(index + 1)) return true;
      mapping.delete(node.id);
      reverse.delete(candidate.id);
    }
    return false;
  };

  return search(0);
}

export function isConnected(molecule: Molecule): boolean {
  if (molecule.atoms.length === 0) return false;
  const adjacency = new Map<number, number[]>();
  for (const atom of molecule.atoms) adjacency.set(atom.id, []);
  for (const bond of molecule.bonds) {
    if (!adjacency.has(bond.a) || !adjacency.has(bond.b)) continue;
    adjacency.get(bond.a)?.push(bond.b);
    adjacency.get(bond.b)?.push(bond.a);
  }
  const visited = new Set<number>();
  const start = molecule.atoms[0].id;
  const stack = [start];
  visited.add(start);
  while (stack.length > 0) {
    const id = stack.pop() as number;
    for (const neighbor of adjacency.get(id) ?? []) {
      if (!visited.has(neighbor)) {
        visited.add(neighbor);
        stack.push(neighbor);
      }
    }
  }
  return visited.size === molecule.atoms.length;
}

export function hasRing(molecule: Molecule): boolean {
  const adjacency = new Map<number, Array<{ to: number; bondId: number }>>();
  for (const atom of molecule.atoms) adjacency.set(atom.id, []);
  for (const bond of molecule.bonds) {
    if (!adjacency.has(bond.a) || !adjacency.has(bond.b)) continue;
    adjacency.get(bond.a)?.push({ to: bond.b, bondId: bond.id });
    adjacency.get(bond.b)?.push({ to: bond.a, bondId: bond.id });
  }
  const visited = new Set<number>();
  const dfs = (id: number, parentBond: number | null): boolean => {
    visited.add(id);
    for (const edge of adjacency.get(id) ?? []) {
      if (edge.bondId === parentBond) continue;
      if (visited.has(edge.to)) return true;
      if (dfs(edge.to, edge.bondId)) return true;
    }
    return false;
  };
  for (const atom of molecule.atoms) {
    if (!visited.has(atom.id)) {
      if (dfs(atom.id, null)) return true;
    }
  }
  return false;
}

export function isAcyclicConnected(molecule: Molecule): boolean {
  return isConnected(molecule) && !hasRing(molecule);
}
