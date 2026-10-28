import type { MoleculeLayout } from '../../build/layout';
import { validateMolecule } from '../../build/graph';
import { formulaCounts, formatDisplayFormula, parseFormula } from '../../chem/formula';
import { canonicalSignature, isAcyclicConnected } from '../../chem/isomers';
import { computePolarity, polarityMatches } from '../../chem/polarity';
import type { Molecule } from '../../chem/types';
import { angleMatches, findCentralAtoms, geometryMatches } from '../../chem/vsepr';
import type { Mission, MissionStep, MissionTarget } from './missions';
import { missionSteps } from './missions';

export interface MissionCheckResult {
  ok: boolean;
  completed: boolean;
  matchedStepId: string | null;
  discoveredIsomers: string[];
  messageKo: string;
  hintKo: string;
  formula: string;
  polarity: 'polar' | 'nonpolar';
}

export interface TargetCheck {
  ok: boolean;
  reasons: string[];
  hintKo: string;
  formula: string;
  polarity: 'polar' | 'nonpolar';
  signature: string;
  isomerCount: number;
}

function formulaOf(molecule: Molecule): string {
  const counts = formulaCounts(molecule);
  return formatDisplayFormula(counts);
}

function formulaMatches(molecule: Molecule, target: MissionTarget): boolean {
  try {
    return (
      formatDisplayFormula(formulaCounts(molecule)) ===
      formatDisplayFormula(parseFormula(target.formula))
    );
  } catch {
    return false;
  }
}

function bondOrderMatches(molecule: Molecule, target: MissionTarget): boolean {
  if (target.bondOrder === undefined) return true;
  return molecule.bonds.some((bond) => bond.order === target.bondOrder);
}

export function checkTarget(
  molecule: Molecule,
  layout: MoleculeLayout,
  target: MissionTarget,
  options: { allowSkeleton?: boolean } = {}
): TargetCheck {
  const reasons: string[] = [];
  const formula = formulaOf(molecule);
  const polarity = computePolarity(molecule, layout);
  const validation = validateMolecule(molecule);
  const signature = canonicalSignature(molecule);
  const formulaOk = formulaMatches(molecule, target);
  if (!formulaOk) reasons.push('formula');
  if (!bondOrderMatches(molecule, target)) reasons.push('bond-order');
  if (!target.isomerCount || target.isomerCount <= 1) {
    if (!validation.connected) reasons.push('connected');
    if (!validation.complete && !options.allowSkeleton) reasons.push('valence');
  }
  if (target.geometry && !geometryMatches(molecule, target.geometry)) {
    reasons.push('geometry');
  }
  if (!polarityMatches(target.polarity, polarity)) {
    reasons.push('polarity');
  }
  if (target.angle !== undefined && !angleMatches(molecule, target.angle)) {
    reasons.push('angle');
  }

  let hintKo = '';
  if (reasons.includes('formula')) {
    hintKo = `현재 분자식은 ${formula || '—'}입니다. 목표 분자식 ${target.formula}과 원자 수를 비교해 보세요. 수소가 부족하다면 H 채우기를 사용해 보세요.`;
  } else if (reasons.includes('connected')) {
    hintKo = '원자들이 하나의 분자로 연결되어야 합니다. 결합 도구로 원자 사이를 이어 보세요.';
  } else if (reasons.includes('valence')) {
    const firstError = validation.issues.find((issue) => issue.level === 'error');
    const firstWarning = validation.issues.find((issue) => issue.level === 'warning');
    hintKo =
      firstError?.hintKo ??
      firstWarning?.hintKo ??
      '원자가가 남은 원자가 있습니다. H 채우기를 누르거나 결합을 추가해 보세요.';
  } else if (reasons.includes('bond-order')) {
    hintKo = '결합을 클릭하면 단일 → 이중 → 삼중 결합으로 바뀝니다. 결합 차수를 확인하세요.';
  } else if (reasons.includes('geometry')) {
    const central = findCentralAtoms(molecule)[0];
    hintKo = central
      ? `중심 원자의 전자 영역은 ${central.stericNumber}개, 비공유 전자쌍은 ${central.lonePairs}개입니다. 이 조합이 어떤 분자 모양을 만드는지 점검 카드에서 확인하세요.`
      : '중심 원자에 결합이 2개 이상 있어야 분자 모양을 판단할 수 있습니다.';
  } else if (reasons.includes('angle')) {
    hintKo = '이상 각도와 VSEPR 근사 각도를 구분해 보세요. 비공유 전자쌍이 각도를 줄입니다.';
  } else if (reasons.includes('polarity')) {
    hintKo =
      '결합 쌍극자는 전기 음성도가 큰 원자 쪽을 향합니다. 각 벡터를 더했을 때 상쇄되는지 확인하세요.';
  }

  return {
    ok: reasons.length === 0,
    reasons,
    hintKo,
    formula,
    polarity: polarity.polarity,
    signature,
    isomerCount: 0
  };
}

