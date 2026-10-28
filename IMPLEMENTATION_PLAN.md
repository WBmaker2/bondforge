# BondForge — Implementation Plan

**Project name:** BondForge
**Folder:** `/Volumes/ External Drive 256G/Dev2/opencode/bondforge`
**Type:** Static educational SPA/PWA
**Runtime AI:** None. No LLM/API calls after build. All chemistry runs in the browser.
**Target learners:** Grades 8–11 (Korean 중2~고2)
**Subject:** Chemistry — molecular structure, VSEPR, bond polarity, isomers
**MVP duration:** 3–4 weeks

---

## 0. One-page summary

BondForge is a 3D molecular builder built around a single question: **why does a molecule with the same formula have a different shape, and why does shape change its properties?**

Students drag atoms onto a workbench, connect them with single, double, or triple bonds, and immediately see the resulting 3D structure. The app checks valence and the octet rule, derives the electron-domain geometry with a VSEPR table, and shows bond angles, lone pairs, formal charges, and the molecular dipole. Mission cards ask students to predict the shape before they build it, then explain what they see.

The app is **not** an AI tutor. Every result comes from a deterministic rule engine and a small geometry solver. There are no generated explanations, no network calls, and no hidden model.

**Why this is a strong build**

- High visual payoff with procedural geometry: atoms, bonds, lone-pair lobes, dipole arrows, and labels need no external assets.
- Real, testable chemistry: valence, octet, VSEPR domains, bond angles, vector dipoles, and graph isomorphism all have exact expected results.
- Clear misconceptions to target: "a molecule is flat", "CO₂ is polar because C=O is polar", "same formula means same molecule", "lone pairs do not affect shape".
- The hard part is not rendering; it is the rule engine. That makes the project a good fit for a coding model that can write pure functions and unit tests.

**MVP shape**

- Atoms: H, C, N, O, F, Cl.
- Bonds: single, double, triple.
- Electron domains: 2–4 (linear, trigonal planar, tetrahedral families).
- Acyclic molecules only; rings and aromatic systems are a later phase.
- Six missions, local progress, teacher mode, PWA.

---

## 1. Product definition

### 1.1 Learning problem

Students often memorize "water is bent" and "CO₂ is linear" as isolated facts. They cannot connect a molecular formula to a 3D arrangement, cannot explain why a molecule with polar bonds can be nonpolar overall, and cannot tell isomers apart. Textbooks show static pictures, so students never test a structure and see it fail.

### 1.2 Learning goals

By the end of the core missions, a student should be able to:

- Build a valid molecule from a formula using valence and the octet rule.
- Count electron domains and distinguish electron-domain geometry from molecular geometry.
- Predict approximate bond angles for common geometries.
- Explain why CO₂ and BF₃ are nonpolar even though their bonds are polar.
- Explain why H₂O and NH₃ are polar and how lone pairs change the shape.
- Recognize that C₄H₁₀ has two different structural isomers.
- Use the inspector's evidence, not memorized labels, to justify a shape.

### 1.3 Core learning loop

1. **Predict** — the mission shows a formula and asks for the shape, angle, or polarity.
2. **Build** — the student places atoms and bonds on the 3D workbench.
3. **Inspect** — the app validates the structure and shows the geometry, angles, lone pairs, and dipole.
4. **Explain** — the student answers a short question that connects the 3D evidence to the rule.
5. **Connect** — a one-sentence takeaway links the molecule to a real-world property.

### 1.4 Success criteria

- A student can build H₂O, CO₂, CH₄, NH₃, BF₃, and C₂H₂ without help.
- A student can explain the difference between tetrahedral electron geometry and bent molecular geometry.
- A student can predict whether a molecule is polar from its shape and bond dipoles.
- A student can find both C₄H₁₀ isomers and explain why they are different.
- A teacher can reset progress, reveal answers, and print a worksheet without code changes.

---

## 2. Scope

### MVP (must ship)

