import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { CSS2DObject, CSS2DRenderer } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import type { MoleculeLayout } from '../build/layout';
import {
  BOND_RADIUS,
  DISPLAY_SCALE,
  LONE_PAIR_DISTANCE,
  POLARITY_THRESHOLD
} from '../build/constants';
import { ELEMENTS } from '../chem/elements';
import { computePolarity } from '../chem/polarity';
import type { ElementSymbol, Molecule, Vec3 } from '../chem/types';
import { computeAtomValence } from '../chem/valence';
import type { ViewPreferences } from '../storage/progress';

export interface SceneSelection {
  atomId: number | null;
  bondId: number | null;
}

export interface SceneState {
  molecule: Molecule;
  layout: MoleculeLayout;
  view: ViewPreferences;
  selection: SceneSelection;
  pendingBondAtomId?: number | null;
  pendingElement?: ElementSymbol | null;
  reducedMotion?: boolean;
}

export type SceneKeyAction =
  'place' | 'bond' | 'delete' | 'next-atom' | 'prev-atom' | 'fill' | 'escape';

export interface SceneCallbacks {
  onAtomClick?: (atomId: number) => void;
  onBondClick?: (bondId: number) => void;
  onBackgroundClick?: (position: Vec3) => void;
  onKeyAction?: (action: SceneKeyAction) => void;
}

export interface SceneOptions {
  readOnly?: boolean;
  autoRotate?: boolean;
  showGrid?: boolean;
  autoFit?: boolean;
}

type AtomStyle = 'normal' | 'selected' | 'pending';
type BondStyle = 'normal' | 'selected' | 'ghost';

const Y_AXIS = new THREE.Vector3(0, 1, 0);
const Z_AXIS = new THREE.Vector3(0, 0, 1);
const X_AXIS = new THREE.Vector3(1, 0, 0);

function toScene(position: Vec3): THREE.Vector3 {
  return new THREE.Vector3(position.x, position.y, position.z).multiplyScalar(DISPLAY_SCALE);
}

function toMolecule(position: THREE.Vector3): Vec3 {
  return {
    x: position.x / DISPLAY_SCALE,
    y: position.y / DISPLAY_SCALE,
    z: position.z / DISPLAY_SCALE
  };
}

function atomSceneRadius(element: ElementSymbol): number {
  const data = ELEMENTS[element];
  return Math.max(0.18, data.covalentRadius * 0.42) * DISPLAY_SCALE;
}

export class SceneManager {
  private container: HTMLElement;
  private options: SceneOptions;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private renderer: THREE.WebGLRenderer;
  private labelRenderer: CSS2DRenderer;
  private controls: OrbitControls;
  private raycaster = new THREE.Raycaster();
  private pointer = new THREE.Vector2();
  private moleculeGroup = new THREE.Group();
  private platformGroup = new THREE.Group();
  private cursorGroup = new THREE.Group();
  private pickables: THREE.Object3D[] = [];
  private callbacks: SceneCallbacks = {};
  private current: SceneState | null = null;
  private lastRenderKey = '';
  private labelElements: HTMLElement[] = [];
  private resizeObserver: ResizeObserver | null = null;
  private animationId = 0;
  private paused = false;
  private reducedMotion = false;
  private dragStart: { x: number; y: number; time: number } | null = null;
  private cursorPosition = new THREE.Vector3(0, 0, 0);
  private cursorWanted = false;
  private keyboardMode = false;
  private cameraTween: {
    started: number;
    duration: number;
    fromPosition: THREE.Vector3;
    toPosition: THREE.Vector3;
    fromTarget: THREE.Vector3;
    toTarget: THREE.Vector3;
  } | null = null;
  private fitDone = false;
  private disposed = false;

