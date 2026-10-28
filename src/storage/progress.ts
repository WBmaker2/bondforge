import type { Molecule } from '../chem/types';

export const STORAGE_KEY = 'bondforge.progress.v1';

export interface ViewPreferences {
  autoRotate: boolean;
  showLabels: boolean;
  showLonePairs: boolean;
  showDipole: boolean;
  showImplicitHydrogens: boolean;
}

export interface ProgressData {
  version: 1;
  completed: string[];
  answers: Record<string, string>;
  lastMissionId: string | null;
  discoveredIsomers: Record<string, string[]>;
  stepsDone: Record<string, string[]>;
  view: ViewPreferences;
  preferences: {
    reducedMotion: boolean;
    language: 'ko' | 'en';
  };
  savedSnapshot?: Molecule | null;
}

export const DEFAULT_VIEW: ViewPreferences = {
  autoRotate: false,
  showLabels: true,
  showLonePairs: true,
  showDipole: true,
  showImplicitHydrogens: true
};

export function defaultProgress(): ProgressData {
  return {
    version: 1,
    completed: [],
    answers: {},
    lastMissionId: null,
    discoveredIsomers: {},
    stepsDone: {},
    view: { ...DEFAULT_VIEW },
    preferences: {
      reducedMotion: false,
      language: 'ko'
    },
    savedSnapshot: null
  };
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === 'string');
}

function sanitize(raw: unknown): ProgressData {
  const base = defaultProgress();
  if (!raw || typeof raw !== 'object') return base;
  const data = raw as Partial<ProgressData>;
  const view = (data.view ?? {}) as Partial<ViewPreferences>;
  const preferences = (data.preferences ?? {}) as Partial<ProgressData['preferences']>;
  const discovered: Record<string, string[]> = {};
  if (data.discoveredIsomers && typeof data.discoveredIsomers === 'object') {
    for (const [key, value] of Object.entries(data.discoveredIsomers)) {
      if (isStringArray(value)) discovered[key] = [...new Set(value)];
    }
  }
  const steps: Record<string, string[]> = {};
  if (data.stepsDone && typeof data.stepsDone === 'object') {
    for (const [key, value] of Object.entries(data.stepsDone)) {
      if (isStringArray(value)) steps[key] = [...new Set(value)];
    }
  }
  return {
    version: 1,
    completed: isStringArray(data.completed) ? [...new Set(data.completed)] : [],
    answers:
      data.answers && typeof data.answers === 'object'
        ? Object.fromEntries(
            Object.entries(data.answers).filter(
              (entry): entry is [string, string] => typeof entry[1] === 'string'
            )
          )
        : {},
    lastMissionId: typeof data.lastMissionId === 'string' ? data.lastMissionId : null,
    discoveredIsomers: discovered,
    stepsDone: steps,
    view: {
      autoRotate: typeof view.autoRotate === 'boolean' ? view.autoRotate : base.view.autoRotate,
      showLabels: typeof view.showLabels === 'boolean' ? view.showLabels : base.view.showLabels,
      showLonePairs:
        typeof view.showLonePairs === 'boolean' ? view.showLonePairs : base.view.showLonePairs,
      showDipole: typeof view.showDipole === 'boolean' ? view.showDipole : base.view.showDipole,
      showImplicitHydrogens:
        typeof view.showImplicitHydrogens === 'boolean'
          ? view.showImplicitHydrogens
          : base.view.showImplicitHydrogens
    },
    preferences: {
      reducedMotion:
        typeof preferences.reducedMotion === 'boolean' ? preferences.reducedMotion : false,
      language: preferences.language === 'en' ? 'en' : 'ko'
    },
    savedSnapshot: null
  };
}

export function loadProgress(): ProgressData {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultProgress();
    return sanitize(JSON.parse(raw));
  } catch {
    return defaultProgress();
  }
}

export function saveProgress(progress: ProgressData): void {
  try {
    const payload: ProgressData = { ...progress, savedSnapshot: null };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // Storage can be unavailable in private mode; the app still works in memory.
  }
}

export function resetProgressStorage(): ProgressData {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Ignore storage failures.
  }
  return defaultProgress();
}

export function markMissionComplete(progress: ProgressData, missionId: string): ProgressData {
  return {
    ...progress,
    completed: [...new Set([...progress.completed, missionId])],
    lastMissionId: missionId
  };
}

export function setMissionAnswer(
  progress: ProgressData,
  missionId: string,
  answer: string
): ProgressData {
  return {
    ...progress,
    answers: { ...progress.answers, [missionId]: answer },
    lastMissionId: missionId
  };
}

export function setMissionSteps(
  progress: ProgressData,
  missionId: string,
  steps: string[]
): ProgressData {
  return {
    ...progress,
    stepsDone: { ...progress.stepsDone, [missionId]: [...new Set(steps)] },
    lastMissionId: missionId
  };
}

export function setDiscoveredIsomers(
  progress: ProgressData,
  missionId: string,
  signatures: string[]
): ProgressData {
  return {
    ...progress,
    discoveredIsomers: {
      ...progress.discoveredIsomers,
      [missionId]: [...new Set(signatures)]
    },
    lastMissionId: missionId
  };
}
