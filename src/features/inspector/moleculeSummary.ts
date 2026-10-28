import type { MoleculeLayout } from '../../build/layout';
import { validateMolecule } from '../../build/graph';
import { formatDisplayFormula, formulaCounts } from '../../chem/formula';
import { formatAngle, geometryName } from '../../chem/geometry';
import { computePolarity } from '../../chem/polarity';
import type { Molecule } from '../../chem/types';
import { findCentralAtoms } from '../../chem/vsepr';

export function moleculeSummary(molecule: Molecule, layout: MoleculeLayout): string {
  if (molecule.atoms.length === 0) {
    return '아직 분자가 없습니다. 원자 팔레트에서 원자를 고르고 작업대를 클릭하거나, 화살표 키로 위치를 옮긴 뒤 Enter를 누르세요.';
  }
  const formula = formatDisplayFormula(formulaCounts(molecule));
  const central = findCentralAtoms(molecule);
  const polarity = computePolarity(molecule, layout);
  const validation = validateMolecule(molecule);
  const implicit = molecule.atoms.reduce((sum, atom) => sum + atom.implicitHydrogens, 0);
  const geometryParts = central.slice(0, 5).map((result) => {
    const atom = molecule.atoms.find((candidate) => candidate.id === result.atomId);
    const symbol = atom?.element ?? '';
    const name = geometryName(result.molecularGeometry).ko;
    const angle = formatAngle(result.approximateAngle);
    return `${symbol}${result.atomId}의 분자 기하는 ${name}${angle === '—' ? '' : `, VSEPR 근사 결합각은 ${angle}`}`;
  });
  const issue =
    validation.issues.find((candidate) => candidate.level === 'error') ??
    validation.issues.find((candidate) => candidate.level === 'warning');
  const validationText = validation.complete
    ? '원자가와 옥텟이 모두 채워졌습니다.'
    : issue
      ? `검증 메시지: ${issue.messageKo}`
      : '구조를 계속 점검해 보세요.';
  return [
    `분자식 ${formula}.`,
    `원자 ${molecule.atoms.length}개, 결합 ${molecule.bonds.length}개${implicit > 0 ? `, 암시적 수소 ${implicit}개` : ''}.`,
    geometryParts.length > 0
      ? `${geometryParts.join('. ')}.`
      : '중심 원자가 아직 뚜렷하지 않습니다.',
    `전체 분자는 ${polarity.labelKo}입니다.`,
    validationText
  ].join(' ');
}
