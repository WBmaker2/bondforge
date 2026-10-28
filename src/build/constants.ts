/**
 * All simulation and display constants live here so the chemistry math stays
 * free of scattered magic numbers.
 */

/** Scene units per ångström. Chemistry math always uses ångströms. */
export const DISPLAY_SCALE = 1.6;

/** Visual compression applied only at the render boundary. */
export const BOND_LENGTH_SCALE = 0.85;

/** Deterministic relaxation budget. */
export const RELAXATION_ITERATIONS = 240;
export const RELAXATION_DT = 0.016;
export const SPRING_K = 42;
export const REPULSION_K = 6;
export const ANGLE_K = 18;

/** Ångström distances used by the toy force field. */
export const MIN_ATOM_DISTANCE = 0.72;
export const NONBONDED_MIN_DISTANCE = 1.45;
export const BOND_RADIUS_FACTOR = 0.9;
export const MAX_DISPLACEMENT = 0.22;

/** Molecules are intentionally small in the MVP. */
export const MAX_ATOMS = 40;
export const MAX_BONDS = 60;

/** Net dipole below this magnitude is labelled nonpolar. */
export const POLARITY_THRESHOLD = 0.05;

/**
 * Bonds with a very small electronegativity difference (notably C–H) still
 * contribute a bond dipole, but their sum is dominated by conformation noise
 * in this toy geometry. They are listed for inspection but left out of the
 * molecular net so an alkane is not mislabelled as polar.
 */
export const MIN_NET_DIPOLE_DELTA_EN = 0.4;

/** Display radii and sizes. */
export const ATOM_RADIUS_SCALE = 0.52;
export const MIN_ATOM_RADIUS = 0.33;
export const BOND_RADIUS = 0.105;
export const LONE_PAIR_DISTANCE = 0.62;
