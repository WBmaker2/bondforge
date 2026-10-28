import missionsData from '../../data/missions.json';
import type { GeometryId } from '../../chem/geometry';
import type { Polarity } from '../../chem/types';

export type MissionConcept = 'vsepr' | 'polarity' | 'isomer' | 'bond-order';

export interface MissionTarget {
  formula: string;
  heavyAtomGraph?: string;
  geometry?: GeometryId;
  polarity?: Polarity;
  angle?: number;
  bondOrder?: 1 | 2 | 3;
  isomerCount?: number;
}

export interface MissionStep {
  id: string;
  labelKo: string;
  target: MissionTarget;
  hintKo?: string;
}

export interface Mission {
  id: string;
  titleKo: string;
  concept: MissionConcept;
  formulaKo: string;
  promptKo: string;
  options: string[];
  answer: string;
  target: MissionTarget;
  steps?: MissionStep[];
  explanationKo: string;
  takeawayKo: string;
  difficulty: 1 | 2 | 3;
}

export const MISSIONS = missionsData as Mission[];

export const CONCEPT_LABELS: Record<MissionConcept, string> = {
  vsepr: 'VSEPR 기하',
  polarity: '결합 극성',
  isomer: '구조 이성질체',
  'bond-order': '결합 차수'
};

export const DIFFICULTY_LABELS: Record<number, string> = {
  1: '기초',
  2: '탐구',
  3: '도전'
};

export function getMission(id: string | null): Mission | null {
  if (!id) return null;
  return MISSIONS.find((mission) => mission.id === id) ?? null;
}

export function missionSteps(mission: Mission): MissionStep[] {
  if (mission.steps && mission.steps.length > 0) return mission.steps;
  return [{ id: mission.id, labelKo: mission.titleKo, target: mission.target }];
}

export function nextMission(mission: Mission): Mission | null {
  const index = MISSIONS.findIndex((candidate) => candidate.id === mission.id);
  if (index < 0 || index === MISSIONS.length - 1) return null;
  return MISSIONS[index + 1];
}

export function missionConceptLabel(concept: MissionConcept): string {
  return CONCEPT_LABELS[concept];
}
