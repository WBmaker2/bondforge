import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

async function gotoBuild(page: Page): Promise<void> {
  await page.goto('/#/build');
  await expect(page.locator('.brand-name')).toBeVisible();
  await expect(page.locator('.scene-canvas')).toBeVisible();
  await page.waitForTimeout(250);
}

async function startMission(page: Page, missionId: string, answer: string): Promise<void> {
  await page.goto('/#/missions');
  await page.locator(`.mission-card button[data-mission="${missionId}"]`).click();
  await expect(page.locator('.modal-dialog[open]')).toBeVisible();
  await page.locator('.modal-dialog .prediction-option').filter({ hasText: answer }).click();
  await expect(page.locator('.modal-dialog[open]')).toHaveCount(0);
  await expect(page.locator('.stage > .mission-strip')).toBeVisible();
}

async function placeAt(page: Page, element: string, x: number, y: number): Promise<void> {
  await page.locator(`.workspace-palette button[data-element="${element}"]`).click();
  const box = await page.locator('.scene-canvas').boundingBox();
  if (!box) throw new Error('Scene canvas has no bounding box');
  await page.mouse.click(box.x + x, box.y + y);
}

async function fillH(page: Page): Promise<void> {
  await page.locator('.workspace-palette button[data-action="fill-h"]').click();
}

async function bond(page: Page, a: number, b: number): Promise<void> {
  await page.locator('.workspace-palette .tool-button[data-tool="select"]').click();
  await page.locator(`.workspace-inspector .atom-list-item[data-id="${a}"]`).click();
  await page.locator('.workspace-inspector .atom-card button[data-action="start-bond"]').click();
  await page.locator(`.workspace-inspector .atom-list-item[data-id="${b}"]`).click();
}

async function checkMission(page: Page): Promise<void> {
  await page.locator('.stage > .mission-strip button[data-action="check-mission"]').click();
}

async function placeManyWithKeyboard(page: Page, element: string, count: number): Promise<void> {
  await page.locator(`.workspace-palette button[data-element="${element}"]`).click();
  await page.locator('.scene-canvas').focus();
  for (let index = 0; index < count; index++) {
    await page.keyboard.press('Enter');
    await page.waitForTimeout(60);
  }
}

async function buildCarbonSkeleton(page: Page, kind: 'chain' | 'branch'): Promise<void> {
  await placeManyWithKeyboard(page, 'C', 4);
  if (kind === 'chain') {
    await bond(page, 1, 2);
    await bond(page, 2, 3);
    await bond(page, 3, 4);
  } else {
    await bond(page, 1, 2);
    await bond(page, 1, 3);
    await bond(page, 1, 4);
  }
}

test('places atoms, creates bonds, cycles bond order, and deletes an atom', async ({ page }) => {
  await gotoBuild(page);
  await placeAt(page, 'C', 300, 210);
  await placeAt(page, 'O', 185, 200);
  await placeAt(page, 'O', 430, 200);
  await expect(page.locator('.workspace-inspector .atom-list-item')).toHaveCount(3);

  await bond(page, 1, 2);
  await expect(page.locator('.workspace-inspector .bond-card')).toBeVisible();
  await page
    .locator('.workspace-inspector .bond-card button[data-action="bond-order"][data-order="2"]')
    .click();
  await expect(page.locator('.workspace-inspector .bond-card')).toContainText('이중 결합');

  await bond(page, 1, 3);
  await page
    .locator('.workspace-inspector .bond-card button[data-action="bond-order"][data-order="2"]')
    .click();
  await expect(page.locator('.workspace-inspector .formula-value')).toContainText('CO');

  await page.locator('.workspace-palette .tool-button[data-tool="delete"]').click();
  await page.locator('.workspace-inspector .atom-list-item[data-id="3"]').click();
  await expect(page.locator('.workspace-inspector .atom-list-item')).toHaveCount(2);
  await expect(page.locator('.workspace-inspector .formula-value')).toHaveText('CO');
});

async function clickAtomLabel(page: Page, label: 'O' | 'H', index = 0): Promise<void> {
  const title = label === 'O' ? '산소 O' : '수소 H';
  const locator = page
    .locator(`.scene-label-layer .scene-label.atom-label[title="${title}"]`)
    .nth(index);
  const box = await locator.boundingBox();
  if (!box) throw new Error(`Atom label ${label} has no bounding box`);
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await page.waitForTimeout(120);
}