  private sphereGeometry = new THREE.SphereGeometry(1, 32, 24);
  private sphereLowGeometry = new THREE.SphereGeometry(1, 16, 12);
  private cylinderGeometry = new THREE.CylinderGeometry(1, 1, 1, 16, 1, false);
  private coneGeometry = new THREE.ConeGeometry(1, 1, 20);
  private circleGeometry = new THREE.CircleGeometry(1, 64);
  private ringGeometry = new THREE.RingGeometry(0.94, 1, 64);
  private innerRingGeometry = new THREE.RingGeometry(0.78, 0.79, 64);
  private atomMaterials = new Map<string, THREE.MeshPhysicalMaterial>();
  private bondMaterials = new Map<BondStyle, THREE.MeshStandardMaterial>();
  private ghostAtomMaterial: THREE.MeshPhysicalMaterial;
  private lonePairMaterial: THREE.MeshBasicMaterial;
  private dipoleMaterial: THREE.MeshStandardMaterial;
  private cursorMaterial: THREE.MeshBasicMaterial;
  private platformDiscMaterial: THREE.MeshStandardMaterial;
  private platformRingMaterial: THREE.MeshBasicMaterial;
  private grid: THREE.GridHelper;
  private directionalLight!: THREE.DirectionalLight;

  constructor(container: HTMLElement, options: SceneOptions = {}) {
    this.container = container;
    this.options = {
      readOnly: false,
      autoRotate: false,
      showGrid: true,
      autoFit: true,
      ...options
    };
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(42, 1, 0.1, 200);
    this.camera.position.set(4.8, 3.8, 7.2);

    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      powerPreference: 'high-performance',
      preserveDrawingBuffer: true
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.08;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.domElement.className = 'scene-canvas';
    this.renderer.domElement.tabIndex = 0;
    this.renderer.domElement.setAttribute('role', 'application');
    this.renderer.domElement.setAttribute(
      'aria-label',
      '3D 분자 작업대. 원자 팔레트에서 원자를 고른 뒤 작업대를 클릭하거나, 키보드 화살표로 위치를 옮기고 Enter로 원자를 놓으세요. B는 결합 시작, Delete는 삭제입니다.'
    );
    this.renderer.domElement.setAttribute(
      'aria-describedby',
      'scene-keyboard-help molecule-summary'
    );
    container.appendChild(this.renderer.domElement);

    this.labelRenderer = new CSS2DRenderer();
    this.labelRenderer.domElement.className = 'scene-label-layer';
    container.appendChild(this.labelRenderer.domElement);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.rotateSpeed = 0.75;
    this.controls.zoomSpeed = 0.9;
    this.controls.panSpeed = 0.7;
    this.controls.minDistance = 2.2;
    this.controls.maxDistance = 30;
    this.controls.autoRotateSpeed = 0.55;
    this.controls.target.set(0, 0, 0);

    this.scene.add(this.moleculeGroup);
    this.scene.add(this.platformGroup);
    this.scene.add(this.cursorGroup);

    this.ghostAtomMaterial = new THREE.MeshPhysicalMaterial({
      color: 0xf8fbff,
      transparent: true,
      opacity: 0.42,
      roughness: 0.45,
      metalness: 0,
      depthWrite: false
    });
    this.lonePairMaterial = new THREE.MeshBasicMaterial({
      color: 0x67e8f9,
      transparent: true,
      opacity: 0.25,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    });
    this.dipoleMaterial = new THREE.MeshStandardMaterial({
      color: 0xf5b942,
      emissive: 0xf5b942,
      emissiveIntensity: 0.45,
      roughness: 0.3,
      metalness: 0.35
    });
    this.cursorMaterial = new THREE.MeshBasicMaterial({
      color: 0x5eead4,
      wireframe: true,
      transparent: true,
      opacity: 0.8
    });
    this.platformDiscMaterial = new THREE.MeshStandardMaterial({
      color: 0x0d1728,
      transparent: true,
      opacity: 0.56,
      roughness: 0.92,
      metalness: 0.08,
      side: THREE.DoubleSide
    });
    this.platformRingMaterial = new THREE.MeshBasicMaterial({
      color: 0xf5b942,
      transparent: true,
      opacity: 0.22,
      side: THREE.DoubleSide
    });
    this.grid = new THREE.GridHelper(1, 24, 0x314967, 0x1b2a40);
    const gridMaterial = this.grid.material as THREE.LineBasicMaterial;
    gridMaterial.transparent = true;
    gridMaterial.opacity = 0.32;

    this.buildPlatform();
    this.buildCursor();
    this.buildLights();
    this.buildEnvironment();

    this.renderer.domElement.addEventListener('pointerdown', this.onPointerDown);
    this.renderer.domElement.addEventListener('pointerup', this.onPointerUp);
    this.renderer.domElement.addEventListener('pointermove', this.onPointerMove);
    this.renderer.domElement.addEventListener('dblclick', this.onDoubleClick);
    this.renderer.domElement.addEventListener('keydown', this.onKeyDown);
    document.addEventListener('visibilitychange', this.onVisibilityChange);
    window.addEventListener('resize', this.resize);

    if (typeof ResizeObserver !== 'undefined') {
      this.resizeObserver = new ResizeObserver(() => this.resize());
      this.resizeObserver.observe(container);
    }
    this.resize();
    this.start();
  }

