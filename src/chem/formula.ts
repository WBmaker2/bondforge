import { ELEMENTS, isElementSymbol } from './elements';
import type { ElementSymbol, Molecule } from './types';

export type FormulaCounts = Partial<Record<ElementSymbol, number>>;

const HILL_ALPHABET = ['B', 'C', 'Cl', 'F', 'H', 'N', 'O'] as const;
const DISPLAY_ORDER: ElementSymbol[] = ['C', 'N', 'B', 'H', 'O', 'F', 'Cl'];

export function emptyCounts(): FormulaCounts {
  return {};
}

export function addElement(counts: FormulaCounts, element: ElementSymbol, amount = 1): void {
  counts[element] = (counts[element] ?? 0) + amount;
}

export function parseFormula(formula: string): FormulaCounts {
  const text = formula.replace(/\s+/g, '');
  if (!text) throw new Error('빈 분자식입니다.');
  const counts: FormulaCounts = {};
  const pattern = /([A-Z][a-z]?)(\d*)/g;
  let consumed = 0;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text)) !== null) {
    if (match.index !== consumed) {
      throw new Error(`분자식을 읽을 수 없습니다: ${formula}`);
    }
    consumed = match.index + match[0].length;
    const symbol = match[1];
    if (!isElementSymbol(symbol)) {
      throw new Error(`지원하지 않는 원소입니다: ${symbol}`);
    }
    const count = match[2] ? Number(match[2]) : 1;
    if (!Number.isFinite(count) || count <= 0) {
      throw new Error(`원자 수가 올바르지 않습니다: ${match[0]}`);
    }
    addElement(counts, symbol, count);
  }
  if (consumed !== text.length) {
    throw new Error(`분자식을 읽을 수 없습니다: ${formula}`);
  }
  return counts;
}

export function formulaCounts(molecule: Molecule): FormulaCounts {
  const counts: FormulaCounts = {};
  for (const atom of molecule.atoms) {
    addElement(counts, atom.element, 1);
    if (atom.implicitHydrogens > 0) {
      addElement(counts, 'H', atom.implicitHydrogens);
    }
  }
  return counts;
}

export function formatHillFormula(counts: FormulaCounts): string {
  const present = HILL_ALPHABET.filter((symbol) => (counts[symbol] ?? 0) > 0);
  let order: ElementSymbol[];
  if ((counts.C ?? 0) > 0) {
    order = ['C', 'H', ...present.filter((symbol) => symbol !== 'C' && symbol !== 'H')];
  } else {
    order = present;
  }
  return order
    .filter((symbol) => (counts[symbol] ?? 0) > 0)
    .map((symbol) => `${symbol}${(counts[symbol] ?? 0) === 1 ? '' : counts[symbol]}`)
    .join('');
}

export function formatDisplayFormula(counts: FormulaCounts): string {
  const known = DISPLAY_ORDER.filter((symbol) => (counts[symbol] ?? 0) > 0);
  const extra = HILL_ALPHABET.filter(
    (symbol) => (counts[symbol] ?? 0) > 0 && !DISPLAY_ORDER.includes(symbol)
  );
  return [...known, ...extra]
    .map((symbol) => `${symbol}${(counts[symbol] ?? 0) === 1 ? '' : counts[symbol]}`)
    .join('');
}

export function formulaKey(counts: FormulaCounts): string {
  return formatHillFormula(counts);
}

export function formulaEquals(a: FormulaCounts, b: FormulaCounts): boolean {
  return formulaKey(a) === formulaKey(b);
}

export function formulaFromMolecule(molecule: Molecule): string {
  return formatDisplayFormula(formulaCounts(molecule));
}

export function molarMass(counts: FormulaCounts): number {
  let total = 0;
  for (const [symbol, count] of Object.entries(counts) as [ElementSymbol, number][]) {
    total += ELEMENTS[symbol].atomicMass * count;
  }
  return total;
}

export function formulaHtml(counts: FormulaCounts): string {
  const text = formatDisplayFormula(counts);
  return text.replace(/(\d+)/g, '<sub>$1</sub>');
}

export function formulaCountEntries(counts: FormulaCounts): Array<[ElementSymbol, number]> {
  return (Object.entries(counts) as Array<[ElementSymbol, number]>)
    .filter(([, count]) => count > 0)
    .sort((a, b) => DISPLAY_ORDER.indexOf(a[0]) - DISPLAY_ORDER.indexOf(b[0]));
}
