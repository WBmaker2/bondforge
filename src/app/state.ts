import type { MoleculeLayout } from '../build/layout';
import { layoutMolecule } from '../build/layout';
import { createEmptyMolecule } from '../build/graph';
import type { ElementSymbol, Molecule, Vec3 } from '../chem/types';
import { v3 } from '../chem/vec';
import { DEFAULT_VIEW, type ProgressData, type ViewPreferences } from '../storage/progress';

export type Route = 'build' | 'missions' | 'teacher';
export type Tool = 'select' | 'atom' | 'bond' | 'delete';
export type MobilePanel = 'atoms' | 'inspect' | 'mission';

export interface SelectionState {
  atomId: number | null;
  bondId: number | null;
  tool: Tool;
  pendingAtom: ElementSymbol | null;
  pendingBondAtomId: number | null;
}

export type FeedbackKind = 'success' | 'error' | 'info';

export interface MissionFeedback {
  kind: FeedbackKind;
  titleKo: string;
  messageKo: string;
  hintKo?: string;
}

export interface MissionRuntime {
  currentId: string | null;
  prediction: string | null;
  predictionCorrect: boolean | null;
  stepsDone: string[];
  discoveredIsomers: string[];
  feedback: MissionFeedback | null;
  completed: boolean;
}

export type ModalState =
  | { kind: 'prediction'; missionId: string }
  | { kind: 'explanation'; missionId: string }
  | { kind: 'help' }
  | { kind: 'confirm-reset' }
  | { kind: 'confirm-exit-mission' }
  | null;

export interface ToastState {
  id: number;
  messageKo: string;
  kind: FeedbackKind;
}

export interface HistoryFlags {
  canUndo: boolean;
  canRedo: boolean;
}

export interface TeacherState {
  showAnswers: boolean;
  previewMissionId: string | null;
  previewOptionId: string | null;
}

export interface UIState {
  inspectorOpen: boolean;
  mobilePanel: MobilePanel;
}

export interface AppState {
  route: Route;
  molecule: Molecule;
  layout: MoleculeLayout;
  selection: SelectionState;
  view: ViewPreferences;
  mission: MissionRuntime;
  progress: ProgressData;
  teacher: TeacherState;
  ui: UIState;
  modal: ModalState;
  toast: ToastState | null;
  reducedMotion: boolean;
  history: HistoryFlags;
  lastAtomPosition: Vec3 | null;
}

export function initialMission(): MissionRuntime {
  return {
    currentId: null,
    prediction: null,
    predictionCorrect: null,
    stepsDone: [],
    discoveredIsomers: [],
    feedback: null,
    completed: false
  };
}

export function initialState(progress: ProgressData, reducedMotion: boolean): AppState {
  const molecule = createEmptyMolecule();
  const view: ViewPreferences = {
    ...DEFAULT_VIEW,
    ...progress.view,
    autoRotate: reducedMotion ? false : progress.view.autoRotate
  };
  return {
    route: 'build',
    molecule,
    layout: layoutMolecule(molecule),
    selection: {
      atomId: null,
      bondId: null,
      tool: 'select',
      pendingAtom: null,
      pendingBondAtomId: null
    },
    view,
    mission: initialMission(),
    progress,
    teacher: {
      showAnswers: false,
      previewMissionId: null,
      previewOptionId: null
    },
    ui: {
      inspectorOpen: false,
      mobilePanel: 'atoms'
    },
    modal: null,
    toast: null,
    reducedMotion,
    history: { canUndo: false, canRedo: false },
    lastAtomPosition: null
  };
}

export function readReducedMotion(): boolean {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

export function emptyPosition(): Vec3 {
  return v3();
}
