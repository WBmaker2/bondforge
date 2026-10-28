import type { AppActions } from '../../app/actions';
import type { AppState, Route } from '../../app/state';
import { MISSIONS } from '../../features/missions/missions';
import { el, iconButton } from './dom';

const NAV_ITEMS: Array<{ route: Route; labelKo: string }> = [
  { route: 'build', labelKo: '제작대' },
  { route: 'missions', labelKo: '미션' },
  { route: 'teacher', labelKo: '교사 모드' }
];

export class Topbar {
  readonly root: HTMLElement;
  private actions: AppActions;
  private navButtons = new Map<Route, HTMLButtonElement>();
  private progressText: HTMLElement;
  private undoButton: HTMLButtonElement;
  private redoButton: HTMLButtonElement;

  constructor(actions: AppActions) {
    this.actions = actions;
    const logo = el(
      'div',
      { className: 'brand' },
      el(
        'span',
        { className: 'brand-mark', 'aria-hidden': 'true' },
        el(
          'span',
          { className: 'brand-mark-orbit orbit-a' },
          el('span', { className: 'brand-mark-nucleus' })
        ),
        el('span', { className: 'brand-mark-orbit orbit-b' }),
        el('span', { className: 'brand-mark-orbit orbit-c' })
      ),
      el(
        'span',
        { className: 'brand-copy' },
        el('span', { className: 'brand-name', text: 'BondForge' }),
        el('span', { className: 'brand-tagline', text: '분자 구조 실험실' })
      )
    );

    const nav = el('nav', { className: 'top-nav', 'aria-label': '주요 화면' });
    for (const item of NAV_ITEMS) {
      const button = el('button', {
        type: 'button',
        className: 'nav-pill',
        'data-route': item.route,
        text: item.labelKo
      });
      button.addEventListener('click', () => this.actions.navigate(item.route));
      this.navButtons.set(item.route, button);
      nav.appendChild(button);
    }

    this.progressText = el('span', { className: 'top-progress-text' });
    const progress = el(
      'div',
      { className: 'top-progress', 'aria-label': '미션 진행 상황' },
      el('span', { className: 'top-progress-ring', 'aria-hidden': 'true' }),
      this.progressText
    );

    this.undoButton = iconButton('undo', '실행 취소', () => this.actions.undo(), {
      'data-action': 'undo'
    });
    this.redoButton = iconButton('redo', '다시 실행', () => this.actions.redo(), {
      'data-action': 'redo'
    });
    const actionButtons = el(
      'div',
      { className: 'top-actions' },
      this.undoButton,
      this.redoButton,
      iconButton('help', '도움말과 키보드 단축키', () => this.actions.openModal({ kind: 'help' }))
    );

    this.root = el(
      'header',
      { className: 'topbar' },
      el(
        'div',
        { className: 'topbar-inner' },
        logo,
        nav,
        el('div', { className: 'topbar-right' }, progress, actionButtons)
      )
    );
  }

  update(state: AppState): void {
    for (const [route, button] of this.navButtons) {
      const active = state.route === route;
      button.classList.toggle('is-active', active);
      if (active) button.setAttribute('aria-current', 'page');
      else button.removeAttribute('aria-current');
    }
    const completed = state.progress.completed.filter((id) =>
      MISSIONS.some((mission) => mission.id === id)
    ).length;
    this.progressText.textContent = `${completed}/${MISSIONS.length} 완료`;
    this.progressText.classList.toggle('is-complete', completed === MISSIONS.length);
    this.undoButton.disabled = !state.history.canUndo;
    this.redoButton.disabled = !state.history.canRedo;
  }
}