- Atom palette: H, C, N, O, F, Cl.
- Single, double, and triple bonds.
- Click-to-place atoms and click-to-bond; drag-to-bond is a convenience layer.
- Valence validation and octet/duet validation with clear messages.
- Formal charge calculation for the selected atom.
- VSEPR engine for steric numbers 2, 3, and 4.
- Electron-domain geometry and molecular geometry names in Korean and English.
- Ideal angles plus empirical corrections for common lone-pair cases.
- 3D scene with atom spheres, bond cylinders, lone-pair lobes, and labels.
- Molecular dipole vector and polarity badge.
- Molecular formula display, including implicit hydrogens.
- "Fill hydrogens" action for valid skeletons.
- Isomer check for small acyclic graphs.
- Six missions with prediction gates and explanations.
- Local progress, teacher reset, printable worksheet.
- Responsive layout, keyboard alternative, reduced motion.
- PWA install and offline cache.

### Later (do not build in the first pass)

- Steric numbers 5 and 6 (trigonal bipyramidal, octahedral, seesaw, square planar).
- Rings, aromaticity, and conformer search.
- Reaction balancing and simple reaction prediction.
- 3D orbital lobes and hybrid-orbital visualization.
- Periodic-table trends and electronegativity maps.
- Import/export of molecule files.
- Classroom accounts or teacher dashboards.

### Out of scope

- Quantum chemistry, DFT, or molecular dynamics.
- Real bond lengths and angles from experimental data.
- Protein or polymer modeling.
- Any server, database, login, or analytics.
- Any runtime AI or generated explanations.
- Claims that the model predicts real reaction outcomes.

---

## 3. Tech stack

| Layer | Choice | Reason |
|---|---|---|
| Build | Vite + TypeScript | Static output, fast iteration |
| 3D | Three.js | Scene graph, instancing, clipping, camera controls |
| UI | Vanilla DOM + CSS custom properties | Small bundle; no framework needed |
| Chemistry math | Pure TypeScript modules | Deterministic and unit-testable without Three.js |
| Math tests | Vitest | VSEPR, valence, polarity, and graph tests |
| Browser tests | Playwright | Build flow, missions, accessibility, screenshots |
| PWA | `vite-plugin-pwa` | Offline classroom use |
| Hosting | GitHub Pages / Cloudflare Pages | No server |

**Constraints**

- Node.js 20+.
- No backend, no API keys, no runtime network calls.
- No external textures, fonts, or model files. Use procedural materials and system fonts.
- Target 60 fps on a mid-range laptop and ≥ 30 fps on a school tablet.
- Initial gzip bundle under 800 KB.
- All chemistry calculations must run without a DOM.

---

## 4. Architecture

### 4.1 Module map

```text
src/
  main.ts
  app/
    App.ts
    state.ts
    routes.ts
  chem/
    elements.ts          element data and colors
    formula.ts           formula parsing and formatting
    valence.ts           valence, octet, formal charge
    vsepr.ts             steric number and geometry selection
    geometry.ts          ideal templates and angle corrections
    polarity.ts          bond dipoles and molecular dipole
    isomers.ts           canonical graph comparison
  build/
    graph.ts             molecule graph editing
    layout.ts            initial 3D placement
    relaxation.ts        spring/repulsion relaxation
  render/
    SceneManager.ts
    AtomMesh.ts
    BondMesh.ts
    LonePairLobes.ts
    DipoleArrow.ts
    Labels.ts
    CameraRig.ts
  features/
    builder/
    inspector/
    missions/
    teacher/
  data/
    missions.json
    elements.json
  ui/
    components/
    styles/
  storage/
    progress.ts
  tests/
    unit/
    e2e/
```

### 4.2 Coordinate frames and units

- Use ångström-scale coordinates internally for chemistry math: bond lengths around 1.0–1.5 Å.
- Use a display scale of `1 Å = 1.6` scene units so atoms are visible.
- Molecule coordinates are in a right-handed molecular frame; the camera orbits around the molecule center.
- Never mix scene units into chemistry functions. Convert only at the render boundary.

### 4.3 State

```ts
interface AppState {
  route: 'build' | 'missions' | 'teacher';
  molecule: {
    atoms: Atom[];
    bonds: Bond[];
    nextAtomId: number;
  };
  selection: {
    atomId: number | null;
    bondId: number | null;
    tool: 'select' | 'atom' | 'bond' | 'delete';
    pendingAtom: ElementSymbol | null;
  };
  view: {
    autoRotate: boolean;
    showLabels: boolean;
    showLonePairs: boolean;
    showDipole: boolean;
    clipping: number | null;
  };
  mission: {
    currentId: string | null;
    prediction: string | null;
    completed: string[];
  };
  preferences: {
    reducedMotion: boolean;
    language: 'ko' | 'en';
  };
}
```

