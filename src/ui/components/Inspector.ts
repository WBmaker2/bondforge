import type { AppActions } from '../../app/actions';
import type { AppState } from '../../app/state';
import { validateMolecule } from '../../build/graph';
import { ELEMENTS } from '../../chem/elements';
import { formatDisplayFormula, formulaCounts, molarMass } from '../../chem/formula';
import { formatAngle, geometryName } from '../../chem/geometry';
import { computePolarity, netDipoleLabel } from '../../chem/polarity';
import type { BondOrder, Molecule } from '../../chem/types';
import { computeAtomValence, formalChargeLabel, type AtomValence } from '../../chem/valence';
import { chooseRepresentativeVsepr, computeVsepr, findCentralAtoms } from '../../chem/vsepr';
import { moleculeSummary } from '../../features/inspector/moleculeSummary';
import { el, formatFormulaHtml } from './dom';

function esc(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function orb(symbol: string, size = 'small'): string {
  const color = ELEMENTS[symbol as keyof typeof ELEMENTS]?.color ?? '#94a3b8';
  return `<span class="mini-orb mini-orb-${size}" style="--element-color:${color}" aria-hidden="true">${esc(symbol)}</span>`;
}

function domainPips(lonePairs: number, bondedAtoms: number): string {
  const pips = [
    ...Array.from(
      { length: Math.min(bondedAtoms, 6) },
      () => '<span class="domain-pip bond"></span>'
    ),
    ...Array.from({ length: Math.min(lonePairs, 4) }, () => '<span class="domain-pip lone"></span>')
  ].join('');
  return `<span class="domain-pips" aria-hidden="true">${pips}</span>`;
}

function issueRow(issue: {
  level: string;
  messageKo: string;
  hintKo?: string;
  atomId: number | null;
}): string {
  const icon = issue.level === 'error' ? '!' : issue.level === 'warning' ? '△' : 'i';
  return `<li class="issue issue-${esc(issue.level)}">
    <span class="issue-icon" aria-hidden="true">${icon}</span>
    <span class="issue-copy"><strong>${esc(issue.messageKo)}</strong>${issue.hintKo ? `<span>${esc(issue.hintKo)}</span>` : ''}</span>
  </li>`;
}

function bondOrderLabel(order: BondOrder): string {
  return order === 1 ? '단일 결합' : order === 2 ? '이중 결합' : '삼중 결합';
}

function atomName(molecule: Molecule, id: number): string {
  const atom = molecule.atoms.find((candidate) => candidate.id === id);
  return atom ? `${atom.element}${atom.id}` : `원자 ${id}`;
}

export class Inspector {
  readonly root: HTMLElement;
  private actions: AppActions;
  private content: HTMLElement;

  constructor(actions: AppActions) {
    this.actions = actions;
    this.content = el('div', { className: 'inspector-content' });
    this.root = el('aside', {
      className: 'panel inspector-panel',
      'aria-label': '분자 점검 카드'
    });
    this.root.appendChild(
      el(
        'div',
        { className: 'panel-heading inspector-heading' },
        el('h2', { text: '점검' }),
        el('span', { className: 'vsepr-chip', text: 'VSEPR 근사' })
      )
    );
    this.root.appendChild(this.content);
    this.root.addEventListener('click', this.onClick);
  }

  private onClick = (event: MouseEvent): void => {
    const target = (event.target as HTMLElement).closest<HTMLElement>('[data-action]');
    if (!target) return;
    const action = target.dataset.action;
    const id = target.dataset.id ? Number(target.dataset.id) : null;
    switch (action) {
      case 'focus-atom':
        if (id !== null) this.actions.focusAtom(id);
        break;
      case 'start-bond':
        if (id !== null) this.actions.beginBond(id);
        break;
      case 'cancel-pending':
        this.actions.cancelPendingBond();
        break;
      case 'delete-atom':
        if (id !== null) {
          this.actions.selectAtom(id);
          this.actions.deleteSelection();
        }
        break;
      case 'delete-bond':
        if (id !== null) {
          this.actions.selectBond(id);
          this.actions.deleteSelection();
        }
        break;
      case 'bond-order':
        if (id !== null) {
          const order = Number(target.dataset.order) as BondOrder;
          this.actions.setBondOrder(id, order);
        }
        break;
      case 'select-central':
      case 'atom-list':
        if (id !== null) {
          if (this.actions) this.actions.clickAtom(id);
        }
        break;
      case 'focus-camera':
        this.actions.resetCamera();
        break;
      default:
        break;
    }
  };

  update(state: AppState): void {
    const active = document.activeElement as HTMLElement | null;
    const focusKey =
      active && this.root.contains(active) && active.dataset.action
        ? `${active.dataset.action}|${active.dataset.id ?? ''}|${active.dataset.order ?? ''}`
        : null;
    const scroll = this.content.scrollTop;
    this.content.innerHTML = this.render(state);
    this.content.scrollTop = scroll;
    if (focusKey) {
      const [action, id, order] = focusKey.split('|');
      const match = [...this.content.querySelectorAll<HTMLElement>('[data-action]')].find(
        (element) =>
          element.dataset.action === action &&
          (element.dataset.id ?? '') === id &&
          (element.dataset.order ?? '') === order
      );
      match?.focus({ preventScroll: true });
    }
  }

  private render(state: AppState): string {
    if (state.molecule.atoms.length === 0) {
      return `
        <section class="empty-card">
          <span class="empty-mark" aria-hidden="true">◎</span>
          <h3>작업대가 비어 있습니다</h3>
          <p>원자 팔레트에서 원자를 고르고 작업대를 클릭하세요. 원자 두 개를 골라 결합 도구로 이으면 분자가 됩니다.</p>
          <ol class="steps-list">
            <li><strong>원자 놓기</strong><span>O, H처럼 필요한 원자를 클릭합니다.</span></li>
            <li><strong>결합 만들기</strong><span>결합 도구로 두 원자를 차례로 클릭합니다.</span></li>
            <li><strong>수소 채우기</strong><span>무거운 원자의 남은 원자가를 H로 채웁니다.</span></li>
          </ol>
        </section>`;
    }

    const counts = formulaCounts(state.molecule);
    const formula = formatDisplayFormula(counts);
    const mass = molarMass(counts);
    const polarity = computePolarity(state.molecule, state.layout);
    const validation = validateMolecule(state.molecule);
    const central = findCentralAtoms(state.molecule);
    const selectedAtom = state.molecule.atoms.find((atom) => atom.id === state.selection.atomId);
    const selectedBond = state.molecule.bonds.find((bond) => bond.id === state.selection.bondId);
    const representative =
      selectedAtom && computeVsepr(state.molecule, selectedAtom.id)
        ? computeVsepr(state.molecule, selectedAtom.id)
        : chooseRepresentativeVsepr(state.molecule);
    const selectedValence = selectedAtom ? computeAtomValence(state.molecule, selectedAtom) : null;
    const summary = moleculeSummary(state.molecule, state.layout);

    return `
      <section class="inspector-card formula-card">
        <div class="formula-main">
          <span class="formula-label">분자식</span>
          <strong class="formula-value">${formatFormulaHtml(formula)}</strong>
        </div>
        <div class="formula-meta">
          <span>${state.molecule.atoms.length}개 원자</span>
          <span>${state.molecule.bonds.length}개 결합</span>
          <span>${mass.toFixed(2)} g/mol</span>
        </div>
        <div class="polarity-row">
          <span class="badge badge-polarity ${polarity.polarity}">${esc(polarity.labelKo)}</span>
          <span class="polarity-net">μ ${esc(netDipoleLabel(polarity))}</span>
        </div>
        <div class="meter" aria-hidden="true"><span style="width:${Math.min(100, (polarity.normalizedMagnitude / 4) * 100)}%"></span></div>
      </section>

      <section class="inspector-card">
        <div class="card-title-row">
          <h3>전자 영역과 분자 모양</h3>
          <span class="muted">중심 원자 기준</span>
        </div>
        ${
          central.length > 0
            ? `<div class="central-chips" role="group" aria-label="중심 원자 선택">${central
                .slice(0, 6)
                .map((result) => {
                  const atom = state.molecule.atoms.find(
                    (candidate) => candidate.id === result.atomId
                  );
                  const name = geometryName(result.molecularGeometry).ko;
                  const active = selectedAtom?.id === result.atomId;
                  return `<button type="button" class="central-chip ${active ? 'is-active' : ''}" data-action="select-central" data-id="${result.atomId}" aria-pressed="${active}">
              ${atom ? orb(atom.element) : ''}<span>${atom?.element ?? ''}${result.atomId} · ${esc(name)}</span>
            </button>`;
                })
                .join('')}</div>`
            : '<p class="muted">중심 원자가 아직 없습니다. 원자에 결합을 2개 이상 만들어 보세요.</p>'
        }
        ${this.renderGeometry(representative)}
      </section>

      ${selectedAtom && selectedValence ? this.renderAtom(selectedAtom, selectedValence, representative) : ''}
      ${selectedBond ? this.renderBond(selectedBond, state.molecule) : ''}

      <section class="inspector-card">
        <div class="card-title-row">
          <h3>구조 검증</h3>
          <span class="status-dot ${validation.complete ? 'ok' : validation.errorCount > 0 ? 'bad' : 'warn'}" aria-label="${validation.complete ? '검증 통과' : '검증 필요'}"></span>
        </div>
        ${this.renderValidation(state, validation)}
      </section>

      <section class="inspector-card">
        <div class="card-title-row">
          <h3>결합 쌍극자</h3>
          <span class="badge badge-soft">${esc(polarity.labelKo)}</span>
        </div>
        ${this.renderDipoles(polarity)}
      </section>

      <section class="inspector-card">
        <div class="card-title-row">
          <h3>원자 목록</h3>
          <span class="muted">키보드 선택</span>
        </div>
        ${
          state.selection.pendingBondAtomId !== null
            ? `<div class="pending-banner"><span>${esc(atomName(state.molecule, state.selection.pendingBondAtomId))}에서 결합 중</span><button type="button" class="text-button" data-action="cancel-pending">취소</button></div>`
            : ''
        }
        <div class="atom-list">
          ${state.molecule.atoms
            .map((atom) => {
              const vsepr = computeVsepr(state.molecule, atom.id);
              const active = atom.id === state.selection.atomId;
              return `<button type="button" class="atom-list-item ${active ? 'is-active' : ''}" data-action="atom-list" data-id="${atom.id}" aria-pressed="${active}">
                ${orb(atom.element)}
                <span class="atom-list-copy"><strong>${atom.element}${atom.id}</strong><span>${esc(
                  geometryName(vsepr?.molecularGeometry ?? null).ko
                )}</span></span>
                <span class="atom-list-valence">${computeAtomValence(state.molecule, atom).usedValence}/${ELEMENTS[atom.element].neutralBonds}</span>
              </button>`;
            })
            .join('')}
        </div>
      </section>

      <section class="inspector-card read-card">
        <div class="card-title-row">
          <h3>분자 읽기</h3>
          <span class="sr-only">텍스트 요약</span>
        </div>
        <p class="molecule-summary" id="inspector-molecule-summary">${esc(summary)}</p>
        <button type="button" class="text-button" data-action="focus-camera">시점을 분자에 맞추기</button>
      </section>
    `;
  }

  private renderGeometry(result: ReturnType<typeof computeVsepr>): string {
    if (!result) return '<p class="muted">원자를 선택하면 전자 영역을 계산합니다.</p>';
    const electron = geometryName(result.electronGeometry);
    const molecular = geometryName(result.molecularGeometry);
    const bonded = result.bondedAtoms;
    const lone = result.lonePairs;
    if (!result.supported) {
      return `<div class="notice notice-warn">이 구조는 MVP의 VSEPR 범위(입체수 2–4)를 벗어났습니다. 전자 영역 수를 줄여 보세요.</div>`;
    }
    if (bonded <= 1) {
      return `<p class="muted">${bonded === 0 ? '고립 원자' : '말단 원자'}입니다. 두 개 이상의 결합이 있어야 분자 모양을 판단할 수 있습니다.</p>`;
    }
    return `
      <div class="domain-line">
        ${domainPips(lone, bonded)}
        <span class="domain-caption">입체수 <strong>${result.stericNumber}</strong> = 결합 <strong>${bonded}</strong> + 비공유 <strong>${lone}</strong></span>
      </div>
      <div class="geometry-compare">
        <div><span class="compare-label">전자 영역 기하</span><strong>${esc(electron.ko)}</strong><span class="muted">${esc(electron.en)}</span></div>
        <span class="compare-arrow" aria-hidden="true">→</span>
        <div><span class="compare-label">분자 기하</span><strong>${esc(molecular.ko)}</strong><span class="muted">${esc(molecular.en)}</span></div>
      </div>
      <div class="angle-row">
        <span>이상 각도 <strong>${formatAngle(result.idealAngle)}</strong></span>
        <span class="angle-approx">이 모형의 근사 각도 <strong>${formatAngle(result.approximateAngle)}</strong> <span class="badge badge-approx">근사</span></span>
      </div>
      <p class="vsepr-note">VSEPR은 전자 영역의 반발을 이용한 근사 모형입니다. 결합 길이와 실제 분자의 미세한 왜곡은 다룰 수 없습니다.</p>
    `;
  }

  private renderAtom(
    atom: AppState['molecule']['atoms'][number],
    valence: AtomValence,
    vsepr: ReturnType<typeof computeVsepr>
  ): string {
    const element = ELEMENTS[atom.element];
    const used = Math.max(valence.usedValence, 0);
    const denominator = Math.max(element.neutralBonds, used, 1);
    const percent = Math.min(100, (used / denominator) * 100);
    const charge = formalChargeLabel(valence.formalCharge);
    return `
      <section class="inspector-card atom-card">
        <div class="atom-card-head">
          ${orb(atom.element, 'large')}
          <div class="atom-card-title">
            <strong>${esc(element.nameKo)} <span>${atom.element}${atom.id}</span></strong>
            <span class="muted">${esc(element.nameEn)} · 원자 번호 ${element.atomicNumber}</span>
          </div>
          <button type="button" class="icon-btn small" data-action="focus-atom" data-id="${atom.id}" aria-label="${atom.element}${atom.id}에 카메라 맞추기" title="카메라 맞추기">◎</button>
        </div>
        <div class="valence-use" aria-label="원자가 사용 ${used} / ${element.neutralBonds}">
          <div class="valence-use-head"><span>원자가 사용</span><strong>${used} / ${element.neutralBonds}</strong></div>
          <div class="meter ${used > element.neutralBonds ? 'is-over' : ''}" aria-hidden="true"><span style="width:${percent}%"></span></div>
          <div class="valence-use-foot"><span>최대 허용 ${element.maxBonds}</span><span>형식 전하 <strong class="${charge === '0' ? '' : 'charge'}">${esc(charge)}</strong></span></div>
        </div>
        <div class="stat-grid">
          <div><span>결합 차수 합</span><strong>${valence.bondOrderSum}</strong></div>
          <div><span>비공유 전자쌍</span><strong>${valence.lonePairs}</strong></div>
          <div><span>암시적 수소</span><strong>${valence.implicitHydrogens}</strong></div>
          <div><span>옥텟 전자</span><strong>${valence.pairedElectrons} / ${valence.octetLimit}</strong></div>
        </div>
        ${vsepr && vsepr.bondedAtoms >= 2 ? `<div class="atom-geometry-line">${esc(geometryName(vsepr.molecularGeometry).ko)} · 근사 ${formatAngle(vsepr.approximateAngle)}</div>` : ''}
        <div class="atom-actions">
          <button type="button" class="btn btn-secondary btn-small" data-action="start-bond" data-id="${atom.id}">이 원자에서 결합 시작</button>
          <button type="button" class="btn btn-danger-ghost btn-small" data-action="delete-atom" data-id="${atom.id}">원자 삭제</button>
        </div>
      </section>
    `;
  }

  private renderBond(bond: AppState['molecule']['bonds'][number], molecule: Molecule): string {
    const a = molecule.atoms.find((atom) => atom.id === bond.a);
    const b = molecule.atoms.find((atom) => atom.id === bond.b);
    return `
      <section class="inspector-card bond-card">
        <div class="card-title-row">
          <h3>선택한 결합</h3>
          <span class="badge badge-soft">${bondOrderLabel(bond.order)}</span>
        </div>
        <p class="bond-title">${a ? esc(`${a.element}${a.id}`) : '?'} ${bond.order === 1 ? '—' : bond.order === 2 ? '=' : '≡'} ${b ? esc(`${b.element}${b.id}`) : '?'}</p>
        <div class="segmented" role="group" aria-label="결합 차수">
          ${[1, 2, 3]
            .map(
              (order) =>
                `<button type="button" class="${bond.order === order ? 'is-active' : ''}" data-action="bond-order" data-id="${bond.id}" data-order="${order}" aria-pressed="${bond.order === order}">${order === 1 ? '단일' : order === 2 ? '이중' : '삼중'}</button>`
            )
            .join('')}
        </div>
        <button type="button" class="btn btn-danger-ghost btn-small" data-action="delete-bond" data-id="${bond.id}">결합 삭제</button>
      </section>
    `;
  }

  private renderValidation(
    state: AppState,
    validation: ReturnType<typeof validateMolecule>
  ): string {
    const issues = [...validation.issues]
      .filter(
        (issue, index, all) =>
          all.findIndex(
            (candidate) =>
              candidate.code === issue.code &&
              candidate.atomId === issue.atomId &&
              candidate.messageKo === issue.messageKo
          ) === index
      )
      .sort((a, b) => {
        const order = { error: 0, warning: 1, info: 2 } as const;
        return order[a.level] - order[b.level];
      });
    if (issues.length === 0) {
      return `<div class="validation-ok"><span aria-hidden="true">✓</span><div><strong>원자가와 옥텟이 안정적입니다.</strong><span>구조가 검증을 통과했습니다.</span></div></div>`;
    }
    const visible = issues.slice(0, 6);
    const selectedIssues = issues.filter((issue) => issue.atomId === state.selection.atomId).length;
    return `
      <ul class="issue-list">
        ${visible.map((issue) => issueRow(issue)).join('')}
      </ul>
      ${issues.length > visible.length ? `<p class="muted small">외 ${issues.length - visible.length}개 메시지가 더 있습니다.</p>` : ''}
      ${selectedIssues > 0 ? `<p class="muted small">선택한 원자에 ${selectedIssues}개의 메시지가 있습니다.</p>` : ''}
    `;
  }

  private renderDipoles(polarity: ReturnType<typeof computePolarity>): string {
    const dipoles = polarity.bondDipoles.filter((dipole) => dipole.magnitude > 1e-6);
    if (dipoles.length === 0) {
      return '<p class="muted">같은 원자 사이의 결합만 있어 결합 쌍극자가 없습니다.</p>';
    }
    const max = Math.max(...dipoles.map((dipole) => dipole.magnitude), 0.001);
    return `
      <ul class="dipole-list">
        ${dipoles
          .slice(0, 8)
          .map(
            (dipole) => `<li>
          <span class="dipole-label" title="${dipole.includedInNet ? '분자 극성 합에 포함' : '분자 극성 합에서 제외된 약한 쌍극자'}">${esc(dipole.label)}${dipole.includedInNet ? '' : ' <span class="dipole-weak">약함</span>'}</span>
          <span class="dipole-bar" aria-hidden="true"><span style="width:${(dipole.magnitude / max) * 100}%"></span></span>
          <span class="dipole-value">${dipole.magnitude.toFixed(2)}</span>
        </li>`
          )
          .join('')}
      </ul>
      <div class="net-dipole"><span>벡터 합</span><strong>${esc(netDipoleLabel(polarity))}</strong></div>
      <p class="muted small">${polarity.polarity === 'nonpolar' ? '결합 쌍극자가 대칭으로 상쇄되었습니다.' : '결합 쌍극자의 벡터 합이 0이 아니므로 극성입니다.'}</p>
      ${polarity.excludedBondCount > 0 ? `<p class="muted small dipole-note">전기 음성도 차이가 0.4 미만인 약한 결합 ${polarity.excludedBondCount}개는 분자 극성 합에서 제외했습니다. C–H 결합은 작은 쌍극자를 가지지만 분자 전체 극성에는 거의 기여하지 않습니다.</p>` : ''}
    `;
  }
}
