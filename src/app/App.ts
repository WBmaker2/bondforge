import type { AppActions } from './actions';
import { parseRoute, routeHash } from './routes';
import {
  initialState,
  initialMission,
  readReducedMotion,
  type AppState,
  type FeedbackKind,
  type MobilePanel,
  type ModalState,
  type Route,
  type Tool
} from './state';
import {
  MoleculeHistory,
  addAtom,
  addBond,
  cloneMolecule,
  createEmptyMolecule,
  cycleBondOrder,
  fillHydrogens as fillHydrogensInMolecule,
  removeAtom,
  removeBond,
  setBondOrder as setBondOrderInMolecule,
  validateMolecule
} from '../build/graph';
import { layoutMolecule } from '../build/layout';
import { formatAngle, geometryName } from '../chem/geometry';
import { formatDisplayFormula, formulaCounts } from '../chem/formula';
import type { BondOrder, ElementSymbol, Molecule, Vec3 } from '../chem/types';
import { computeAtomValence, formalChargeLabel } from '../chem/valence';
import { computeVsepr } from '../chem/vsepr';
import { distance } from '../chem/vec';
import { checkMission as evaluateMission, predictionCorrect } from '../features/missions/engine';
import {
  getMission,
  missionSteps,
  nextMission as getNextMission
} from '../features/missions/missions';
import { buildWorksheetHtml } from '../features/teacher/worksheet';
import { moleculeSummary } from '../features/inspector/moleculeSummary';
import { SceneManager, type SceneKeyAction } from '../render/SceneManager';
import {
  DEFAULT_VIEW,
  defaultProgress,
  markMissionComplete,
  resetProgressStorage,
  saveProgress,
  setDiscoveredIsomers,
  setMissionAnswer,
  setMissionSteps,
  type ProgressData
} from '../storage/progress';
import { Inspector } from '../ui/components/Inspector';
import { MissionStrip } from '../ui/components/MissionStrip';
import { StageOverlay } from '../ui/components/StageOverlay';
import { Topbar } from '../ui/components/Topbar';
import { Palette } from '../ui/components/Palette';
import { MissionHub } from '../features/missions/MissionHub';
import { MobileMissionBar } from '../features/missions/MobileMissionBar';
import { TeacherView } from '../features/teacher/TeacherView';
import { el } from '../ui/components/dom';

class Store {
  private state: AppState;
  private listeners = new Set<(state: AppState) => void>();

  constructor(initial: AppState) {
    this.state = initial;
  }

  get(): AppState {
    return this.state;
  }

  set(updater: (state: AppState) => AppState): void {
    this.state = updater(this.state);
    for (const listener of this.listeners) listener(this.state);
  }