### 4.4 Persistence

- `localStorage` key: `bondforge.progress.v1`.
- Store completed missions, last mission id, answers, and view preferences.
- Do not store molecule coordinates between sessions unless the user explicitly saves a snapshot.
- Teacher reset clears progress after confirmation.
- No personal data.

---

## 5. Data model

### 5.1 Element data

```ts
interface ElementData {
  symbol: 'H' | 'C' | 'N' | 'O' | 'F' | 'Cl';
  nameKo: string;
  atomicNumber: number;
  valenceElectrons: number;
  maxBonds: number;
  electronegativity: number; // Pauling
  covalentRadius: number;    // Å
  color: string;
  canExpandOctet: boolean;   // false for period 2 in the MVP
}
```

Initial values:

| Symbol | Valence e⁻ | Max bonds | Electronegativity | Covalent radius (Å) |
|---|---:|---:|---:|---:|
| H | 1 | 1 | 2.20 | 0.31 |
| C | 4 | 4 | 2.55 | 0.76 |
| N | 3 | 4 | 3.04 | 0.71 |
| O | 2 | 3 | 3.44 | 0.66 |
| F | 1 | 1 | 3.98 | 0.57 |
| Cl | 1 | 1 | 3.16 | 1.02 |

`maxBonds` for N and O allows a positive formal charge in a valid structure; the validator must report the formal charge rather than silently accepting it.

### 5.2 Molecule graph

```ts
type ElementSymbol = 'H' | 'C' | 'N' | 'O' | 'F' | 'Cl';

interface Atom {
  id: number;
  element: ElementSymbol;
  position: { x: number; y: number; z: number };
  implicitHydrogens: number;
}

interface Bond {
  id: number;
  a: number;       // atom id
  b: number;       // atom id
  order: 1 | 2 | 3;
}

interface Molecule {
  atoms: Atom[];
  bonds: Bond[];
}
```

### 5.3 Mission

```ts
interface Mission {
  id: string;
  titleKo: string;
  concept: 'vsepr' | 'polarity' | 'isomer' | 'bond-order';
  formulaKo: string;
  promptKo: string;
  options: string[];
  answer: string;
  target: {
    formula: string;
    heavyAtomGraph?: string; // canonical signature
    geometry?: string;
    polarity?: 'polar' | 'nonpolar';
    angleLabel?: string;
    isomerCount?: number;
  };
  explanationKo: string;
  takeawayKo: string;
  difficulty: 1 | 2 | 3;
}
```

### 5.4 Simulation constants

```ts
const DISPLAY_SCALE = 1.6;          // scene units per Å
const BOND_LENGTH_SCALE = 0.85;     // visual compression for readability
const RELAXATION_ITERATIONS = 240;
const RELAXATION_DT = 0.016;
const SPRING_K = 42;
const REPULSION_K = 6;
const MIN_ATOM_DISTANCE = 0.72;     // Å
```

Keep these in one file with comments. Do not scatter magic numbers.

### 5.5 Mission content

Six missions are stored as JSON:

1. `h2o-shape` — build H₂O and identify bent geometry and polarity.
2. `co2-polarity` — build CO₂ and explain why polar bonds cancel.
3. `ch4-nh3-h2o` — compare tetrahedral, trigonal pyramidal, and bent.
4. `c4h10-isomers` — build both structural isomers of C₄H₁₀.
5. `bf3-vs-nh3` — compare trigonal planar nonpolar BF₃ with pyramidal polar NH₃.
6. `c2h2-triple` — build C₂H₂ and identify the linear triple bond.

Each mission has a prediction gate before the builder opens and an explanation gate after the target is reached.

---

## 6. Core algorithms

### 6.1 Graph editing and valence

- Atoms are nodes; bonds are edges with order 1, 2, or 3.
- Reject duplicate bonds and self-bonds.
- A bond can be created only if both atoms have remaining valence.
- `usedValence(atom) = sum of bond orders + implicitHydrogens`.
- `remainingValence(atom) = maxBonds - usedValence(atom)`.
- Editing never mutates the previous state in place; the builder clones the graph for undo/redo.

**Validation messages (Korean)**

