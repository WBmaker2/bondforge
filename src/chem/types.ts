export type ElementSymbol = 'H' | 'B' | 'C' | 'N' | 'O' | 'F' | 'Cl';

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export type BondOrder = 1 | 2 | 3;

export interface Atom {
  id: number;
  element: ElementSymbol;
  position: Vec3;
  implicitHydrogens: number;
}

export interface Bond {
  id: number;
  a: number;
  b: number;
  order: BondOrder;
}

export interface Molecule {
  atoms: Atom[];
  bonds: Bond[];
}

export type Polarity = 'polar' | 'nonpolar';
