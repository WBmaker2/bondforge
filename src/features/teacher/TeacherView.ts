import type { AppActions } from '../../app/actions';
import type { AppState } from '../../app/state';
import { layoutMolecule } from '../../build/layout';
import { formatDisplayFormula, formulaCounts } from '../../chem/formula';
import { formatAngle, geometryName } from '../../chem/geometry';
import { computePolarity } from '../../chem/polarity';
import { chooseRepresentativeVsepr } from '../../chem/vsepr';
import { SceneManager } from '../../render/SceneManager';
import { el, formatFormulaHtml, svgIcon } from '../../ui/components/dom';
import {
  DIFFICULTY_LABELS,
  MISSIONS,
  getMission,
  missionConceptLabel,
  missionSteps,
  type Mission,
  type MissionTarget
} from '../missions/missions';
import { previewOptionsForMission } from '../missions/targets';
import type { ViewPreferences } from '../../storage/progress';

function esc(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function targetSummary(target: MissionTarget): string {
  const parts: string[] = [`분자식 ${target.formula}`];
  if (target.geometry) parts.push(`분자 기하 ${geometryName(target.geometry).ko}`);
  if (target.polarity) parts.push(target.polarity === 'polar' ? '극성' : '무극성');
  if (target.angle !== undefined) parts.push(`근사 ${formatAngle(target.angle)}`);
  if (target.bondOrder) parts.push(`결합 차수 ${target.bondOrder}`);
  if (target.isomerCount) parts.push(`구조 이성질체 ${target.isomerCount}가지`);
  return parts.join(' · ');
}

export class TeacherView {
  readonly root: HTMLElement;
  private actions: AppActions;
  private missionList: HTMLElement;
  private previewCanvas: HTMLElement;
  private previewOptions: HTMLElement;
  private previewCaption: HTMLElement;
  private answersButton: HTMLButtonElement;
  private scene: SceneManager | null = null;
  private visible = false;
  private lastState: AppState | null = null;
  private currentOptionId: string | null = null;
  private currentMissionId: string | null = null;

  constructor(actions: AppActions) {
    this.actions = actions;
    this.missionList = el('div', { className: 'teacher-missions' });
    this.previewCanvas = el('div', {
      className: 'preview-canvas',
      'aria-label': '목표 분자 3D 미리보기'
    });
    this.previewOptions = el('div', {
      className: 'preview-options',
      role: 'group',
      'aria-label': '목표 구조 선택'
    });
    this.previewCaption = el('p', { className: 'preview-caption' });

    this.answersButton = el(
      'button',
      {
        type: 'button',
        className: 'btn btn-secondary',
        'data-action': 'toggle-answers',
        'aria-pressed': 'false'
      },
      svgIcon('eye', 17),
      el('span', { text: '답 보기' })
    );

    const printButton = el(
      'button',
      { type: 'button', className: 'btn btn-ghost', 'data-action': 'print' },
      svgIcon('print', 17),
      el('span', { text: '워크시트 인쇄' })
    );
    const resetButton = el(
      'button',
      { type: 'button', className: 'btn btn-danger-ghost', 'data-action': 'reset' },
      svgIcon('reset', 17),
      el('span', { text: '진행 초기화' })
    );

    this.root = el(
      'section',
      { className: 'view teacher-view' },
      el(
        'div',
        { className: 'teacher-header' },
        el(
          'div',
          { className: 'teacher-header-copy' },
          el(
            'span',
            { className: 'eyebrow' },
            el('span', { 'aria-hidden': 'true' }, '▤'),
            'TEACHER MODE'
          ),
          el('h1', { text: '교사 모드' }),
          el('p', {
            text: '정답, 목표 구조, 해설을 확인하고 수업 진행을 관리합니다. 모든 계산은 학생 화면과 같은 규칙 엔진을 사용합니다.'
          })
        ),
        el('div', { className: 'teacher-actions' }, this.answersButton, printButton, resetButton)
      ),
      el(
        'div',
        { className: 'teacher-grid' },
        this.missionList,
        el(
          'aside',
          { className: 'preview-panel', 'aria-label': '목표 분자 미리보기' },
          el(
            'div',
            { className: 'preview-head' },
            el('h2', { text: '목표 구조 미리보기' }),
            el('span', { className: 'vsepr-chip', text: '3D' })
          ),
          this.previewCanvas,
          this.previewOptions,
          this.previewCaption,
          el('p', {
            className: 'preview-note',
            text: 'VSEPR 근사 모형입니다. 실제 결합 길이·각도와 다를 수 있으며, 비공유 전자쌍은 청록색 로브로 표시됩니다.'
          })
        )
      )
    );
    this.root.hidden = true;
    this.root.addEventListener('click', this.onClick);
  }

  private onClick = (event: MouseEvent): void => {
    const target = (event.target as HTMLElement).closest<HTMLElement>('[data-action]');
    if (!target) return;
    switch (target.dataset.action) {
      case 'toggle-answers':
        this.actions.toggleTeacherAnswers();
        break;
      case 'print':
        this.actions.printWorksheet();
        break;
      case 'reset':
        this.actions.openModal({ kind: 'confirm-reset' });
        break;
      case 'preview-mission':
        if (target.dataset.mission) this.actions.selectTeacherMission(target.dataset.mission);
        break;
      case 'preview-option':
        if (target.dataset.option) this.actions.selectTeacherPreviewOption(target.dataset.option);
        break;
      case 'start-mission':
        if (target.dataset.mission) this.actions.openMission(target.dataset.mission);
        break;
      default:
        break;
    }
  };

  setVisible(visible: boolean): void {
    if (this.visible === visible) return;
    this.visible = visible;
    this.root.hidden = !visible;
    if (this.scene) this.scene.setPaused(!visible);
    if (visible && this.lastState) {
      this.ensureScene(this.lastState);
      this.scene?.fitCamera(false);
    }
  }

  dispose(): void {
    this.scene?.dispose();
    this.scene = null;
  }

  update(state: AppState): void {
    this.lastState = state;
    const mission = this.previewMission(state);
    if (mission) {
      if (this.currentMissionId !== mission.id) {
        this.currentMissionId = mission.id;
        this.currentOptionId = null;
      }
      const options = previewOptionsForMission(mission);
      const option =
        options.find((candidate) => candidate.id === state.teacher.previewOptionId) ??
        options.find((candidate) => candidate.id === this.currentOptionId) ??
        options[0] ??
        null;
      if (option) this.currentOptionId = option.id;
      this.renderMissionList(state, mission);
      this.renderPreview(mission, options, option);
    } else {
      this.missionList.innerHTML =
        '<div class="empty-card"><h3>미션을 선택하세요</h3><p>왼쪽 목록에서 미리보기 버튼을 누르면 목표 구조가 나타납니다.</p></div>';
      this.previewOptions.innerHTML = '';
      this.previewCaption.textContent = '';
    }
    this.answersButton.classList.toggle('is-active', state.teacher.showAnswers);
    this.answersButton.setAttribute('aria-pressed', String(state.teacher.showAnswers));
    this.answersButton.querySelector('span')!.textContent = state.teacher.showAnswers
      ? '답 숨기기'
      : '답 보기';
    if (this.visible) {
      this.ensureScene(state);
      this.updateScene(state);
    }
  }

  private previewMission(state: AppState): Mission | null {
    const requested =
      state.teacher.previewMissionId ?? state.mission.currentId ?? MISSIONS[0]?.id ?? null;
    return getMission(requested) ?? MISSIONS[0] ?? null;
  }

  private ensureScene(state: AppState): void {
    if (this.scene) return;
    this.previewCanvas.innerHTML = '';
    this.scene = new SceneManager(this.previewCanvas, {
      readOnly: true,
      autoRotate: true,
      showGrid: true,
      autoFit: true
    });
    this.scene.setCallbacks({});
    this.scene.update({
      molecule: { atoms: [], bonds: [] },
      layout: layoutMolecule({ atoms: [], bonds: [] }),
      view: this.previewView(state),
      selection: { atomId: null, bondId: null },
      reducedMotion: state.reducedMotion
    });
  }

  private previewView(state: AppState): ViewPreferences {
    return {
      ...state.view,
      autoRotate: true,
      showLabels: true,
      showLonePairs: true,
      showDipole: true,
      showImplicitHydrogens: true
    };
  }

  private updateScene(state: AppState): void {
    if (!this.scene) return;
    const mission = this.previewMission(state);
    if (!mission) return;
    const options = previewOptionsForMission(mission);
    const option =
      options.find((candidate) => candidate.id === this.currentOptionId) ?? options[0] ?? null;
    if (!option) return;
    const layout = layoutMolecule(option.molecule);
    this.scene.update({
      molecule: option.molecule,
      layout,
      view: this.previewView(state),
      selection: { atomId: null, bondId: null },
      reducedMotion: state.reducedMotion
    });
  }

  private renderMissionList(state: AppState, preview: Mission): void {
    const active = document.activeElement as HTMLElement | null;
    const focusKey =
      active && this.missionList.contains(active) && active.dataset.action
        ? `${active.dataset.action}|${active.dataset.mission ?? ''}`
        : null;
    this.missionList.innerHTML = MISSIONS.map((mission) =>
      this.renderMissionCard(mission, state, preview.id)
    ).join('');
    if (focusKey) {
      const [action, id] = focusKey.split('|');
      const match = [...this.missionList.querySelectorAll<HTMLElement>('[data-action]')].find(
        (element) => element.dataset.action === action && (element.dataset.mission ?? '') === id
      );
      match?.focus({ preventScroll: true });
    }
  }

  private renderMissionCard(mission: Mission, state: AppState, previewId: string): string {
    const done = state.progress.completed.includes(mission.id);
    const showAnswers = state.teacher.showAnswers;
    const steps = missionSteps(mission);
    return `
      <article class="teacher-card ${previewId === mission.id ? 'is-previewing' : ''}">
        <div class="teacher-card-head">
          <span class="teacher-card-index">${String(MISSIONS.indexOf(mission) + 1).padStart(2, '0')}</span>
          <span class="tag tag-${mission.concept}">${esc(missionConceptLabel(mission.concept))}</span>
          <span class="muted">${esc(DIFFICULTY_LABELS[mission.difficulty])}</span>
          ${done ? '<span class="badge badge-success">완료</span>' : ''}
        </div>
        <div class="teacher-card-title">
          <h3>${esc(mission.titleKo)}</h3>
          <span class="teacher-formula">${esc(mission.formulaKo)}</span>
        </div>
        <p class="teacher-prompt">${esc(mission.promptKo)}</p>
        <div class="teacher-options">
          ${mission.options
            .map(
              (option) =>
                `<span class="teacher-option ${showAnswers && option === mission.answer ? 'is-answer' : ''}">${esc(option)}</span>`
            )
            .join('')}
        </div>
        ${
          showAnswers
            ? `<div class="answer-block">
                <div class="answer-line"><span>예측 정답</span><strong>${esc(mission.answer)}</strong></div>
                <div class="answer-line"><span>목표</span><strong>${esc(targetSummary(mission.target))}</strong></div>
                ${
                  mission.steps
                    ? `<ul class="answer-steps">${mission.steps
                        .map(
                          (step) =>
                            `<li><strong>${esc(step.labelKo)}</strong><span>${esc(targetSummary(step.target))}</span></li>`
                        )
                        .join('')}</ul>`
                    : ''
                }
                <div class="answer-explanation"><span>해설</span><p>${esc(mission.explanationKo)}</p></div>
                <div class="answer-takeaway"><span>한 줄 정리</span><p>${esc(mission.takeawayKo)}</p></div>
              </div>`
            : '<div class="answer-hidden"><span aria-hidden="true">◈</span> 답과 해설을 보려면 상단의 <strong>답 보기</strong>를 누르세요.</div>'
        }
        <div class="teacher-card-actions">
          <button type="button" class="btn btn-ghost btn-small" data-action="preview-mission" data-mission="${mission.id}">미리보기</button>
          <button type="button" class="btn btn-secondary btn-small" data-action="start-mission" data-mission="${mission.id}">학생 화면으로 열기</button>
        </div>
        ${steps.length > 1 ? `<div class="teacher-step-note">${steps.length}단계 구조</div>` : ''}
      </article>
    `;
  }

  private renderPreview(
    mission: Mission,
    options: ReturnType<typeof previewOptionsForMission>,
    option: ReturnType<typeof previewOptionsForMission>[number] | null
  ): void {
    this.previewOptions.innerHTML = options
      .map(
        (candidate) =>
          `<button type="button" class="preview-option ${candidate.id === option?.id ? 'is-active' : ''}" data-action="preview-option" data-option="${candidate.id}" aria-pressed="${candidate.id === option?.id}">${esc(candidate.labelKo)}</button>`
      )
      .join('');
    if (!option) {
      this.previewCaption.textContent = '미리보기 구조가 없습니다.';
      return;
    }
    const molecule = option.molecule;
    const layout = layoutMolecule(molecule);
    const vsepr = chooseRepresentativeVsepr(molecule);
    const polarity = computePolarity(molecule, layout);
    const formula = formatDisplayFormula(formulaCounts(molecule));
    const geometry = geometryName(vsepr?.molecularGeometry ?? null);
    const angle = formatAngle(vsepr?.approximateAngle ?? null);
    this.previewCaption.innerHTML = `${formatFormulaHtml(formula)} · ${esc(geometry.ko)} · ${esc(polarity.labelKo)}${angle === '—' ? '' : ` · 근사 ${angle}`}`;
    this.previewOptions.setAttribute('aria-label', `${mission.titleKo} 목표 구조 선택`);
  }
}