- `원자가가 남지 않습니다.` — no remaining valence.
- `같은 원자끼리는 결합할 수 없습니다.` — self-bond.
- `이미 결합이 있습니다.` — duplicate bond.
- `수소는 결합을 하나만 가질 수 있습니다.` — H violation.
- `옥텟을 초과했습니다.` — period-2 octet overflow.

### 6.2 Octet and formal charge

For each atom, compute:

```text
bondingElectrons = sum of bond orders
nonbondingElectrons = 2 × lonePairs(atom)
formalCharge = valenceElectrons - (nonbondingElectrons + bondingElectrons)
```

Lone pairs are derived from valence and bonding:

```text
lonePairs = floor((valenceElectrons - bondingElectrons) / 2)
```

For period-2 atoms, `bondingElectrons + nonbondingElectrons` must be ≤ 8, except H (≤ 2). If the count is odd, show a radical warning rather than pretending the structure is closed-shell.

**Test cases**

- H₂O: O has 2 bonds and 2 lone pairs; formal charge 0.
- NH₃: N has 3 bonds and 1 lone pair; formal charge 0.
- CH₄: C has 4 bonds and 0 lone pairs; formal charge 0.
- CO₂: each O has 1 double bond and 2 lone pairs; formal charge 0.
- BF₃: B has 3 bonds and 0 lone pairs; formal charge 0.

### 6.3 Steric number and VSEPR selection

For a selected central atom:

```text
stericNumber = bondedAtoms + lonePairs
```

MVP supports steric numbers 2–4:

| Steric | Electron geometry | Molecular geometry (lone pairs) | Ideal angle |
|---:|---|---|---:|
| 2 | linear | linear (0) | 180° |
| 3 | trigonal planar | trigonal planar (0) | 120° |
| 3 | trigonal planar | bent (1) | ~118° |
| 4 | tetrahedral | tetrahedral (0) | 109.5° |
| 4 | tetrahedral | trigonal pyramidal (1) | ~107° |
| 4 | tetrahedral | bent (2) | ~104.5° |

Use the ideal template for placement and the empirical correction for the displayed angle. Label both clearly: "이상 각도" vs "이 모형의 근사 각도".

### 6.4 Geometry templates

Templates are unit vectors for substituent directions:

```text
linear:       (+1,0,0), (-1,0,0)
trigonal:     (1,0,0), (-0.5,0.866,0), (-0.5,-0.866,0)
tetrahedral:  (1,1,1), (1,-1,-1), (-1,1,-1), (-1,-1,1) normalized
```

For a central atom with lone pairs, assign lone pairs to template directions and place bonds on the remaining directions. Choose the assignment that minimizes lone-pair–lone-pair repulsion (largest separation). For water, the two lone pairs occupy two tetrahedral directions and the two O–H bonds occupy the other two, producing the bent shape.

For multiple central atoms, place the graph with a breadth-first spanning tree:

1. Put the first heavy atom at the origin.
2. Place its neighbors on the local template.
3. For each new central atom, inherit one direction from its parent bond and place its remaining neighbors on the local template.
4. Run relaxation to resolve overlaps and ring closure (rings are later).

### 6.5 Relaxation

Use a small deterministic force field:

```text
F_bond   = SPRING_K × (targetLength - currentLength)
F_angle  = ANGLE_K × (targetAngle - currentAngle)
F_repel  = REPULSION_K / distance²
```

- Target bond length: sum of covalent radii × 0.9.
- Target angle: from the geometry template.
- Cap displacement per iteration to avoid explosions.
- Use a fixed number of iterations, not a wall-clock loop, so screenshots and tests are reproducible.
- Freeze the root atom and apply the resulting translation to the whole molecule at the end.

### 6.6 Polarity

For every bond, define a dipole vector from the less electronegative atom to the more electronegative atom:

```text
magnitude = (ΔEN) × bondOrder
direction = normalize(atomB - atomA) with the sign toward the more electronegative atom
```

Sum the vectors. If `|sum| < 0.05`, label the molecule nonpolar; otherwise polar and show the resultant arrow.

**Important chemistry note:** CO₂ has two polar C=O bonds that cancel because the molecule is linear. BF₃ cancels because the three B–F vectors are 120° apart. H₂O and NH₃ do not cancel because of their bent/pyramidal shapes.

