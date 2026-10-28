import type { AppActions } from '../../app/actions';
import type { AppState } from '../../app/state';
import { DIFFICULTY_LABELS, MISSIONS, missionConceptLabel, type Mission } from './missions';

function esc(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function recommendedMission(completed: string[], lastMissionId: string | null): Mission {
  const last = MISSIONS.find(
    (mission) => mission.id === lastMissionId && !completed.includes(mission.id)
  );
  if (last) return last;
  return MISSIONS.find((mission) => !completed.includes(mission.id)) ?? MISSIONS[0];
}

export class MissionHub {
  readonly root: HTMLElement;
  private actions: AppActions;

  constructor(actions: AppActions) {
    this.actions = actions;
    this.root = document.createElement('section');
    this.root.className = 'view mission-hub-view';
    this.root.addEventListener('click', this.onClick);
  }

  private onClick = (event: MouseEvent): void => {
    const target = (event.target as HTMLElement).closest<HTMLElement>('[data-action]');
    if (!target) return;
    switch (target.dataset.action) {
      case 'start-mission':
        if (target.dataset.mission) this.actions.openMission(target.dataset.mission);
        break;
      case 'open-teacher':
        this.actions.navigate('teacher');
        break;
      case 'open-build':
        this.actions.navigate('build');
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
    const completed = state.progress.completed;
    const completedCount = MISSIONS.filter((mission) => completed.includes(mission.id)).length;
    const allDone = completedCount === MISSIONS.length;
    const recommended = recommendedMission(completed, state.progress.lastMissionId);
    const percent = Math.round((completedCount / MISSIONS.length) * 100);
    return `
      <div class="hub-hero">
        <div class="hub-hero-copy">
          <span class="eyebrow"><span aria-hidden="true">✦</span> MISSION CONTROL</span>
          <h1>예측하고, 만들고,<br />3D로 확인하세요.</h1>
          <p>여섯 개의 미션을 따라가며 분자 모양이 왜 달라지는지 직접 확인합니다. 모든 결과는 브라우저 안의 규칙 엔진이 계산합니다.</p>
          <div class="hub-hero-actions">
            ${
              allDone
                ? '<button type="button" class="btn btn-primary btn-pulse" data-action="open-build">자유 제작대로 가기</button>'
                : `<button type="button" class="btn btn-primary btn-pulse" data-action="start-mission" data-mission="${recommended.id}">${completedCount > 0 ? '이어서 하기' : '첫 미션 시작'} · ${esc(recommended.titleKo)}</button>`
            }
            <button type="button" class="btn btn-ghost" data-action="open-build">자유 제작</button>
            <button type="button" class="btn btn-ghost" data-action="open-teacher">교사 모드</button>
          </div>
        </div>
        <div class="hub-progress-card" aria-label="미션 진행 ${completedCount} / ${MISSIONS.length}">
          <div class="hub-progress-top">
            <span>진행 상황</span>
            <strong>${completedCount}<span>/${MISSIONS.length}</span></strong>
          </div>
          <div class="hub-progress-meter" aria-hidden="true"><span style="width:${percent}%"></span></div>
          <div class="hub-dots" aria-hidden="true">
            ${MISSIONS.map(
              (mission) =>
                `<span class="hub-dot ${completed.includes(mission.id) ? 'is-done' : ''}"></span>`
            ).join('')}
          </div>
          <p>${allDone ? '모든 미션 완료. 이제 자유롭게 구조를 실험해 보세요.' : `${percent}% 완료 · ${esc(recommended.formulaKo)}부터 이어가세요.`}</p>
        </div>
      </div>
      <div class="hub-section-head">
        <h2>미션 목록</h2>
        <p>난이도는 기초 → 탐구 → 도전 순서입니다.</p>
      </div>
      <div class="mission-card-grid">
        ${MISSIONS.map((mission, index) => this.renderCard(mission, index, completed.includes(mission.id))).join('')}
      </div>
      <div class="hub-footer-note">
        <span aria-hidden="true">⚗</span>
        <p><strong>교사라면</strong> 교사 모드에서 정답과 해설을 확인하고, 진행을 초기화하거나 워크시트를 인쇄할 수 있습니다.</p>
        <button type="button" class="text-button" data-action="open-teacher">교사 모드 열기 →</button>
      </div>
    `;
  }

  private renderCard(mission: Mission, index: number, done: boolean): string {
    const steps = mission.steps?.length ?? 1;
    return `
      <article class="mission-card ${done ? 'is-done' : ''}">
        <div class="mission-card-top">
          <span class="mission-card-index">${String(index + 1).padStart(2, '0')}</span>
          <span class="tag tag-${mission.concept}">${esc(missionConceptLabel(mission.concept))}</span>
          ${done ? '<span class="card-done-mark" aria-label="완료">✓</span>' : ''}
        </div>
        <h3>${esc(mission.titleKo)}</h3>
        <div class="mission-card-formula">${esc(mission.formulaKo)}</div>
        <p>${esc(mission.promptKo)}</p>
        <div class="mission-card-meta">
          <span>${esc(DIFFICULTY_LABELS[mission.difficulty])}</span>
          <span>${steps > 1 ? `구조 ${steps}개` : '구조 1개'}</span>
        </div>
        <button type="button" class="btn ${done ? 'btn-ghost' : 'btn-secondary'} btn-card" data-action="start-mission" data-mission="${mission.id}">
          ${done ? '다시 만들기' : '미션 시작'} <span aria-hidden="true">→</span>
        </button>
        <span class="mission-card-molecule" aria-hidden="true">
          ${miniMolecule(mission.concept)}
        </span>
      </article>
    `;
  }
}

function miniMolecule(concept: Mission['concept']): string {
  const layouts: Record<Mission['concept'], string> = {
    vsepr:
      '<span class="mm-dot mm-a" style="left:48%;top:48%"></span><span class="mm-dot mm-b" style="left:18%;top:24%"></span><span class="mm-dot mm-c" style="left:76%;top:22%"></span><span class="mm-line" style="left:30%;top:44%;width:24%;transform:rotate(-17deg)"></span>',
    polarity:
      '<span class="mm-dot mm-a" style="left:46%;top:48%"></span><span class="mm-dot mm-b" style="left:12%;top:56%"></span><span class="mm-dot mm-b" style="left:80%;top:40%"></span><span class="mm-line" style="left:24%;top:52%;width:22%"></span><span class="mm-line" style="left:55%;top:45%;width:22%;transform:rotate(-8deg)"></span>',
    isomer:
      '<span class="mm-dot mm-a" style="left:12%;top:36%"></span><span class="mm-dot mm-a" style="left:38%;top:58%"></span><span class="mm-dot mm-a" style="left:64%;top:34%"></span><span class="mm-dot mm-a" style="left:82%;top:62%"></span><span class="mm-line" style="left:19%;top:45%;width:20%;transform:rotate(19deg)"></span><span class="mm-line" style="left:45%;top:47%;width:20%;transform:rotate(-22deg)"></span><span class="mm-line" style="left:70%;top:45%;width:13%;transform:rotate(28deg)"></span>',
    'bond-order':
      '<span class="mm-dot mm-a" style="left:24%;top:50%"></span><span class="mm-dot mm-a" style="left:72%;top:50%"></span><span class="mm-dot mm-b" style="left:6%;top:68%"></span><span class="mm-dot mm-b" style="left:88%;top:32%"></span><span class="mm-line" style="left:32%;top:46%;width:34%"></span><span class="mm-line" style="left:32%;top:52%;width:34%"></span><span class="mm-line" style="left:32%;top:58%;width:34%"></span>'
  };
  return `<span class="mini-molecule">${layouts[concept]}</span>`;
}