  private buildLights(): void {
    const hemisphere = new THREE.HemisphereLight(0xbfd7ff, 0x131c2c, 1.35);
    this.scene.add(hemisphere);

    this.directionalLight = new THREE.DirectionalLight(0xffffff, 2.5);
    this.directionalLight.position.set(6, 10, 8);
    this.directionalLight.castShadow = true;
    this.directionalLight.shadow.mapSize.set(1024, 1024);
    this.directionalLight.shadow.camera.left = -8;
    this.directionalLight.shadow.camera.right = 8;
    this.directionalLight.shadow.camera.top = 8;
    this.directionalLight.shadow.camera.bottom = -8;
    this.directionalLight.shadow.camera.near = 0.5;
    this.directionalLight.shadow.camera.far = 40;
    this.directionalLight.shadow.bias = -0.0004;
    this.scene.add(this.directionalLight);
    this.scene.add(this.directionalLight.target);

    const warmRim = new THREE.PointLight(0xf5b942, 18, 18, 2);
    warmRim.position.set(-5, 3.5, -4);
    this.scene.add(warmRim);

    const coolRim = new THREE.PointLight(0x5eead4, 10, 16, 2);
    coolRim.position.set(5, -1.5, -4);
    this.scene.add(coolRim);
  }

  private buildEnvironment(): void {
    const glow = new THREE.PointLight(0x94a3b8, 4, 25, 2);
    glow.position.set(0, -5, 4);
    this.scene.add(glow);
  }

  private buildPlatform(): void {
    const disc = new THREE.Mesh(this.circleGeometry, this.platformDiscMaterial);
    disc.rotation.x = -Math.PI / 2;
    disc.receiveShadow = true;
    disc.name = 'workbench-disc';
    this.platformGroup.add(disc);

    const ring = new THREE.Mesh(this.ringGeometry, this.platformRingMaterial);
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.012;
    this.platformGroup.add(ring);

    const innerRing = new THREE.Mesh(this.innerRingGeometry, this.platformRingMaterial);
    innerRing.rotation.x = -Math.PI / 2;
    innerRing.position.y = 0.012;
    this.platformGroup.add(innerRing);

    this.grid.position.y = 0.02;
    this.platformGroup.add(this.grid);
  }

  private buildCursor(): void {
    const ghost = new THREE.Mesh(this.sphereLowGeometry, this.cursorMaterial);
    ghost.scale.setScalar(0.32);
    this.cursorGroup.add(ghost);
    const ring = new THREE.Mesh(this.ringGeometry, this.cursorMaterial);
    ring.rotation.x = -Math.PI / 2;
    ring.scale.setScalar(0.6);
    ring.position.y = -0.34;
    this.cursorGroup.add(ring);
    this.cursorGroup.visible = false;
  }

  private getAtomMaterial(element: ElementSymbol, style: AtomStyle): THREE.MeshPhysicalMaterial {
    const key = `${element}:${style}`;
    const cached = this.atomMaterials.get(key);
    if (cached) return cached;
    const base = ELEMENTS[element];
    const material = new THREE.MeshPhysicalMaterial({
      color: new THREE.Color(base.color),
      roughness: element === 'H' ? 0.48 : 0.3,
      metalness: element === 'H' ? 0.05 : 0.18,
      clearcoat: 0.55,
      clearcoatRoughness: 0.35
    });
    if (style === 'selected') {
      material.emissive = new THREE.Color(0xf5b942);
      material.emissiveIntensity = 0.75;
    } else if (style === 'pending') {
      material.emissive = new THREE.Color(0x5eead4);
      material.emissiveIntensity = 0.9;
    }
    this.atomMaterials.set(key, material);
    return material;
  }