### 6.7 Isomer canonicalization

The isomer check must distinguish structural isomers, not just formulas.

1. Build a heavy-atom graph (ignore explicit H; use implicit H counts).
2. Quick reject with a Weisfeiler–Lehman hash of element labels, bond orders, and degrees.
3. For equal hashes, run an exact backtracking isomorphism check over heavy atoms (graphs are small, ≤ 12 heavy atoms in the MVP).
4. If isomorphic, compare the implicit hydrogen count per mapped atom.
5. Return a canonical signature string for display and mission checks.

**Test:** C₄H₁₀ chain and branched graphs are not isomorphic; both have the same formula.

### 6.8 Formula and implicit hydrogens

- Display formula in Hill order for organic molecules: C first, H second, then alphabetical.
- Count explicit atoms plus `implicitHydrogens`.
- "Fill hydrogens" computes `remainingValence` for each heavy atom and adds implicit H, not visible atoms, unless the user asks to show them.
- If the user explicitly places H, treat them as normal atoms and set implicit H to zero.

### 6.9 Hit testing and editing

- Raycast against atom spheres first, then bond cylinders.
- Click an atom with the bond tool to start a bond; click a second atom to finish.
- Click a bond to cycle its order (1 → 2 → 3 → 1).
- Delete removes the selected atom or bond and clears implicit H where needed.
- Undo/redo stores immutable graph snapshots (max 50).

### 6.10 Determinism and units

- All math uses plain numbers and `Math` functions; no random values except a seeded jitter for initial layout.
- Seed the jitter from the molecule signature so the same structure lays out the same way every time.
- Angles are displayed to one decimal place; dipole magnitude is normalized to a 0–4 scale for the badge.
- Do not imply that the displayed bond lengths are experimental values.

---

## 7. Screens and UX

### 7.1 Builder screen

- **Left:** atom palette (H, C, N, O, F, Cl) and tools (select, bond, delete, fill H).
- **Center:** 3D workbench with orbit controls and a subtle grid plane.
- **Right:** inspector with formula, selected atom, electron domains, geometry, angle, formal charge, and polarity.
- **Bottom:** mission strip with the current prompt and a check button.
- **Top:** undo/redo, reset molecule, labels/lone-pair/dipole toggles, help.

### 7.2 Inspector

The inspector is the teaching surface. It must show:

- Molecular formula and molar mass (optional, computed from standard atomic masses).
- Selected atom: element, bonds, lone pairs, formal charge.
- Electron-domain count and electron-domain geometry.
- Molecular geometry name in Korean and English.
- Displayed angle with an "approximate" badge.
- Bond dipole list and molecular dipole result.
- Validation messages with a fix hint.

### 7.3 Mission screen

- Prediction card: formula, question, and 3–4 options.
- The student commits an answer before the builder unlocks.
- The target formula is shown; the student builds it.
- The app checks the graph, geometry, and polarity, not just the formula.
- On success: explanation, takeaway, and a "next mission" button.
- On failure: a hint that points to the evidence, not the answer.

### 7.4 Teacher mode

- Mission list with concepts, answers, and explanations.
- Show the target molecule as a 3D preview.
- Reset progress.
- Print a worksheet with formulas and blank prediction boxes.
- Toggle answer visibility for classroom projection.

### 7.5 Responsive layout

**Desktop (≥ 1024 px)**

- Three columns: palette, viewport, inspector.

**Tablet (768–1023 px)**

- Viewport with collapsible left and right drawers.

**Phone (< 768 px)**

- Viewport at the top; bottom sheet tabs: Atoms | Inspect | Mission.
- Large touch targets for atoms and bonds.
- Pinch to zoom, two-finger orbit.

### 7.6 Accessibility

- Keyboard path: `Tab` through the palette, `Enter` to select an atom, arrow keys to move a placement cursor, `B` to start a bond, `Enter` to connect, `Delete` to remove.
- Every 3D state has a text summary: formula, geometry, angle, polarity, validation.
- Screen reader announces atom and bond changes.
- Respect `prefers-reduced-motion`: no auto-rotation, no animated camera flights.
- Do not encode atom identity by color alone; show element symbols.
- Provide a "read the molecule" panel that lists atoms and bonds in words.
- Ensure the inspector is reachable without a mouse.

---

## 8. Implementation milestones

