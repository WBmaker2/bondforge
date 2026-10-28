import type { AppActions } from '../../app/actions';
import type { AppState } from '../../app/state';
import { validateMolecule } from '../../build/graph';
import { formatFormulaHtml } from './dom';
import {
  DIFFICULTY_LABELS,
  MISSIONS,
  getMission,
  missionConceptLabel,
  missionSteps,
  nextMission
} from '../../features/missions/missions';

function esc(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export class MissionStrip {
  readonly root: HTMLElement;
  private actions: AppActions;

  constructor(actions: AppActions) {
    this.actions = actions;
    this.root = create('section', { className: 'mission-strip', 'aria-label': '미션 진행' });
    this.root.addEventListener('click', this.onClick);
  }

  private onClick = (event: MouseEvent): void => {
    const target = (event.target as HTMLElement).closest<HTMLElement>('[data-action]');
    if (!target) return;
    const action = target.dataset.action;
    switch (action) {
      case 'open-prediction':
        this.actions.openPredictionGate();
        break;
      case 'check-mission':
        this.actions.checkMission();
        break;
      case 'next-step':
        this.actions.prepareNextStep();
        break;
      case 'open-explanation':
        if (target.dataset.mission) {
          this.actions.openModal({ kind: 'explanation', missionId: target.dataset.mission });
        }
        break;
      case 'next-mission':
        this.actions.nextMission();
        break;
      case 'exit-mission':
        this.actions.requestExitMission();
        break;
      case 'open-hub':
        this.actions.navigate('missions');
        break;
      case 'start-mission':
        if (target.dataset.mission) this.actions.openMission(target.dataset.mission);
        break;
      default:
        break;
    }
  };

  update(state: AppState): void {
    const active = document.activeElement as HTMLElement | null;
    const focusKey =
      active && this.root.contains(active) && active.dataset.action
        ? `${active.dataset.action}|${active.dataset.mission ?? ''}`
        : null;
    this.root.innerHTML = this.render(state);
    if (focusKey) {
      const [action, mission] = focusKey.split('|');
      const match = [...this.root.querySelectorAll<HTMLElement>('[data-action]')].find(
        (element) =>
          element.dataset.action === action && (element.dataset.mission ?? '') === mission
      );
      match?.focus({ preventScroll: true });
    }
  }

  private render(state: AppState): string {
    const mission = getMission(state.mission.currentId);
    if (!mission) return this.renderIdle(state);
    const steps = missionSteps(mission);
    const done = state.mission.stepsDone;
    const isMulti = steps.length > 1;
    const completed = state.mission.completed;
    const nextStep = steps.find((step) => !done.includes(step.id));
    const prediction = state.mission.prediction;
    const validation = validateMolecule(state.molecule);
    const needsHydrogen =
      state.molecule.atoms.length > 0 &&
      state.molecule.atoms.some(
        (atom) => atom.element !== 'H' && atom.implicitHydrogens === 0 && !validation.complete
      );
    const feedback = state.mission.feedback;
    const discovered = state.mission.discoveredIsomers.length;
    const isomerTarget = mission.target.isomerCount ?? 0;
    const feedbackActions =
      feedback?.kind === 'success' && !completed
        ? mission.concept === 'isomer'
          ? `<button type="button" class="btn btn-primary btn-small btn-pulse" data-action="next-step">다른 구조 만들기</button>`
          : isMulti
            ? `<button type="button" class="btn btn-primary btn-small btn-pulse" data-action="next-step">다음 구조 만들기</button>`
            : ''
        : '';
    const primaryAction = completed
      ? `<button type="button" class="btn btn-primary btn-small" data-action="open-explanation" data-mission="${mission.id}">설명 다시 보기</button>
         ${
           nextMission(mission)
             ? `<button type="button" class="btn btn-secondary btn-small btn-pulse" data-action="next-mission">다음 미션</button>`
             : `<button type="button" class="btn btn-secondary btn-small btn-pulse" data-action="open-hub">미션 허브로</button>`
         }`
      : prediction === null
        ? `<button type="button" class="btn btn-primary btn-small btn-pulse" data-action="open-prediction">예측 먼저 제출하기</button>`
        : `<button type="button" class="btn btn-primary btn-small btn-pulse" data-action="check-mission">구조 확인</button>`;

    const stepChips = isMulti
      ? `<div class="mission-steps" aria-label="미션 단계">
          ${steps
            .map((step, index) => {
              const isDone = done.includes(step.id);
              const isNext = nextStep?.id === step.id;
              return `<span class="step-chip ${isDone ? 'is-done' : ''} ${isNext ? 'is-next' : ''}">
                <span class="step-index">${isDone ? '✓' : index + 1}</span>${esc(step.labelKo)}
              </span>`;
            })
            .join('')}
        </div>`
      : '';
    const isomerProgress =
      isomerTarget > 0
        ? `<div class="isomer-progress">
            <span>찾은 구조 <strong>${discovered}/${isomerTarget}</strong></span>
            <span class="mini-meter"><span style="width:${Math.min(100, (discovered / isomerTarget) * 100)}%"></span></span>
          </div>`
        : '';

    return `
      <div class="mission-strip-head">
        <div class="mission-strip-title">
          <span class="mission-index">${MISSIONS.findIndex((candidate) => candidate.id === mission.id) + 1}</span>
          <div>
            <h2>${esc(mission.titleKo)}</h2>
            <div class="mission-meta">
              <span class="tag tag-${mission.concept}">${esc(missionConceptLabel(mission.concept))}</span>
              <span class="muted">${esc(DIFFICULTY_LABELS[mission.difficulty])}</span>
              ${completed ? '<span class="badge badge-success">완료</span>' : ''}
            </div>
          </div>
        </div>
        <button type="button" class="icon-btn small" data-action="exit-mission" aria-label="미션 나가기" title="미션 나가기">×</button>
      </div>
      <div class="mission-strip-body">
        <p class="mission-prompt">${esc(mission.promptKo)}</p>
        <div class="mission-target-row">
          <span class="target-label">목표</span>
          <strong class="target-formula">${nextStep ? formatFormulaHtml(nextStep.target.formula) : formatFormulaHtml(mission.target.formula)}</strong>
          ${prediction ? `<span class="prediction-chip">예측: ${esc(prediction)}</span>` : '<span class="prediction-chip is-locked">예측 잠김</span>'}
          ${isomerProgress}
        </div>
        ${stepChips}
        ${
          needsHydrogen && prediction
            ? '<p class="mission-tip">원자가가 남은 원자가 있습니다. 팔레트의 <strong>H 채우기</strong>를 먼저 눌러 보세요.</p>'
            : ''
        }
        ${
          feedback
            ? `<div class="mission-feedback is-${feedback.kind}" role="status" aria-live="polite">
                <strong>${esc(feedback.titleKo)}</strong>
                <p>${esc(feedback.messageKo)}</p>
                ${feedback.hintKo ? `<p class="feedback-hint"><span>근거 힌트</span>${esc(feedback.hintKo)}</p>` : ''}
              </div>`
            : ''
        }
      </div>
      <div class="mission-strip-actions">
        <div class="mission-actions-left">
          <button type="button" class="text-button" data-action="open-hub">미션 목록</button>
        </div>
        <div class="mission-actions-right">
          ${feedbackActions}
          ${primaryAction}
        </div>
      </div>
    `;
  }

  private renderIdle(state: AppState): string {
    const completed = state.progress.completed;
    const allDone = MISSIONS.every((mission) => completed.includes(mission.id));
    const recommended = MISSIONS.find((mission) => !completed.includes(mission.id)) ?? MISSIONS[0];
    return `
      <div class="mission-idle">
        <div class="mission-idle-mark" aria-hidden="true">✦</div>
        <div class="mission-idle-copy">
          <h2>${allDone ? '모든 미션을 완료했습니다' : '예측 → 제작 → 점검'}</h2>
          <p>${allDone ? '자유롭게 분자를 만들거나 교사 모드에서 진행을 초기화할 수 있습니다.' : `${esc(recommended.titleKo)}부터 시작해 보세요. 예측을 먼저 쓰고 3D 구조로 확인합니다.`}</p>
        </div>
        ${
          allDone
            ? '<button type="button" class="btn btn-secondary btn-small" data-action="open-hub">미션 허브</button>'
            : `<button type="button" class="btn btn-primary btn-small btn-pulse" data-action="start-mission" data-mission="${recommended.id}">미션 시작</button>`
        }
        <button type="button" class="text-button" data-action="open-hub">전체 보기</button>
      </div>
    `;
  }
}

function create<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Record<string, string>
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (key === 'className') node.className = value;
    else node.setAttribute(key, value);
  }
  return node;
}