  private getBondMaterial(style: BondStyle): THREE.MeshStandardMaterial {
    const cached = this.bondMaterials.get(style);
    if (cached) return cached;
    let material: THREE.MeshStandardMaterial;
    if (style === 'ghost') {
      material = new THREE.MeshStandardMaterial({
        color: 0xf4f8ff,
        transparent: true,
        opacity: 0.35,
        roughness: 0.5,
        metalness: 0.1,
        depthWrite: false
      });
    } else {
      material = new THREE.MeshStandardMaterial({
        color: style === 'selected' ? 0xf5b942 : 0xc7d2e2,
        emissive: style === 'selected' ? 0xf5b942 : 0x000000,
        emissiveIntensity: style === 'selected' ? 0.5 : 0,
        roughness: 0.32,
        metalness: 0.4
      });
    }
    this.bondMaterials.set(style, material);
    return material;
  }

  setCallbacks(callbacks: SceneCallbacks): void {
    this.callbacks = callbacks;
  }

  update(state: SceneState): void {
    this.current = state;
    this.reducedMotion = Boolean(state.reducedMotion);
    this.controls.autoRotate = Boolean(
      (state.view.autoRotate || this.options.autoRotate) && !this.reducedMotion
    );
    const key = this.renderKey(state);
    if (key !== this.lastRenderKey) {
      this.rebuild(state);
      this.lastRenderKey = key;
    }
    if (!this.fitDone && state.molecule.atoms.length > 0) {
      this.fitCamera(false);
      this.fitDone = true;
    } else if (this.fitDone) {
      const radius = Math.max(1.9, state.layout.boundingRadius * DISPLAY_SCALE);
      const distance = this.camera.position.distanceTo(this.controls.target);
      const minHalfExtent = distance * Math.tan(this.minHalfFov() / 2);
      if (radius > minHalfExtent * 0.94) {
        this.fitCamera(false);
      } else {
        this.keepTargetCentered();
      }
    }
  }

  private renderKey(state: SceneState): string {
    return [
      state.layout.signature,
      state.molecule.bonds.map((bond) => `${bond.id}:${bond.order}`).join(','),
      state.view.showLabels ? 'L' : '-',
      state.view.showLonePairs ? 'P' : '-',
      state.view.showDipole ? 'D' : '-',
      state.view.showImplicitHydrogens ? 'H' : '-',
      state.selection.atomId ?? '',
      state.selection.bondId ?? '',
      state.pendingBondAtomId ?? '',
      state.pendingElement ?? ''
    ].join('|');
  }

  private clearMoleculeGroup(): void {
    this.moleculeGroup.clear();
    this.pickables = [];
    for (const element of this.labelElements) element.remove();
    this.labelElements = [];
  }

  private addLabel(text: string, position: THREE.Vector3, className: string, title?: string): void {
    const div = document.createElement('div');
    div.className = `scene-label ${className}`;
    div.textContent = text;
    if (title) div.title = title;
    div.setAttribute('aria-hidden', 'true');
    const label = new CSS2DObject(div);
    label.position.copy(position);
    this.moleculeGroup.add(label);
    this.labelElements.push(div);
  }

  private addAtomMesh(
    element: ElementSymbol,
    position: THREE.Vector3,
    style: AtomStyle,
    atomId: number | null,
    implicit = false
  ): void {
    const material = implicit ? this.ghostAtomMaterial : this.getAtomMaterial(element, style);
    const mesh = new THREE.Mesh(this.sphereGeometry, material);
    const radius = implicit ? 0.27 : atomSceneRadius(element);
    mesh.scale.setScalar(radius);
    mesh.position.copy(position);
    mesh.castShadow = !implicit;
    mesh.receiveShadow = !implicit;
    if (atomId !== null) mesh.userData.atomId = atomId;
    this.moleculeGroup.add(mesh);
    if (atomId !== null) this.pickables.push(mesh);
    if (this.current?.view.showLabels) {
      this.addLabel(
        element,
        position,
        implicit ? 'atom-label implicit-hydrogen' : 'atom-label',
        implicit ? '암시적 수소' : `${ELEMENTS[element].nameKo} ${element}`
      );
    }
  }