### M0 — Setup (0.5 day)

- Scaffold Vite + TypeScript + Three.js.
- Add Vitest, Playwright, ESLint, Prettier, PWA plugin.
- Create the module map and a scene with one sphere.
- **Verify:** dev server, build, and tests run.

### M1 — Chemistry core (3–4 days)

- Implement elements, formula, valence, octet, formal charge, and VSEPR selection.
- Write unit tests for H₂O, CO₂, CH₄, NH₃, BF₃, and C₂H₂.
- Build the mission data model.
- **Verify:** all chemistry tests pass without Three.js.

### M2 — Builder and inspector (3–4 days)

- Implement the graph editor, selection, bond order cycling, undo/redo.
- Build the inspector with validation and geometry output.
- Add the palette and tool state.
- **Verify:** a student can build H₂O and see the correct inspector values.

### M3 — 3D layout and rendering (3–4 days)

- Implement geometry templates, initial layout, and relaxation.
- Render atoms, bonds, lone-pair lobes, labels, and the dipole arrow.
- Add camera controls and focus-on-atom.
- **Verify:** all six target molecules render without overlaps or NaNs.

### M4 — Polarity and isomer checks (2–3 days)

- Implement bond dipoles, vector sum, and polarity badge.
- Implement canonical signatures and the C₄H₁₀ isomer check.
- Add the "fill hydrogens" action.
- **Verify:** CO₂/BF₃ are nonpolar; H₂O/NH₃ are polar; both butane isomers pass.

### M5 — Missions and teacher mode (2–3 days)

- Author six missions with prediction and explanation gates.
- Add scoring, progress persistence, and teacher reset.
- Add the printable worksheet.
- **Verify:** each mission can be completed from a fresh state.

### M6 — Responsive, accessibility, PWA (2 days)

- Implement the three layouts.
- Add keyboard controls, text summaries, reduced motion.
- Configure offline caching.
- **Verify:** keyboard-only completion; offline reload.

### M7 — QA and pilot (2 days)

- Run all tests and screenshot checks.
- Test on a low-end tablet.
- Ask 3–5 students to try the shape and polarity missions.
- Fix the top usability issues.
- Deploy.
- **Verify:** acceptance criteria below are met.

---

## 9. Testing and verification

### Unit tests (Vitest)

- Element valence and max bonds.
- Formula parsing and Hill-order formatting.
- Octet validation for H₂O, CO₂, CH₄, NH₃, BF₃.
- Steric number and geometry selection for each target.
- Angle corrections: 109.5°, 107°, 104.5°.
- Dipole cancellation for CO₂ and BF₃; nonzero for H₂O and NH₃.
- Canonical signatures: C₄H₁₀ isomers differ; duplicate graphs match.
- "Fill hydrogens" produces the expected formula.
- Relaxation is deterministic for a fixed seed.

### Interaction tests (Playwright)

- Place atoms and create a single bond.
- Cycle a bond from single to double to triple.
- Delete an atom and confirm the graph updates.
- Complete the H₂O mission correctly and incorrectly.
- Complete the C₄H₁₀ isomer mission.
- Toggle lone pairs and the dipole arrow.
- Reset progress in teacher mode.
- Keyboard-only path through the H₂O mission.

### Visual tests

- Screenshot H₂O, CO₂, CH₄, NH₃, BF₃, and C₂H₂.
- Screenshot the inspector in valid and invalid states.
- Run at 1440×900, 1024×768, and 390×844.
- Check that atom symbols remain readable at phone size.

### Accessibility checks

- `axe-core` scan with no critical issues.
- Keyboard reaches every control.
- Reduced motion disables auto-rotation.
- Text summary matches the current molecule.
- Color is not the only atom cue.

### Performance budget

- 60 fps on a mid-range laptop; ≥ 30 fps on a school tablet.
- No per-frame object creation.
- Cap the molecule at 40 atoms and 60 bonds in the MVP.
- Pause rendering when the tab is hidden.
- DPR clamp to 2.
- Initial load < 2.5 s on simulated 4G.

---

## 10. Acceptance criteria / Go-No-Go