test('creates bonds by clicking atoms in the 3D scene', async ({ page }) => {
  await gotoBuild(page);
  await placeAt(page, 'O', 300, 210);
  await placeAt(page, 'H', 190, 300);
  await placeAt(page, 'H', 420, 300);
  await page.locator('.workspace-palette .tool-button[data-tool="bond"]').click();
  await clickAtomLabel(page, 'O');
  await clickAtomLabel(page, 'H', 0);
  await clickAtomLabel(page, 'O');
  await clickAtomLabel(page, 'H', 1);
  await expect(page.locator('.workspace-inspector .formula-value')).toHaveText('H2O');
});

test('completes the H2O mission and gives an evidence hint for an empty build', async ({
  page
}) => {
  await startMission(page, 'h2o-shape', '굽은형');
  await checkMission(page);
  await expect(page.locator('.stage > .mission-strip .mission-feedback.is-error')).toContainText(
    'H2O'
  );

  await placeAt(page, 'O', 310, 210);
  await fillH(page);
  await expect(page.locator('.workspace-inspector .formula-value')).toHaveText('H2O');
  await expect(page.locator('.stage-polarity')).toHaveClass(/polar/);
  await checkMission(page);
  await expect(page.locator('.modal-dialog[open]')).toBeVisible();
  await expect(page.locator('#modal-title')).toHaveText('물의 굽은 모양');
  await expect(page.locator('.modal-dialog .badge-success')).toContainText('예측 적중');
  await page.locator('.modal-dialog [data-modal-action="close"]').click();
  await expect(page.locator('.stage > .mission-strip')).toContainText('완료');
});

test('finds both C4H10 structural isomers and does not double-count', async ({ page }) => {
  await startMission(page, 'c4h10-isomers', '2가지');

  await buildCarbonSkeleton(page, 'chain');
  await fillH(page);
  await expect(page.locator('.workspace-inspector .formula-value')).toHaveText('C4H10');
  await checkMission(page);
  await expect(page.locator('.stage > .mission-strip')).toContainText('찾은 구조 1/2');

  await page.locator('.stage > .mission-strip [data-action="next-step"]').click();
  await buildCarbonSkeleton(page, 'branch');
  await fillH(page);
  await checkMission(page);
  await expect(page.locator('.modal-dialog[open]')).toBeVisible();
  await expect(page.locator('#modal-title')).toHaveText('C₄H₁₀의 두 가지 구조');
  await expect(page.locator('.modal-dialog')).toContainText('예측 적중');
  const completed = await page.evaluate(
    () => JSON.parse(localStorage.getItem('bondforge.progress.v1') || '{}').completed
  );
  expect(completed).toContain('c4h10-isomers');
});

test('completes the H2O mission with keyboard activation', async ({ page }) => {
  await page.goto('/#/build?mission=h2o-shape');
  await expect(page.locator('.modal-dialog[open]')).toBeVisible();
  await page.locator('.modal-dialog .prediction-option').filter({ hasText: '굽은형' }).focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('.modal-dialog[open]')).toHaveCount(0);
  await page.waitForTimeout(180);

  await page.locator('.workspace-palette button[data-element="O"]').focus();
  await page.keyboard.press('Enter');
  await page.locator('.scene-canvas').focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('.workspace-inspector .atom-list-item')).toHaveCount(1);

  await page.locator('.workspace-palette button[data-element="H"]').focus();
  await page.keyboard.press('Enter');
  await page.locator('.scene-canvas').focus();
  await page.keyboard.press('Enter');
  await page.keyboard.press('Enter');
  await expect(page.locator('.workspace-inspector .atom-list-item')).toHaveCount(3);

  await page.locator('.workspace-inspector .atom-list-item[data-id="1"]').focus();
  await page.keyboard.press('Enter');
  await page.locator('.scene-canvas').focus();
  await page.keyboard.press('b');
  await page.locator('.workspace-inspector .atom-list-item[data-id="2"]').focus();
  await page.keyboard.press('Enter');
  await page.locator('.workspace-inspector .atom-list-item[data-id="1"]').focus();
  await page.keyboard.press('Enter');
  await page.locator('.workspace-inspector .atom-list-item[data-id="3"]').focus();
  await page.keyboard.press('Enter');

  await expect(page.locator('.workspace-inspector .formula-value')).toHaveText('H2O');
  await expect(page.locator('.stage-polarity')).toHaveClass(/polar/);
  await page.locator('.stage > .mission-strip button[data-action="check-mission"]').focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('.modal-dialog[open]')).toBeVisible();
  await expect(page.locator('#modal-title')).toHaveText('물의 굽은 모양');
});