function discoverIsomer(
  molecule: Molecule,
  target: MissionTarget,
  existing: string[]
): { ok: boolean; completed: boolean; discovered: string[]; messageKo: string; hintKo: string } {
  const formula = formulaOf(molecule);
  const validation = validateMolecule(molecule);
  if (
    formatDisplayFormula(formulaCounts(molecule)) !==
    formatDisplayFormula(parseFormula(target.formula))
  ) {
    return {
      ok: false,
      completed: false,
      discovered: existing,
      messageKo: `현재 분자식은 ${formula}입니다. 목표는 ${target.formula}입니다.`,
      hintKo:
        '탄소 원자의 수와 수소의 수를 확인하세요. 탄소 골격을 만든 뒤 H 채우기를 사용할 수 있습니다.'
    };
  }
  if (!validation.connected) {
    return {
      ok: false,
      completed: false,
      discovered: existing,
      messageKo: '원자들이 하나의 분자로 연결되어 있지 않습니다.',
      hintKo: '결합 도구로 탄소 원자들을 하나의 골격으로 이어 보세요.'
    };
  }
  if (!validation.complete) {
    return {
      ok: false,
      completed: false,
      discovered: existing,
      messageKo: '원자가 아직 채워지지 않았습니다.',
      hintKo: 'H 채우기를 눌러 각 탄소의 수소를 채운 뒤 다시 확인하세요.'
    };
  }
  if (!isAcyclicConnected(molecule)) {
    return {
      ok: false,
      completed: false,
      discovered: existing,
      messageKo: '이 미션은 고리 구조를 지원하지 않습니다.',
      hintKo: '탄소가 한 줄 또는 가지로만 연결된 사슬 구조를 만들어 보세요.'
    };
  }
  const signature = canonicalSignature(molecule);
  const isNew = !existing.includes(signature);
  const discovered = [...new Set([...existing, signature])];
  const count = target.isomerCount ?? 2;
  const completed = discovered.length >= count;
  return {
    ok: true,
    completed,
    discovered,
    messageKo: completed
      ? `C₄H₁₀의 구조 이성질체 ${count}가지를 모두 찾았습니다.`
      : isNew
        ? `새로운 구조를 찾았습니다. 지금까지 ${discovered.length}/${count}개를 찾았습니다.`
        : `이미 찾은 구조입니다. 지금까지 ${discovered.length}/${count}개를 찾았습니다.`,
    hintKo: completed
      ? ''
      : isNew
        ? '같은 C₄H₁₀이지만 탄소의 연결 순서가 다른 구조를 하나 더 만들어 보세요.'
        : '이미 찾은 이성질체와 다른 연결 순서의 C₄H₁₀을 만들어 보세요.'
  };
}