- [ ] A student can build H₂O, CO₂, CH₄, NH₃, BF₃, and C₂H₂.
- [ ] Valence and octet violations are explained in Korean.
- [ ] The inspector distinguishes electron-domain geometry from molecular geometry.
- [ ] Bond angles show the correct approximate values for the six targets.
- [ ] CO₂ and BF₃ are labeled nonpolar; H₂O and NH₃ are labeled polar.
- [ ] Both C₄H₁₀ isomers are accepted; the same graph is not double-counted.
- [ ] Six missions are playable, scored, and saved locally.
- [ ] Teacher reset works.
- [ ] Keyboard-only mission completion works.
- [ ] Reduced motion is respected.
- [ ] The app works offline after the first load.
- [ ] No runtime network calls to an AI service or backend.
- [ ] The "VSEPR approximation" notice is visible in the inspector.

If the VSEPR or polarity tests fail, stop and fix the chemistry before adding missions.

---

## 11. Risks and mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| VSEPR is taught as if it were exact quantum chemistry | False confidence | Label it "VSEPR approximation"; no orbital or energy claims |
| Empirical angles (104.5°, 107°) are mistaken for derived values | Misconception | Show ideal vs approximate angle; explain lone-pair repulsion |
| Hypervalent or transition-metal molecules break the validator | Wrong structures | MVP restricts elements to H, C, N, O, F, Cl; steric 2–4 |
| Ring and aromatic support causes layout explosions | Scope creep | Rings and aromatic systems are explicitly later |
| Isomer check accepts the same graph twice | Wrong mission result | WL hash plus exact backtracking; test both butane isomers |
| Force relaxation produces overlaps or NaNs | Unusable 3D | Fixed iteration count, displacement cap, deterministic seed, fallback to template layout |
| Drag-and-drop is inaccessible | Some students cannot build | Full keyboard path and click-to-place alternative |
| Students think the model shows real bond lengths | Misconception | Use "approximate model" labels; no experimental claims |

---

## 12. AI build guide

Use the AI coding agent for scaffolding, pure chemistry functions, 3D rendering, tests, and screenshot-driven fixes. Chemistry correctness is easy to make plausible but wrong, so tests and teacher review are mandatory.

### Recommended build order

1. Scaffold Vite + TypeScript + Three.js with tests.
2. Implement the pure chemistry modules and unit tests first.
3. Build the graph editor and inspector without 3D.
4. Add geometry templates and relaxation.
5. Add atoms, bonds, lone pairs, labels, and the dipole arrow.
6. Add polarity and isomer checks.
7. Add missions and teacher mode.
8. Do responsive/accessibility passes.
9. Use screenshots at three viewports and fix visual regressions.

### Prompt rules

- State the constraint: “No backend, no runtime AI, no network calls.”
- Require a test for every chemistry rule.
- Ask the agent to explain the valence/octet model before coding.
- Use exact expected values in tests, not approximate snapshots.
- Never let the app claim to predict real reaction outcomes.
- Provide screenshots when fixing layout or camera issues.

### What not to delegate

- The decision that the VSEPR simplification is pedagogically acceptable.
- The final review of bond angles and polarity examples.
- Accessibility judgment.
- Classroom pilot feedback.

### Definition of done

- All chemistry and interaction tests pass.
- The acceptance checklist is complete.
- A teacher can run the six missions without developer help.
- The model's simplifications are visible in the UI.

---

## 13. Future extensions

- Steric numbers 5 and 6 with the full VSEPR table.
- Ring and aromatic molecule support.
- Conformer search and energy ranking (clearly labeled as a toy model).
- Reaction balancing and simple reaction prediction.
- 3D hybrid-orbital and molecular-orbital lobes.
- Periodic-table trends and electronegativity maps.
- Molecule import/export with a simple JSON format.
- Classroom worksheet generator.
- Localization.

---

## 14. References

- IUPAC Gold Book: https://goldbook.iupac.org/
- Chemistry LibreTexts — VSEPR theory: https://chem.libretexts.org/
- Pauling electronegativity values: https://en.wikipedia.org/wiki/Electronegativity
- Three.js documentation: https://threejs.org/docs/
- MDN Web APIs: https://developer.mozilla.org/en-US/docs/Web/API
- WCAG 2.2 quick reference: https://www.w3.org/WAI/WCAG22/quickref/

---

**Plan version:** 1.0
**Created:** 2026-10-28
**Next step:** scaffold the project, then implement M1 (chemistry core + tests) before building the 3D workbench.