test('teacher mode reveals answers, prints a worksheet, and resets progress', async ({ page }) => {
  await page.goto('/#/build?mission=h2o-shape');
  await page.locator('.modal-dialog .prediction-option').filter({ hasText: '굽은형' }).click();
  await page.locator('.workspace-palette button[data-element="O"]').click();
  const box = await page.locator('.scene-canvas').boundingBox();
  if (!box) throw new Error('Scene canvas has no bounding box');
  await page.mouse.click(box.x + 310, box.y + 210);
  await fillH(page);
  await checkMission(page);
  await expect(page.locator('.modal-dialog[open]')).toBeVisible();
  await page.locator('.modal-dialog [data-modal-action="close"]').click();

  await page.locator('nav.top-nav button[data-route="teacher"]').click();
  await expect(page.locator('.teacher-view')).toBeVisible();
  await page.locator('.teacher-actions button[data-action="toggle-answers"]').click();
  await expect(page.locator('.teacher-card .answer-block').first()).toBeVisible();

  await page.evaluate(() => {
    (window as unknown as { __printed: boolean }).__printed = false;
    window.print = () => {
      (window as unknown as { __printed: boolean }).__printed = true;
    };
  });
  await page.locator('.teacher-actions button[data-action="print"]').click();
  await expect
    .poll(() => page.evaluate(() => (window as unknown as { __printed: boolean }).__printed))
    .toBe(true);
  const worksheet = await page.locator('#worksheet-print').innerText();
  expect(worksheet).toContain('분자 구조 예측 워크시트');
  expect(worksheet).toContain('교사용 정답');

  await page.locator('.teacher-actions button[data-action="reset"]').click();
  await expect(page.locator('.modal-dialog[open]')).toBeVisible();
  await page.locator('.modal-dialog [data-modal-action="confirm-reset"]').click();
  await expect(page.locator('.top-progress-text')).toHaveText('0/6 완료');
  const completed = await page.evaluate(
    () => JSON.parse(localStorage.getItem('bondforge.progress.v1') || '{}').completed
  );
  expect(completed).toEqual([]);
});

test('toggles atom labels, lone pairs, implicit hydrogens, and the dipole arrow', async ({
  page
}) => {
  await gotoBuild(page);
  await placeAt(page, 'O', 310, 210);
  await fillH(page);
  await expect(page.locator('.scene-label-layer .dipole-label')).toBeVisible();

  const dipoleButton = page.locator('.stage-toggles button[aria-label="분자 쌍극자 표시"]');
  await dipoleButton.click();
  await expect(dipoleButton).toHaveAttribute('aria-pressed', 'false');
  await expect(page.locator('.scene-label-layer .dipole-label')).toHaveCount(0);
  await dipoleButton.click();
  await expect(dipoleButton).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.scene-label-layer .dipole-label')).toBeVisible();

  const loneButton = page.locator('.stage-toggles button[aria-label="비공유 전자쌍 표시"]');
  await loneButton.click();
  await expect(loneButton).toHaveAttribute('aria-pressed', 'false');

  const implicitButton = page.locator('.stage-toggles button[aria-label="암시적 수소 표시"]');
  await implicitButton.click();
  await expect(implicitButton).toHaveAttribute('aria-pressed', 'false');
  await expect(page.locator('.scene-label.implicit-hydrogen')).toHaveCount(0);
});

test('respects reduced motion preferences', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/#/build');
  await expect(page.locator('.brand-name')).toBeVisible();
  const rotate = page.locator('.stage-toggles button[aria-label="자동 회전"]');
  await expect(rotate).toBeDisabled();
  const pulse = page.locator('.stage > .mission-strip .btn-pulse').first();
  await expect(pulse).toBeVisible();
  const animationName = await pulse.evaluate((element) => getComputedStyle(element).animationName);
  expect(animationName).toBe('none');
});

test('opens and closes the tablet inspector drawer', async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 768 });
  await page.goto('/#/build');
  await expect(page.locator('.stage-panel-button')).toBeVisible();
  await page.locator('.stage-panel-button').click();
  await expect(page.locator('.workspace')).toHaveClass(/inspector-open/);
  await expect(page.locator('.drawer-close')).toBeVisible();
  await page.locator('.drawer-close').click();
  await expect(page.locator('.workspace')).not.toHaveClass(/inspector-open/);
});

test('keeps oxygen visible in a short landscape palette', async ({ page }) => {
  await page.setViewportSize({ width: 667, height: 375 });
  await page.goto('/#/build');
  await expect(page.locator('.mobile-sheet')).toBeVisible();
  const oxygen = page.locator('.mobile-panel [data-element="O"]');
  await expect(oxygen).toBeVisible();
  const box = await oxygen.boundingBox();
  expect(box).not.toBeNull();
  if (!box) return;
  expect(box.y + box.height).toBeLessThanOrEqual(375);
});