  private addBondMesh(
    start: THREE.Vector3,
    end: THREE.Vector3,
    order: number,
    style: BondStyle,
    bondId: number | null
  ): void {
    const delta = new THREE.Vector3().subVectors(end, start);
    const length = delta.length();
    if (length < 0.01) return;
    const direction = delta.clone().normalize();
    const viewDirection = this.camera.getWorldDirection(new THREE.Vector3());
    const perpendicular = new THREE.Vector3().crossVectors(direction, viewDirection);
    if (perpendicular.lengthSq() < 1e-4) {
      const base = Math.abs(direction.y) < 0.88 ? Y_AXIS : X_AXIS;
      perpendicular.crossVectors(base, direction);
    }
    if (perpendicular.lengthSq() < 1e-6) perpendicular.set(1, 0, 0);
    perpendicular.normalize();
    const offsets = order === 1 ? [0] : order === 2 ? [-0.085, 0.085] : [-0.13, 0, 0.13];
    const radius = order === 1 ? BOND_RADIUS : 0.072;
    const material = this.getBondMaterial(style);
    for (const offset of offsets) {
      const mesh = new THREE.Mesh(this.cylinderGeometry, material);
      mesh.scale.set(radius, length, radius);
      mesh.position.copy(start).add(end).multiplyScalar(0.5).addScaledVector(perpendicular, offset);
      mesh.quaternion.setFromUnitVectors(Y_AXIS, direction);
      mesh.castShadow = !style.startsWith('ghost');
      if (bondId !== null) {
        mesh.userData.bondId = bondId;
      }
      this.moleculeGroup.add(mesh);
      if (bondId !== null) this.pickables.push(mesh);
    }
  }

  private rebuild(state: SceneState): void {
    this.clearMoleculeGroup();
    const positions = new Map<number, THREE.Vector3>();
    for (const atom of state.molecule.atoms) {
      const layoutPosition = state.layout.positions.get(atom.id) ?? atom.position;
      positions.set(atom.id, toScene(layoutPosition));
    }

    for (const atom of state.molecule.atoms) {
      const position = positions.get(atom.id);
      if (!position) continue;
      const style: AtomStyle =
        state.selection.atomId === atom.id
          ? 'selected'
          : state.pendingBondAtomId === atom.id
            ? 'pending'
            : 'normal';
      this.addAtomMesh(atom.element, position, style, atom.id);
    }

    for (const bond of state.molecule.bonds) {
      const start = positions.get(bond.a);
      const end = positions.get(bond.b);
      if (!start || !end) continue;
      const style: BondStyle = state.selection.bondId === bond.id ? 'selected' : 'normal';
      this.addBondMesh(start, end, bond.order, style, bond.id);
    }

    if (state.view.showImplicitHydrogens) {
      for (const virtual of state.layout.virtualHydrogens) {
        const center = positions.get(virtual.atomId);
        if (!center) continue;
        const hydrogenPosition = toScene(virtual.position);
        this.addBondMesh(center, hydrogenPosition, 1, 'ghost', null);
        this.addAtomMesh('H', hydrogenPosition, 'normal', null, true);
      }
    }

    if (state.view.showLonePairs) {
      for (const lonePair of state.layout.lonePairs) {
        const atom = state.molecule.atoms.find((candidate) => candidate.id === lonePair.atomId);
        const center = positions.get(lonePair.atomId);
        if (!atom || !center) continue;
        const valence = computeAtomValence(state.molecule, atom);
        const bondedAtoms = valence.explicitBondCount + valence.implicitHydrogens;
        if (bondedAtoms < 2 && state.selection.atomId !== atom.id) continue;
        const direction = new THREE.Vector3(
          lonePair.direction.x,
          lonePair.direction.y,
          lonePair.direction.z
        ).normalize();
        const position = center
          .clone()
          .addScaledVector(direction, LONE_PAIR_DISTANCE * DISPLAY_SCALE);
        const lobe = new THREE.Mesh(this.sphereLowGeometry, this.lonePairMaterial);
        lobe.position.copy(position);
        lobe.scale.set(0.13, 0.13, 0.27);
        lobe.quaternion.setFromUnitVectors(Z_AXIS, direction);
        this.moleculeGroup.add(lobe);
      }
    }

    if (state.view.showDipole) {
      this.addDipole(state);
    }

    this.updatePlatform(state);
  }

