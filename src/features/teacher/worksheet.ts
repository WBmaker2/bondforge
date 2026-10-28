import { formatAngle, geometryName } from '../../chem/geometry';
import type { MissionTarget } from '../missions/missions';
import { MISSIONS, missionConceptLabel } from '../missions/missions';

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
  if (target.angle !== undefined) parts.push(`근사 결합각 ${formatAngle(target.angle)}`);
  if (target.bondOrder) parts.push(`결합 차수 ${target.bondOrder}`);
  if (target.isomerCount) parts.push(`구조 이성질체 ${target.isomerCount}가지`);
  return parts.join(' · ');
}

export function buildWorksheetHtml(showAnswers: boolean): string {
  const worksheet = MISSIONS.map(
    (mission, index) => `
    <article class="ws-mission">
      <div class="ws-mission-head">
        <span class="ws-number">${String(index + 1).padStart(2, '0')}</span>
        <div>
          <h2>${esc(mission.titleKo)}</h2>
          <p class="ws-meta">${esc(missionConceptLabel(mission.concept))} · 난이도 ${mission.difficulty} · ${esc(
            mission.formulaKo
          )}</p>
        </div>
      </div>
      <p class="ws-prompt">${esc(mission.promptKo)}</p>
      <div class="ws-options">
        ${mission.options
          .map(
            (option, optionIndex) =>
              `<span class="ws-option"><span class="ws-checkbox" aria-hidden="true"></span>${optionIndex + 1}. ${esc(option)}</span>`
          )
          .join('')}
      </div>
      <div class="ws-write">
        <span class="ws-label">나의 예측과 근거</span>
        <div class="ws-lines"><span></span><span></span><span></span></div>
      </div>
      <div class="ws-write">
        <span class="ws-label">3D 구조에서 관찰한 전자 영역 · 분자 모양 · 극성</span>
        <div class="ws-lines"><span></span><span></span><span></span></div>
      </div>
    </article>
  `
  ).join('');

  const answerKey = showAnswers
    ? `<section class="ws-answer-key">
        <h1>교사용 정답과 해설</h1>
        ${MISSIONS.map(
          (mission) => `
          <article class="ws-answer">
            <h2>${esc(mission.titleKo)} <span>${esc(mission.formulaKo)}</span></h2>
            <p><strong>예측 정답:</strong> ${esc(mission.answer)}</p>
            <p><strong>목표:</strong> ${esc(targetSummary(mission.target))}</p>
            ${
              mission.steps
                ? `<ul>${mission.steps
                    .map(
                      (step) =>
                        `<li><strong>${esc(step.labelKo)}</strong> — ${esc(targetSummary(step.target))}</li>`
                    )
                    .join('')}</ul>`
                : ''
            }
            <p><strong>해설:</strong> ${esc(mission.explanationKo)}</p>
            <p><strong>한 줄 정리:</strong> ${esc(mission.takeawayKo)}</p>
          </article>
        `
        ).join('')}
      </section>`
    : '';

  return `
    <div class="worksheet-page">
      <header class="ws-header">
        <div class="ws-brand">BondForge <span>분자 구조 실험실</span></div>
        <h1>분자 구조 예측 워크시트</h1>
        <p>이름: ____________________ &nbsp;&nbsp; 반: __________ &nbsp;&nbsp; 날짜: __________</p>
        <p class="ws-instructions">각 미션의 분자식을 보고 모양과 극성을 먼저 예측하세요. 그다음 3D 제작대에서 구조를 만들고, 전자 영역·비공유 전자쌍·결합 쌍극자를 근거로 관찰을 설명하세요.</p>
      </header>
      ${worksheet}
      <footer class="ws-footer">BondForge · VSEPR 근사 모형 · 모든 결과는 브라우저에서 계산됩니다.</footer>
    </div>
    ${answerKey}
  `;
}