test('supports keyboard tab navigation in the mobile sheet', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/#/build');
  await expect(page.locator('.mobile-sheet')).toBeVisible();
  await page.locator('#mobile-tab-atoms').focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('#mobile-tab-inspect')).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('#mobile-panel-inspect')).toBeVisible();
  await page.keyboard.press('End');
  await expect(page.locator('#mobile-tab-mission')).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('#mobile-panel-mission')).toBeVisible();
});

test('works offline after the first load', async ({ page, context }) => {
  await page.goto('/#/build');
  await expect(page.locator('.brand-name')).toBeVisible();
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => true));
  await page
    .waitForFunction(() => Boolean(navigator.serviceWorker.controller), undefined, {
      timeout: 15000
    })
    .catch(() => undefined);
  await page.reload();
  await expect(page.locator('.brand-name')).toBeVisible();

  await context.setOffline(true);
  await page.reload();
  await expect(page.locator('.brand-name')).toBeVisible();
  await expect(page.locator('.scene-canvas')).toBeVisible();
  await context.setOffline(false);
});

test('has no critical accessibility violations on the builder and mission hub', async ({
  page
}) => {
  await gotoBuild(page);
  const builderResults = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
  expect(builderResults.violations.filter((violation) => violation.impact === 'critical')).toEqual(
    []
  );

  await page.goto('/#/missions');
  await expect(page.locator('.mission-hub-view')).toBeVisible();
  const hubResults = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
  expect(hubResults.violations.filter((violation) => violation.impact === 'critical')).toEqual([]);
});

test('captures responsive builders and previews of all target molecules', async ({
  page
}, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await gotoBuild(page);
  await placeAt(page, 'O', 310, 210);
  await testInfo.attach('inspector-incomplete', {
    body: await page.locator('.workspace-inspector').screenshot(),
    contentType: 'image/png'
  });
  await fillH(page);
  await expect(page.locator('.workspace-inspector .formula-value')).toHaveText('H2O');
  await testInfo.attach('inspector-valid', {
    body: await page.locator('.workspace-inspector').screenshot(),
    contentType: 'image/png'
  });

  for (const [width, height, name] of [
    [1440, 900, 'desktop'],
    [1024, 768, 'tablet'],
    [390, 844, 'phone']
  ] as const) {
    await page.setViewportSize({ width, height });
    await page.waitForTimeout(250);
    await testInfo.attach(`builder-${name}`, {
      body: await page.screenshot(),
      contentType: 'image/png'
    });
  }

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/#/teacher');
  await expect(page.locator('.preview-canvas canvas')).toBeVisible();

  const previews: Array<{ mission: string; option?: string; name: string }> = [
    { mission: 'h2o-shape', name: 'h2o' },
    { mission: 'co2-polarity', name: 'co2' },
    { mission: 'ch4-nh3-h2o', option: 'ch4', name: 'ch4' },
    { mission: 'ch4-nh3-h2o', option: 'nh3', name: 'nh3' },
    { mission: 'bf3-vs-nh3', option: 'bf3', name: 'bf3' },
    { mission: 'c2h2-triple', name: 'c2h2' },
    { mission: 'c4h10-isomers', name: 'c4h10-butane' },
    { mission: 'c4h10-isomers', option: 'isobutane', name: 'c4h10-isobutane' }
  ];

  for (const preview of previews) {
    await page
      .locator(`.teacher-card [data-action="preview-mission"][data-mission="${preview.mission}"]`)
      .click();
    if (preview.option) {
      await page.locator(`.preview-options [data-option="${preview.option}"]`).click();
    }
    await page.waitForTimeout(260);
    await testInfo.attach(`preview-${preview.name}`, {
      body: await page.locator('.preview-canvas').screenshot(),
      contentType: 'image/png'
    });
  }

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/#/missions');
  await expect(page.locator('.mission-hub-view')).toBeVisible();
  await page.waitForTimeout(250);
  await testInfo.attach('hub-phone', {
    body: await page.screenshot(),
    contentType: 'image/png'
  });
  await page.goto('/#/teacher');
  await expect(page.locator('.preview-canvas canvas')).toBeVisible();
  await page.waitForTimeout(250);
  await testInfo.attach('teacher-phone', {
    body: await page.screenshot(),
    contentType: 'image/png'
  });
});