export function checkMission(
  mission: Mission,
  molecule: Molecule,
  layout: MoleculeLayout,
  state: { stepsDone: string[]; discoveredIsomers: string[] }
): MissionCheckResult {
  const steps = missionSteps(mission);
  const found: string[] = [];
  let discovered = [...state.discoveredIsomers];
  let messageKo = '';
  let hintKo = '';
  let ok = false;
  let completed = false;
  let formula = formulaOf(molecule);
  let polarity: 'polar' | 'nonpolar' = 'nonpolar';

  if (mission.concept === 'isomer' && mission.target.isomerCount) {
    const result = discoverIsomer(molecule, mission.target, discovered);
    discovered = result.discovered;
    ok = result.ok;
    completed = result.completed;
    messageKo = result.messageKo;
    hintKo = result.hintKo;
    const polarityResult = computePolarity(molecule, layout);
    polarity = polarityResult.polarity;
  } else {
    const remaining = steps.filter((step) => !state.stepsDone.includes(step.id));
    const matches = steps
      .map((step) => ({ step, result: checkTarget(molecule, layout, step.target) }))
      .filter((entry) => entry.result.ok);
    const newMatch = matches.find((entry) => !state.stepsDone.includes(entry.step.id));
    const completedMatch = matches.find((entry) => state.stepsDone.includes(entry.step.id));
    if (newMatch) {
      found.push(newMatch.step.id);
      formula = newMatch.result.formula;
      polarity = newMatch.result.polarity;
      ok = true;
      const done = [...new Set([...state.stepsDone, newMatch.step.id])];
      completed = steps.every((step) => done.includes(step.id));
      const nextStep = steps.find((step) => !done.includes(step.id));
      messageKo = completed
        ? `${mission.titleKo} 미션을 완료했습니다.`
        : `구조를 완성했습니다. 다음 목표: ${nextStep?.labelKo ?? ''}`;
      hintKo = completed ? '' : '다음 구조도 같은 방법으로 만들어 보세요.';
    } else if (completedMatch) {
      formula = completedMatch.result.formula;
      polarity = completedMatch.result.polarity;
      ok = true;
      const nextStep = remaining[0];
      messageKo = nextStep
        ? `이미 완성한 구조입니다. 다음 목표: ${nextStep.labelKo}`
        : '이미 완성한 구조입니다.';
      hintKo = nextStep
        ? '다른 구조를 만들려면 분자를 초기화하거나 새 구조 만들기를 사용하세요.'
        : '';
      completed = remaining.length === 0;
    } else {
      const target = remaining[0] ?? steps[0];
      const result = checkTarget(molecule, layout, target.target);
      formula = result.formula;
      polarity = result.polarity;
      messageKo = incompleteMessage(mission, target, result);
      hintKo = result.hintKo;
    }
  }

  return {
    ok,
    completed,
    matchedStepId: found[0] ?? null,
    discoveredIsomers: discovered,
    messageKo,
    hintKo,
    formula,
    polarity
  };
}

function incompleteMessage(mission: Mission, step: MissionStep, result: TargetCheck): string {
  if (result.reasons.includes('formula')) {
    return `아직 목표 분자식 ${step.target.formula}이 아닙니다.`;
  }
  if (result.reasons.includes('connected')) {
    return '분자가 아직 하나로 연결되지 않았습니다.';
  }
  if (result.reasons.includes('valence')) {
    return '원자가가 채워지지 않은 원자가 있습니다.';
  }
  if (result.reasons.includes('bond-order')) {
    return '결합 차수가 목표와 다릅니다.';
  }
  if (result.reasons.includes('geometry') || result.reasons.includes('angle')) {
    return '분자 모양이 아직 목표와 다릅니다. 전자 영역과 비공유 전자쌍을 세어 보세요.';
  }
  if (result.reasons.includes('polarity')) {
    return '분자 전체의 극성이 목표와 다릅니다. 결합 쌍극자의 합을 확인하세요.';
  }
  return `${mission.titleKo}의 목표 구조와 아직 일치하지 않습니다.`;
}

export function predictionCorrect(mission: Mission, answer: string): boolean {
  return answer === mission.answer;
}