  private addDipole(state: SceneState): void {
    const polarity = computePolarity(state.molecule, state.layout);
    if (polarity.netMagnitude < POLARITY_THRESHOLD) return;
    const center = toScene(state.layout.center);
    const direction = new THREE.Vector3(
      polarity.direction.x,
      polarity.direction.y,
      polarity.direction.z
    ).normalize();
    const length = Math.min(3.2, 1.35 + polarity.normalizedMagnitude * 0.5);
    const start = center.clone().addScaledVector(direction, -length * 0.5);
    const end = center.clone().addScaledVector(direction, length * 0.5);
    const shaftLength = Math.max(0.2, length - 0.4);
    const shaft = new THREE.Mesh(this.cylinderGeometry, this.dipoleMaterial);
    shaft.scale.set(0.045, shaftLength, 0.045);
    shaft.position.copy(start).addScaledVector(direction, shaftLength * 0.5);
    shaft.quaternion.setFromUnitVectors(Y_AXIS, direction);
    this.moleculeGroup.add(shaft);

    const head = new THREE.Mesh(this.coneGeometry, this.dipoleMaterial);
    head.scale.set(0.16, 0.4, 0.16);
    head.position.copy(end).addScaledVector(direction, -0.2);
    head.quaternion.setFromUnitVectors(Y_AXIS, direction);
    this.moleculeGroup.add(head);

    if (state.view.showLabels) {
      this.addLabel(
        'μ',
        end.clone().addScaledVector(direction, 0.3),
        'dipole-label',
        `분자 쌍극자 (${polarity.netMagnitude.toFixed(2)})`
      );
    }
  }

  private updatePlatform(state: SceneState): void {
    if (!this.options.showGrid) {
      this.platformGroup.visible = false;
      return;
    }
    this.platformGroup.visible = true;
    const center = toScene(state.layout.center);
    const radius = Math.max(3.2, state.layout.boundingRadius * DISPLAY_SCALE * 1.18);
    const y = center.y - Math.max(1.9, state.layout.boundingRadius * DISPLAY_SCALE * 0.88);
    this.platformGroup.position.set(center.x, y, center.z);
    for (const child of this.platformGroup.children) {
      if (child === this.grid) {
        child.scale.setScalar(radius * 1.55);
        continue;
      }
      child.scale.setScalar(radius);
    }
    this.directionalLight.position.set(center.x + 6, center.y + 10, center.z + 8);
    this.directionalLight.target.position.copy(center);
    this.directionalLight.target.updateMatrixWorld();
  }

  private keepTargetCentered(): void {
    if (!this.current) return;
    const center = toScene(this.current.layout.center);
    const previous = this.controls.target.clone();
    const delta = center.clone().sub(previous);
    if (delta.length() > 0.85) {
      this.controls.target.copy(center);
      this.camera.position.add(delta);
      this.controls.update();
    }
  }

  private minHalfFov(): number {
    const vertical = (this.camera.fov * Math.PI) / 180;
    const horizontal = 2 * Math.atan(Math.tan(vertical / 2) * this.camera.aspect);
    return Math.min(vertical, horizontal);
  }

  fitCamera(animate = true): void {
    if (!this.current) return;
    const center = toScene(this.current.layout.center);
    const radius = Math.max(1.9, this.current.layout.boundingRadius * DISPLAY_SCALE);
    const halfFov = this.minHalfFov();
    const distance = THREE.MathUtils.clamp((radius / Math.sin(halfFov / 2)) * 1.12, 3.8, 26);
    const direction = this.camera.position.clone().sub(this.controls.target);
    if (direction.lengthSq() < 1e-6) direction.set(0.8, 0.55, 1);
    direction.normalize();
    const targetPosition = center.clone().addScaledVector(direction, distance);
    if (animate && !this.reducedMotion) {
      this.cameraTween = {
        started: performance.now(),
        duration: 460,
        fromPosition: this.camera.position.clone(),
        toPosition: targetPosition,
        fromTarget: this.controls.target.clone(),
        toTarget: center
      };
    } else {
      this.cameraTween = null;
      this.camera.position.copy(targetPosition);
      this.controls.target.copy(center);
      this.controls.update();
    }
  }

  focusAtom(atomId: number): void {
    if (!this.current) return;
    const position = this.current.layout.positions.get(atomId);
    if (!position) return;
    const target = toScene(position);
    const direction = this.camera.position.clone().sub(this.controls.target).normalize();
    const distance = Math.max(3.2, this.camera.position.distanceTo(this.controls.target) * 0.68);
    const targetPosition = target.clone().addScaledVector(direction, distance);
    if (this.reducedMotion) {
      this.camera.position.copy(targetPosition);
      this.controls.target.copy(target);
      this.controls.update();
    } else {
      this.cameraTween = {
        started: performance.now(),
        duration: 420,
        fromPosition: this.camera.position.clone(),
        toPosition: targetPosition,
        fromTarget: this.controls.target.clone(),
        toTarget: target
      };
    }
  }

