import type { AppActions } from '../../app/actions';
import type { AppState } from '../../app/state';
import { formatDisplayFormula, formulaCounts } from '../../chem/formula';
import { formatAngle, geometryName } from '../../chem/geometry';
import { computePolarity } from '../../chem/polarity';
import { chooseRepresentativeVsepr } from '../../chem/vsepr';
import { el, formatFormulaHtml, iconButton, svgIcon } from './dom';

type ViewKey = 'showLabels' | 'showLonePairs' | 'showDipole' | 'showImplicitHydrogens';

const VIEW_TOGGLES: Array<{ key: ViewKey; icon: string; label: string; short: string }> = [
  { key: 'showLabels', icon: 'label', label: '원소 기호 표시', short: '기호' },
  { key: 'showLonePairs', icon: 'lonePair', label: '비공유 전자쌍 표시', short: '비공유' },
  { key: 'showDipole', icon: 'dipole', label: '분자 쌍극자 표시', short: '쌍극자' },
  { key: 'showImplicitHydrogens', icon: 'implicitH', label: '암시적 수소 표시', short: '암시 H' }
];

export class StageOverlay {
  readonly root: HTMLElement;
  private actions: AppActions;
  private formula: HTMLElement;
  private geometry: HTMLElement;
  private angle: HTMLElement;
  private polarity: HTMLElement;
  private hint: HTMLElement;
  private viewButtons = new Map<ViewKey, HTMLButtonElement>();
  private rotateButton: HTMLButtonElement;
  private panelButton: HTMLButtonElement;

  constructor(actions: AppActions) {
    this.actions = actions;
    this.formula = el('strong', { className: 'stage-formula' });
    this.geometry = el('span', { className: 'stage-geometry' });
    this.angle = el('span', { className: 'stage-angle' });
    this.polarity = el('span', { className: 'stage-polarity badge' });
    this.hint = el('span', { className: 'stage-hint-text' });

    const badges = el(
      'div',
      { className: 'stage-badges', 'aria-live': 'polite' },
      this.formula,
      this.geometry,
      this.angle,
      this.polarity
    );

    const toggles = el('div', {
      className: 'stage-toggles',
      role: 'group',
      'aria-label': '보기 설정'
    });
    for (const toggle of VIEW_TOGGLES) {
      const button = el(
        'button',
        {
          type: 'button',
          className: 'toggle-button',
          'aria-pressed': 'true',
          'aria-label': toggle.label,
          title: toggle.label
        },
        svgIcon(toggle.icon, 17),
        el('span', { className: 'toggle-label', text: toggle.short })
      );
      button.addEventListener('click', () => this.actions.toggleView(toggle.key));
      this.viewButtons.set(toggle.key, button);
      toggles.appendChild(button);
    }
    this.rotateButton = el(
      'button',
      {
        type: 'button',
        className: 'toggle-button',
        'aria-pressed': 'false',
        'aria-label': '자동 회전',
        title: '자동 회전'
      },
      svgIcon('rotate', 17),
      el('span', { className: 'toggle-label', text: '회전' })
    );
    this.rotateButton.addEventListener('click', () => this.actions.toggleView('autoRotate'));
    toggles.appendChild(this.rotateButton);

    this.panelButton = el(
      'button',
      {
        type: 'button',
        className: 'stage-panel-button',
        'aria-label': '점검 패널 열기',
        title: '점검 패널'
      },
      svgIcon('book', 17),
      el('span', { text: '점검' })
    );
    this.panelButton.addEventListener('click', () => this.actions.toggleInspector());

    const top = el(
      'div',
      { className: 'stage-top' },
      badges,
      el('div', { className: 'stage-top-actions' }, toggles, this.panelButton)
    );

    const bottom = el(
      'div',
      { className: 'stage-bottom' },
      el(
        'div',
        { className: 'stage-hint' },
        el('span', { className: 'hint-dot', 'aria-hidden': 'true' }),
        this.hint
      ),
      el(
        'div',
        { className: 'stage-tools' },
        iconButton('camera', '시점 초기화', () => this.actions.resetCamera(), {
          className: 'icon-btn stage-icon'
        })
      )
    );

    this.root = el('div', { className: 'stage-overlay' }, top, bottom);
  }

  update(state: AppState): void {
    const formula =
      state.molecule.atoms.length > 0 ? formatDisplayFormula(formulaCounts(state.molecule)) : '';
    this.formula.innerHTML = formula
      ? formatFormulaHtml(formula)
      : '<span class="muted">빈 작업대</span>';
    const vsepr = chooseRepresentativeVsepr(state.molecule);
    const geometry = geometryName(vsepr?.molecularGeometry ?? null);
    this.geometry.textContent =
      state.molecule.atoms.length > 0 ? `분자 기하 · ${geometry.ko}` : '원자를 놓아 시작하세요';
    const angle = formatAngle(vsepr?.approximateAngle ?? null);
    this.angle.textContent = angle === '—' ? '' : `근사 ${angle}`;
    this.angle.hidden = angle === '—';
    const polarity = computePolarity(state.molecule, state.layout);
    this.polarity.textContent = state.molecule.atoms.length > 0 ? polarity.labelKo : '—';
    this.polarity.className = `stage-polarity badge badge-polarity ${polarity.polarity}`;
    this.polarity.hidden = state.molecule.atoms.length === 0;

    for (const [key, button] of this.viewButtons) {
      const active = state.view[key];
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-pressed', String(active));
    }
    this.rotateButton.classList.toggle('is-active', state.view.autoRotate && !state.reducedMotion);
    this.rotateButton.setAttribute(
      'aria-pressed',
      String(state.view.autoRotate && !state.reducedMotion)
    );
    this.rotateButton.disabled = state.reducedMotion;
    this.rotateButton.title = state.reducedMotion
      ? '동작 줄이기 설정이 켜져 있어 자동 회전을 사용할 수 없습니다.'
      : '자동 회전';
    this.panelButton.setAttribute('aria-expanded', String(state.ui.inspectorOpen));

    const pending = state.selection.pendingBondAtomId;
    if (state.selection.tool === 'bond') {
      this.hint.textContent =
        pending !== null
          ? '두 번째 원자를 선택하세요. 원자 목록에서도 결합할 수 있습니다.'
          : '결합할 첫 번째 원자를 선택하세요.';
    } else if (state.selection.tool === 'atom') {
      this.hint.textContent =
        '작업대를 클릭해 원자를 놓으세요. 화살표 키로 커서를 옮기고 Enter로 놓을 수 있습니다.';
    } else if (state.selection.tool === 'delete') {
      this.hint.textContent = '삭제할 원자나 결합을 클릭하세요.';
    } else {
      this.hint.textContent =
        '드래그로 회전, 스크롤로 확대, 두 손가락으로 이동합니다. 원자를 클릭해 점검하세요.';
    }
  }
}
