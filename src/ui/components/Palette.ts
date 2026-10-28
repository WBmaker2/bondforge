import type { AppActions } from '../../app/actions';
import type { AppState, Tool } from '../../app/state';
import { computeValences } from '../../chem/valence';
import { PALETTE_ELEMENTS, getElement } from '../../chem/elements';
import { el, svgIcon } from './dom';

const TOOLS: Array<{ id: Tool; labelKo: string; icon: string }> = [
  { id: 'select', labelKo: '선택', icon: 'select' },
  { id: 'bond', labelKo: '결합', icon: 'bond' },
  { id: 'delete', labelKo: '삭제', icon: 'trash' }
];

export class Palette {
  readonly root: HTMLElement;
  private actions: AppActions;
  private elementButtons = new Map<string, HTMLButtonElement>();
  private toolButtons = new Map<Tool, HTMLButtonElement>();
  private fillButton: HTMLButtonElement;
  private resetButton: HTMLButtonElement;
  private hint: HTMLElement;
  private valenceNote: HTMLElement;

  constructor(actions: AppActions) {
    this.actions = actions;
    const grid = el('div', { className: 'element-grid', role: 'group', 'aria-label': '원자 선택' });
    for (const symbol of PALETTE_ELEMENTS) {
      const element = getElement(symbol);
      const button = el(
        'button',
        {
          type: 'button',
          className: 'element-button',
          'data-element': symbol,
          'aria-pressed': 'false',
          style: `--element-color: ${element.color}`
        },
        el(
          'span',
          { className: 'element-orb', 'aria-hidden': 'true' },
          el('span', { className: 'element-symbol', text: symbol })
        ),
        el(
          'span',
          { className: 'element-copy' },
          el('span', { className: 'element-name', text: element.nameKo }),
          el('span', {
            className: 'element-meta',
            text: `원자가 ${element.valenceElectrons} · 결합 ${element.neutralBonds}`
          })
        )
      );
      button.addEventListener('click', () => this.actions.selectElement(symbol));
      this.elementButtons.set(symbol, button);
      grid.appendChild(button);
    }

    const toolRow = el('div', {
      className: 'tool-row',
      role: 'group',
      'aria-label': '제작 도구'
    });
    for (const tool of TOOLS) {
      const button = el(
        'button',
        {
          type: 'button',
          className: 'tool-button',
          'data-tool': tool.id,
          'aria-pressed': 'false'
        },
        svgIcon(tool.icon, 17),
        el('span', { text: tool.labelKo })
      );
      button.addEventListener('click', () => this.actions.setTool(tool.id));
      this.toolButtons.set(tool.id, button);
      toolRow.appendChild(button);
    }

    this.fillButton = el(
      'button',
      {
        type: 'button',
        className: 'btn btn-primary btn-fill',
        'data-action': 'fill-h'
      },
      svgIcon('implicitH', 17),
      el('span', { text: 'H 채우기' })
    );
    this.fillButton.addEventListener('click', () => this.actions.fillHydrogens());

    this.resetButton = el(
      'button',
      {
        type: 'button',
        className: 'btn btn-ghost',
        'data-action': 'reset-molecule'
      },
      svgIcon('reset', 16),
      el('span', { text: '분자 초기화' })
    );
    this.resetButton.addEventListener('click', () => this.actions.resetMolecule());

    this.hint = el('p', { className: 'tool-hint', 'aria-live': 'polite' });
    this.valenceNote = el('p', { className: 'palette-note' });

    this.root = el(
      'aside',
      { className: 'panel palette-panel', 'aria-label': '원자와 도구' },
      el(
        'div',
        { className: 'panel-heading' },
        el('h2', { text: '원자' }),
        el('span', { className: 'panel-count', text: '7종' })
      ),
      grid,
      el(
        'p',
        { className: 'palette-note' },
        el('strong', { text: 'B' }),
        '는 BF₃ 미션에서 필요합니다. 2주기 원소의 옥텟 예외를 관찰해 보세요.'
      ),
      el('section', { className: 'panel-section' }, el('h3', { text: '도구' }), toolRow, this.hint),
      el(
        'section',
        { className: 'panel-section' },
        el('h3', { text: '분자' }),
        this.fillButton,
        this.resetButton,
        this.valenceNote
      )
    );
  }

  update(state: AppState): void {
    const activeElement = state.selection.tool === 'atom' ? state.selection.pendingAtom : null;
    for (const [symbol, button] of this.elementButtons) {
      const active = activeElement === symbol;
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-pressed', String(active));
    }
    for (const [tool, button] of this.toolButtons) {
      const active = state.selection.tool === tool;
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-pressed', String(active));
    }

    const valences = computeValences(state.molecule);
    const needsHydrogen = state.molecule.atoms.some((atom) => {
      if (atom.element === 'H') return false;
      const valence = valences.get(atom.id);
      return Boolean(valence?.valenceIncomplete) && atom.implicitHydrogens === 0;
    });
    this.fillButton.disabled = state.molecule.atoms.length === 0;
    this.fillButton.classList.toggle('btn-pulse', needsHydrogen && state.molecule.atoms.length > 0);
    this.resetButton.disabled = state.molecule.atoms.length === 0;

    if (state.molecule.atoms.length === 0) {
      this.valenceNote.textContent = '원자를 놓으면 원자가 점검이 시작됩니다.';
    } else if (needsHydrogen) {
      this.valenceNote.textContent =
        '원자가가 남은 원자가 있습니다. H 채우기로 수소를 채워 보세요.';
    } else {
      this.valenceNote.textContent = '결합을 클릭하면 단일 → 이중 → 삼중으로 바뀝니다.';
    }

    const selected = state.selection.atomId;
    const atom = state.molecule.atoms.find((candidate) => candidate.id === selected);
    switch (state.selection.tool) {
      case 'atom': {
        const symbol = state.selection.pendingAtom ?? 'C';
        this.hint.textContent = `${getElement(symbol).nameKo}(${symbol}) 원자를 작업대 클릭으로 놓으세요. 화살표 키와 Enter도 사용할 수 있습니다.`;
        break;
      }
      case 'bond':
        this.hint.textContent =
          state.selection.pendingBondAtomId !== null
            ? '두 번째 원자를 클릭하면 결합이 만들어집니다.'
            : '결합할 첫 번째 원자를 클릭하세요. 결합을 클릭하면 차수가 바뀝니다.';
        break;
      case 'delete':
        this.hint.textContent = '삭제할 원자나 결합을 클릭하세요. Delete 키도 사용할 수 있습니다.';
        break;
      default:
        this.hint.textContent = atom
          ? `${atom.element}${atom.id} 원자를 선택했습니다. 점검 카드에서 전자 영역을 확인하세요.`
          : '원자나 결합을 클릭해 점검하세요. 빈 곳을 클릭하면 선택이 해제됩니다.';
        break;
    }
  }
}