  subscribe(listener: (state: AppState) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}

function esc(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

const MOBILE_TABS: Array<{ panel: MobilePanel; labelKo: string }> = [
  { panel: 'atoms', labelKo: '원자' },
  { panel: 'inspect', labelKo: '점검' },
  { panel: 'mission', labelKo: '미션' }
];

export class App implements AppActions {
  private root: HTMLElement;
  private store: Store;
  private history = new MoleculeHistory();

  private topbar: Topbar;
  private palette: Palette;
  private inspector: Inspector;
  private stageOverlay: StageOverlay;
  private missionStrip: MissionStrip;
  private mobilePalette: Palette;
  private mobileInspector: Inspector;
  private mobileMissionStrip: MissionStrip;
  private mobileMissionBar: MobileMissionBar;
  private missionHub: MissionHub;
  private teacherView: TeacherView;

  private buildView: HTMLElement;
  private workspace: HTMLElement;
  private stage: HTMLElement;
  private sceneContainer: HTMLElement;
  private paletteSlot: HTMLElement;
  private inspectorSlot: HTMLElement;
  private inspectorClose: HTMLButtonElement;
  private drawerBackdrop: HTMLElement;
  private mobileSheet: HTMLElement;
  private mobileTabs = new Map<MobilePanel, HTMLButtonElement>();
  private mobilePanels = new Map<MobilePanel, HTMLElement>();
  private mobileBadges = new Map<MobilePanel, HTMLElement>();
  private summary: HTMLElement;
  private announcer: HTMLElement;
  private toastRegion: HTMLElement;
  private modalDialog: HTMLDialogElement;
  private worksheet: HTMLElement;

  private scene: SceneManager | null = null;
  private lastModalKey = '';
  private lastToastId = 0;
  private toastTimer = 0;
  private toastCounter = 0;
  private announceTimer = 0;
  private lastSavedJson = '';
  private reducedMotionQuery: MediaQueryList | null = null;
  private disposed = false;

  constructor(root: HTMLElement, progress: ProgressData) {
    this.root = root;
    const reducedMotion = readReducedMotion();
    this.store = new Store(initialState(progress, reducedMotion));

    this.topbar = new Topbar(this);
    this.palette = new Palette(this);
    this.inspector = new Inspector(this);
    this.stageOverlay = new StageOverlay(this);
    this.missionStrip = new MissionStrip(this);
    this.mobilePalette = new Palette(this);
    this.mobileInspector = new Inspector(this);
    this.mobileMissionStrip = new MissionStrip(this);
    this.mobileMissionBar = new MobileMissionBar(this);
    this.missionHub = new MissionHub(this);
    this.teacherView = new TeacherView(this);

    this.paletteSlot = el('div', { className: 'workspace-palette' }, this.palette.root);
    this.inspectorSlot = el('div', { className: 'workspace-inspector' }, this.inspector.root);
    this.inspectorClose = el(
      'button',
      {
        type: 'button',
        className: 'drawer-close icon-btn',
        'aria-label': '점검 패널 닫기',
        title: '점검 패널 닫기'
      },
      '×'
    );
    this.inspectorClose.addEventListener('click', () => this.toggleInspector());
    this.inspectorSlot.appendChild(this.inspectorClose);
    this.sceneContainer = el('div', { className: 'scene-container' });
    const stageCanvasArea = el(
      'div',
      { className: 'stage-canvas-area' },
      this.sceneContainer,
      this.stageOverlay.root
    );
    this.stage = el(
      'section',
      { className: 'stage', 'aria-label': '3D 분자 작업대' },
      stageCanvasArea,
      this.missionStrip.root
    );
    this.workspace = el(
      'div',
      { className: 'workspace' },
      this.paletteSlot,
      this.stage,
      this.inspectorSlot
    );
    this.drawerBackdrop = el('div', { className: 'drawer-backdrop', 'aria-hidden': 'true' });
    this.drawerBackdrop.addEventListener('click', () => this.toggleInspector());
    this.mobileSheet = this.buildMobileSheet();
    this.buildView = el(
      'div',
      { className: 'build-view' },
      this.workspace,
      this.drawerBackdrop,
      this.mobileSheet
    );

    const main = el(
      'main',
      { id: 'main-content', className: 'main-content', tabindex: '-1' },
      this.buildView,
      this.missionHub.root,
      this.teacherView.root
    );

    this.summary = el('p', { id: 'molecule-summary', className: 'sr-only' });
    this.announcer = el('div', {
      id: 'announcer',
      className: 'sr-only',
      'aria-live': 'polite',
      'aria-atomic': 'true'
    });
    const keyboardHelp = el('div', {
      id: 'scene-keyboard-help',
      className: 'sr-only',
      text: '화살표 키로 원자 배치 커서를 이동하고 Enter로 원자를 놓습니다. 원자 목록에서 원자를 선택한 뒤 B를 누르면 결합을 시작합니다. 대괄호 키로 다른 원자를 선택하고 Enter로 결합을 완성합니다. Delete는 선택 항목 삭제, H는 수소 채우기, Escape는 선택 해제입니다.'
    });
    this.toastRegion = el('div', {
      className: 'toast-region',
      role: 'status',
      'aria-live': 'polite',
      'aria-atomic': 'true'
    });
    this.toastRegion.addEventListener('click', (event) => {
      if ((event.target as HTMLElement).closest('[data-toast-close]')) this.dismissToast();
    });

    this.modalDialog = el('dialog', {
      className: 'modal-dialog',
      'aria-labelledby': 'modal-title'
    });
    this.modalDialog.addEventListener('click', this.onModalClick);
    this.modalDialog.addEventListener('cancel', this.onModalCancel);
    this.modalDialog.addEventListener('close', this.onModalClose);
    document.body.appendChild(this.modalDialog);

    this.worksheet = el('div', { id: 'worksheet-print', 'aria-hidden': 'true' });
    document.body.appendChild(this.worksheet);

    const skipLink = el(
      'a',
      { className: 'skip-link', href: '#main-content' },
      '본문으로 건너뛰기'
    );
    this.root.replaceChildren(
      skipLink,
      this.topbar.root,
      main,
      this.summary,
      this.announcer,
      keyboardHelp,
      this.toastRegion
    );
    this.root.classList.add('bondforge-app');

    this.createScene();
    this.store.subscribe((state) => this.render(state));
    this.render(this.store.get());
    this.attachGlobalListeners();
    this.applyInitialRoute();

    if (!window.location.hash) {
      window.history.replaceState(null, '', '#/build');
    }
  }

  private buildMobileSheet(): HTMLElement {
    const tabs = el('div', {
      className: 'mobile-sheet-tabs',
      role: 'tablist',
      'aria-label': '모바일 패널',
      'aria-orientation': 'horizontal'
    });
    for (const tab of MOBILE_TABS) {
      const badge = el('span', { className: 'tab-badge', 'aria-hidden': 'true' });
      const button = el(
        'button',
        {
          type: 'button',
          id: `mobile-tab-${tab.panel}`,
          className: 'mobile-tab',
          role: 'tab',
          'aria-selected': 'false',
          'aria-controls': `mobile-panel-${tab.panel}`,
          tabindex: '-1',
          'data-panel': tab.panel
        },
        el('span', { text: tab.labelKo }),
        badge
      );
      button.addEventListener('click', () => this.setMobilePanel(tab.panel));
      this.mobileTabs.set(tab.panel, button);
      this.mobileBadges.set(tab.panel, badge);
      tabs.appendChild(button);
    }
    tabs.addEventListener('keydown', (event) => {
      if (
        event.key !== 'ArrowLeft' &&
        event.key !== 'ArrowRight' &&
        event.key !== 'Home' &&
        event.key !== 'End'
      ) {
        return;
      }
      event.preventDefault();
      const current = this.store.get().ui.mobilePanel;
      const index = MOBILE_TABS.findIndex((tab) => tab.panel === current);
      let nextIndex = index;
      if (event.key === 'ArrowLeft')
        nextIndex = (index - 1 + MOBILE_TABS.length) % MOBILE_TABS.length;
      if (event.key === 'ArrowRight') nextIndex = (index + 1) % MOBILE_TABS.length;
      if (event.key === 'Home') nextIndex = 0;
      if (event.key === 'End') nextIndex = MOBILE_TABS.length - 1;
      const panel = MOBILE_TABS[nextIndex].panel;
      this.setMobilePanel(panel);
      requestAnimationFrame(() => this.mobileTabs.get(panel)?.focus());
    });

    const panels = el('div', { className: 'mobile-sheet-body' });
    const panelContent: Record<MobilePanel, HTMLElement> = {
      atoms: this.mobilePalette.root,
      inspect: this.mobileInspector.root,
      mission: this.mobileMissionStrip.root
    };
    for (const tab of MOBILE_TABS) {
      const panel = el(
        'div',
        {
          id: `mobile-panel-${tab.panel}`,
          className: 'mobile-panel',
          role: 'tabpanel',
          'aria-labelledby': `mobile-tab-${tab.panel}`
        },
        panelContent[tab.panel]
      );
      this.mobilePanels.set(tab.panel, panel);
      panels.appendChild(panel);
    }
    return el('div', { className: 'mobile-sheet' }, tabs, panels, this.mobileMissionBar.root);
  }

  private createScene(): void {
    try {
      this.scene = new SceneManager(this.sceneContainer, {
        autoRotate: false,
        showGrid: true,
        autoFit: true
      });
      this.scene.setCallbacks({
        onAtomClick: (atomId) => this.clickAtom(atomId),
        onBondClick: (bondId) => this.clickBond(bondId),
        onBackgroundClick: (position) => this.clickBackground(position),
        onKeyAction: (action) => this.onSceneKeyAction(action)
      });
    } catch {
      this.scene = null;
      const fallback = el(
        'div',
        { className: 'scene-fallback' },
        el('strong', { text: '3D 화면을 표시할 수 없습니다.' }),
        el('p', {
          text: '브라우저의 WebGL 설정을 확인하세요. 원자 목록과 점검 카드는 계속 사용할 수 있습니다.'
        })
      );
      const add = el('button', {
        type: 'button',
        className: 'btn btn-secondary btn-small',
        text: '원자 추가'
      });
      add.addEventListener('click', () => this.placeAtom({ x: 0, y: 0, z: 0 }));
      fallback.appendChild(add);
      this.sceneContainer.appendChild(fallback);
    }
  }

  private attachGlobalListeners(): void {
    window.addEventListener('hashchange', this.onHashChange);
    window.addEventListener('beforeunload', this.onBeforeUnload);
    window.addEventListener('keydown', this.onGlobalKeyDown);
    try {
      this.reducedMotionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
      this.reducedMotionQuery.addEventListener('change', this.onReducedMotionChange);
    } catch {
      this.reducedMotionQuery = null;
    }
  }

  private applyInitialRoute(): void {
    const parsed = parseRoute(window.location.hash);
    if (parsed.route === 'build' && parsed.missionId) {
      this.openMission(parsed.missionId);
      return;
    }
    this.setRoute(parsed.route);
  }

  private render(state: AppState): void {
    this.root.dataset.route = state.route;
    this.topbar.update(state);
    this.buildView.hidden = state.route !== 'build';
    this.missionHub.root.hidden = state.route !== 'missions';
    this.teacherView.setVisible(state.route === 'teacher');
    this.workspace.classList.toggle(
      'inspector-open',
      state.route === 'build' && state.ui.inspectorOpen
    );
    this.drawerBackdrop.classList.toggle(
      'is-visible',
      state.route === 'build' && state.ui.inspectorOpen
    );

    if (state.route === 'build') {
      this.palette.update(state);
      this.inspector.update(state);
      this.stageOverlay.update(state);
      this.missionStrip.update(state);
      this.mobilePalette.update(state);
      this.mobileInspector.update(state);
      this.mobileMissionStrip.update(state);
      this.mobileMissionBar.update(state);
      this.updateMobileTabs(state);
      this.summary.textContent = moleculeSummary(state.molecule, state.layout);
      this.scene?.setPaused(false);
      this.scene?.setCursorVisible(state.selection.tool === 'atom');
      this.scene?.update({
        molecule: state.molecule,
        layout: state.layout,
        view: state.view,
        selection: state.selection,
        pendingBondAtomId: state.selection.pendingBondAtomId,
        pendingElement: state.selection.pendingAtom,
        reducedMotion: state.reducedMotion
      });
    } else {
      this.scene?.setPaused(true);
      this.scene?.setCursorVisible(false);
      if (state.route === 'missions') {
        this.missionHub.update(state);
      } else if (state.route === 'teacher') {
        this.teacherView.update(state);
      }
    }

    this.updateToast(state);
    this.renderModal(state);
    this.persistIfNeeded(state);
    this.updateDocumentTitle(state);
  }

  private updateMobileTabs(state: AppState): void {
    const validation = validateMolecule(state.molecule);
    const issueCount = validation.errorCount + validation.warningCount;
    for (const tab of MOBILE_TABS) {
      const button = this.mobileTabs.get(tab.panel);
      const panel = this.mobilePanels.get(tab.panel);
      const badge = this.mobileBadges.get(tab.panel);
      if (!button || !panel || !badge) continue;
      const active = state.ui.mobilePanel === tab.panel;
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-selected', String(active));
      button.tabIndex = active ? 0 : -1;
      panel.hidden = !active;
      badge.textContent = '';
      badge.className = 'tab-badge';
      if (tab.panel === 'inspect' && issueCount > 0 && state.molecule.atoms.length > 0) {
        badge.textContent = String(Math.min(9, issueCount));
        badge.classList.add('is-warn');
      }
      if (tab.panel === 'mission') {
        const mission = getMission(state.mission.currentId);
        if (mission) {
          if (state.mission.completed) {
            badge.textContent = '✓';
            badge.classList.add('is-ok');
          } else if (!state.mission.prediction) {
            badge.textContent = '!';
            badge.classList.add('is-warn');
          }
        }
      }
    }
  }

  private updateDocumentTitle(state: AppState): void {
    const mission = getMission(state.mission.currentId);
    document.title = mission ? `${mission.titleKo} · BondForge` : 'BondForge — 분자 구조 실험실';
  }

  private progressPayload(state: AppState): ProgressData {
    return {
      ...state.progress,
      view: state.view,
      preferences: {
        ...state.progress.preferences,
        reducedMotion: state.reducedMotion
      },
      savedSnapshot: null
    };
  }

  private persistIfNeeded(state: AppState): void {
    const json = JSON.stringify(this.progressPayload(state));
    if (json === this.lastSavedJson) return;
    this.lastSavedJson = json;
    saveProgress(this.progressPayload(state));
  }

  private updateToast(state: AppState): void {
    if (!state.toast) {
      this.lastToastId = 0;
      this.toastRegion.replaceChildren();
      return;
    }
    if (this.lastToastId === state.toast.id) return;
    this.lastToastId = state.toast.id;
    this.toastRegion.replaceChildren(
      el(
        'div',
        { className: `toast is-${state.toast.kind}` },
        el('span', { className: 'toast-message', text: state.toast.messageKo }),
        el(
          'button',
          {
            type: 'button',
            className: 'toast-close',
            'aria-label': '알림 닫기',
            'data-toast-close': 'true'
          },
          '×'
        )
      )
    );
  }

  private onChangeToast(): void {
    const state = this.store.get();
    if (!state.toast) return;
    const id = state.toast.id;
    window.clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(
      () => {
        if (this.store.get().toast?.id === id) {
          this.store.set((current) => ({ ...current, toast: null }));
        }
      },
      state.toast.kind === 'error' ? 4800 : 3400
    );
  }

  private toast(messageKo: string, kind: FeedbackKind = 'info'): void {
    const id = ++this.toastCounter;
    this.store.set((state) => ({
      ...state,
      toast: { id, messageKo, kind }
    }));
    this.onChangeToast();
  }

  private onSceneKeyAction(action: SceneKeyAction): void {
    const state = this.store.get();
    switch (action) {
      case 'place':
        if (state.selection.tool === 'atom') {
          this.placeAtom(this.scene?.getCursorPosition() ?? { x: 0, y: 0, z: 0 });
        } else if (state.selection.tool === 'bond') {
          if (
            state.selection.pendingBondAtomId !== null &&
            state.selection.atomId !== null &&
            state.selection.atomId !== state.selection.pendingBondAtomId
          ) {
            this.clickAtom(state.selection.atomId);
          } else {
            this.toast('원자 목록에서 결합할 두 번째 원자를 선택하세요.', 'info');
          }
        } else if (state.selection.tool === 'delete') {
          this.deleteSelection();
        }
        break;
      case 'bond':
        if (state.selection.atomId !== null) {
          this.beginBond(state.selection.atomId);
        } else {
          this.toast('원자를 먼저 선택하세요. 원자 목록에서 선택할 수 있습니다.', 'info');
        }
        break;
      case 'delete':
        this.deleteSelection();
        break;
      case 'next-atom':
        this.cycleAtom(1);
        break;
      case 'prev-atom':
        this.cycleAtom(-1);
        break;
      case 'fill':
        this.fillHydrogens();
        break;
      case 'escape':
        this.store.set((current) => ({
          ...current,
          selection: {
            ...current.selection,
            atomId: null,
            bondId: null,
            pendingBondAtomId: null,
            pendingAtom: null,
            tool: 'select'
          }
        }));
        this.announce('선택을 해제했습니다.');
        break;
      default:
        break;
    }
  }

  private cycleAtom(direction: 1 | -1): void {
    const state = this.store.get();
    if (state.molecule.atoms.length === 0) {
      this.toast('원자가 없습니다. 먼저 원자를 놓으세요.', 'info');
      return;
    }
    const atoms = [...state.molecule.atoms].sort((a, b) => a.id - b.id);
    const currentIndex = atoms.findIndex((atom) => atom.id === state.selection.atomId);
    const nextIndex =
      currentIndex === -1 ? 0 : (currentIndex + direction + atoms.length) % atoms.length;
    this.selectAtom(atoms[nextIndex].id);
  }

  private setRoute(route: Route): void {
    this.store.set((state) => ({
      ...state,
      route,
      modal: route === 'build' ? state.modal : null,
      ui: {
        ...state.ui,
        inspectorOpen: route === 'build' ? state.ui.inspectorOpen : false
      }
    }));
  }

  private onHashChange = (): void => {
    const parsed = parseRoute(window.location.hash);
    const state = this.store.get();
    if (parsed.route === 'build') {
      if (parsed.missionId) {
        if (state.mission.currentId !== parsed.missionId) {
          this.openMission(parsed.missionId);
        } else {
          this.setRoute('build');
        }
      } else {
        if (state.mission.currentId) {
          this.clearMissionState();
        }
        this.setRoute('build');
      }
      return;
    }
    this.setRoute(parsed.route);
  };

  private onBeforeUnload = (): void => {
    saveProgress(this.progressPayload(this.store.get()));
  };

  private onGlobalKeyDown = (event: KeyboardEvent): void => {
    if (event.key !== 'Escape') return;
    if (this.store.get().modal) return;
    if (this.store.get().ui.inspectorOpen) this.toggleInspector();
  };

  private onReducedMotionChange = (event: MediaQueryListEvent): void => {
    const reducedMotion = event.matches;
    this.store.set((state) => ({
      ...state,
      reducedMotion,
      view: reducedMotion ? { ...state.view, autoRotate: false } : state.view,
      progress: {
        ...state.progress,
        preferences: { ...state.progress.preferences, reducedMotion }
      }
    }));
    this.announce(
      reducedMotion
        ? '동작 줄이기 설정이 켜졌습니다. 자동 회전과 카메라 애니메이션을 멈춥니다.'
        : '동작 줄이기 설정이 꺼졌습니다.'
    );
  };

  private clearMissionState(): void {
    this.store.set((state) => ({
      ...state,
      mission: initialMission(),
      modal: null,
      route: 'build'
    }));
  }

  private commitMolecule(
    molecule: Molecule,
    options: {
      selectAtom?: number | null;
      selectBond?: number | null;
      pendingBondAtomId?: number | null;
      clearFeedback?: boolean;
    } = {}
  ): void {
    const state = this.store.get();
    const layout = layoutMolecule(molecule);
    const positioned = cloneMolecule(molecule);
    for (const atom of positioned.atoms) {
      const position = layout.positions.get(atom.id);
      if (position) atom.position = { ...position };
    }
    const atomIds = new Set(positioned.atoms.map((atom) => atom.id));
    const bondIds = new Set(positioned.bonds.map((bond) => bond.id));
    let atomId = options.selectAtom !== undefined ? options.selectAtom : state.selection.atomId;
    let bondId = options.selectBond !== undefined ? options.selectBond : state.selection.bondId;
    if (options.selectAtom !== undefined) bondId = null;
    if (options.selectBond !== undefined) atomId = null;
    if (atomId !== null && !atomIds.has(atomId)) atomId = null;
    if (bondId !== null && !bondIds.has(bondId)) bondId = null;
    let pending =
      options.pendingBondAtomId !== undefined
        ? options.pendingBondAtomId
        : state.selection.pendingBondAtomId;
    if (pending !== null && !atomIds.has(pending)) pending = null;
    this.store.set((current) => ({
      ...current,
      molecule: positioned,
      layout,
      selection: {
        ...current.selection,
        atomId,
        bondId,
        pendingBondAtomId: pending
      },
      mission: {
        ...current.mission,
        feedback: options.clearFeedback === false ? current.mission.feedback : null
      },
      history: {
        canUndo: this.history.canUndo,
        canRedo: this.history.canRedo
      }
    }));
  }

  announce(message: string): void {
    window.clearTimeout(this.announceTimer);
    this.announcer.textContent = '';
    this.announceTimer = window.setTimeout(() => {
      this.announcer.textContent = message;
    }, 30);
  }

  private focusSceneSoon(): void {
    window.setTimeout(() => {
      this.sceneContainer.querySelector<HTMLCanvasElement>('.scene-canvas')?.focus();
    }, 80);
  }

  private announceAtom(atomId: number): void {
    const state = this.store.get();
    const atom = state.molecule.atoms.find((candidate) => candidate.id === atomId);
    if (!atom) return;
    const valence = computeAtomValence(state.molecule, atom);
    const vsepr = computeVsepr(state.molecule, atomId);
    const geometry =
      vsepr && vsepr.bondedAtoms >= 2
        ? ` ${geometryName(vsepr.molecularGeometry).ko}, 근사 결합각 ${formatAngle(
            vsepr.approximateAngle
          )}.`
        : '';
    this.announce(
      `${atom.element}${atom.id} 원자를 선택했습니다. 결합 차수 합 ${valence.bondOrderSum}, 비공유 전자쌍 ${valence.lonePairs}, 형식 전하 ${formalChargeLabel(
        valence.formalCharge
      )}.${geometry}`
    );
  }

  navigate(route: Route): void {
    const state = this.store.get();
    const missionId = route === 'build' ? state.mission.currentId : null;
    const hash = routeHash(route, missionId);
    if (window.location.hash !== hash) window.location.hash = hash;
    this.setRoute(route);
  }

  openMission(missionId: string): void {
    const mission = getMission(missionId);
    if (!mission) {
      this.toast('미션을 찾을 수 없습니다.', 'error');
      this.setRoute('build');
      return;
    }
    const state = this.store.get();
    if (state.mission.currentId === missionId && state.route === 'build') {
      if (!state.mission.completed && !state.mission.prediction) {
        this.openModal({ kind: 'prediction', missionId });
      }
      return;
    }
    const prediction = state.progress.answers[missionId] ?? null;
    const completed = state.progress.completed.includes(missionId);
    const stepsDone = state.progress.stepsDone[missionId] ?? [];
    const discovered = state.progress.discoveredIsomers[missionId] ?? [];
    const progress: ProgressData = {
      ...state.progress,
      lastMissionId: missionId
    };
    this.history.clear();
    const hash = routeHash('build', missionId);
    if (window.location.hash !== hash) window.location.hash = hash;
    this.store.set((current) => ({
      ...current,
      route: 'build',
      molecule: createEmptyMolecule(),
      layout: layoutMolecule(createEmptyMolecule()),
      selection: {
        ...current.selection,
        atomId: null,
        bondId: null,
        pendingBondAtomId: null
      },
      mission: {
        currentId: missionId,
        prediction,
        predictionCorrect: prediction ? predictionCorrect(mission, prediction) : null,
        stepsDone,
        discoveredIsomers: discovered,
        feedback: null,
        completed
      },
      progress,
      modal: !completed && prediction === null ? { kind: 'prediction', missionId } : null,
      ui: { ...current.ui, mobilePanel: 'mission', inspectorOpen: false },
      history: { canUndo: false, canRedo: false },
      toast: null
    }));
    this.announce(`미션 ${mission.titleKo}을 시작합니다.`);
    window.setTimeout(() => {
      this.scene?.fitCamera(false);
      if (!this.store.get().modal) this.focusSceneSoon();
    }, 60);
  }

  exitMission(): void {
    if (!this.store.get().mission.currentId) {
      this.navigate('missions');
      return;
    }
    const hash = routeHash('missions');
    if (window.location.hash !== hash) window.location.hash = hash;
    this.store.set((state) => ({
      ...state,
      mission: initialMission(),
      modal: null,
      route: 'missions'
    }));
    this.announce('미션을 나왔습니다.');
  }

  requestExitMission(): void {
    if (!this.store.get().mission.currentId) {
      this.navigate('missions');
      return;
    }
    this.openModal({ kind: 'confirm-exit-mission' });
  }

  submitPrediction(answer: string): void {
    const state = this.store.get();
    const mission = getMission(state.mission.currentId);
    if (!mission || !mission.options.includes(answer)) return;
    const progress = setMissionAnswer(state.progress, mission.id, answer);
    this.store.set((current) => ({
      ...current,
      progress,
      mission: {
        ...current.mission,
        prediction: answer,
        predictionCorrect: predictionCorrect(mission, answer),
        feedback: null
      },
      modal: null,
      ui: { ...current.ui, mobilePanel: 'atoms' }
    }));
    this.announce('예측을 저장했습니다. 이제 3D 작업대에서 구조를 만들어 확인하세요.');
    this.focusSceneSoon();
  }

  checkMission(): void {
    const state = this.store.get();
    const mission = getMission(state.mission.currentId);
    if (!mission) {
      this.toast('진행 중인 미션이 없습니다.', 'info');
      return;
    }
    if (!state.mission.prediction) {
      this.openModal({ kind: 'prediction', missionId: mission.id });
      return;
    }
    const result = evaluateMission(mission, state.molecule, state.layout, {
      stepsDone: state.mission.stepsDone,
      discoveredIsomers: state.mission.discoveredIsomers
    });
    let progress = state.progress;
    if (result.matchedStepId) {
      progress = setMissionSteps(progress, mission.id, [
        ...state.mission.stepsDone,
        result.matchedStepId
      ]);
    }
    if (result.discoveredIsomers.length > 0) {
      progress = setDiscoveredIsomers(progress, mission.id, result.discoveredIsomers);
    }
    if (result.completed) {
      progress = markMissionComplete(progress, mission.id);
    }
    progress = { ...progress, lastMissionId: mission.id };
    const stepsDone = result.matchedStepId
      ? [...new Set([...state.mission.stepsDone, result.matchedStepId])]
      : state.mission.stepsDone;
    const feedback = result.completed
      ? {
          kind: 'success' as const,
          titleKo: '미션 완료!',
          messageKo: result.messageKo,
          hintKo: ''
        }
      : result.ok
        ? {
            kind: 'success' as const,
            titleKo: '구조를 완성했습니다.',
            messageKo: result.messageKo,
            hintKo: result.hintKo
          }
        : {
            kind: 'error' as const,
            titleKo: '아직 목표 구조가 아닙니다.',
            messageKo: result.messageKo,
            hintKo: result.hintKo
          };
    this.store.set((current) => ({
      ...current,
      progress,
      mission: {
        ...current.mission,
        stepsDone,
        discoveredIsomers: result.discoveredIsomers,
        completed: result.completed || current.mission.completed,
        feedback
      },
      modal: result.completed ? { kind: 'explanation', missionId: mission.id } : current.modal,
      ui: window.innerWidth < 768 ? { ...current.ui, mobilePanel: 'mission' } : current.ui
    }));
    this.announce(
      result.completed
        ? `미션을 완료했습니다. ${result.messageKo}`
        : result.ok
          ? result.messageKo
          : `${result.messageKo} ${result.hintKo}`
    );
    if (!result.ok) {
      this.toast('아직 목표 구조가 아닙니다. 근거 힌트를 확인하세요.', 'error');
    } else if (!result.completed) {
      this.toast('구조를 완성했습니다. 다음 목표를 확인하세요.', 'success');
    }
  }

  prepareNextStep(): void {
    const state = this.store.get();
    const mission = getMission(state.mission.currentId);
    if (!mission) return;
    const hash = routeHash('build', mission.id);
    if (window.location.hash !== hash) window.location.hash = hash;
    this.store.set((current) => ({
      ...current,
      route: 'build',
      molecule: createEmptyMolecule(),
      layout: layoutMolecule(createEmptyMolecule()),
      selection: {
        ...current.selection,
        atomId: null,
        bondId: null,
        pendingBondAtomId: null
      },
      mission: { ...current.mission, feedback: null },
      modal: null,
      ui: { ...current.ui, mobilePanel: 'atoms' }
    }));
    this.history.clear();
    this.announce('새 구조를 만들 준비가 되었습니다. 다음 목표 분자식을 확인하세요.');
    this.focusSceneSoon();
    window.setTimeout(() => this.scene?.fitCamera(false), 80);
  }

  nextMission(): void {
    const state = this.store.get();
    const mission = getMission(state.mission.currentId);
    if (!mission) {
      this.navigate('missions');
      return;
    }
    const next = getNextMission(mission);
    if (next) {
      this.openMission(next.id);
    } else {
      this.exitMission();
    }
  }

  openPredictionGate(): void {
    const state = this.store.get();
    const mission = getMission(state.mission.currentId);
    if (!mission) return;
    if (state.mission.prediction) {
      this.toast('이미 예측을 제출했습니다. 구조를 만들어 확인하세요.', 'info');
      return;
    }
    this.openModal({ kind: 'prediction', missionId: mission.id });
  }

  setTool(tool: Tool, element?: ElementSymbol | null): void {
    this.store.set((state) => ({
      ...state,
      selection: {
        ...state.selection,
        tool,
        pendingAtom: tool === 'atom' ? (element ?? state.selection.pendingAtom ?? 'C') : null,
        pendingBondAtomId: null
      }
    }));
    const labels: Record<Tool, string> = {
      select: '선택 도구',
      atom: '원자 배치 도구',
      bond: '결합 도구',
      delete: '삭제 도구'
    };
    this.announce(`${labels[tool]}를 선택했습니다.`);
  }

  selectElement(element: ElementSymbol): void {
    this.setTool('atom', element);
    this.announce(`${element} 원자를 선택했습니다. 작업대를 클릭해 놓으세요.`);
  }

  selectAtom(atomId: number | null): void {
    if (atomId === null) {
      this.store.set((state) => ({
        ...state,
        selection: { ...state.selection, atomId: null, bondId: null }
      }));
      return;
    }
    const atom = this.store.get().molecule.atoms.find((candidate) => candidate.id === atomId);
    if (!atom) return;
    this.store.set((state) => ({
      ...state,
      selection: {
        ...state.selection,
        atomId,
        bondId: null
      }
    }));
    this.announceAtom(atomId);
  }

  selectBond(bondId: number | null): void {
    if (bondId === null) {
      this.store.set((state) => ({
        ...state,
        selection: { ...state.selection, bondId: null }
      }));
      return;
    }
    this.store.set((state) => ({
      ...state,
      selection: {
        ...state.selection,
        bondId,
        atomId: null
      }
    }));
    const bond = this.store.get().molecule.bonds.find((candidate) => candidate.id === bondId);
    if (bond) this.announce(`결합을 선택했습니다. 결합 차수 ${bond.order}.`);
  }

  beginBond(atomId: number): void {
    const atom = this.store.get().molecule.atoms.find((candidate) => candidate.id === atomId);
    if (!atom) return;
    this.store.set((state) => ({
      ...state,
      selection: {
        ...state.selection,
        tool: 'bond',
        atomId,
        bondId: null,
        pendingAtom: null,
        pendingBondAtomId: atomId
      }
    }));
    this.announce(`${atom.element}${atom.id}에서 결합을 시작합니다. 두 번째 원자를 선택하세요.`);
  }

  cancelPendingBond(): void {
    this.store.set((state) => ({
      ...state,
      selection: { ...state.selection, pendingBondAtomId: null, tool: 'bond' }
    }));
    this.announce('결합 시작을 취소했습니다.');
  }

  placeAtom(position: Vec3): void {
    const state = this.store.get();
    const element = state.selection.pendingAtom;
    if (!element) {
      this.toast('원자 팔레트에서 원자를 먼저 선택하세요.', 'info');
      return;
    }
    let target = { ...position };
    const layoutPositions = [...state.layout.positions.values()];
    for (let attempt = 0; attempt < 16; attempt++) {
      const clash = layoutPositions.some((candidate) => distance(candidate, target) < 1.0);
      if (!clash) break;
      target = { x: target.x + 0.95, y: target.y + 0.2, z: target.z + 0.65 };
    }
    const before = state.molecule;
    const result = addAtom(before, element, target);
    if (!result.changed) {
      this.toast(result.message ?? '원자를 놓을 수 없습니다.', 'error');
      return;
    }
    this.history.push(before);
    const newAtom = result.molecule.atoms[result.molecule.atoms.length - 1];
    this.commitMolecule(result.molecule, {
      selectAtom: newAtom.id,
      pendingBondAtomId: null
    });
    this.scene?.setCursorPosition({
      x: target.x + 1.35,
      y: target.y,
      z: target.z + 0.7
    });
    this.announce(`${element}${newAtom.id} 원자를 놓았습니다.`);
  }

  clickAtom(atomId: number): void {
    const state = this.store.get();
    if (!state.molecule.atoms.some((atom) => atom.id === atomId)) return;
    switch (state.selection.tool) {
      case 'bond': {
        if (state.selection.pendingBondAtomId === null) {
          this.beginBond(atomId);
          return;
        }
        if (state.selection.pendingBondAtomId === atomId) {
          this.toast('같은 원자끼리는 결합할 수 없습니다.', 'error');
          return;
        }
        const beforeIds = new Set(state.molecule.bonds.map((bond) => bond.id));
        const result = addBond(state.molecule, state.selection.pendingBondAtomId, atomId, 1);
        if (!result.changed) {
          this.toast(result.message ?? '결합을 만들 수 없습니다.', 'error');
          return;
        }
        this.history.push(state.molecule);
        const newBond = result.molecule.bonds.find((bond) => !beforeIds.has(bond.id));
        this.commitMolecule(result.molecule, {
          selectBond: newBond?.id ?? null,
          pendingBondAtomId: null
        });
        this.announce('결합을 만들었습니다.');
        break;
      }
      case 'delete':
        this.selectAtom(atomId);
        this.deleteSelection();
        break;
      default:
        this.selectAtom(atomId);
        break;
    }
  }

  clickBond(bondId: number): void {
    const state = this.store.get();
    if (!state.molecule.bonds.some((bond) => bond.id === bondId)) return;
    switch (state.selection.tool) {
      case 'bond': {
        const before = state.molecule;
        const bond = before.bonds.find((candidate) => candidate.id === bondId);
        if (!bond) return;
        const result = cycleBondOrder(before, bondId);
        if (!result.changed) {
          this.toast(result.message ?? '결합 차수를 바꿀 수 없습니다.', 'error');
          return;
        }
        this.history.push(before);
        this.commitMolecule(result.molecule, {
          selectBond: bondId,
          pendingBondAtomId: null
        });
        const nextBond = result.molecule.bonds.find((candidate) => candidate.id === bondId);
        this.announce(`결합 차수를 ${nextBond?.order ?? 1}로 바꿨습니다.`);
        break;
      }
      case 'delete':
        this.selectBond(bondId);
        this.deleteSelection();
        break;
      default:
        this.selectBond(bondId);
        break;
    }
  }

  clickBackground(position: Vec3): void {
    const state = this.store.get();
    if (state.selection.tool === 'atom') {
      this.placeAtom(position);
      return;
    }
    if (state.selection.tool === 'bond') {
      if (state.selection.pendingBondAtomId !== null) {
        this.store.set((current) => ({
          ...current,
          selection: { ...current.selection, pendingBondAtomId: null }
        }));
        this.announce('결합 시작을 취소했습니다.');
      } else {
        this.store.set((current) => ({
          ...current,
          selection: { ...current.selection, atomId: null, bondId: null }
        }));
      }
      return;
    }
    this.store.set((current) => ({
      ...current,
      selection: { ...current.selection, atomId: null, bondId: null }
    }));
  }

  deleteSelection(): void {
    const state = this.store.get();
    if (state.selection.bondId !== null) {
      const result = removeBond(state.molecule, state.selection.bondId);
      if (!result.changed) {
        this.toast(result.message ?? '결합을 삭제할 수 없습니다.', 'error');
        return;
      }
      this.history.push(state.molecule);
      this.commitMolecule(result.molecule, {
        selectAtom: null,
        selectBond: null,
        pendingBondAtomId: null
      });
      this.toast('결합을 삭제했습니다.', 'success');
      return;
    }
    if (state.selection.atomId !== null) {
      const result = removeAtom(state.molecule, state.selection.atomId);
      if (!result.changed) {
        this.toast(result.message ?? '원자를 삭제할 수 없습니다.', 'error');
        return;
      }
      this.history.push(state.molecule);
      this.commitMolecule(result.molecule, {
        selectAtom: null,
        selectBond: null,
        pendingBondAtomId: null
      });
      this.toast('원자를 삭제했습니다.', 'success');
      return;
    }
    this.toast('삭제할 원자나 결합을 선택하세요.', 'info');
  }

  deleteBond(bondId: number): void {
    const state = this.store.get();
    const result = removeBond(state.molecule, bondId);
    if (!result.changed) {
      this.toast(result.message ?? '결합을 삭제할 수 없습니다.', 'error');
      return;
    }
    this.history.push(state.molecule);
    this.commitMolecule(result.molecule, {
      selectAtom: null,
      selectBond: null,
      pendingBondAtomId: null
    });
    this.toast('결합을 삭제했습니다.', 'success');
  }

  setBondOrder(bondId: number, order: BondOrder): void {
    const state = this.store.get();
    const result = setBondOrderInMolecule(state.molecule, bondId, order);
    if (!result.changed) {
      this.toast(result.message ?? '결합 차수를 바꿀 수 없습니다.', 'error');
      return;
    }
    this.history.push(state.molecule);
    this.commitMolecule(result.molecule, {
      selectBond: bondId,
      pendingBondAtomId: null
    });
    this.announce(`결합 차수를 ${order}로 바꿨습니다.`);
  }

  fillHydrogens(): void {
    const state = this.store.get();
    if (state.molecule.atoms.length === 0) {
      this.toast('먼저 원자를 놓으세요.', 'info');
      return;
    }
    const filled = fillHydrogensInMolecule(state.molecule);
    const changed = filled.atoms.some((atom, index) => {
      const original = state.molecule.atoms[index];
      return original && atom.implicitHydrogens !== original.implicitHydrogens;
    });
    if (!changed) {
      this.toast('채울 수소가 없습니다. 이미 원자가가 채워져 있습니다.', 'info');
      return;
    }
    this.history.push(state.molecule);
    this.commitMolecule(filled);
    const formula = formatDisplayFormula(formulaCounts(filled));
    this.toast(`수소를 채웠습니다. 분자식은 ${formula}입니다.`, 'success');
    this.announce(`수소를 채웠습니다. 분자식은 ${formula}입니다.`);
  }

  resetMolecule(): void {
    const state = this.store.get();
    if (state.molecule.atoms.length === 0) {
      this.toast('이미 빈 작업대입니다.', 'info');
      return;
    }
    this.history.push(state.molecule);
    this.commitMolecule(createEmptyMolecule(), {
      selectAtom: null,
      selectBond: null,
      pendingBondAtomId: null
    });
    this.toast('분자를 초기화했습니다. 실행 취소로 되돌릴 수 있습니다.', 'success');
    this.announce('분자를 초기화했습니다.');
  }

  undo(): void {
    const state = this.store.get();
    const previous = this.history.undo(state.molecule);
    if (!previous) {
      this.toast('되돌릴 작업이 없습니다.', 'info');
      return;
    }
    this.commitMolecule(previous, {
      selectAtom: null,
      selectBond: null,
      pendingBondAtomId: null
    });
    this.toast('실행 취소했습니다.', 'success');
    this.announce(
      `실행 취소했습니다. 분자식은 ${formatDisplayFormula(formulaCounts(previous))}입니다.`
    );
  }

  redo(): void {
    const state = this.store.get();
    const next = this.history.redo(state.molecule);
    if (!next) {
      this.toast('다시 실행할 작업이 없습니다.', 'info');
      return;
    }
    this.commitMolecule(next, {
      selectAtom: null,
      selectBond: null,
      pendingBondAtomId: null
    });
    this.toast('다시 실행했습니다.', 'success');
    this.announce(
      `다시 실행했습니다. 분자식은 ${formatDisplayFormula(formulaCounts(next))}입니다.`
    );
  }

  toggleView(key: keyof typeof DEFAULT_VIEW): void {
    const state = this.store.get();
    if (key === 'autoRotate' && state.reducedMotion) {
      this.toast('동작 줄이기 설정이 켜져 있어 자동 회전을 사용할 수 없습니다.', 'info');
      return;
    }
    this.store.set((current) => ({
      ...current,
      view: { ...current.view, [key]: !current.view[key] }
    }));
  }

  focusAtom(atomId: number): void {
    const state = this.store.get();
    if (!state.molecule.atoms.some((atom) => atom.id === atomId)) return;
    this.store.set((current) => ({
      ...current,
      selection: { ...current.selection, atomId, bondId: null }
    }));
    this.scene?.focusAtom(atomId);
  }

  resetCamera(): void {
    this.scene?.resetCamera();
  }

  openModal(modal: ModalState): void {
    if (
      modal &&
      (modal.kind === 'prediction' || modal.kind === 'explanation') &&
      !getMission(modal.missionId)
    ) {
      return;
    }
    this.store.set((state) => ({ ...state, modal }));
  }

  closeModal(): void {
    this.store.set((state) => ({ ...state, modal: null }));
  }

  confirmResetProgress(): void {
    resetProgressStorage();
    const progress = defaultProgress();
    const route = this.store.get().route;
    const targetRoute: Route =
      route === 'teacher' ? 'teacher' : route === 'missions' ? 'missions' : 'build';
    this.history.clear();
    this.store.set((state) => ({
      ...state,
      progress,
      view: { ...DEFAULT_VIEW },
      mission: initialMission(),
      molecule: createEmptyMolecule(),
      layout: layoutMolecule(createEmptyMolecule()),
      selection: {
        ...state.selection,
        atomId: null,
        bondId: null,
        pendingBondAtomId: null
      },
      teacher: {
        showAnswers: false,
        previewMissionId: null,
        previewOptionId: null
      },
      modal: null,
      toast: {
        id: ++this.toastCounter,
        messageKo: '모든 미션 진행과 예측 기록을 초기화했습니다.',
        kind: 'success'
      },
      route: targetRoute,
      history: { canUndo: false, canRedo: false }
    }));
    const hash = routeHash(targetRoute);
    if (window.location.hash !== hash) window.location.hash = hash;
    this.onChangeToast();
    this.lastSavedJson = JSON.stringify(this.progressPayload(this.store.get()));
    saveProgress(this.progressPayload(this.store.get()));
    this.announce('모든 미션 진행과 예측 기록을 초기화했습니다.');
  }

  toggleTeacherAnswers(): void {
    this.store.set((state) => ({
      ...state,
      teacher: { ...state.teacher, showAnswers: !state.teacher.showAnswers }
    }));
    this.announce(
      this.store.get().teacher.showAnswers ? '정답과 해설을 표시합니다.' : '정답과 해설을 숨깁니다.'
    );
  }

  printWorksheet(): void {
    const state = this.store.get();
    this.worksheet.innerHTML = buildWorksheetHtml(state.teacher.showAnswers);
    this.announce('워크시트 인쇄 창을 엽니다.');
    window.setTimeout(() => window.print(), 90);
  }

  selectTeacherMission(missionId: string): void {
    if (!getMission(missionId)) return;
    this.store.set((state) => ({
      ...state,
      teacher: {
        ...state.teacher,
        previewMissionId: missionId,
        previewOptionId: null
      }
    }));
    window.setTimeout(() => {
      this.teacherView.root.querySelector('.preview-panel')?.scrollIntoView({
        behavior: this.store.get().reducedMotion ? 'auto' : 'smooth',
        block: 'start'
      });
    }, 60);
  }

  selectTeacherPreviewOption(optionId: string): void {
    this.store.set((state) => ({
      ...state,
      teacher: { ...state.teacher, previewOptionId: optionId }
    }));
  }

  setMobilePanel(panel: MobilePanel): void {
    this.store.set((state) => ({
      ...state,
      ui: { ...state.ui, mobilePanel: panel }
    }));
  }

  toggleInspector(): void {
    if (window.innerWidth < 768) {
      this.setMobilePanel('inspect');
      return;
    }
    this.store.set((state) => ({
      ...state,
      ui: { ...state.ui, inspectorOpen: !state.ui.inspectorOpen }
    }));
  }

  dismissToast(): void {
    window.clearTimeout(this.toastTimer);
    this.store.set((state) => ({ ...state, toast: null }));
  }

  private renderModal(state: AppState): void {
    const modal = state.modal;
    if (!modal) {
      if (this.modalDialog.open) this.modalDialog.close();
      this.lastModalKey = '';
      return;
    }
    const key = `${modal.kind}:${'missionId' in modal ? modal.missionId : ''}`;
    if (this.lastModalKey === key && this.modalDialog.open) return;
    this.lastModalKey = key;
    this.modalDialog.innerHTML = this.modalHtml(state, modal);
    if (!this.modalDialog.open) {
      this.modalDialog.showModal();
    }
    const autofocus = this.modalDialog.querySelector<HTMLElement>('[autofocus]');
    window.setTimeout(() => autofocus?.focus(), 20);
  }

  private modalHtml(state: AppState, modal: NonNullable<ModalState>): string {
    if (modal.kind === 'prediction') {
      const mission = getMission(modal.missionId);
      if (!mission) return '<p>미션을 찾을 수 없습니다.</p>';
      return `
        <div class="modal-body prediction-modal">
          <div class="modal-eyebrow">PREDICT FIRST</div>
          <h2 id="modal-title">${esc(mission.titleKo)}</h2>
          <p class="modal-formula">${esc(mission.formulaKo)}</p>
          <p class="modal-prompt">${esc(mission.promptKo)}</p>
          <p class="modal-note">정답을 맞히는 것이 목표가 아니라, 구조를 만들기 전에 생각을 기록하는 과정입니다. 선택하면 예측이 저장되고 제작대가 열립니다.</p>
          <div class="prediction-options" role="group" aria-label="예측 선택">
            ${mission.options
              .map(
                (option, index) =>
                  `<button type="button" class="prediction-option" data-modal-action="predict" data-answer="${esc(
                    option
                  )}" ${index === 0 ? 'autofocus' : ''}>${esc(option)}</button>`
              )
              .join('')}
          </div>
          <div class="modal-actions">
            <button type="button" class="text-button" data-modal-action="exit-mission">미션 나가기</button>
          </div>
        </div>
      `;
    }
    if (modal.kind === 'explanation') {
      const mission = getMission(modal.missionId);
      if (!mission) return '<p>미션을 찾을 수 없습니다.</p>';
      const next = getNextMission(mission);
      const prediction = state.mission.prediction;
      const predictionBadge =
        state.mission.predictionCorrect === true
          ? '<span class="badge badge-success">예측 적중</span>'
          : state.mission.predictionCorrect === false
            ? '<span class="badge badge-warn">예측과 실제가 달랐습니다</span>'
            : '<span class="badge badge-soft">예측 기록 없음</span>';
      const steps = missionSteps(mission);
      return `
        <div class="modal-body explanation-modal">
          <div class="modal-eyebrow">MISSION COMPLETE</div>
          <h2 id="modal-title">${esc(mission.titleKo)}</h2>
          <div class="explanation-result">
            <span class="modal-formula">${esc(mission.formulaKo)}</span>
            ${predictionBadge}
            ${prediction ? `<span class="prediction-chip">나의 예측: ${esc(prediction)}</span>` : ''}
          </div>
          <div class="explanation-block">
            <h3>왜 그럴까요?</h3>
            <p>${esc(mission.explanationKo)}</p>
          </div>
          <div class="takeaway-block">
            <span>한 줄 정리</span>
            <p>${esc(mission.takeawayKo)}</p>
          </div>
          ${
            steps.length > 1
              ? `<div class="explanation-steps"><span>이번 미션에서 확인한 구조</span><div>${steps
                  .map((step) => `<span class="step-chip is-done">✓ ${esc(step.labelKo)}</span>`)
                  .join('')}</div></div>`
              : ''
          }
          <div class="modal-actions modal-actions-end">
            <button type="button" class="text-button" data-modal-action="close">닫기</button>
            ${
              next
                ? `<button type="button" class="text-button" data-modal-action="hub">미션 허브</button>
                   <button type="button" class="btn btn-primary btn-pulse" data-modal-action="next-mission">다음 미션 · ${esc(next.titleKo)}</button>`
                : `<button type="button" class="btn btn-primary btn-pulse" data-modal-action="hub">미션 허브로</button>`
            }
          </div>
        </div>
      `;
    }
    if (modal.kind === 'help') {
      return `
        <div class="modal-body help-modal">
          <div class="modal-eyebrow">HOW TO BUILD</div>
          <h2 id="modal-title">BondForge 사용법</h2>
          <div class="help-grid">
            <section><h3>원자 놓기</h3><p>팔레트에서 원자를 고른 뒤 작업대를 클릭합니다. 빈 곳을 클릭하면 그 위치에 원자가 놓입니다.</p></section>
            <section><h3>결합 만들기</h3><p>결합 도구를 고르고 두 원자를 차례로 클릭합니다. 결합을 클릭하면 단일 → 이중 → 삼중으로 바뀝니다.</p></section>
            <section><h3>수소 채우기</h3><p>탄소 골격처럼 무거운 원자만 만든 뒤 H 채우기를 누르면 남은 원자가만큼 암시적 수소가 붙습니다.</p></section>
            <section><h3>점검하기</h3><p>원자를 선택하면 전자 영역 수, 전자 영역 기하, 분자 기하, 이상 각도와 VSEPR 근사 각도를 확인할 수 있습니다.</p></section>
          </div>
          <div class="shortcut-block">
            <h3>키보드</h3>
            <ul>
              <li><kbd>Tab</kbd> 팔레트와 점검 카드 이동</li>
              <li><kbd>←</kbd><kbd>→</kbd><kbd>↑</kbd><kbd>↓</kbd> 배치 커서 이동</li>
              <li><kbd>Enter</kbd> 원자 놓기 · 결합 완성</li>
              <li><kbd>B</kbd> 선택한 원자에서 결합 시작</li>
              <li><kbd>[</kbd><kbd>]</kbd> 원자 선택 이동</li>
              <li><kbd>Delete</kbd> 선택 항목 삭제, <kbd>H</kbd> 수소 채우기, <kbd>Esc</kbd> 선택 해제</li>
            </ul>
          </div>
          <div class="help-note">
            <strong>VSEPR 근사 모형</strong>
            <p>표시되는 결합각은 이상적인 전자 영역 배치를 바탕으로 한 근사값입니다. 실제 결합 길이와 미세한 왜곡은 다루지 않습니다.</p>
          </div>
          <p class="help-offline">모든 계산은 브라우저 안에서 실행되며, 네트워크나 AI 서비스 호출이 없습니다. 첫 방문 후에는 오프라인에서도 사용할 수 있습니다.</p>
          <div class="modal-actions modal-actions-end">
            <button type="button" class="btn btn-primary" data-modal-action="close" autofocus>닫기</button>
          </div>
        </div>
      `;
    }
    if (modal.kind === 'confirm-reset') {
      return `
        <div class="modal-body confirm-modal">
          <div class="modal-eyebrow">RESET PROGRESS</div>
          <h2 id="modal-title">진행을 초기화할까요?</h2>
          <p>완료한 미션, 예측 기록, 찾은 이성질체, 보기 설정이 모두 삭제됩니다. 이 작업은 되돌릴 수 없습니다.</p>
          <div class="modal-actions modal-actions-end">
            <button type="button" class="btn btn-ghost" data-modal-action="cancel-reset">취소</button>
            <button type="button" class="btn btn-danger" data-modal-action="confirm-reset">모두 초기화</button>
          </div>
        </div>
      `;
    }
    return `
      <div class="modal-body confirm-modal">
        <div class="modal-eyebrow">LEAVE MISSION</div>
        <h2 id="modal-title">미션을 나갈까요?</h2>
        <p>현재 미션 화면을 나가면 미션 목록으로 이동합니다. 이미 완료한 단계와 예측 기록은 저장됩니다.</p>
        <div class="modal-actions modal-actions-end">
          <button type="button" class="btn btn-ghost" data-modal-action="continue-mission">계속하기</button>
          <button type="button" class="btn btn-danger-ghost" data-modal-action="confirm-exit">미션 나가기</button>
        </div>
      </div>
    `;
  }

  private onModalClick = (event: MouseEvent): void => {
    const target = (event.target as HTMLElement).closest<HTMLElement>('[data-modal-action]');
    if (!target) return;
    switch (target.dataset.modalAction) {
      case 'predict':
        if (target.dataset.answer) this.submitPrediction(target.dataset.answer);
        break;
      case 'close':
        this.closeModal();
        break;
      case 'exit-mission':
      case 'confirm-exit':
        this.exitMission();
        break;
      case 'next-mission':
        this.nextMission();
        break;
      case 'hub':
        this.exitMission();
        break;
      case 'cancel-reset':
      case 'continue-mission':
        this.closeModal();
        break;
      case 'confirm-reset':
        this.confirmResetProgress();
        break;
      default:
        break;
    }
  };

  private onModalCancel = (event: Event): void => {
    const modal = this.store.get().modal;
    if (!modal) return;
    event.preventDefault();
    if (modal.kind === 'prediction') {
      this.announce('예측을 제출하거나 미션 나가기를 선택하세요.');
      return;
    }
    this.closeModal();
  };

  private onModalClose = (): void => {
    if (this.store.get().modal) {
      this.store.set((state) => ({ ...state, modal: null }));
    }
    this.lastModalKey = '';
  };

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    window.clearTimeout(this.toastTimer);
    window.clearTimeout(this.announceTimer);
    window.removeEventListener('hashchange', this.onHashChange);
    window.removeEventListener('beforeunload', this.onBeforeUnload);
    window.removeEventListener('keydown', this.onGlobalKeyDown);
    this.reducedMotionQuery?.removeEventListener('change', this.onReducedMotionChange);
    this.scene?.dispose();
    this.scene = null;
    this.teacherView.dispose();
    if (this.modalDialog.open) this.modalDialog.close();
    this.modalDialog.remove();
    this.worksheet.remove();
    this.root.replaceChildren();
  }
}