  resetCamera(): void {
    this.fitCamera(true);
  }

  setCursorVisible(visible: boolean): void {
    this.cursorWanted = visible;
    this.cursorGroup.visible = visible && this.keyboardMode;
    if (visible) this.updateCursorPosition();
  }

  setCursorPosition(position: Vec3): void {
    this.cursorPosition.copy(toScene(position));
    this.updateCursorPosition();
  }

  getCursorPosition(): Vec3 {
    return toMolecule(this.cursorPosition);
  }

  private updateCursorPosition(): void {
    this.cursorGroup.position.copy(this.cursorPosition);
  }

  setPaused(paused: boolean): void {
    this.paused = paused;
  }

  private start(): void {
    const loop = (): void => {
      if (this.disposed) return;
      this.animationId = requestAnimationFrame(loop);
      if (this.paused || document.hidden) return;
      if (this.cameraTween) {
        const t = Math.min(
          1,
          (performance.now() - this.cameraTween.started) / this.cameraTween.duration
        );
        const eased = 1 - Math.pow(1 - t, 3);
        this.camera.position.lerpVectors(
          this.cameraTween.fromPosition,
          this.cameraTween.toPosition,
          eased
        );
        this.controls.target.lerpVectors(
          this.cameraTween.fromTarget,
          this.cameraTween.toTarget,
          eased
        );
        if (t >= 1) this.cameraTween = null;
      }
      this.controls.update();
      this.renderer.render(this.scene, this.camera);
      this.labelRenderer.render(this.scene, this.camera);
    };
    this.animationId = requestAnimationFrame(loop);
  }

  private resize = (): void => {
    const width = this.container.clientWidth;
    const height = this.container.clientHeight;
    if (width <= 0 || height <= 0) return;
    this.renderer.setSize(width, height, false);
    this.labelRenderer.setSize(width, height);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  };

  private setPointer(event: PointerEvent): void {
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  }

  private pick(): { atomId: number | null; bondId: number | null } {
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const intersections = this.raycaster.intersectObjects(this.pickables, false);
    for (const intersection of intersections) {
      const atomId = intersection.object.userData.atomId;
      if (typeof atomId === 'number') return { atomId, bondId: null };
      const bondId = intersection.object.userData.bondId;
      if (typeof bondId === 'number') return { atomId: null, bondId };
    }
    return { atomId: null, bondId: null };
  }

  private backgroundPoint(): Vec3 {
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const normal = this.camera.getWorldDirection(new THREE.Vector3()).negate();
    const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(normal, this.controls.target);
    const point = new THREE.Vector3();
    const hit = this.raycaster.ray.intersectPlane(plane, point);
    if (!hit) return toMolecule(this.controls.target);
    const molecule = toMolecule(point);
    return {
      x: THREE.MathUtils.clamp(molecule.x, -8, 8),
      y: THREE.MathUtils.clamp(molecule.y, -8, 8),
      z: THREE.MathUtils.clamp(molecule.z, -8, 8)
    };
  }

  private onPointerDown = (event: PointerEvent): void => {
    if (event.button !== 0) return;
    this.keyboardMode = false;
    this.cursorGroup.visible = false;
    this.dragStart = { x: event.clientX, y: event.clientY, time: performance.now() };
  };

  private onPointerUp = (event: PointerEvent): void => {
    if (this.options.readOnly || event.button !== 0 || !this.dragStart) return;
    const moved = Math.hypot(event.clientX - this.dragStart.x, event.clientY - this.dragStart.y);
    const elapsed = performance.now() - this.dragStart.time;
    this.dragStart = null;
    if (moved > 6 || elapsed > 900) return;
    this.setPointer(event);
    const picked = this.pick();
    if (picked.atomId !== null) {
      this.callbacks.onAtomClick?.(picked.atomId);
      return;
    }
    if (picked.bondId !== null) {
      this.callbacks.onBondClick?.(picked.bondId);
      return;
    }
    this.callbacks.onBackgroundClick?.(this.backgroundPoint());
  };

