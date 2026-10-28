import type { AppActions } from '../../app/actions';
import type { AppState } from '../../app/state';
import { computeValences } from '../../chem/valence';
import { el, formatFormulaHtml } from '../../ui/components/dom';
import { getMission, missionSteps } from './missions';

export class MobileMissionBar {
  readonly root: HTMLElement;
  private actions: AppActions;
  private target: HTMLButtonElement;
  private fillButton: HTMLButtonElement;
  private checkButton: HTMLButtonElement;

  constructor(actions: AppActions) {
    this.actions = actions;
    this.target = el('button', {
      type: 'button',
      className: 'mobile-mission-target',
      'data-action': 'mission',
      'aria-label': '미션 내용 보기'
    });
    this.fillButton = el(
      'button',
      {
        type: 'button',
        className: 'btn btn-secondary btn-small',
        'data-action': 'fill'
      },
      'H 채우기'
    );
    this.checkButton = el(
      'button',
      {
        type: 'button',
        className: 'btn btn-primary btn-small btn-pulse',
        'data-action': 'check'
      },
      '구조 확인'
    );
    this.root = el(
      'div',
      { className: 'mobile-mission-bar', hidden: true, 'aria-label': '미션 빠른 실행' },
      this.target,
      this.fillButton,
      this.checkButton
    );
    this.root.addEventListener('click', (event) => {
      const button = (event.target as HTMLElement).closest<HTMLElement>('[data-action]');
      if (!button) return;
      switch (button.dataset.action) {
        case 'mission':
          this.actions.setMobilePanel('mission');
          break;
        case 'fill':
          this.actions.fillHydrogens();
          break;
        case 'check':
          this.actions.checkMission();
          break;
        default:
          break;
      }
    });
  }

  update(state: AppState): void {
    const mission = getMission(state.mission.currentId);
    const show =
      Boolean(mission) &&
      Boolean(state.mission.prediction) &&
      !state.mission.completed &&
      state.ui.mobilePanel !== 'mission';
    this.root.hidden = !show;
    if (!mission || !show) return;

    const steps = missionSteps(mission);
    const nextStep = steps.find((step) => !state.mission.stepsDone.includes(step.id));
    const target = nextStep?.target ?? mission.target;
    const isomerProgress =
      mission.concept === 'isomer' && mission.target.isomerCount
        ? ` <span>${state.mission.discoveredIsomers.length}/${mission.target.isomerCount}</span>`
        : '';
    this.target.innerHTML = `목표 <strong>${formatFormulaHtml(target.formula)}</strong>${isomerProgress}`;
    this.target.setAttribute('aria-label', `미션 내용 보기. 목표 ${target.formula}`);

    const valences = computeValences(state.molecule);
    const needsHydrogen = state.molecule.atoms.some(
      (atom) =>
        atom.element !== 'H' &&
        atom.implicitHydrogens === 0 &&
        valences.get(atom.id)?.valenceIncomplete
    );
    this.fillButton.hidden = !needsHydrogen;
    this.checkButton.disabled = state.molecule.atoms.length === 0;
  }
}
