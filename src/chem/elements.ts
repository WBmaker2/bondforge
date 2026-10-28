import elementData from '../data/elements.json';
import type { ElementSymbol } from './types';

export interface ElementData {
  symbol: ElementSymbol;
  nameKo: string;
  nameEn: string;
  atomicNumber: number;
  atomicMass: number;
  valenceElectrons: number;
  maxBonds: number;
  neutralBonds: number;
  electronegativity: number;
  covalentRadius: number;
  color: string;
  canExpandOctet: boolean;
  allowsIncompleteOctet: boolean;
}

export const ELEMENTS = elementData as Record<ElementSymbol, ElementData>;

export const ELEMENT_LIST: ElementSymbol[] = ['H', 'O', 'C', 'N', 'F', 'Cl', 'B'];

export const PALETTE_ELEMENTS: ElementSymbol[] = ['H', 'O', 'C', 'N', 'F', 'Cl', 'B'];

export function getElement(symbol: ElementSymbol): ElementData {
  return ELEMENTS[symbol];
}

export function isElementSymbol(value: string): value is ElementSymbol {
  return Object.prototype.hasOwnProperty.call(ELEMENTS, value);
}

export function elementOrder(symbol: ElementSymbol): number {
  return ELEMENTS[symbol].atomicNumber;
}