  private onPointerMove = (event: PointerEvent): void => {
    if (this.options.readOnly || event.pointerType === 'touch') return;
    this.setPointer(event);
    const picked = this.pick();
    this.renderer.domElement.style.cursor =
      picked.atomId !== null || picked.bondId !== null ? 'pointer' : 'grab';
  };

  private onDoubleClick = (event: MouseEvent): void => {
    if (this.options.readOnly) return;
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    const picked = this.pick();
    if (picked.atomId !== null) this.focusAtom(picked.atomId);
  };

  private onKeyDown = (event: KeyboardEvent): void => {
    if (this.options.readOnly) return;
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    if (
      event.key === 'ArrowLeft' ||
      event.key === 'ArrowRight' ||
      event.key === 'ArrowUp' ||
      event.key === 'ArrowDown' ||
      event.key === 'Enter' ||
      event.key === '[' ||
      event.key === ']'
    ) {
      this.keyboardMode = true;
      this.cursorGroup.visible = this.cursorWanted;
    }
    const step = event.shiftKey ? 1.0 : 0.5;
    switch (event.key) {
      case 'ArrowLeft':
        this.cursorPosition.x -= step * DISPLAY_SCALE;
        this.updateCursorPosition();
        event.preventDefault();
        break;
      case 'ArrowRight':
        this.cursorPosition.x += step * DISPLAY_SCALE;
        this.updateCursorPosition();
        event.preventDefault();
        break;
      case 'ArrowUp':
        this.cursorPosition.z -= step * DISPLAY_SCALE;
        this.updateCursorPosition();
        event.preventDefault();
        break;
      case 'ArrowDown':
        this.cursorPosition.z += step * DISPLAY_SCALE;
        this.updateCursorPosition();
        event.preventDefault();
        break;
      case 'Enter':
        this.callbacks.onKeyAction?.('place');
        event.preventDefault();
        break;
      case 'b':
      case 'B':
        this.callbacks.onKeyAction?.('bond');
        event.preventDefault();
        break;
      case 'Delete':
      case 'Backspace':
        this.callbacks.onKeyAction?.('delete');
        event.preventDefault();
        break;
      case ']':
        this.callbacks.onKeyAction?.('next-atom');
        event.preventDefault();
        break;
      case '[':
        this.callbacks.onKeyAction?.('prev-atom');
        event.preventDefault();
        break;
      case 'h':
      case 'H':
        this.callbacks.onKeyAction?.('fill');
        event.preventDefault();
        break;
      case 'Escape':
        this.callbacks.onKeyAction?.('escape');
        event.preventDefault();
        break;
      default:
        break;
    }
  };

  private onVisibilityChange = (): void => {
    this.paused = document.hidden;
  };

  dispose(): void {
    this.disposed = true;
    cancelAnimationFrame(this.animationId);
    this.resizeObserver?.disconnect();
    window.removeEventListener('resize', this.resize);
    document.removeEventListener('visibilitychange', this.onVisibilityChange);
    this.renderer.domElement.removeEventListener('pointerdown', this.onPointerDown);
    this.renderer.domElement.removeEventListener('pointerup', this.onPointerUp);
    this.renderer.domElement.removeEventListener('pointermove', this.onPointerMove);
    this.renderer.domElement.removeEventListener('dblclick', this.onDoubleClick);
    this.renderer.domElement.removeEventListener('keydown', this.onKeyDown);
    for (const element of this.labelElements) element.remove();
    this.scene.traverse((object) => {
      if (object instanceof THREE.Mesh) {
        object.geometry.dispose();
      }
    });
    this.sphereGeometry.dispose();
    this.sphereLowGeometry.dispose();
    this.cylinderGeometry.dispose();
    this.coneGeometry.dispose();
    this.circleGeometry.dispose();
    this.ringGeometry.dispose();
    this.innerRingGeometry.dispose();
    for (const material of this.atomMaterials.values()) material.dispose();
    for (const material of this.bondMaterials.values()) material.dispose();
    this.ghostAtomMaterial.dispose();
    this.lonePairMaterial.dispose();
    this.dipoleMaterial.dispose();
    this.cursorMaterial.dispose();
    this.platformDiscMaterial.dispose();
    this.platformRingMaterial.dispose();
    this.grid.dispose();
    this.controls.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
    this.labelRenderer.domElement.remove();
    this.container.innerHTML = '';
  }
}
